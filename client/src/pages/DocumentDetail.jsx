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
import { FIELD_TYPE_LABELS, AUDIT_EVENT_LABELS } from '../labels';
import { formatCpf, isValidCpf } from '../cpf';

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
  const [form, setForm] = useState({ name: '', email: '', cpf: '', phone: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const setCpf = (e) => setForm((f) => ({ ...f, cpf: formatCpf(e.target.value) }));

  const submit = async (e) => {
    e.preventDefault();
    if (!isValidCpf(form.cpf)) {
      setErrors({ cpf: 'Informe um CPF válido' });
      return;
    }
    setBusy(true);
    setErrors({});
    try {
      await api(`/api/documents/${documentId}/signers`, { method: 'POST', body: form });
      toast('Signatário adicionado', 'success');
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
    <Modal title="Adicionar signatário" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="form-group">
          <label>Nome completo</label>
          <input className={`input${errors.name ? ' invalid' : ''}`} value={form.name} onChange={set('name')} autoFocus />
          {errors.name && <div className="field-error">{errors.name}</div>}
        </div>
        <div className="form-group">
          <label>E-mail</label>
          <input type="email" className={`input${errors.email ? ' invalid' : ''}`} value={form.email} onChange={set('email')} />
          {errors.email && <div className="field-error">{errors.email}</div>}
        </div>
        <div className="form-group">
          <label>CPF</label>
          <input
            className={`input${errors.cpf ? ' invalid' : ''}`}
            value={form.cpf}
            onChange={setCpf}
            placeholder="000.000.000-00"
            inputMode="numeric"
          />
          {errors.cpf && <div className="field-error">{errors.cpf}</div>}
        </div>
        <div className="form-group">
          <label>Número de WhatsApp (opcional)</label>
          <input className="input" value={form.phone} onChange={set('phone')} placeholder="+55 11 91234 5678" />
          <div className="form-hint">Se informado, o link de assinatura também será enviado por WhatsApp (360dialog).</div>
        </div>
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy && <Spinner />} Adicionar signatário
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

  if (!logs) return <LoadingBlock label="Carregando trilha de auditoria…" />;
  if (!logs.length) return <div className="empty-state">Nenhum evento registrado ainda.</div>;

  return (
    <div>
      {logs.map((log) => (
        <div key={log.id} className="audit-item">
          <div className="audit-icon">{EVENT_ICONS[log.event] || '•'}</div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{AUDIT_EVENT_LABELS[log.event] || log.event.replaceAll('_', ' ')}</div>
            <div style={{ fontSize: 13.5 }}>{log.description}</div>
            <div className="audit-meta">
              {new Date(log.created_at + 'Z').toLocaleString('pt-BR')}
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
  if (!doc) return <LoadingBlock label="Carregando documento…" />;

  const sendDocument = async () => {
    if (!doc.signers.length) return toast('Adicione pelo menos um signatário primeiro', 'error');
    if (!doc.fields.length) return toast('Posicione pelo menos um campo de assinatura primeiro', 'error');
    setSending(true);
    try {
      await api(`/api/documents/${id}/send`, { method: 'POST' });
      toast('Links de assinatura enviados a todos os signatários pendentes', 'success');
      load();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSending(false);
    }
  };

  const cancelDocument = async () => {
    if (!window.confirm('Cancelar este documento? Os links de assinatura pendentes deixarão de funcionar.')) return;
    try {
      await api(`/api/documents/${id}/cancel`, { method: 'POST' });
      toast('Documento cancelado', 'success');
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const removeSigner = async (signer) => {
    if (!window.confirm(`Remover ${signer.name}?`)) return;
    try {
      await api(`/api/documents/${id}/signers/${signer.id}`, { method: 'DELETE' });
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const fieldsBySignerPage = (pageNumber) => doc.fields.filter((f) => f.page_number === pageNumber);
  const signerName = (signerId) => doc.signers.find((s) => s.id === signerId)?.name || 'Signatário';

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
            : `${FIELD_TYPE_LABELS[f.field_type] || f.field_type} · ${signerName(f.signer_id)}`}
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
            Criado em {new Date(doc.created_at + 'Z').toLocaleString('pt-BR')} · {doc.signed_count}/{doc.signer_count} signatários concluíram
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {doc.status === 'draft' && (
            <>
              <Link to={`/documents/${id}/fields`} className="btn btn-secondary">Editar campos</Link>
              <button className="btn btn-primary" onClick={sendDocument} disabled={sending}>
                {sending && <Spinner />} Enviar para assinatura
              </button>
            </>
          )}
          {doc.status === 'pending_signature' && (
            <button className="btn btn-primary" onClick={sendDocument} disabled={sending}>
              {sending && <Spinner />} Reenviar links
            </button>
          )}
          {doc.status === 'completed' && (
            <button className="btn btn-primary" onClick={() => downloadSignedPdf(doc, toast)}>
              Baixar PDF assinado
            </button>
          )}
          {['draft', 'pending_signature'].includes(doc.status) && (
            <button className="btn btn-danger" onClick={cancelDocument}>Cancelar</button>
          )}
        </div>
      </div>

      {doc.status === 'completed' && (
        <div className="alert alert-info">
          Este documento foi concluído. O PDF final inclui todas as assinaturas e uma página de certificado com a trilha de auditoria completa.
        </div>
      )}

      <div className="detail-grid">
        <div>
          <div className="signature-tabs" style={{ marginBottom: 12 }}>
            <button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>Documento</button>
            <button className={tab === 'audit' ? 'active' : ''} onClick={() => setTab('audit')}>Trilha de auditoria</button>
          </div>
          {tab === 'overview'
            ? (pdfUrl ? <PdfViewer fileUrl={pdfUrl} renderOverlay={renderOverlay} maxWidth={640} /> : <LoadingBlock label="Carregando PDF…" />)
            : <div className="card"><div className="card-body"><AuditTrail documentId={id} /></div></div>}
        </div>

        <div className="card">
          <div className="card-header">
            <h2>Signatários</h2>
            {['draft', 'pending_signature'].includes(doc.status) && (
              <button className="btn btn-secondary btn-sm" onClick={() => setShowAddSigner(true)}>+ Adicionar</button>
            )}
          </div>
          <div className="card-body" style={{ paddingTop: 6, paddingBottom: 6 }}>
            {!doc.signers.length && <div className="empty-state" style={{ padding: '24px 0' }}>Nenhum signatário ainda.</div>}
            {doc.signers.map((s) => {
              const selfie = doc.signatures.find((sig) => sig.signer_id === s.id)?.selfie_image;
              return (
              <div key={s.id} className="signer-row">
                {selfie ? (
                  <img src={selfie} alt={`Selfie de ${s.name}`} className="avatar avatar-selfie" />
                ) : (
                  <div className="avatar">{s.name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()}</div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{s.name}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {s.email}{s.phone ? ` · ${s.phone}` : ''}
                  </div>
                  {s.cpf && (
                    <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>CPF: {formatCpf(s.cpf)}</div>
                  )}
                </div>
                <StatusBadge status={s.status} />
                {doc.status === 'draft' && (
                  <button className="btn btn-danger btn-sm" onClick={() => removeSigner(s)}>✕</button>
                )}
              </div>
              );
            })}
          </div>
        </div>
      </div>

      {showAddSigner && (
        <AddSignerModal documentId={id} onClose={() => setShowAddSigner(false)} onAdded={load} />
      )}
    </>
  );
}
