'use client';

import { FormEvent, useState } from 'react';
import type { SessionUser } from './session-model';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export function LoginForm({user, onAuthenticated, onLogout, loggingOut}: {user: SessionUser | null; onAuthenticated: (user: SessionUser) => void; onLogout: () => void; loggingOut: boolean}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

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
      const body = (await response.json()) as { user: SessionUser };
      onAuthenticated(body.user);
    } catch {
      setError('No pudimos conectarnos con el servidor. Intentá nuevamente.');
    } finally {
      setSubmitting(false);
    }
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
      const body = (await response.json()) as { user: SessionUser };
      onAuthenticated(body.user);
    } catch {
      setError('No pudimos conectarnos con el servidor. Intentá nuevamente.');
    } finally {
      setSubmitting(false);
    }
  }

  if (user) {
    return (
      <section className="access-panel" aria-labelledby="welcome-title">
        <div className="user-row">
          <div>
            <p className="eyebrow">Sesión iniciada</p>
            <h1 id="welcome-title">Hola, {user.name}</h1>
          </div>
          <button className="text-button" type="button" onClick={onLogout} disabled={loggingOut}>Cerrar sesión</button>
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
