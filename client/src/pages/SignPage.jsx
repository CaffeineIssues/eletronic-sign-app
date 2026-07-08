import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import SignaturePad from 'signature_pad';
import { api, fetchPdfBlobUrl } from '../api';
import { useToast } from '../context/ToastContext';
import Spinner, { LoadingBlock } from '../components/Spinner';
import PdfViewer from '../components/PdfViewer';
import { Brand } from '../components/Layout';
import { SIGNER_FIELD_PROMPTS } from '../labels';
import { formatCpf } from '../cpf';

function typedSignatureImage(name) {
  const canvas = document.createElement('canvas');
  canvas.width = 600;
  canvas.height = 200;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#1e1b4b';
  ctx.font = '72px "Brush Script MT", "Segoe Script", cursive';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, 300, 100);
  return canvas.toDataURL('image/png');
}

function DrawPad({ onChange }) {
  const canvasRef = useRef(null);
  const padRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const resize = () => {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const data = padRef.current?.toData();
      canvas.width = canvas.offsetWidth * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      canvas.getContext('2d').scale(ratio, ratio);
      if (padRef.current && data) padRef.current.fromData(data);
    };
    padRef.current = new SignaturePad(canvas, { penColor: '#1e1b4b' });
    padRef.current.addEventListener('endStroke', () => {
      onChange(padRef.current.isEmpty() ? null : padRef.current.toDataURL('image/png'));
    });
    resize();
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
      padRef.current?.off();
    };
  }, [onChange]);

  return (
    <div>
      <div className="sig-canvas-wrap">
        <canvas ref={canvasRef} />
      </div>
      <div style={{ marginTop: 8 }}>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => {
            padRef.current.clear();
            onChange(null);
          }}
        >
          Limpar
        </button>
      </div>
    </div>
  );
}

function SelfieCapture({ value, onChange }) {
  const toast = useToast();
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOn(true);
    } catch {
      setCameraError('Não foi possível acessar a câmera. Verifique as permissões ou envie uma foto abaixo.');
    }
  };

  useEffect(() => {
    if (cameraOn && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [cameraOn]);

  const capture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    onChange(canvas.toDataURL('image/jpeg', 0.85));
    stopCamera();
  };

  const onFile = (file) => {
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      toast('A selfie deve ser PNG ou JPEG', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result);
    reader.readAsDataURL(file);
  };

  if (value) {
    return (
      <div className="selfie-wrap">
        <img src={value} alt="Sua selfie" className="selfie-preview" />
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => { onChange(null); startCamera(); }}>
          Tirar outra
        </button>
      </div>
    );
  }

  return (
    <div className="selfie-wrap">
      {cameraOn ? (
        <>
          <video ref={videoRef} className="selfie-video" playsInline muted />
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-primary" onClick={capture}>📸 Capturar</button>
            <button type="button" className="btn btn-secondary" onClick={stopCamera}>Cancelar</button>
          </div>
        </>
      ) : (
        <>
          {cameraError && <div className="alert alert-error" style={{ marginBottom: 10 }}>{cameraError}</div>}
          <button type="button" className="btn btn-primary" onClick={startCamera}>📷 Abrir câmera</button>
          <div className="form-hint" style={{ margin: '10px 0 6px' }}>
            Ou envie uma foto sua (a câmera do celular abre automaticamente):
          </div>
          <input
            type="file"
            accept="image/png,image/jpeg"
            capture="user"
            className="input"
            onChange={(e) => onFile(e.target.files[0])}
          />
        </>
      )}
    </div>
  );
}

export default function SignPage() {
  const { token } = useParams();
  const toast = useToast();
  const [session, setSession] = useState(null);
  const [error, setError] = useState(null);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [tab, setTab] = useState('draw');
  const [drawnImage, setDrawnImage] = useState(null);
  const [typedName, setTypedName] = useState('');
  const [uploadedImage, setUploadedImage] = useState(null);
  const [fieldValues, setFieldValues] = useState({});
  const [selfieImage, setSelfieImage] = useState(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [done, setDone] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => {
    api(`/api/signing/${token}`, { auth: false })
      .then((d) => {
        setSession(d);
        setTypedName(d.signer.name);
        if (d.signer.status === 'signed') setDone(true);
      })
      .catch((err) => setError(err.message));
    let url;
    fetchPdfBlobUrl(`/api/signing/${token}/file`, { auth: false })
      .then((u) => { url = u; setPdfUrl(u); })
      .catch(() => {});
    return () => url && URL.revokeObjectURL(url);
  }, [token]);

  const markStarted = useCallback(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    api(`/api/signing/${token}/start`, { method: 'POST', auth: false }).catch(() => {});
  }, [token]);

  const onDraw = useCallback(
    (img) => {
      markStarted();
      setDrawnImage(img);
    },
    [markStarted]
  );

  const onUpload = (file) => {
    if (!file) return setUploadedImage(null);
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      toast('A imagem da assinatura deve ser PNG ou JPEG', 'error');
      return;
    }
    markStarted();
    const reader = new FileReader();
    reader.onload = () => setUploadedImage(reader.result);
    reader.readAsDataURL(file);
  };

  const signatureImage =
    tab === 'draw' ? drawnImage : tab === 'type' ? (typedName.trim() ? typedSignatureImage(typedName.trim()) : null) : uploadedImage;
  const method = tab === 'draw' ? 'drawn' : tab === 'type' ? 'typed' : 'uploaded';

  const submit = async () => {
    setFieldErrors({});
    if (!signatureImage) return toast('Adicione sua assinatura primeiro', 'error');
    if (!selfieImage) return toast('Tire uma selfie de verificação primeiro', 'error');
    if (!consent) return toast('Você precisa aceitar a declaração de consentimento', 'error');
    setBusy(true);
    try {
      await api(`/api/signing/${token}/complete`, {
        method: 'POST',
        auth: false,
        body: {
          consent,
          method,
          signature_image: signatureImage,
          selfie_image: selfieImage,
          field_values: fieldValues,
        },
      });
      setDone(true);
      window.scrollTo(0, 0);
    } catch (err) {
      setFieldErrors(err.errors || {});
      toast(err.errors ? 'Revise os campos destacados' : err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <div className="auth-wrap">
        <div className="card auth-card">
          <div className="card-body" style={{ textAlign: 'center' }}>
            <div className="auth-brand"><Brand /></div>
            <h2>Link indisponível</h2>
            <p style={{ color: 'var(--text-muted)', marginTop: 8 }}>{error}</p>
          </div>
        </div>
      </div>
    );
  }
  if (!session) return <LoadingBlock label="Carregando seu documento…" />;

  const textFields = session.fields.filter((f) => f.field_type === 'text');

  const renderOverlay = (pageNumber, size) => (
    <>
      {session.fields
        .filter((f) => f.page_number === pageNumber)
        .map((f) => (
          <div
            key={f.id}
            className={`field-box readonly${f.signed_at || done ? ' signed' : ''}`}
            style={{
              left: f.x_position * size.width,
              top: f.y_position * size.height,
              width: f.width * size.width,
              height: f.height * size.height,
            }}
          >
            {done && signatureImage && ['signature', 'initials'].includes(f.field_type)
              ? <img src={signatureImage} alt="signature" />
              : `${SIGNER_FIELD_PROMPTS[f.field_type] || f.field_type}${f.required ? ' *' : ''}`}
          </div>
        ))}
    </>
  );

  return (
    <div className="sign-shell">
      <div className="sign-header">
        <Brand />
        <div style={{ fontSize: 13.5, color: 'var(--text-muted)' }}>
          Assinando como <strong>{session.signer.name}</strong> ({session.signer.email})
          {session.signer.cpf && <> · CPF {formatCpf(session.signer.cpf)}</>}
        </div>
      </div>

      {done ? (
        <div className="card sign-complete">
          <div className="check">✓</div>
          <h1>Obrigado, tudo certo!</h1>
          <p style={{ color: 'var(--text-muted)', marginTop: 8 }}>
            Sua assinatura em “{session.document.title}” foi registrada.
            {session.document.owner_name && <> {session.document.owner_name} foi notificado(a).</>}
            {' '}Assim que todos os signatários concluírem, o PDF final assinado será gerado automaticamente.
          </p>
        </div>
      ) : (
        <>
          <div className="alert alert-info">
            <strong>{session.document.owner_name || 'O remetente'}</strong> solicitou sua assinatura em{' '}
            <strong>{session.document.title}</strong>. Revise o documento abaixo e adicione sua assinatura.
          </div>

          {pdfUrl ? <PdfViewer fileUrl={pdfUrl} renderOverlay={renderOverlay} maxWidth={760} /> : <LoadingBlock label="Carregando PDF…" />}

          <div className="card" style={{ marginTop: 20 }}>
            <div className="card-header"><h2>Sua assinatura</h2></div>
            <div className="card-body">
              <div className="signature-tabs">
                <button className={tab === 'draw' ? 'active' : ''} onClick={() => setTab('draw')}>✍ Desenhar</button>
                <button className={tab === 'type' ? 'active' : ''} onClick={() => { setTab('type'); markStarted(); }}>⌨ Digitar</button>
                <button className={tab === 'upload' ? 'active' : ''} onClick={() => setTab('upload')}>⬆ Enviar imagem</button>
              </div>

              {tab === 'draw' && <DrawPad onChange={onDraw} />}

              {tab === 'type' && (
                <div>
                  <div className="form-group">
                    <label>Digite seu nome</label>
                    <input className="input" value={typedName} onChange={(e) => setTypedName(e.target.value)} />
                  </div>
                  <div className="sig-typed-preview">{typedName.trim() || 'Seu nome'}</div>
                </div>
              )}

              {tab === 'upload' && (
                <div>
                  <div className="form-group">
                    <label>Envie uma imagem da assinatura (PNG ou JPEG)</label>
                    <input type="file" accept="image/png,image/jpeg" className="input" onChange={(e) => onUpload(e.target.files[0])} />
                  </div>
                  {uploadedImage && (
                    <div className="sig-canvas-wrap" style={{ padding: 12, textAlign: 'center' }}>
                      <img src={uploadedImage} alt="signature preview" style={{ maxHeight: 120, maxWidth: '100%' }} />
                    </div>
                  )}
                </div>
              )}

              {textFields.length > 0 && (
                <div style={{ marginTop: 18 }}>
                  <h3 style={{ marginBottom: 10 }}>Campos adicionais</h3>
                  {textFields.map((f) => (
                    <div className="form-group" key={f.id}>
                      <label>Campo de texto (página {f.page_number}){f.required ? ' *' : ''}</label>
                      <input
                        className={`input${fieldErrors[`field_${f.id}`] ? ' invalid' : ''}`}
                        value={fieldValues[f.id] || ''}
                        onChange={(e) => setFieldValues((v) => ({ ...v, [f.id]: e.target.value }))}
                      />
                      {fieldErrors[`field_${f.id}`] && <div className="field-error">{fieldErrors[`field_${f.id}`]}</div>}
                    </div>
                  ))}
                </div>
              )}

              <div style={{ marginTop: 18 }}>
                <h3 style={{ marginBottom: 4 }}>Selfie de verificação *</h3>
                <div className="form-hint" style={{ marginBottom: 10 }}>
                  Para sua segurança, tire uma selfie que será anexada ao certificado de assinatura.
                </div>
                <SelfieCapture
                  value={selfieImage}
                  onChange={(img) => {
                    if (img) markStarted();
                    setSelfieImage(img);
                  }}
                />
                {fieldErrors.selfie && <div className="field-error">{fieldErrors.selfie}</div>}
              </div>

              <label className="consent-row">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                <span>{session.consent_text}</span>
              </label>

              <button
                className="btn btn-primary btn-block"
                onClick={submit}
                disabled={busy || !consent || !signatureImage || !selfieImage}
              >
                {busy && <Spinner />} Concluir assinatura
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
