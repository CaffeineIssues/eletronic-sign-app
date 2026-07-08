import { Link, useNavigate } from 'react-router-dom';
import { api, fetchPdfBlobUrl } from '../api';
import { useToast } from '../context/ToastContext';
import StatusBadge from './StatusBadge';

export async function downloadSignedPdf(doc, toast) {
  try {
    const url = await fetchPdfBlobUrl(`/api/documents/${doc.id}/signed-file`);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${doc.title} (assinado).pdf`;
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    toast('O PDF assinado ainda não está disponível', 'error');
  }
}

export default function DocumentsTable({ documents, onChanged }) {
  const toast = useToast();
  const navigate = useNavigate();

  const cancelDocument = async (doc) => {
    if (!window.confirm(`Cancelar "${doc.title}"? Os links de assinatura pendentes deixarão de funcionar.`)) return;
    try {
      await api(`/api/documents/${doc.id}/cancel`, { method: 'POST' });
      toast('Documento cancelado', 'success');
      onChanged?.();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  if (!documents.length) {
    return (
      <div className="empty-state">
        <h3>Nenhum documento ainda</h3>
        <p>Envie um PDF para começar.</p>
        <div style={{ marginTop: 14 }}>
          <Link to="/documents/upload" className="btn btn-primary">Enviar documento</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="table">
        <thead>
          <tr>
            <th>Título</th>
            <th>Status</th>
            <th>Signatários</th>
            <th>Criado em</th>
            <th style={{ textAlign: 'right' }}>Ações</th>
          </tr>
        </thead>
        <tbody>
          {documents.map((doc) => (
            <tr key={doc.id}>
              <td>
                <Link to={`/documents/${doc.id}`} style={{ fontWeight: 600 }}>{doc.title}</Link>
              </td>
              <td><StatusBadge status={doc.status} /></td>
              <td>{doc.signed_count}/{doc.signer_count} assinaram</td>
              <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                {new Date(doc.created_at + 'Z').toLocaleDateString('pt-BR')}
              </td>
              <td>
                <div className="row-actions">
                  <Link to={`/documents/${doc.id}`} className="btn btn-secondary btn-sm">Ver</Link>
                  {doc.status === 'draft' && (
                    <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/documents/${doc.id}/fields`)}>
                      Editar campos
                    </button>
                  )}
                  {doc.status === 'completed' && (
                    <button className="btn btn-secondary btn-sm" onClick={() => downloadSignedPdf(doc, toast)}>
                      Baixar
                    </button>
                  )}
                  {['draft', 'pending_signature'].includes(doc.status) && (
                    <button className="btn btn-danger btn-sm" onClick={() => cancelDocument(doc)}>Cancelar</button>
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
