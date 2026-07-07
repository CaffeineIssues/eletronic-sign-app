import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { LoadingBlock } from '../components/Spinner';
import DocumentsTable from '../components/DocumentsTable';

const STAT_CARDS = [
  { key: 'total', label: 'Total documents' },
  { key: 'draft', label: 'Drafts' },
  { key: 'pending_signature', label: 'Pending signature' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
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
  if (!stats || !documents) return <LoadingBlock label="Loading dashboard…" />;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p className="subtitle">Welcome back, {user.name}</p>
        </div>
        <Link to="/documents/upload" className="btn btn-primary">+ Upload document</Link>
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
          <h2>Recent documents</h2>
          <Link to="/documents" className="btn btn-secondary btn-sm">View all</Link>
        </div>
        <DocumentsTable documents={documents.slice(0, 6)} onChanged={load} />
      </div>
    </>
  );
}
