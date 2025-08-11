import React, { useMemo, useState } from 'react';

function parseFilenameFromContentDisposition(headerValue) {
  if (!headerValue) return null;
  try {
    const utfPart = headerValue.split("filename*=UTF-8''")[1];
    if (utfPart) return decodeURIComponent(utfPart.trim().replace(/"/g, ''));
    const match = /filename\*=([^;]+)|filename=\"([^\"]+)\"|filename=([^;]+)/i.exec(headerValue);
    if (match) {
      return decodeURIComponent((match[1] || match[2] || match[3] || '').trim().replace(/\"/g, ''));
    }
  } catch (_) {}
  return null;
}

const FileSearch = ({ token, keycloak }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState('');
  const [downloadingUuid, setDownloadingUuid] = useState(null);
  const [downloadPercent, setDownloadPercent] = useState(0);
  const [downloadFilename, setDownloadFilename] = useState('');

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

  const handleDownload = async (uuid, suggestedName) => {
    if (!uuid || !currentToken) return;
    const url = `${baseUrl}/obtenerfile/${uuid}`;
    const authHeaders = { Authorization: `Bearer ${currentToken}` };

    setError('');
    setDownloadingUuid(uuid);
    setDownloadPercent(0);
    setDownloadFilename(suggestedName || uuid);

    try {
      const res = await fetch(url, { method: 'GET', headers: authHeaders });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`${res.status} ${res.statusText}: ${txt}`);
      }

      const total = Number(res.headers.get('Content-Length') || '0');
      const contentType = res.headers.get('Content-Type') || 'application/octet-stream';
      const cd = res.headers.get('Content-Disposition');
      const filename = parseFilenameFromContentDisposition(cd) || suggestedName || uuid;
      setDownloadFilename(filename);

      const reader = res.body && res.body.getReader ? res.body.getReader() : null;
      if (!reader) {
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(blobUrl);
        setDownloadPercent(100);
        setDownloadingUuid(null);
        return;
      }

      const parts = [];
      let received = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value && value.byteLength) {
          parts.push(value);
          received += value.byteLength;
          if (total > 0) {
            setDownloadPercent(Math.floor((received / total) * 100));
          }
        }
      }

      const blob = new Blob(parts, { type: contentType });
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
      setDownloadPercent(100);
    } catch (err) {
      setError(err.message || 'Error descargando archivo');
    } finally {
      setDownloadingUuid(null);
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
                <div className="text-end">
                  <button
                    className="btn btn-outline-secondary"
                    onClick={() => handleDownload(item.uuid, item.nombre)}
                    disabled={!!downloadingUuid}
                  >
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

      {downloadingUuid && (
        <div className="modal fade show" style={{ display: 'block', background: 'rgba(0,0,0,0.5)' }} tabIndex={-1}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Descargando</h5>
              </div>
              <div className="modal-body">
                <div className="mb-2"><strong>Archivo:</strong> {downloadFilename}</div>
                <div className="progress" style={{ height: 12 }}>
                  <div className="progress-bar" role="progressbar" style={{ width: `${downloadPercent}%` }} aria-valuenow={downloadPercent} aria-valuemin="0" aria-valuemax="100" />
                </div>
                <div className="small text-muted mt-2">
                  {downloadPercent}%
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" disabled>
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FileSearch; 