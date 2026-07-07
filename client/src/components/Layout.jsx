import { NavLink, Link, Outlet, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LoadingBlock } from './Spinner';

export function Brand() {
  return (
    <Link to="/" className="brand">
      <span className="brand-mark">eS</span>
      eSign
    </Link>
  );
}

export default function Layout() {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();

  if (loading) return <LoadingBlock label="Loading your workspace…" />;
  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="app-shell">
      <header className="topbar">
        <Brand />
        <nav>
          <NavLink to="/" end>Dashboard</NavLink>
          <NavLink to="/documents">Documents</NavLink>
          <NavLink to="/documents/upload">Upload</NavLink>
        </nav>
        <div className="user-chip">
          <span>
            {user.name} · <em>{user.role}</em>
          </span>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => {
              logout();
              navigate('/login');
            }}
          >
            Log out
          </button>
        </div>
      </header>
      <main className="page">
        <Outlet />
      </main>
    </div>
  );
}
