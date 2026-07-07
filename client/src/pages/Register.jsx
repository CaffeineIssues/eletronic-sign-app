import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Brand } from '../components/Layout';
import Spinner from '../components/Spinner';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      await register(form.name, form.email, form.password);
      navigate('/');
    } catch (err) {
      setError(err.errors ? null : err.message);
      setFieldErrors(err.errors || {});
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <div className="card-body">
          <div className="auth-brand"><Brand /></div>
          <h1 style={{ textAlign: 'center', fontSize: 20 }}>Create your account</h1>
          <p className="subtitle" style={{ textAlign: 'center', marginBottom: 20, color: 'var(--text-muted)', fontSize: 14 }}>
            Upload, send and sign documents in minutes
          </p>
          {error && <div className="alert alert-error">{error}</div>}
          <form onSubmit={submit}>
            <div className="form-group">
              <label htmlFor="name">Full name</label>
              <input id="name" className={`input${fieldErrors.name ? ' invalid' : ''}`} value={form.name}
                onChange={set('name')} required autoFocus />
              {fieldErrors.name && <div className="field-error">{fieldErrors.name}</div>}
            </div>
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input id="email" type="email" className={`input${fieldErrors.email ? ' invalid' : ''}`} value={form.email}
                onChange={set('email')} required />
              {fieldErrors.email && <div className="field-error">{fieldErrors.email}</div>}
            </div>
            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input id="password" type="password" className={`input${fieldErrors.password ? ' invalid' : ''}`}
                value={form.password} onChange={set('password')} required minLength={8} />
              {fieldErrors.password && <div className="field-error">{fieldErrors.password}</div>}
              <div className="form-hint">At least 8 characters.</div>
            </div>
            <button className="btn btn-primary btn-block" disabled={busy}>
              {busy && <Spinner />} Create account
            </button>
          </form>
          <div className="auth-footer">
            Already have an account? <Link to="/login">Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
