import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, fetchPdfBlobUrl } from '../api';
import { useToast } from '../context/ToastContext';
import Spinner, { LoadingBlock } from '../components/Spinner';
import PdfViewer from '../components/PdfViewer';

const DEFAULT_SIZES = {
  signature: { width: 0.28, height: 0.06 },
  initials: { width: 0.1, height: 0.05 },
  date: { width: 0.16, height: 0.04 },
  text: { width: 0.24, height: 0.04 },
};

let tempId = -1;

export default function FieldEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [doc, setDoc] = useState(null);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [fields, setFields] = useState([]);
  const [activeSigner, setActiveSigner] = useState(null);
  const [fieldType, setFieldType] = useState('signature');
  const [required, setRequired] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const dragRef = useRef(null);

  useEffect(() => {
    api(`/api/documents/${id}`)
      .then((d) => {
        setDoc(d.document);
        setFields(d.document.fields.map((f) => ({ ...f, required: !!f.required })));
        if (d.document.signers.length) setActiveSigner(d.document.signers[0].id);
      })
      .catch((err) => setError(err.message));
    let url;
    fetchPdfBlobUrl(`/api/documents/${id}/file`).then((u) => { url = u; setPdfUrl(u); }).catch(() => {});
    return () => url && URL.revokeObjectURL(url);
  }, [id]);

  const addField = (pageNumber, e, size) => {
    if (!activeSigner) {
      toast('Add a signer before placing fields', 'error');
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const def = DEFAULT_SIZES[fieldType];
    const x = (e.clientX - rect.left) / size.width - def.width / 2;
    const y = (e.clientY - rect.top) / size.height - def.height / 2;
    setFields((prev) => [
      ...prev,
      {
        id: tempId--,
        signer_id: activeSigner,
        page_number: pageNumber,
        x_position: Math.min(Math.max(x, 0), 1 - def.width),
        y_position: Math.min(Math.max(y, 0), 1 - def.height),
        width: def.width,
        height: def.height,
        field_type: fieldType,
        required,
      },
    ]);
  };

  const startDrag = (e, field, size, mode) => {
    e.stopPropagation();
    e.preventDefault();
    dragRef.current = {
      fieldId: field.id,
      mode,
      startX: e.clientX,
      startY: e.clientY,
      orig: { ...field },
      size,
    };
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', endDrag);
  };

  const onDragMove = useCallback((e) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = (e.clientX - drag.startX) / drag.size.width;
    const dy = (e.clientY - drag.startY) / drag.size.height;
    setFields((prev) =>
      prev.map((f) => {
        if (f.id !== drag.fieldId) return f;
        if (drag.mode === 'move') {
          return {
            ...f,
            x_position: Math.min(Math.max(drag.orig.x_position + dx, 0), 1 - f.width),
            y_position: Math.min(Math.max(drag.orig.y_position + dy, 0), 1 - f.height),
          };
        }
        return {
          ...f,
          width: Math.min(Math.max(drag.orig.width + dx, 0.04), 1 - f.x_position),
          height: Math.min(Math.max(drag.orig.height + dy, 0.02), 1 - f.y_position),
        };
      })
    );
  }, []);

  const endDrag = useCallback(() => {
    dragRef.current = null;
    window.removeEventListener('pointermove', onDragMove);
    window.removeEventListener('pointerup', endDrag);
  }, [onDragMove]);

  const removeField = (fieldId) => setFields((prev) => prev.filter((f) => f.id !== fieldId));

  const save = async (thenBack = false) => {
    setSaving(true);
    try {
      const payload = fields.map(({ signer_id, page_number, x_position, y_position, width, height, field_type, required }) => ({
        signer_id, page_number, x_position, y_position, width, height, field_type, required,
      }));
      await api(`/api/documents/${id}/fields`, { method: 'PUT', body: { fields: payload } });
      toast('Fields saved', 'success');
      if (thenBack) navigate(`/documents/${id}`);
    } catch (err) {
      toast(err.errors?.fields || err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!doc) return <LoadingBlock label="Loading editor…" />;

  if (doc.status !== 'draft') {
    return (
      <div className="alert alert-error">
        Fields can only be edited while the document is a draft.{' '}
        <Link to={`/documents/${id}`}>Back to document</Link>
      </div>
    );
  }

  const signerName = (signerId) => doc.signers.find((s) => s.id === signerId)?.name || 'Signer';

  const renderOverlay = (pageNumber, size) => (
    <div
      style={{ position: 'absolute', inset: 0, cursor: 'copy' }}
      onClick={(e) => addField(pageNumber, e, size)}
    >
      {fields
        .filter((f) => f.page_number === pageNumber)
        .map((f) => (
          <div
            key={f.id}
            className="field-box"
            style={{
              left: f.x_position * size.width,
              top: f.y_position * size.height,
              width: f.width * size.width,
              height: f.height * size.height,
            }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => startDrag(e, f, size, 'move')}
          >
            {f.field_type} · {signerName(f.signer_id)}{f.required ? ' *' : ''}
            <button className="field-remove" onPointerDown={(e) => e.stopPropagation()} onClick={() => removeField(f.id)}>
              ✕
            </button>
            <span className="field-resize" onPointerDown={(e) => startDrag(e, f, size, 'resize')} />
          </div>
        ))}
    </div>
  );

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Field editor</h1>
          <p className="subtitle">{doc.title} — click on the page to place a field, drag to move, corner to resize</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link to={`/documents/${id}`} className="btn btn-secondary">Back</Link>
          <button className="btn btn-primary" onClick={() => save(true)} disabled={saving}>
            {saving && <Spinner />} Save fields
          </button>
        </div>
      </div>

      {!doc.signers.length && (
        <div className="alert alert-error">
          This document has no signers yet. <Link to={`/documents/${id}`}>Add signers first</Link>, then place their fields.
        </div>
      )}

      <div className="card editor-toolbar">
        <span className="toolbar-label">Signer</span>
        <select className="input" style={{ width: 200 }} value={activeSigner ?? ''} onChange={(e) => setActiveSigner(Number(e.target.value))}>
          {doc.signers.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <span className="toolbar-label">Field type</span>
        <select className="input" style={{ width: 150 }} value={fieldType} onChange={(e) => setFieldType(e.target.value)}>
          <option value="signature">Signature</option>
          <option value="initials">Initials</option>
          <option value="date">Date signed</option>
          <option value="text">Text</option>
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5, fontWeight: 600 }}>
          <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
          Required
        </label>
        <span style={{ flex: 1 }} />
        <span className="toolbar-label">{fields.length} field{fields.length === 1 ? '' : 's'} placed</span>
      </div>

      {pdfUrl ? <PdfViewer fileUrl={pdfUrl} renderOverlay={renderOverlay} /> : <LoadingBlock label="Loading PDF…" />}
    </>
  );
}
