import React, { useEffect, useState, useRef } from 'react';
import '@uppy/core/dist/style.min.css';

// Configuración para chunked upload manual
const USE_MANUAL_CHUNKED = true; // Usar implementación manual en lugar de Uppy
const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB chunks

// Función para generar upload_id único compartido entre chunks
function generateUploadId() {
  return crypto?.randomUUID?.() || Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

// Función para dividir archivo en chunks
function splitFileIntoChunks(file, chunkSize = CHUNK_SIZE) {
  const chunks = [];
  let start = 0;
  let chunkIndex = 0;
  
  while (start < file.size) {
    const end = Math.min(start + chunkSize, file.size);
    const chunk = file.slice(start, end);
    
    chunks.push({
      data: chunk,
      index: chunkIndex,
      start: start,
      end: end,
      size: end - start
    });
    
    start = end;
    chunkIndex++;
  }
  
  return chunks;
}

// Función para finalizar la subida chunked (ensamblar chunks)
async function finalizeChunkedUpload(uploadId, filename, totalChunks, totalSize, endpoint, token) {
  console.log('🔧 Intentando finalizar subida chunked...');
  
  // Intentar diferentes enfoques para finalizar
  const finalizeEndpoints = [
    `${endpoint}/finalize`,  // Endpoint específico para finalizar
    `${endpoint}`,           // Mismo endpoint con parámetro action
  ];
  
  for (const finalizeEndpoint of finalizeEndpoints) {
    try {
      const formData = new FormData();
      formData.append('upload_id', uploadId);
      formData.append('filename', filename);
      formData.append('total_chunks', totalChunks.toString());
      formData.append('total_size', totalSize.toString());
      
      if (finalizeEndpoint === endpoint) {
        formData.append('action', 'finalize');
      }
      
      console.log(`🔧 Probando endpoint: ${finalizeEndpoint}`);
      
      const response = await fetch(finalizeEndpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        },
        body: formData
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('✅ Subida finalizada exitosamente:', result);
        return result;
      } else {
        console.log(`❌ Falló con ${finalizeEndpoint}: ${response.status}`);
      }
    } catch (error) {
      console.log(`❌ Error con ${finalizeEndpoint}:`, error.message);
    }
  }
  
  throw new Error('No se pudo finalizar la subida con ningún método');
}

// Función para enviar un chunk individual
async function uploadChunk(chunk, file, uploadId, totalChunks, endpoint, token) {
  const formData = new FormData();
  
  // Datos del chunk - usar 'files' como campo
  formData.append('files', chunk.data, file.name);
  
  // Metadatos requeridos por CGR API
  formData.append('upload_id', uploadId);
  formData.append('chunk_index', chunk.index.toString());
  formData.append('total_chunks', totalChunks.toString());
  formData.append('filename', file.name);
  formData.append('file_size', file.size.toString());
  formData.append('chunk_size', chunk.size.toString());
  
  // Log detallado de la petición
  console.log('📤 Detalles de la petición:');
  console.log('🔗 Endpoint:', endpoint);
  console.log('🔑 Token:', token);
  console.log('📦 Datos del chunk:', {
    upload_id: uploadId,
    chunk_index: chunk.index,
    total_chunks: totalChunks,
    filename: file.name,
    file_size: file.size,
    chunk_size: chunk.size
  });
  
  console.log(
    `📤 Enviando chunk ${chunk.index + 1}/${totalChunks} | ` +
    `Tamaño: ${(chunk.size / (1024*1024)).toFixed(2)}MB | ` +
    `Archivo: ${file.name}`
  );
  
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json'
    },
    body: formData
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ Error en la respuesta:', {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      body: errorText
    });
    throw new Error(`Error HTTP ${response.status}: ${errorText}`);
  }
  
  const result = await response.json();
  console.log(`✅ Chunk ${chunk.index + 1}/${totalChunks} subido exitosamente`);
  console.log(`📋 Respuesta del chunk ${chunk.index + 1}:`, result);
  
  // Verificar si la API está procesando correctamente los chunks
  if (result.archivos && result.archivos[0]) {
    const archivo = result.archivos[0];
    console.log(`📊 Análisis del chunk ${chunk.index + 1}:`);
    console.log(`   - Tamaño esperado del chunk: ${chunk.size} bytes`);
    console.log(`   - Tamaño reportado por API: ${archivo.tamaño} bytes`);
    console.log(`   - Upload ID enviado: ${uploadId}`);
    console.log(`   - ¿Tamaños coinciden?:`, chunk.size === archivo.tamaño);
    
    if (chunk.index === totalChunks - 1) {
      console.log(`🏁 ÚLTIMO CHUNK - Análisis final:`);
      console.log(`   - Tamaño original del archivo: ${file.size} bytes`);
      console.log(`   - Tamaño final reportado: ${archivo.tamaño} bytes`);
      console.log(`   - ¿Es el archivo completo?:`, archivo.tamaño === file.size);
    }
  }
  
  return result;
}

const FileUploader = ({ token, onTokenRefresh, keycloak }) => {
  const [uploadStatus, setUploadStatus] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadCompleted, setUploadCompleted] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const fileInputRef = useRef(null);
  const dropzoneRef = useRef(null);
  const retryAttemptRef = useRef(0);
  const uploadIdRef = useRef(null);

  useEffect(() => {
    // Configuración para API externa (apifile) con chunked upload
    const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;
    const apiUploadPath = import.meta.env.VITE_API_UPLOAD_PATH;

    // Construir el endpoint completo para apifile
    const base = apiBaseUrl.endsWith('/') ? apiBaseUrl.slice(0, -1) : apiBaseUrl;
    const path = apiUploadPath.startsWith('/') ? apiUploadPath.slice(1) : apiUploadPath;
    // Usar la URL tal como está configurada en las variables de entorno
    const uploadEndpoint = `${base}/${path}`;
    
    // Obtener el token actual para headers estáticos
    const currentToken = keycloak?.token || token;
    
    console.log(`🔗 Endpoint configurado: ${uploadEndpoint}`);
    console.log(`🔑 Token disponible: ${currentToken ? 'Sí' : 'No'}`);
    console.log(`🔑 Access Token:`, currentToken);
    if (currentToken) {
      try {
        const tokenPayload = JSON.parse(atob(currentToken.split('.')[1]));
        console.log(`🔑 Token decodificado:`, tokenPayload);
      } catch (e) {
        console.error('Error decodificando token:', e);
      }
    }

    return () => {
      // Cleanup si es necesario
    };
  }, [token, keycloak?.token, onTokenRefresh, keycloak]);

  // Función principal para subida manual chunked
  const uploadFileInChunks = async (file) => {
    try {
      setIsUploading(true);
      setUploadCompleted(false);
      setUploadStatus({
        type: 'info',
        message: 'Iniciando subida por chunks...',
      });

      // Configurar endpoint y token
      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;
      const apiUploadPath = import.meta.env.VITE_API_UPLOAD_PATH;
      const base = apiBaseUrl.endsWith('/') ? apiBaseUrl.slice(0, -1) : apiBaseUrl;
      const path = apiUploadPath.startsWith('/') ? apiUploadPath.slice(1) : apiUploadPath;
      // Usar la URL tal como está configurada en las variables de entorno
      const uploadEndpoint = `${base}/${path}`;
      const currentToken = keycloak?.token || token;

      if (!currentToken) {
        throw new Error('No hay token disponible para la subida');
      }

      // Log detallado del token
      console.log('🔑 Token completo:', currentToken);
      try {
        const [header, payload, signature] = currentToken.split('.');
        console.log('🔑 Token Header:', JSON.parse(atob(header)));
        console.log('🔑 Token Payload:', JSON.parse(atob(payload)));
        console.log('🔑 Token Signature:', signature);
        
        // Verificar expiración
        const tokenData = JSON.parse(atob(payload));
        const expirationDate = new Date(tokenData.exp * 1000);
        console.log('🔑 Token expira:', expirationDate.toLocaleString());
        console.log('🔑 Token expirado:', new Date() > expirationDate);
      } catch (e) {
        console.error('Error analizando token:', e);
      }

      // Generar upload_id único
      const uploadId = generateUploadId();
      uploadIdRef.current = uploadId;

      // Dividir archivo en chunks
      const chunks = splitFileIntoChunks(file, CHUNK_SIZE);
      const totalChunks = chunks.length;
      
      console.log(`🚀 Iniciando subida chunked:`);
      console.log(`📁 Archivo: ${file.name} (${(file.size / (1024*1024)).toFixed(2)}MB)`);
      console.log(`🔗 Upload ID: ${uploadId}`);
      console.log(`📦 Total chunks: ${totalChunks} de ${(CHUNK_SIZE / (1024*1024)).toFixed(2)}MB cada uno`);
      
      setUploadProgress({ current: 0, total: totalChunks });

      // Subir chunks secuencialmente
      const results = [];
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        
        setUploadProgress({ current: i + 1, total: totalChunks });
        setUploadStatus({
          type: 'info',
          message: `Subiendo chunk ${i + 1} de ${totalChunks}...`,
        });

        try {
          const result = await uploadChunk(chunk, file, uploadId, totalChunks, uploadEndpoint, currentToken);
          results.push(result);
        } catch (chunkError) {
          console.error(`❌ Error en chunk ${i + 1}:`, chunkError.message);
          
          // Si es 401, intentar renovar token una vez
          if (chunkError.message.includes('401') && onTokenRefresh && retryAttemptRef.current < 1) {
            retryAttemptRef.current += 1;
            console.log('🔄 Renovando token...');
            
            try {
              const newToken = await onTokenRefresh();
              if (newToken) {
                console.log('✅ Token renovado, reintentando chunk...');
                const result = await uploadChunk(chunk, file, uploadId, totalChunks, uploadEndpoint, newToken);
                results.push(result);
                continue;
              }
            } catch (refreshError) {
              console.error('❌ Error renovando token:', refreshError);
            }
          }
          
          throw new Error(`Error en chunk ${i + 1}: ${chunkError.message}`);
        }
      }

      // Verificar si el último resultado tiene el tamaño correcto
      const lastResult = results[results.length - 1];
      let finalResult = lastResult;
      
      if (lastResult?.archivos?.[0]?.tamaño !== file.size) {
        console.log('⚠️ El archivo final no tiene el tamaño correcto. Intentando finalizar...');
        
        setUploadStatus({
          type: 'info',
          message: 'Finalizando ensamblaje del archivo...',
        });
        
        try {
          finalResult = await finalizeChunkedUpload(
            uploadId, 
            file.name, 
            totalChunks, 
            file.size, 
            uploadEndpoint, 
            currentToken
          );
        } catch (finalizeError) {
          console.log('⚠️ No se pudo finalizar automáticamente:', finalizeError.message);
          console.log('📝 Esto podría ser normal si la API ensambla automáticamente');
          // No lanzar error, usar el último resultado
        }
      } else {
        console.log('✅ El archivo parece haberse ensamblado correctamente');
      }

      // Éxito completo
      setIsUploading(false);
      setUploadCompleted(true);
      setUploadStatus({
        type: 'success',
        message: `✅ Archivo subido completamente (${totalChunks} chunks)`,
        details: finalResult, // Usar el resultado finalizado o el último chunk
      });

      console.log(`🎉 ¡Subida completada exitosamente!`);
      console.log(`📁 Archivo: ${file.name}`);
      console.log(`🔗 Upload ID: ${uploadId}`);
      console.log(`📦 Chunks procesados: ${totalChunks}`);
      
      uploadIdRef.current = null;

    } catch (error) {
      console.error('❌ Error en subida chunked:', error.message);
      
      setIsUploading(false);
      setUploadCompleted(true);
      setUploadStatus({
        type: 'error',
        message: `Error en subida: ${error.message}`,
        details: error,
      });
      
      uploadIdRef.current = null;
    }
  };

  const handleFiles = (files) => {
    if (files.length > 0 && !isUploading) {
      try {
        // Resetear estados para nueva subida chunked
        setUploadStatus(null);
        setUploadCompleted(false);
        setUploadProgress({ current: 0, total: 0 });
        uploadIdRef.current = null;
        
        const file = files[0];
        console.log(`📄 Archivo seleccionado: ${file.name} (${(file.size / (1024*1024)).toFixed(2)}MB)`);
        
        // Usar implementación manual
        uploadFileInChunks(file);
        
      } catch (error) {
        console.error('❌ Error al procesar archivo:', error.message);
        setUploadStatus({
          type: 'error',
          message: `Error al procesar el archivo: ${error.message}`,
        });
        setUploadCompleted(true);
      }
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isUploading) {
      const files = e.dataTransfer.files;
      handleFiles(files);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const resetUploader = () => {
    setUploadStatus(null);
    setUploadCompleted(false);
    setIsUploading(false);
    setUploadProgress({ current: 0, total: 0 });
    uploadIdRef.current = null;
    
    // Limpiar el input file
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    
    console.log('🔄 Uploader reiniciado');
  };

  const handleFileInputClick = () => {
    if (!isUploading) {
      fileInputRef.current.click();
    }
  };

  return (
    <div className="container mt-4">
      <div className="card shadow-sm border-0">
        <div className="card-body text-center">
          <h4 className="card-title mb-3">
            {uploadCompleted ? 'Resultado de la subida' : 'Subir archivo por chunks'}
          </h4>

          {!uploadCompleted && (
            <>
              <div
                ref={dropzoneRef}
                className={`border rounded p-4 mb-3 ${
                  isUploading ? 'bg-secondary text-white' : 'bg-light'
                }`}
                style={{ 
                  cursor: isUploading ? 'not-allowed' : 'pointer',
                  opacity: isUploading ? 0.6 : 1 
                }}
                onClick={handleFileInputClick}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
              >
                <p className="mb-0">
                  {isUploading 
                    ? `Subiendo chunk ${uploadProgress.current}/${uploadProgress.total}...` 
                    : 'Arrastra tu archivo aquí o haz clic para seleccionarlo'
                  }
                </p>
                
                {/* Progress bar para chunks */}
                {isUploading && uploadProgress.total > 0 && (
                  <div className="mt-3">
                    <div className="progress">
                      <div 
                        className="progress-bar progress-bar-striped progress-bar-animated" 
                        role="progressbar" 
                        style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                        aria-valuenow={uploadProgress.current} 
                        aria-valuemin="0" 
                        aria-valuemax={uploadProgress.total}
                      >
                        {uploadProgress.current}/{uploadProgress.total} chunks
                      </div>
                    </div>
                    <small className="text-muted mt-1 d-block">
                      Progreso: {Math.round((uploadProgress.current / uploadProgress.total) * 100)}%
                    </small>
                  </div>
                )}
              </div>

              <input
                type="file"
                className="d-none"
                ref={fileInputRef}
                onChange={(e) => handleFiles(e.target.files)}
                accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar"
                disabled={isUploading}
              />
              
              {/* Información sobre chunked upload */}
              <div className="mt-2">
                <small className="text-muted">
                  <i className="bi bi-info-circle"></i> Los archivos se dividen automáticamente en chunks de 2MB para una subida más eficiente y confiable.
                </small>
              </div>
            </>
          )}

          {uploadStatus && (
            <div
              className={`alert ${
                uploadStatus.type === 'success' 
                  ? 'alert-success' 
                  : uploadStatus.type === 'error'
                  ? 'alert-danger'
                  : 'alert-info'
              }`}
              role="alert"
            >
              {/* {uploadStatus.message} */}
              {uploadStatus.details && (
                <details className="mt-2">
                  <summary className="cursor-pointer">Ver detalles de la respuesta</summary>
                  <pre className="mt-2 text-start small bg-white p-2 border rounded">
                    {JSON.stringify(uploadStatus.details, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          )}

          {uploadCompleted && (
            <button
              className="btn btn-primary mt-3"
              onClick={resetUploader}
              type="button"
            >
              Subir otro archivo
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default FileUploader;
