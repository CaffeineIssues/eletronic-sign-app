import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Brand } from '../components/Layout';
import Spinner from '../components/Spinner';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <div className="card-body">
          <div className="auth-brand"><Brand /></div>
          <h1 style={{ textAlign: 'center', fontSize: 20 }}>Welcome back</h1>
          <p className="subtitle" style={{ textAlign: 'center', marginBottom: 20, color: 'var(--text-muted)', fontSize: 14 }}>
            Sign in to manage your documents
          </p>
          {error && <div className="alert alert-error">{error}</div>}
          <form onSubmit={submit}>
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input id="email" type="email" className="input" value={email}
                onChange={(e) => setEmail(e.target.value)} required autoFocus />
            </div>
            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input id="password" type="password" className="input" value={password}
                onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <button className="btn btn-primary btn-block" disabled={busy}>
              {busy && <Spinner />} Sign in
            </button>
          </form>
          <div className="auth-footer">
            No account yet? <Link to="/register">Create one</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
