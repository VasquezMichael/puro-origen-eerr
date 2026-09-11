'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';

type User = { isAdmin: boolean; branchAccesses: { branchId: string; role: 'READER' | 'EDITOR' }[] };
type Branch = { id: string; name: string; active: boolean; startDate: string };
type Eerr = { id: string; branchId: string; year: number; month: number; loadStatus: 'SIN_CARGAR'; createdAt: string };
type MonthContext = { branch: Branch; exists: true; eerr: Eerr } | { branch: Branch; exists: false; eerr: null };
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const periodName = (year: number, month: number) => `${months[month - 1]} ${year}`;
const dateName = (value: string) => new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(value));
const canCreate = (user: User, branch: Branch) => branch.active && (user.isAdmin || user.branchAccesses.some((access) => access.branchId === branch.id && access.role === 'EDITOR'));

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...options, credentials: 'include', cache: 'no-store' });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new Error('No pudimos conectarnos con el servidor. Intentá nuevamente.');
  }
  const body = await response.json();
  if (!response.ok) {
    if (response.status === 401) throw new Error('Tu sesión venció. Volvé al inicio para ingresar.');
    throw new Error(Array.isArray(body.message) ? body.message.join('. ') : body.message ?? 'No se pudo completar la operación');
  }
  return body as T;
}

export function EerrWorkspace() {
  const [session, setSession] = useState<{ user: User; branches: Branch[] } | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const options = { signal: controller.signal };
    Promise.all([api<{ user: User }>('/auth/me', options), api<Branch[]>('/branches', options)])
      .then(([auth, branches]) => setSession({ user: auth.user, branches }))
      .catch((error: Error) => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [attempt]);
  return <main className="branches-shell">
    <header className="branches-header"><Link className="brand-home" href="/">Puro de Origen <small>Estados de resultados</small></Link><Link className="text-button" href="/">Volver al inicio</Link></header>
    <div className="branches-title"><div><p className="eyebrow">Contexto de trabajo</p><h1>Estados de resultados</h1><p className="intro">Elegí una sucursal o un período para consultar sus EERR.</p></div></div>
    {error ? <div className="branch-feedback"><p className="error" role="alert">{error}</p><button className="text-button" onClick={() => { setError(''); setAttempt(attempt + 1); }}>Reintentar</button></div>
      : session ? <ContextBrowser user={session.user} branches={session.branches} /> : <p role="status">Comprobando sesión y sucursales…</p>}
  </main>;
}

function ContextBrowser({ user, branches }: { user: User; branches: Branch[] }) {
  const [perspective, setPerspective] = useState<'branch' | 'month'>('branch');
  const [branchId, setBranchId] = useState(branches[0]?.id ?? '');
  const [period, setPeriod] = useState(() => ({ year: new Date().getUTCFullYear(), month: new Date().getUTCMonth() + 1 }));
  const [revision, setRevision] = useState(0);
  const [creation, setCreation] = useState<{ branch: Branch; year: number; month: number } | null>(null);
  const [success, setSuccess] = useState('');
  const [detail, setDetail] = useState<string | null>(null);
  const selected = branches.find((branch) => branch.id === branchId);
  const path = perspective === 'branch' ? `/eerr?branchId=${branchId}` : `/eerr/context?year=${period.year}&month=${period.month}`;
  const openCreate = (branch: Branch) => { setSuccess(''); setDetail(null); setCreation({ branch, ...period }); };
  return <>
    <fieldset className="eerr-perspective" disabled={creation !== null}><legend>Perspectiva de trabajo</legend>
      <label><input type="radio" name="perspective" checked={perspective === 'branch'} onChange={() => { setPerspective('branch'); setDetail(null); }} /> Pararme en una sucursal</label>
      <label><input type="radio" name="perspective" checked={perspective === 'month'} onChange={() => { setPerspective('month'); setDetail(null); }} /> Pararme en un período</label>
    </fieldset>
    {!branches.length ? <p className="branch-empty">No tenés sucursales accesibles. Contactá al administrador.</p> : <>
      {perspective === 'branch' ? <div className="eerr-selector"><label>Sucursal<select value={branchId} disabled={creation !== null} onChange={(event) => { setBranchId(event.target.value); setDetail(null); }}>
        {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}{branch.active ? '' : ' · Inactiva (históricos)'}</option>)}
      </select></label>{selected && canCreate(user, selected) && <button className="primary-button" disabled={creation !== null} onClick={() => openCreate(selected)}>Crear período</button>}</div>
        : <PeriodSelector value={period} disabled={creation !== null} onChange={(value) => { setPeriod(value); setDetail(null); }} />}
      {perspective === 'branch' && selected && !selected.active && <p className="notice">Sucursal inactiva: podés consultar sus históricos. No admite nuevos EERR.</p>}
      {creation && <CreateForm key={creation.branch.id} initial={creation} onCancel={() => setCreation(null)} onCreated={(row) => {
        setSuccess(`Se creó ${periodName(row.year, row.month)} para ${creation.branch.name}.`);
        setPeriod({ year: row.year, month: row.month }); setCreation(null); setRevision(revision + 1); setDetail(row.id);
      }} />}
      {success && <p className="branch-success" role="status">{success}</p>}
      <div className="branches-toolbar"><span>{perspective === 'branch' ? 'Períodos de la sucursal' : periodName(period.year, period.month)}</span><button className="text-button" disabled={creation !== null} onClick={() => setRevision(revision + 1)}>Actualizar</button></div>
      <Results key={`${path}:${revision}`} path={path} perspective={perspective} user={user} disabled={creation !== null} onCreate={openCreate} onOpen={setDetail} />
      {detail && <Detail key={detail} id={detail} branches={branches} onClose={() => setDetail(null)} />}
    </>}
  </>;
}

function PeriodSelector({ value, onChange, disabled }: { value: { year: number; month: number }; onChange: (value: { year: number; month: number }) => void; disabled: boolean }) {
  return <div className="branch-form-fields eerr-period-selector"><label>Año<input type="number" min={1} max={9999} step={1} required value={value.year || ''} disabled={disabled} onChange={(event) => onChange({ ...value, year: Number(event.target.value) })} /></label>
    <label>Mes<select value={value.month} disabled={disabled} onChange={(event) => onChange({ ...value, month: Number(event.target.value) })}>{months.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}</select></label></div>;
}

function Results({ path, perspective, user, disabled, onCreate, onOpen }: { path: string; perspective: 'branch' | 'month'; user: User; disabled: boolean; onCreate: (branch: Branch) => void; onOpen: (id: string) => void }) {
  const [result, setResult] = useState<Eerr[] | MonthContext[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    api<Eerr[] | MonthContext[]>(path, { signal: controller.signal }).then(setResult)
      .catch((error: Error) => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [path]);
  if (error) return <p className="error" role="alert">{error}</p>;
  if (!result) return <p role="status">Consultando períodos…</p>;
  if (!result.length) return <p className="branch-empty">{perspective === 'branch' ? 'Esta sucursal todavía no tiene EERR creados.' : 'No hay sucursales accesibles.'}</p>;
  return <ul className="branch-grid">{perspective === 'branch' ? (result as Eerr[]).map((row) => <li className="branch-card" key={row.id}>
    <h2>{periodName(row.year, row.month)}</h2><EerrSummary row={row} /><button className="text-button" disabled={disabled} onClick={() => onOpen(row.id)}>Ver EERR</button>
  </li>) : (result as MonthContext[]).map((context) => <li className="branch-card" key={context.branch.id}>
    <div className="branch-card-heading"><h2>{context.branch.name}</h2>{!context.branch.active && <span className="branch-badge is-inactive">Inactiva</span>}</div>
    {context.exists ? <><p className="eerr-exists">EERR existente</p><EerrSummary row={context.eerr} /><button className="text-button" disabled={disabled} onClick={() => onOpen(context.eerr.id)}>Ver EERR</button></>
      : <><p className="notice">EERR inexistente para este período.</p><p className="help">No hay información cargada para esta combinación.</p>{canCreate(user, context.branch) && <button className="text-button" disabled={disabled} onClick={() => onCreate(context.branch)}>Crear EERR faltante</button>}</>}
  </li>)}</ul>;
}

function EerrSummary({ row }: { row: Eerr }) {
  return <><p><span className="branch-badge is-inactive">Sin cargar</span></p><p className="branch-date">Creado el {dateName(row.createdAt)}</p></>;
}

function CreateForm({ initial, onCancel, onCreated }: { initial: { branch: Branch; year: number; month: number }; onCancel: () => void; onCreated: (row: Eerr) => void }) {
  const [period, setPeriod] = useState({ year: initial.year, month: initial.month });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true; setBusy(true); setError('');
    try {
      const row = await api<Eerr>('/eerr', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ branchId: initial.branch.id, ...period }) });
      onCreated(row);
    } catch (error) { setError((error as Error).message); }
    finally { submitting.current = false; setBusy(false); }
  }
  return <form className="branch-form" onSubmit={submit} aria-describedby="create-description create-feedback" aria-busy={busy}>
    <h2 ref={heading} tabIndex={-1}>Crear EERR · {initial.branch.name}</h2>
    <p id="create-description" className="intro">Confirmá el mes que querés crear. Solo se prepara el contenedor mensual, sin importes.</p>
    <PeriodSelector value={period} onChange={setPeriod} disabled={busy} />
    <div id="create-feedback">{error && <p className="error" role="alert">{error}</p>}</div>
    <div className="branch-actions"><button className="primary-button" disabled={busy} type="submit">{busy ? 'Creando…' : 'Confirmar creación'}</button><button className="text-button" disabled={busy} type="button" onClick={onCancel}>Cancelar</button></div>
  </form>;
}

function Detail({ id, branches, onClose }: { id: string; branches: Branch[]; onClose: () => void }) {
  const [row, setRow] = useState<Eerr | null>(null);
  const [error, setError] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
    const controller = new AbortController();
    api<Eerr>(`/eerr/${id}`, { signal: controller.signal }).then(setRow).catch((error: Error) => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [id]);
  return <section className="branch-feedback" aria-labelledby="eerr-detail-title"><div className="branch-card-heading"><h2 id="eerr-detail-title" tabIndex={-1} ref={heading}>Contexto del EERR</h2><button className="text-button" onClick={onClose}>Cerrar detalle</button></div>
    {error ? <p className="error" role="alert">{error}</p> : row ? <><h3>{branches.find((branch) => branch.id === row.branchId)?.name} · {periodName(row.year, row.month)}</h3><EerrSummary row={row} /><p className="branch-code">Identificador<code>{row.id}</code></p><p className="intro">Este EERR existe y está sin cargar. Todavía no contiene estructura financiera ni importes.</p></> : <p role="status">Consultando EERR…</p>}
  </section>;
}
