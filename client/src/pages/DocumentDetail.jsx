import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, fetchPdfBlobUrl } from '../api';
import { useToast } from '../context/ToastContext';
import { LoadingBlock } from '../components/Spinner';
import Spinner from '../components/Spinner';
import StatusBadge from '../components/StatusBadge';
import Modal from '../components/Modal';
import PdfViewer from '../components/PdfViewer';
import { downloadSignedPdf } from '../components/DocumentsTable';

const EVENT_ICONS = {
  document_uploaded: '⬆',
  signer_added: '＋',
  signing_link_sent: '✉',
  document_viewed: '👁',
  signature_started: '✍',
  signature_completed: '✔',
  document_completed: '★',
  document_cancelled: '✕',
};

function AddSignerModal({ documentId, onClose, onAdded }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      await api(`/api/documents/${documentId}/signers`, { method: 'POST', body: form });
      toast('Signer added', 'success');
      onAdded();
      onClose();
    } catch (err) {
      setErrors(err.errors || {});
      if (!err.errors) toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Add signer" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="form-group">
          <label>Full name</label>
          <input className={`input${errors.name ? ' invalid' : ''}`} value={form.name} onChange={set('name')} autoFocus />
          {errors.name && <div className="field-error">{errors.name}</div>}
        </div>
        <div className="form-group">
          <label>Email</label>
          <input type="email" className={`input${errors.email ? ' invalid' : ''}`} value={form.email} onChange={set('email')} />
          {errors.email && <div className="field-error">{errors.email}</div>}
        </div>
        <div className="form-group">
          <label>WhatsApp number (optional)</label>
          <input className="input" value={form.phone} onChange={set('phone')} placeholder="+55 11 91234 5678" />
          <div className="form-hint">If provided, the signing link is also sent via WhatsApp (360dialog).</div>
        </div>
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy && <Spinner />} Add signer
        </button>
      </form>
    </Modal>
  );
}

function AuditTrail({ documentId }) {
  const [logs, setLogs] = useState(null);

  useEffect(() => {
    api(`/api/documents/${documentId}/audit`).then((d) => setLogs(d.logs)).catch(() => setLogs([]));
  }, [documentId]);

  if (!logs) return <LoadingBlock label="Loading audit trail…" />;
  if (!logs.length) return <div className="empty-state">No events recorded yet.</div>;

  return (
    <div>
      {logs.map((log) => (
        <div key={log.id} className="audit-item">
          <div className="audit-icon">{EVENT_ICONS[log.event] || '•'}</div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{log.event.replaceAll('_', ' ')}</div>
            <div style={{ fontSize: 13.5 }}>{log.description}</div>
            <div className="audit-meta">
              {new Date(log.created_at + 'Z').toLocaleString()}
              {log.ip_address && <> · IP {log.ip_address}</>}
              {log.user_agent && <> · {log.user_agent.slice(0, 60)}…</>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function DocumentDetail() {
  const { id } = useParams();
  const toast = useToast();
  const [doc, setDoc] = useState(null);
  const [error, setError] = useState(null);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [showAddSigner, setShowAddSigner] = useState(false);
  const [sending, setSending] = useState(false);
  const [tab, setTab] = useState('overview');

  const load = useCallback(() => {
    api(`/api/documents/${id}`)
      .then((d) => setDoc(d.document))
      .catch((err) => setError(err.message));
  }, [id]);

  useEffect(load, [load]);

  useEffect(() => {
    let url;
    fetchPdfBlobUrl(`/api/documents/${id}/file`)
      .then((u) => { url = u; setPdfUrl(u); })
      .catch(() => {});
    return () => url && URL.revokeObjectURL(url);
  }, [id]);

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!doc) return <LoadingBlock label="Loading document…" />;

  const sendDocument = async () => {
    if (!doc.signers.length) return toast('Add at least one signer first', 'error');
    if (!doc.fields.length) return toast('Place at least one signature field first', 'error');
    setSending(true);
    try {
      await api(`/api/documents/${id}/send`, { method: 'POST' });
      toast('Signing links sent to all pending signers', 'success');
      load();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSending(false);
    }
  };

  const cancelDocument = async () => {
    if (!window.confirm('Cancel this document? Outstanding signing links will stop working.')) return;
    try {
      await api(`/api/documents/${id}/cancel`, { method: 'POST' });
      toast('Document cancelled', 'success');
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const removeSigner = async (signer) => {
    if (!window.confirm(`Remove ${signer.name}?`)) return;
    try {
      await api(`/api/documents/${id}/signers/${signer.id}`, { method: 'DELETE' });
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const fieldsBySignerPage = (pageNumber) => doc.fields.filter((f) => f.page_number === pageNumber);
  const signerName = (signerId) => doc.signers.find((s) => s.id === signerId)?.name || 'Signer';

  const renderOverlay = (pageNumber, size) => (
    <>
      {fieldsBySignerPage(pageNumber).map((f) => (
        <div
          key={f.id}
          className={`field-box readonly${f.signed_at ? ' signed' : ''}`}
          style={{
            left: f.x_position * size.width,
            top: f.y_position * size.height,
            width: f.width * size.width,
            height: f.height * size.height,
          }}
        >
          {f.signed_at && f.value?.startsWith('data:image')
            ? <img src={f.value} alt="signature" />
            : `${f.field_type} · ${signerName(f.signer_id)}`}
        </div>
      ))}
    </>
  );

  return (
    <>
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <h1>{doc.title}</h1>
            <StatusBadge status={doc.status} />
          </div>
          <p className="subtitle">
            Created {new Date(doc.created_at + 'Z').toLocaleString()} · {doc.signed_count}/{doc.signer_count} signers completed
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {doc.status === 'draft' && (
            <>
              <Link to={`/documents/${id}/fields`} className="btn btn-secondary">Edit fields</Link>
              <button className="btn btn-primary" onClick={sendDocument} disabled={sending}>
                {sending && <Spinner />} Send for signature
              </button>
            </>
          )}
          {doc.status === 'pending_signature' && (
            <button className="btn btn-primary" onClick={sendDocument} disabled={sending}>
              {sending && <Spinner />} Resend links
            </button>
          )}
          {doc.status === 'completed' && (
            <button className="btn btn-primary" onClick={() => downloadSignedPdf(doc, toast)}>
              Download signed PDF
            </button>
          )}
          {['draft', 'pending_signature'].includes(doc.status) && (
            <button className="btn btn-danger" onClick={cancelDocument}>Cancel</button>
          )}
        </div>
      </div>

      {doc.status === 'completed' && (
        <div className="alert alert-info">
          This document is completed. The final PDF includes every signature and a certificate page with the full audit trail.
        </div>
      )}

      <div className="detail-grid">
        <div>
          <div className="signature-tabs" style={{ marginBottom: 12 }}>
            <button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>Document</button>
            <button className={tab === 'audit' ? 'active' : ''} onClick={() => setTab('audit')}>Audit trail</button>
          </div>
          {tab === 'overview'
            ? (pdfUrl ? <PdfViewer fileUrl={pdfUrl} renderOverlay={renderOverlay} maxWidth={640} /> : <LoadingBlock label="Loading PDF…" />)
            : <div className="card"><div className="card-body"><AuditTrail documentId={id} /></div></div>}
        </div>

        <div className="card">
          <div className="card-header">
            <h2>Signers</h2>
            {['draft', 'pending_signature'].includes(doc.status) && (
              <button className="btn btn-secondary btn-sm" onClick={() => setShowAddSigner(true)}>+ Add</button>
            )}
          </div>
          <div className="card-body" style={{ paddingTop: 6, paddingBottom: 6 }}>
            {!doc.signers.length && <div className="empty-state" style={{ padding: '24px 0' }}>No signers yet.</div>}
            {doc.signers.map((s) => (
              <div key={s.id} className="signer-row">
                <div className="avatar">{s.name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{s.name}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {s.email}{s.phone ? ` · ${s.phone}` : ''}
                  </div>
                </div>
                <StatusBadge status={s.status} />
                {doc.status === 'draft' && (
                  <button className="btn btn-danger btn-sm" onClick={() => removeSigner(s)}>✕</button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {showAddSigner && (
        <AddSignerModal documentId={id} onClose={() => setShowAddSigner(false)} onAdded={load} />
      )}
    </>
  );
}
