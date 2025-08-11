import React, { useMemo, useState } from 'react';

function parseFilenameFromContentDisposition(headerValue) {
  if (!headerValue) return null;
  // Content-Disposition: attachment; filename="example.pdf"; filename*=UTF-8''example.pdf
  try {
    const utfPart = headerValue.split("filename*=UTF-8''")[1];
    if (utfPart) return decodeURIComponent(utfPart.trim().replace(/"/g, ''));
    const match = /filename\*=([^;]+)|filename=\"([^\"]+)\"|filename=([^;]+)/i.exec(headerValue);
    if (match) {
      return decodeURIComponent((match[1] || match[2] || match[3] || '').trim().replace(/"/g, ''));
    }
  } catch (_) {}
  return null;
}

const FileSearch = ({ token, keycloak }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState('');

  const baseUrl = useMemo(() => {
    const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '';
    return apiBaseUrl.endsWith('/') ? apiBaseUrl.slice(0, -1) : apiBaseUrl;
  }, []);

  const currentToken = useMemo(() => keycloak?.token || token, [keycloak?.token, token]);

  const handleSearch = async (e) => {
    e?.preventDefault?.();
    setError('');
    setResults([]);
    if (!query || !currentToken) return;
    setIsSearching(true);
    try {
      const url = `${baseUrl}/search?query=${encodeURIComponent(query)}`;
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${currentToken}`,
          Accept: 'application/json',
        },
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`${res.status} ${res.statusText}: ${txt}`);
      }
      const data = await res.json();
      setResults(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || 'Error realizando búsqueda');
    } finally {
      setIsSearching(false);
    }
  };

  const handleDownload = async (uuid) => {
    if (!uuid || !currentToken) return;
    try {
      const url = `${baseUrl}/obtenerfile/${uuid}`;
      const res = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${currentToken}` },
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`${res.status} ${res.statusText}: ${txt}`);
      }
      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition');
      const filename = parseFilenameFromContentDisposition(cd) || `${uuid}`;

      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      setError(err.message || 'Error descargando archivo');
    }
  };

  return (
    <div className="mt-4">
      <form className="d-flex gap-2" onSubmit={handleSearch}>
        <input
          type="text"
          className="form-control"
          placeholder="Buscar por nombre (ej: 14mb.pdf)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={isSearching}
        />
        <button className="btn btn-primary" type="submit" disabled={isSearching || !query}>
          {isSearching ? 'Buscando...' : 'Buscar'}
        </button>
      </form>

      {error && (
        <div className="alert alert-danger mt-3" role="alert">
          {error}
        </div>
      )}

      {results.length > 0 && (
        <div className="mt-3">
          <div className="list-group">
            {results.map((item) => (
              <div key={item.uuid} className="list-group-item d-flex justify-content-between align-items-start">
                <div className="me-3">
                  <div className="fw-bold">{item.nombre}</div>
                  <div className="small text-muted">
                    UUID: {item.uuid}
                    <br />
                    Fecha: {new Date(item.fecha).toLocaleString()}
                    <br />
                    Tamaño: {item.tamaño_legible || `${item.tamaño} bytes`}
                    <br />
                    Tipo: {item.tipo_contenido}
                    <br />
                    Backup: {item.backup_status}{item.backup_timestamp ? ` (${new Date(item.backup_timestamp).toLocaleString()})` : ''}
                  </div>
                </div>
                <div>
                  <button className="btn btn-outline-secondary" onClick={() => handleDownload(item.uuid)}>
                    Descargar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!isSearching && results.length === 0 && !error && (
        <div className="text-muted small mt-3">No hay resultados</div>
      )}
    </div>
  );
};

export default FileSearch; 