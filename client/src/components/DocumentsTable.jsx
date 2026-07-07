import { Link, useNavigate } from 'react-router-dom';
import { api, fetchPdfBlobUrl } from '../api';
import { useToast } from '../context/ToastContext';
import StatusBadge from './StatusBadge';

export async function downloadSignedPdf(doc, toast) {
  try {
    const url = await fetchPdfBlobUrl(`/api/documents/${doc.id}/signed-file`);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${doc.title} (signed).pdf`;
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    toast('Signed PDF is not available yet', 'error');
  }
}

export default function DocumentsTable({ documents, onChanged }) {
  const toast = useToast();
  const navigate = useNavigate();

  const cancelDocument = async (doc) => {
    if (!window.confirm(`Cancel "${doc.title}"? Outstanding signing links will stop working.`)) return;
    try {
      await api(`/api/documents/${doc.id}/cancel`, { method: 'POST' });
      toast('Document cancelled', 'success');
      onChanged?.();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  if (!documents.length) {
    return (
      <div className="empty-state">
        <h3>No documents yet</h3>
        <p>Upload a PDF to get started.</p>
        <div style={{ marginTop: 14 }}>
          <Link to="/documents/upload" className="btn btn-primary">Upload document</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="table">
        <thead>
          <tr>
            <th>Title</th>
            <th>Status</th>
            <th>Signers</th>
            <th>Created</th>
            <th style={{ textAlign: 'right' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {documents.map((doc) => (
            <tr key={doc.id}>
              <td>
                <Link to={`/documents/${doc.id}`} style={{ fontWeight: 600 }}>{doc.title}</Link>
              </td>
              <td><StatusBadge status={doc.status} /></td>
              <td>{doc.signed_count}/{doc.signer_count} signed</td>
              <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                {new Date(doc.created_at + 'Z').toLocaleDateString()}
              </td>
              <td>
                <div className="row-actions">
                  <Link to={`/documents/${doc.id}`} className="btn btn-secondary btn-sm">View</Link>
                  {doc.status === 'draft' && (
                    <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/documents/${doc.id}/fields`)}>
                      Edit fields
                    </button>
                  )}
                  {doc.status === 'completed' && (
                    <button className="btn btn-secondary btn-sm" onClick={() => downloadSignedPdf(doc, toast)}>
                      Download
                    </button>
                  )}
                  {['draft', 'pending_signature'].includes(doc.status) && (
                    <button className="btn btn-danger btn-sm" onClick={() => cancelDocument(doc)}>Cancel</button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
