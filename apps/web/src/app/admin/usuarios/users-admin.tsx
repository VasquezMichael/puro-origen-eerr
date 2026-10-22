'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Modal } from '../../eerr/overlays';
import { WorkspaceShell } from '../../eerr/workspace-shell';
import { notifySessionExpired, useSession } from '../../session-context';
import type { AccessChoice, Branch, BranchAccess, ManagedUser } from './users-model';
import { filterUsers, selectedAccesses, userError } from './users-model';
import styles from './users-admin.module.css';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
type Mode = { kind: 'create' } | { kind: 'access' | 'status' | 'reset'; user: ManagedUser };
type Operation = 'create' | 'access' | 'status' | 'reset' | 'list';

class RequestError extends Error {
  constructor(message: string, readonly status = 0) { super(message); }
}

async function api<T>(path: string, operation: Operation, options?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...options, credentials: 'include', cache: 'no-store' });
  } catch {
    throw new RequestError('No pudimos conectarnos al servidor. Intentá nuevamente.');
  }
  if (response.status === 401) notifySessionExpired();
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { code?: string };
    throw new RequestError(userError(response.status, body.code, operation), response.status);
  }
  return response.json() as Promise<T>;
}

function AccessSelector({ branches, value, onChange, disabled }: {
  branches: Branch[];
  value: Record<string, AccessChoice>;
  onChange: (next: Record<string, AccessChoice>) => void;
  disabled: boolean;
}) {
  return <fieldset className={styles.accessFieldset} disabled={disabled}>
    <legend>Accesos por sucursal</legend>
    {branches.length === 0 && <p>No hay sucursales disponibles.</p>}
    <div className={styles.accessList}>{branches.map((branch) => <label key={branch.id}>
      <span>{branch.name}{!branch.active && <small>Inactiva</small>}</span>
      <select aria-label={`Acceso a ${branch.name}`} value={value[branch.id] ?? 'NONE'}
        onChange={(event) => onChange({ ...value, [branch.id]: event.target.value as AccessChoice })}>
        <option value="NONE">Sin acceso</option><option value="EDITOR">Editor</option><option value="READER">Lector</option>
      </select>
    </label>)}</div>
  </fieldset>;
}

function UserForm({ mode, branches, busy, error, onCreate, onAccess, onReset, onStatus, onClose }: {
  mode: Mode;
  branches: Branch[];
  busy: boolean;
  error: string;
  onCreate: (input: { name: string; email: string; password: string; isAdmin: boolean; branchAccesses: BranchAccess[] }) => Promise<void>;
  onAccess: (user: ManagedUser, accesses: BranchAccess[]) => Promise<void>;
  onReset: (user: ManagedUser, password: string, requireChange: boolean) => Promise<void>;
  onStatus: (user: ManagedUser) => Promise<void>;
  onClose: () => void;
}) {
  const user = 'user' in mode ? mode.user : null;
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [requireChange, setRequireChange] = useState(true);
  const [validation, setValidation] = useState('');
  const [choices, setChoices] = useState<Record<string, AccessChoice>>(() =>
    Object.fromEntries(user?.branchAccesses.map((access) => [access.branchId, access.role]) ?? []));
  const title = mode.kind === 'create' ? 'Nuevo usuario' : mode.kind === 'access' ? 'Editar accesos' : mode.kind === 'reset' ? 'Restablecer contraseña' : user?.active ? 'Desactivar usuario' : 'Reactivar usuario';
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setValidation('');
    if (mode.kind === 'create' || mode.kind === 'reset') {
      if (password.length < 12) { setValidation('La contraseña debe tener al menos 12 caracteres.'); return; }
      if (password !== confirmation) { setValidation('La confirmación de contraseña no coincide.'); return; }
    }
    if (mode.kind === 'create') await onCreate({ name: name.trim(), email: email.trim(), password, isAdmin, branchAccesses: selectedAccesses(branches, choices) });
    if (mode.kind === 'access' && user) await onAccess(user, selectedAccesses(branches, choices));
    if (mode.kind === 'reset' && user) await onReset(user, password, requireChange);
    if (mode.kind === 'status' && user) await onStatus(user);
  }
  return <Modal title={title} context={user?.name ?? 'Administración de usuarios'} busy={busy} onClose={onClose} footer={null}>
    <form className={styles.form} onSubmit={(event) => void submit(event)} aria-busy={busy}>
      {mode.kind === 'create' && <>
        <label>Nombre<input autoFocus value={name} onChange={(event) => setName(event.target.value)} minLength={2} required disabled={busy} /></label>
        <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required disabled={busy} /></label>
        <label className={styles.checkbox}><input type="checkbox" checked={isAdmin} onChange={(event) => setIsAdmin(event.target.checked)} disabled={busy} /> Administrador</label>
        {isAdmin && <p className={styles.help}>Administrador: acceso global. Los accesos por sucursal no limitan ese alcance.</p>}
      </>}
      {(mode.kind === 'create' || mode.kind === 'reset') && <>
        <label>{mode.kind === 'create' ? 'Contraseña inicial' : 'Nueva contraseña'}<input type="password" autoComplete="new-password" minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} required disabled={busy} /></label>
        <label>Confirmar contraseña<input type="password" autoComplete="new-password" minLength={12} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required disabled={busy} /></label>
      </>}
      {(mode.kind === 'create' || mode.kind === 'access') && <>
        {mode.kind === 'access' && <p className={styles.help}>Guardar reemplaza la lista completa de accesos actuales. {user?.isAdmin && 'Esta cuenta conserva acceso global de Administrador.'}</p>}
        <AccessSelector branches={branches} value={choices} onChange={setChoices} disabled={busy} />
      </>}
      {mode.kind === 'reset' && <label className={styles.checkbox}><input type="checkbox" checked={requireChange} onChange={(event) => setRequireChange(event.target.checked)} disabled={busy} /> Exigir cambio en próximo inicio de sesión</label>}
      {mode.kind === 'status' && <p>{user?.active ? 'El usuario perderá acceso y sus sesiones actuales quedarán invalidadas.' : 'El usuario deberá iniciar sesión nuevamente. Sus sesiones anteriores no se restauran.'}</p>}
      {(validation || error) && <p role="alert" className={styles.error}>{validation || error}</p>}
      <div className={styles.actions}>
        <button type="submit" className={styles.primary} disabled={busy}>{busy ? 'Guardando…' : mode.kind === 'create' ? 'Crear usuario' : mode.kind === 'access' ? 'Guardar accesos' : mode.kind === 'reset' ? 'Restablecer contraseña' : user?.active ? 'Confirmar desactivación' : 'Confirmar reactivación'}</button>
        <button type="button" onClick={onClose} disabled={busy}>Cancelar</button>
      </div>
    </form>
  </Modal>;
}

export function UsersAdmin() {
  const { user: session } = useSession();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Exclude<Operation, 'list'> | null>(null);
  const sending = useRef(false);
  const [mode, setMode] = useState<Mode | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    if (!session.isAdmin) return;
    let current = true;
    Promise.all([api<ManagedUser[]>('/users', 'list'), api<Branch[]>('/branches', 'list')])
      .then(([userList, branchList]) => { if (current) { setUsers(userList); setBranches(branchList); } })
      .catch((cause: unknown) => { if (current) { setError(cause instanceof Error ? cause.message : 'No pudimos cargar usuarios.'); setDenied(cause instanceof RequestError && cause.status === 403); } })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [session.isAdmin]);

  async function refresh() {
    setLoading(true);
    try { setUsers(await api<ManagedUser[]>('/users', 'list')); return true; }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No pudimos actualizar usuarios.'); if (cause instanceof RequestError && cause.status === 403) setDenied(true); return false; }
    finally { setLoading(false); }
  }
  async function mutate(operation: Exclude<Operation, 'list'>, path: string, body: object, message: string) {
    if (sending.current) return;
    sending.current = true;
    setBusy(operation); setError(''); setSuccess('');
    try {
      await api(path, operation, { method: operation === 'create' ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      setMode(null);
      setSuccess(message);
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No pudimos guardar los cambios.'); }
    finally { sending.current = false; setBusy(null); }
  }

  const visible = filterUsers(users, search);
  return <WorkspaceShell section="users" title="Usuarios"><div className={styles.content}>
    {!session.isAdmin || denied ? <section className={styles.feedback}><h1>Acceso denegado</h1><p>Esta sección requiere una sesión de Administrador.</p><Link href="/">Volver al Dashboard</Link></section> : <>
      <header className={styles.header}><div><p className={styles.eyebrow}>Administración</p><h1>Usuarios</h1><p>Gestioná cuentas, accesos y contraseñas desde un solo lugar.</p></div><button className={styles.primary} disabled={loading} onClick={() => { setError(''); setMode({ kind: 'create' }); }}>Nuevo usuario</button></header>
      {success && <p role="status" className={styles.success}>{success}</p>}
      {error && !mode && <p role="alert" className={styles.error}>{error}</p>}
      <div className={styles.toolbar}><label>Buscar por nombre o email<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label><button disabled={loading} onClick={() => { setError(''); void refresh(); }}>{loading ? 'Actualizando…' : 'Actualizar lista'}</button></div>
      {loading && <p role="status">Cargando usuarios…</p>}
      {!loading && users.length === 0 && <p className={styles.feedback}>Todavía no hay usuarios.</p>}
      {!loading && users.length > 0 && visible.length === 0 && <p className={styles.feedback}>No hay usuarios que coincidan con la búsqueda.</p>}
      <ul className={styles.grid} aria-label="Usuarios" aria-busy={loading}>{visible.map((user) => <li key={user.id} className={styles.card}>
        <div className={styles.cardHead}><div><h2>{user.name}</h2><p className={styles.email}>{user.email}</p></div><span className={`${styles.badge} ${user.active ? styles.active : styles.inactive}`}>{user.active ? 'Activo' : 'Inactivo'}</span></div>
        <div className={styles.badges}>{user.isAdmin && <span className={styles.badge}>Administrador</span>}{user.mustChangePassword && <span className={styles.badge}>Cambio de contraseña pendiente</span>}</div>
        {user.isAdmin && <p className={styles.help}>Administrador — acceso global</p>}
        <div className={styles.accessSummary}><h3>Accesos por sucursal</h3>{user.branchAccesses.length ? <ul>{user.branchAccesses.map((access) => {
          const branch = branches.find((item) => item.id === access.branchId);
          return <li key={access.branchId}>{branch?.name ?? 'Sucursal no disponible'}{branch && !branch.active && ' · Inactiva'} <strong>{access.role === 'EDITOR' ? 'Editor' : 'Lector'}</strong></li>;
        })}</ul> : <p>Sin accesos asignados</p>}</div>
        <div className={styles.actions}>
          <button onClick={() => { setError(''); setMode({ kind: 'access', user }); }}>Editar accesos</button>
          <button onClick={() => { setError(''); setMode({ kind: 'reset', user }); }}>Restablecer contraseña</button>
          {user.active && user.id.toLowerCase() === session.id.toLowerCase() ? <span className={styles.help}>No podés desactivar tu propia cuenta.</span> : <button onClick={() => { setError(''); setMode({ kind: 'status', user }); }}>{user.active ? 'Desactivar' : 'Reactivar'}</button>}
        </div>
      </li>)}</ul>
      {mode && <UserForm key={`${mode.kind}-${'user' in mode ? mode.user.id : 'new'}`} mode={mode} branches={branches} busy={busy !== null} error={error} onClose={() => { setMode(null); setError(''); }}
        onCreate={(input) => mutate('create', '/users', input, 'Usuario creado. Deberá cambiar la contraseña inicial al ingresar.')}
        onAccess={(user, accesses) => mutate('access', `/users/${user.id}/branch-accesses`, { branchAccesses: accesses }, 'Accesos actualizados.')}
        onReset={(user, password, requireChange) => mutate('reset', `/users/${user.id}/password`, { password, requireChange }, `Contraseña restablecida. Las sesiones anteriores fueron invalidadas.${requireChange ? ' Deberá cambiarla al iniciar sesión.' : ''}`)}
        onStatus={(user) => mutate('status', `/users/${user.id}/status`, { active: !user.active }, user.active ? 'Usuario desactivado. Sus sesiones fueron invalidadas.' : 'Usuario reactivado. Deberá iniciar sesión nuevamente.')} />}
    </>}
  </div></WorkspaceShell>;
}
