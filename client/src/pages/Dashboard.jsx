import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { LoadingBlock } from '../components/Spinner';
import DocumentsTable from '../components/DocumentsTable';

const STAT_CARDS = [
  { key: 'total', label: 'Total de documentos' },
  { key: 'draft', label: 'Rascunhos' },
  { key: 'pending_signature', label: 'Aguardando assinatura' },
  { key: 'completed', label: 'Concluídos' },
  { key: 'cancelled', label: 'Cancelados' },
];

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [documents, setDocuments] = useState(null);
  const [error, setError] = useState(null);

  const load = () => {
    Promise.all([api('/api/documents/stats'), api('/api/documents')])
      .then(([s, d]) => {
        setStats(s.stats);
        setDocuments(d.documents);
      })
      .catch((err) => setError(err.message));
  };

  useEffect(load, []);

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!stats || !documents) return <LoadingBlock label="Carregando painel…" />;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Painel</h1>
          <p className="subtitle">Bem-vindo(a) de volta, {user.name}</p>
        </div>
        <Link to="/documents/upload" className="btn btn-primary">+ Enviar documento</Link>
      </div>

      <div className="stat-grid">
        {STAT_CARDS.map((c) => (
          <div key={c.key} className="card stat-card">
            <div className="stat-label">{c.label}</div>
            <div className="stat-value">{stats[c.key]}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Documentos recentes</h2>
          <Link to="/documents" className="btn btn-secondary btn-sm">Ver todos</Link>
        </div>
        <DocumentsTable documents={documents.slice(0, 6)} onChanged={load} />
      </div>
    </>
  );
}
