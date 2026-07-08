import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { LoadingBlock } from '../components/Spinner';
import DocumentsTable from '../components/DocumentsTable';

export default function Documents() {
  const [documents, setDocuments] = useState(null);
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState(null);

  const load = () => {
    api('/api/documents')
      .then((d) => setDocuments(d.documents))
      .catch((err) => setError(err.message));
  };
  useEffect(load, []);

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!documents) return <LoadingBlock label="Carregando documentos…" />;

  const filtered = filter === 'all' ? documents : documents.filter((d) => d.status === filter);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Documentos</h1>
          <p className="subtitle">Todos os documentos que você possui</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <select className="input" style={{ width: 190 }} value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">Todos os status</option>
            <option value="draft">Rascunho</option>
            <option value="pending_signature">Aguardando assinatura</option>
            <option value="completed">Concluído</option>
            <option value="cancelled">Cancelado</option>
          </select>
          <Link to="/documents/upload" className="btn btn-primary">+ Enviar</Link>
        </div>
      </div>
      <div className="card">
        <DocumentsTable documents={filtered} onChanged={load} />
      </div>
    </>
  );
}
