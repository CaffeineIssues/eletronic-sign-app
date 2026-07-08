import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useToast } from '../context/ToastContext';
import Spinner from '../components/Spinner';

export default function Upload() {
  const navigate = useNavigate();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [file, setFile] = useState(null);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const onFile = (f) => {
    setFile(f || null);
    if (f && !title) setTitle(f.name.replace(/\.pdf$/i, ''));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!file) {
      setErrors({ file: 'Escolha um arquivo PDF para enviar' });
      return;
    }
    setBusy(true);
    setErrors({});
    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', title);
    try {
      const data = await api('/api/documents', { method: 'POST', formData });
      toast('Documento enviado', 'success');
      navigate(`/documents/${data.document.id}`);
    } catch (err) {
      setErrors(err.errors || { file: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Enviar documento</h1>
          <p className="subtitle">Apenas arquivos PDF são aceitos (máx. 25 MB)</p>
        </div>
      </div>
      <div className="card" style={{ maxWidth: 560 }}>
        <div className="card-body">
          <form onSubmit={submit}>
            <div className="form-group">
              <label htmlFor="title">Título do documento</label>
              <input id="title" className="input" value={title} onChange={(e) => setTitle(e.target.value)}
                placeholder="ex.: Contrato de Consultoria" />
            </div>
            <div className="form-group">
              <label htmlFor="file">Arquivo PDF</label>
              <input id="file" type="file" accept="application/pdf" className={`input${errors.file ? ' invalid' : ''}`}
                onChange={(e) => onFile(e.target.files[0])} />
              {errors.file && <div className="field-error">{errors.file}</div>}
            </div>
            <button className="btn btn-primary" disabled={busy}>
              {busy && <Spinner />} Enviar
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
