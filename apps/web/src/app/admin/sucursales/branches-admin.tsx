'use client';

import Link from 'next/link';
import { Modal } from '../../eerr/overlays';
import { WorkspaceShell } from '../../eerr/workspace-shell';
import shellStyles from '../../eerr/workspace.module.css';
import { notifySessionExpired } from '../../session-context';
import { FormEvent, useEffect, useRef, useState } from 'react';

type Branch = {
  id: string; code: string; name: string; startDate: string;
  active: boolean; createdAt: string; updatedAt: string;
};
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export function BranchesAdmin() {
  const [access, setAccess] = useState<'loading' | 'allowed' | 'denied' | 'error'>('loading');
  const [confirmation, setConfirmation] = useState<Branch | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState<{ branch: Branch | null } | null>(null);
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const nameInput = useRef<HTMLInputElement>(null);

  async function api(path: string, options?: RequestInit) {
    let response: Response;
    try {
      response = await fetch(`${API_URL}${path}`, { ...options, credentials: 'include', cache: 'no-store' });
    } catch {
      throw new Error('No pudimos conectarnos al servidor. Intentá nuevamente.');
    }
    if (response.status === 401) notifySessionExpired();
    if (response.status === 401 || response.status === 403) {
      setAccess('denied');
      throw new Error('La sesión venció o no tenés permisos de administrador.');
    }
    const body = await response.json();
    if (!response.ok) {
      throw new Error(Array.isArray(body.message) ? body.message.join('. ') : body.message ?? 'No pudimos completar la operación.');
    }
    return body;
  }

  useEffect(() => {
    const abort = new AbortController();
    async function load() {
      try {
        const response = await fetch(`${API_URL}/auth/me`, { credentials: 'include', cache: 'no-store', signal: abort.signal });
        if (response.status === 401) notifySessionExpired();
        if (response.status === 401 || response.status === 403) { setAccess('denied'); return; }
        if (!response.ok) throw new Error('No pudimos comprobar la sesión.');
        const { user } = await response.json();
        if (!user.isAdmin) { setAccess('denied'); return; }
        const list = await fetch(`${API_URL}/branches`, { credentials: 'include', cache: 'no-store', signal: abort.signal });
        if (list.status === 401) notifySessionExpired();
        if (list.status === 401 || list.status === 403) { setAccess('denied'); return; }
        if (!list.ok) throw new Error('No pudimos cargar las sucursales.');
        setBranches(await list.json());
        setAccess('allowed');
      } catch (cause) {
        if (!abort.signal.aborted) { setError(cause instanceof Error && !(cause instanceof TypeError) ? cause.message : 'No pudimos conectarnos al servidor.'); setAccess('error'); }
      }
    }
    void load();
    return () => abort.abort();
  }, []);

  useEffect(() => { if (form) nameInput.current?.focus(); }, [form]);

  function openForm(branch: Branch | null) {
    setForm({ branch }); setName(branch?.name ?? ''); setStartDate(branch?.startDate.slice(0, 10) ?? '');
    setError(''); setSuccess('');
  }

  async function refresh() {
    setLoading(true); setError('');
    try { setBranches(await api('/branches')); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No pudimos cargar las sucursales.'); }
    finally { setLoading(false); }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form || busy) return;
    if (!name.trim()) { setError('El nombre de la sucursal es obligatorio.'); return; }
    setBusy(true); setError(''); setSuccess('');
    try {
      const branch: Branch = await api(form.branch ? `/branches/${form.branch.id}` : '/branches', {
        method: form.branch ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, ...(startDate && startDate !== form.branch?.startDate.slice(0, 10) ? { startDate } : {}) }),
      });
      setBranches((current) => [...current.filter((item) => item.id !== branch.id), branch].sort((a, b) => a.name.localeCompare(b.name, 'es')));
      setSuccess(form.branch ? 'Cambios guardados.' : 'Sucursal creada correctamente.');
      setForm(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No pudimos guardar la sucursal.'); }
    finally { setBusy(false); }
  }

  async function changeStatus(branch: Branch) {
    if (busy) return;
    setBusy(true); setError(''); setSuccess('');
    try {
      const updated: Branch = await api(`/branches/${branch.id}/status`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: !branch.active }),
      });
      setBranches((current) => current.map((item) => item.id === updated.id ? updated : item));
      setSuccess(updated.active ? 'Sucursal reactivada.' : 'Sucursal desactivada. Su información se conserva.');
      setConfirmation(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No pudimos cambiar el estado.'); }
    finally { setBusy(false); }
  }

  return (
    <WorkspaceShell section="branches" title="Sucursales"><div className={shellStyles.moduleContent}>
      {access === 'loading' && <p role="status" className="session-status">Comprobando sesión y cargando sucursales...</p>}
      {access === 'denied' && <section className="branch-feedback"><h1>Acceso denegado</h1><p>Esta sección requiere una sesión de Administrador.</p><Link href="/" className="text-button">Volver al Dashboard</Link></section>}
      {access === 'error' && <section className="branch-feedback"><p role="alert" className="error">{error}</p><button className="text-button" onClick={() => window.location.reload()}>Reintentar</button></section>}
      {access === 'allowed' && <>
        <div className="branches-title"><div><p className="eyebrow">Administración</p><h1>Sucursales</h1><p className="intro">Gestioná sus datos y su disponibilidad desde un único lugar.</p></div>
          <button className="primary-button" disabled={busy || loading} onClick={() => openForm(null)}>Nueva sucursal</button>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        {success && <p className="branch-success" role="status">{success}</p>}
        {busy && <p role="status" className="session-status">Guardando cambios...</p>}
        {form && <form className="branch-form" onSubmit={save} aria-labelledby="branch-form-title">
          <h2 id="branch-form-title">{form.branch ? 'Editar sucursal' : 'Nueva sucursal'}</h2>
          {form.branch && <p className="branch-code">Código interno: <code>{form.branch.code}</code></p>}
          <div className="branch-form-fields"><label>Nombre<input ref={nameInput} name="name" value={name} onChange={(event) => setName(event.target.value)} required disabled={busy} /></label>
          <label>Fecha de inicio<input name="startDate" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} disabled={busy} aria-describedby="date-help" /></label></div>
          <p id="date-help" className="help">{form.branch ? 'Si dejás la fecha vacía, se conserva la fecha actual.' : 'Opcional. Si la dejás vacía, se usará la fecha de creación.'}</p>
          <div className="branch-actions"><button className="primary-button" type="submit" disabled={busy}>Guardar sucursal</button><button className="text-button" type="button" disabled={busy} onClick={() => setForm(null)}>Cancelar</button></div>
        </form>}
        <div className="branches-toolbar"><p>{branches.length} {branches.length === 1 ? 'sucursal' : 'sucursales'}</p><button className="text-button" disabled={loading || busy} onClick={refresh}>{loading ? 'Actualizando...' : 'Actualizar lista'}</button></div>
        {!branches.length && <section className="branch-empty"><h2>Todavía no hay sucursales</h2><p>Creá la primera sucursal para comenzar.</p></section>}
        <ul className="branch-grid" aria-label="Sucursales" aria-busy={loading}>
          {branches.map((branch) => <li className="branch-card" key={branch.id}>
            <div className="branch-card-heading"><h2>{branch.name}</h2><span className={`branch-badge ${branch.active ? 'is-active' : 'is-inactive'}`}>{branch.active ? 'Activa' : 'Inactiva'}</span></div>
            <p className="branch-code">Código interno<code>{branch.code}</code></p>
            <p className="branch-date">Inicio: <time dateTime={branch.startDate}>{new Date(branch.startDate).toLocaleDateString('es-AR', { timeZone: 'UTC' })}</time></p>
            {!branch.active && <p className="help">Conserva su información y el acceso histórico.</p>}
            <div className="branch-actions"><button className="text-button" disabled={busy || loading} onClick={() => openForm(branch)} aria-label={`Editar ${branch.name}`}>Editar</button><button className="text-button" disabled={busy || loading} onClick={() => { setError(''); setConfirmation(branch); }} aria-label={`${branch.active ? 'Desactivar' : 'Reactivar'} ${branch.name}`}>{branch.active ? 'Desactivar' : 'Reactivar'}</button></div>
          </li>)}
        </ul>
      </>}
    {confirmation && <Modal title={confirmation.active ? "Desactivar sucursal" : "Reactivar sucursal"} context={confirmation.name} busy={busy} onClose={() => setConfirmation(null)} footer={null}>
      <p>{confirmation.active ? "Se conservarán su información y el acceso histórico." : "Volverá a figurar como activa."}</p>
      {error && <p role="alert" className={shellStyles.error}>{error}</p>}
      <div className={shellStyles.actions}><button disabled={busy} className={shellStyles.primary} onClick={() => void changeStatus(confirmation)}>Confirmar cambio de estado</button><button disabled={busy} onClick={() => setConfirmation(null)}>Cancelar</button></div>
    </Modal>}
    </div></WorkspaceShell>
  );
}
