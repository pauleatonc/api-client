import React, { useEffect, useState, useRef } from 'react';
import '@uppy/core/dist/style.min.css';

// Configuración para chunked upload manual
const USE_MANUAL_CHUNKED = true; // Usar implementación manual en lugar de Uppy
const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB chunks (coincide con el script bash)



// Función para dividir archivo en chunks
function splitFileIntoChunks(file, chunkSize = CHUNK_SIZE) {
  const chunks = [];
  let start = 0;
  let chunkIndex = 0;
  
  while (start < file.size) {
    const end = Math.min(start + chunkSize, file.size);
    const chunk = file.slice(start, end, file.type);
    
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



// Función para enviar un chunk individual
async function uploadChunk(chunk, file, totalChunks, endpoint, token, clientId) {
  const formData = new FormData();
  
  // Datos del chunk como blob binario con nombre original
  const chunkBlob = new Blob([chunk.data], { type: file.type });
  
  // Parámetros según especificaciones
  formData.append('files', chunkBlob, file.name);
  formData.append('client_id', clientId); // único por navegador + usuario
  formData.append('part_number', (chunk.index + 1).toString());
  formData.append('total_parts', totalChunks.toString());
    formData.append('original_filename', file.name);
  
  // El usuario se extrae automáticamente del token JWT de Keycloak en el backend
  // Solo enviamos client_id para manejo de concurrencia
  
  // Parámetro crucial para que el backend detecte el último chunk
  if (chunk.index + 1 === totalChunks) {
    formData.append('completo', 'true');
    // Intentar también otros nombres que el backend podría estar esperando
    formData.append('is_last_chunk', 'true');
    formData.append('final_chunk', 'true');
    formData.append('last_part', 'true');
  } else {
    formData.append('completo', 'false');
    formData.append('is_last_chunk', 'false');
    formData.append('final_chunk', 'false');
    formData.append('last_part', 'false');
  }

  console.log(`Subiendo chunk ${chunk.index + 1}/${totalChunks} - ${(chunk.size / (1024*1024)).toFixed(2)}MB`);
  console.log(`Client ID: ${clientId}`);
  console.log('Detalles del chunk:', {
    part_number: chunk.index + 1,
    total_parts: totalChunks,
    chunk_size: chunk.size,
    file_size: file.size,
    is_last_chunk: chunk.index + 1 === totalChunks,
    start_byte: chunk.start,
    end_byte: chunk.end,
    parametros_enviados: {
      files: `${file.name} (${chunk.size} bytes)`,
      client_id: clientId,
      part_number: chunk.index + 1,
      total_parts: totalChunks,
      original_filename: file.name,
      completo: chunk.index + 1 === totalChunks ? 'true' : 'false'
    }
  });
  
  // Log para el último chunk
  if (chunk.index + 1 === totalChunks) {
    console.log('🚨 ÚLTIMO CHUNK - completo: true, client_id:', clientId);
  }
  
  // DIAGNÓSTICO: Verificar todos los parámetros enviados
  console.log('📋 TODOS LOS PARÁMETROS ENVIADOS:');
  for (let [key, value] of formData.entries()) {
    if (value instanceof File || value instanceof Blob) {
      console.log(`  ${key}: [File/Blob] ${value.name || 'unnamed'} (${value.size} bytes)`);
    } else {
      console.log(`  ${key}: "${value}"`);
    }
  }
  
  // Log de los headers enviados
  console.log('Headers:', {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json'
  });
  
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
    console.error('Error en la respuesta:', {
      status: response.status,
      statusText: response.statusText,
      body: errorText
    });
    throw new Error(`Error HTTP ${response.status}: ${errorText}`);
  }
  
  const result = await response.json();
  // Log completo de la respuesta JSON del backend
  console.log('Respuesta completa del backend:', result);
  
  // Si result.archivos está presente, logea sus campos
  const archivo = result.archivos?.[0];
  if (archivo) {
    console.log('Analisis respuesta chunk:', {
      nombre: archivo.nombre,
      tamaño_reportado: archivo.tamaño,
      tipo_contenido: archivo.tipo_contenido,
      uuid: archivo.uuid,
      tamaño_esperado: chunk.size,
      coinciden: chunk.size === archivo.tamaño
    });
  } else {
    // Si la respuesta no contiene los campos esperados
    console.error('Respuesta inesperada del backend para el chunk:', result);
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

  useEffect(() => {
    // Configuración para API externa (apifile) con chunked upload
    const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;
    const apiUploadPath = import.meta.env.VITE_API_UPLOAD_PATH;

    // Construir el endpoint completo para apifile
    const base = apiBaseUrl.endsWith('/') ? apiBaseUrl.slice(0, -1) : apiBaseUrl;
    const path = apiUploadPath.startsWith('/') ? apiUploadPath.slice(1) : apiUploadPath;
    const uploadEndpoint = `${base}/${path}`;
    
    // Obtener el token actual para headers estáticos
    const currentToken = keycloak?.token || token;

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

      // Imprime el tipo MIME del archivo original al inicio
      console.log('Tipo MIME del archivo original:', file.type);

      // Configurar endpoint y token PRIMERO
      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;
      const apiUploadPath = import.meta.env.VITE_API_UPLOAD_PATH;
      const base = apiBaseUrl.endsWith('/') ? apiBaseUrl.slice(0, -1) : apiBaseUrl;
      const path = apiUploadPath.startsWith('/') ? apiUploadPath.slice(1) : apiUploadPath;
      const uploadEndpoint = `${base}/${path}`;
      const currentToken = keycloak?.token || token;
      
      // Generar client_id único: navegador + usuario + timestamp
      // "cada navegador + nfiles uploads es el id"
      const userAgent = navigator.userAgent.slice(-10); // últimos 10 chars del user agent
      const sessionToken = currentToken ? currentToken.slice(-8) : 'anonymous'; // últimos 8 chars del token
      const timestamp = Date.now();
      const clientId = `${userAgent}_${sessionToken}_${timestamp}`.replace(/[^a-zA-Z0-9_]/g, '_');
      
      console.log('Client ID único:', clientId);

      if (!currentToken) {
        throw new Error('No hay token disponible para la subida');
      }



      // Dividir archivo en chunks
      const chunks = splitFileIntoChunks(file, CHUNK_SIZE);
      const totalChunks = chunks.length;
      
      console.log(`Iniciando subida: ${file.name} (${(file.size / (1024*1024)).toFixed(2)}MB) - ${totalChunks} chunks`);
      
      setUploadProgress({ current: 0, total: totalChunks });

      // Subir chunks secuencialmente
      const results = [];
      let tipo_contenido_final = null;
      let uuid_final = null;
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        
        setUploadProgress({ current: i + 1, total: totalChunks });
        setUploadStatus({
          type: 'info',
          message: `Subiendo chunk ${i + 1} de ${totalChunks}...`,
        });

        try {
          const result = await uploadChunk(chunk, file, totalChunks, uploadEndpoint, currentToken, clientId);
          results.push(result);
          // Guardar tipo_contenido y uuid si están presentes
          const archivo = result.archivos?.[0];
          if (archivo) {
            tipo_contenido_final = archivo.tipo_contenido;
            uuid_final = archivo.uuid;
          }
        } catch (chunkError) {
          console.error(`Error en chunk ${i + 1}:`, chunkError.message);
          
          // Si es el último chunk y falla, intentar una vez más después de una pausa
          if (i === chunks.length - 1 && chunkError.message.includes('500')) {
            console.log('Reintentando último chunk después de pausa...');
            await new Promise(resolve => setTimeout(resolve, 2000)); // Pausa de 2 segundos
            
                         try {
               const result = await uploadChunk(chunk, file, totalChunks, uploadEndpoint, currentToken, clientId);
              results.push(result);
              // Guardar tipo_contenido y uuid si están presentes
              const archivo = result.archivos?.[0];
              if (archivo) {
                tipo_contenido_final = archivo.tipo_contenido;
                uuid_final = archivo.uuid;
              }
              continue;
            } catch (retryError) {
              console.error('Error en reintento del último chunk:', retryError.message);
            }
          }
          
          // Si es 401, intentar renovar token una vez
          if (chunkError.message.includes('401') && onTokenRefresh && retryAttemptRef.current < 1) {
            retryAttemptRef.current += 1;
            
            try {
              const newToken = await onTokenRefresh();
              if (newToken) {
                const result = await uploadChunk(chunk, file, totalChunks, uploadEndpoint, newToken, clientId);
                results.push(result);
                // Guardar tipo_contenido y uuid si están presentes
                const archivo = result.archivos?.[0];
                if (archivo) {
                  tipo_contenido_final = archivo.tipo_contenido;
                  uuid_final = archivo.uuid;
                }
                continue;
              }
            } catch (refreshError) {
              console.error('Error renovando token:', refreshError);
            }
          }
          
          throw new Error(`Error en chunk ${i + 1}: ${chunkError.message}`);
        }
      }

      // Éxito completo - el backend debería procesar automáticamente
      setIsUploading(false);
      setUploadCompleted(true);
      setUploadStatus({
        type: 'success',
        message: `Archivo subido completamente (${totalChunks} chunks)`,
        details: results[results.length - 1],
      });



      console.log(`Subida completada: ${file.name}`);
      // Log final de tipo_contenido y uuid
      if (tipo_contenido_final || uuid_final) {
        console.log('Archivo ensamblado:', {
          tipo_contenido_final,
          uuid_final
        });
      } 

    } catch (error) {
      console.error('Error en subida chunked:', error.message);

      setIsUploading(false);
      setUploadCompleted(true);
      setUploadStatus({
        type: 'error',
        message: `Error en subida: ${error.message}`,
        details: error,
      });
    }
  };

  const handleFiles = (files) => {
    if (files.length > 0 && !isUploading) {
      try {
        // Resetear estados para nueva subida chunked
        setUploadStatus(null);
        setUploadCompleted(false);
        setUploadProgress({ current: 0, total: 0 });
        
        const file = files[0];
        
        // Usar implementación manual
        uploadFileInChunks(file);
        
      } catch (error) {
        console.error('Error al procesar archivo:', error.message);
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
    
    // Limpiar el input file
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
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
                  <i className="bi bi-info-circle"></i> Los archivos se dividen automáticamente en chunks de 10MB para una subida más eficiente y confiable.
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
                  : uploadStatus.type === 'warning'
                  ? 'alert-warning'
                  : 'alert-info'
              }`}
              role="alert"
            >
              {uploadStatus.message}
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
