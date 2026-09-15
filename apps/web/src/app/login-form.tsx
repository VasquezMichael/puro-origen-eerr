'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';

type BranchAccess = { branchId: string; role: 'READER' | 'EDITOR' };
type User = {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  branchAccesses: BranchAccess[];
  mustChangePassword: boolean;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export function LoginForm() {
  const [user, setUser] = useState<User | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${API_URL}/auth/me`, { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) return;
        const body = (await response.json()) as { user: User };
        setUser(body.user);
      })
      .catch(() => undefined)
      .finally(() => setLoadingSession(false));
  }, []);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.get('email'),
          password: form.get('password'),
        }),
      });
      if (!response.ok) {
        setError('No pudimos iniciar sesión. Revisá el email y la contraseña.');
        return;
      }
      const body = (await response.json()) as { user: User };
      setUser(body.user);
    } catch {
      setError('No pudimos conectarnos con el servidor. Intentá nuevamente.');
    } finally {
      setSubmitting(false);
    }
  }

  async function logout() {
    await fetch(`${API_URL}/auth/logout`, { method: 'POST', credentials: 'include' });
    setUser(null);
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`${API_URL}/auth/password`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: form.get('currentPassword'),
          newPassword: form.get('newPassword'),
        }),
      });
      if (!response.ok) {
        setError('No pudimos cambiar la contraseña. Revisá la contraseña actual.');
        return;
      }
      const body = (await response.json()) as { user: User };
      setUser(body.user);
    } catch {
      setError('No pudimos conectarnos con el servidor. Intentá nuevamente.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingSession) return <p className="session-status">Comprobando sesión...</p>;

  if (user) {
    const canEdit = user.isAdmin || user.branchAccesses.some((access) => access.role === 'EDITOR');
    return (
      <section className="access-panel" aria-labelledby="welcome-title">
        <div className="user-row">
          <div>
            <p className="eyebrow">Sesión iniciada</p>
            <h1 id="welcome-title">Hola, {user.name}</h1>
          </div>
          <button className="text-button" type="button" onClick={logout}>Cerrar sesión</button>
        </div>
        {user.mustChangePassword && (
          <form className="password-form" onSubmit={changePassword}>
            <p className="notice">Tu contraseña es temporal. Cambiala antes de comenzar a trabajar.</p>
            <label>Contraseña actual<input name="currentPassword" type="password" autoComplete="current-password" required /></label>
            <label>Nueva contraseña<input name="newPassword" type="password" minLength={12} autoComplete="new-password" required /></label>
            {error && <p className="error" role="alert">{error}</p>}
            <button className="primary-button" type="submit" disabled={submitting}>
              {submitting ? 'Guardando...' : 'Cambiar contraseña'}
            </button>
          </form>
        )}
        <div className="mode-copy">
          <p className="eyebrow">Elegí un modo</p>
          <h2>¿Qué querés hacer hoy?</h2>
        </div>
        {user.isAdmin && <Link className="admin-branches-link" href="/admin/sucursales">Administrar sucursales <span aria-hidden="true">→</span></Link>}
        {!user.mustChangePassword && <Link className="admin-branches-link" href="/eerr">Sucursales y períodos · EERR <span aria-hidden="true">→</span></Link>}
        <div className="mode-grid">
          <button className="mode-card" type="button" disabled={user.mustChangePassword}>
            <span className="mode-icon">A</span>
            <strong>Modo Análisis</strong>
            <small>Consultar períodos, indicadores y comparativas.</small>
          </button>
          <button className="mode-card" type="button" disabled={!canEdit || user.mustChangePassword}>
            <span className="mode-icon">E</span>
            <strong>Modo Editor</strong>
            <small>{canEdit ? 'Cargar y administrar información financiera.' : 'Tu perfil tiene acceso de solo lectura.'}</small>
          </button>
        </div>
      </section>
    );
  }

  return (
    <form className="login-card" onSubmit={handleLogin}>
      <div>
        <p className="eyebrow">Acceso privado</p>
        <h1>Bienvenido</h1>
        <p className="intro">Ingresá para gestionar los estados de resultados.</p>
      </div>
      <label>Email<input name="email" type="email" autoComplete="email" required /></label>
      <label>Contraseña<input name="password" type="password" autoComplete="current-password" required /></label>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="primary-button" type="submit" disabled={submitting}>
        {submitting ? 'Ingresando...' : 'Ingresar'}
      </button>
      <p className="help">Si olvidaste tu contraseña, pedile al administrador que la restablezca.</p>
    </form>
  );
}
