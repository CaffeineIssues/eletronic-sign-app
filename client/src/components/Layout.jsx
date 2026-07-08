import { NavLink, Link, Outlet, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LoadingBlock } from './Spinner';

export function Brand() {
  return (
    <Link to="/" className="brand">
      <img src="/logo.svg" alt="JuliPet — Clínica Veterinária" className="brand-logo" />
    </Link>
  );
}

export default function Layout() {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();

  if (loading) return <LoadingBlock label="Carregando seu espaço de trabalho…" />;
  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="app-shell">
      <header className="topbar">
        <Brand />
        <nav>
          <NavLink to="/" end>Painel</NavLink>
          <NavLink to="/documents">Documentos</NavLink>
          <NavLink to="/documents/upload">Enviar PDF</NavLink>
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
            Sair
          </button>
        </div>
      </header>
      <main className="page">
        <Outlet />
      </main>
    </div>
  );
}
