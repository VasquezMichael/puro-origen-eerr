"use client";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { ROOTS } from "@puro-origen/domain";
import type { DashboardBranch, DashboardResponse } from "@puro-origen/shared-types";
import { branchStatus, formatDashboardMetric, metricReason, scopeLabel, type Period, MONTHS, validPeriod } from "./dashboard-model";
import styles from "./dashboard.module.css";

export function PeriodPicker({ period, onSelect, onRefresh, loading }: { period: Period; onSelect: (period: Period) => void; onRefresh: () => void; loading: boolean }) {
  const [year, setYear] = useState(String(period.year));
  const [month, setMonth] = useState(String(period.month));
  const selectedYear = Number(year), selectedMonth = Number(month);
  const valid = /^(?:[1-9][0-9]{0,3})$/.test(year) && validPeriod(selectedYear, selectedMonth);
  return <form className={styles.period} onSubmit={(event) => { event.preventDefault(); if (valid) onSelect({ year: selectedYear, month: selectedMonth }); }}>
    <label>Año<input aria-label="Año del Dashboard" type="number" min="1" max="9999" step="1" value={year} onChange={(event) => setYear(event.target.value)} /></label>
    <label>Mes<select aria-label="Mes del Dashboard" value={month} onChange={(event) => setMonth(event.target.value)}>{MONTHS.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}</select></label>
    <button type="submit" disabled={!valid}>Ver período</button>
    <button type="button" onClick={onRefresh} disabled={loading}>Actualizar</button>
    {!valid && <span role="alert">Ingresá un año entre 1 y 9999 y un mes válido.</span>}
  </form>;
}

export function ContextHelp({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const container = useRef<HTMLSpanElement>(null);
  const suppress = useRef(false);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !container.current?.contains(event.target)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); suppress.current = true; setOpen(false); button.current?.focus(); } };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape, true);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape, true); };
  }, [open]);
  return <span ref={container} className={styles.help} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) { suppress.current = false; setOpen(false); } }}>
    <button ref={button} type="button" aria-label={label} aria-expanded={open} aria-describedby={open ? id : undefined} onMouseEnter={() => { if (!suppress.current) setOpen(true); }} onMouseLeave={() => { if (document.activeElement !== button.current) setOpen(false); }} onFocus={() => { if (!suppress.current) setOpen(true); }} onClick={() => { suppress.current = false; setOpen(true); }}>?</button>
    {open && <span className={styles.helpText} role="tooltip" id={id}>{children}</span>}
  </span>;
}

export function Coverage({ data }: { data: DashboardResponse }) {
  const c = data.coverage;
  const primary = [["Esperadas", c.expected], ["Con EERR", c.withEerr], ["Sin EERR", c.withoutEerr], ["Completas", c.complete]] as const;
  const details = [["Parciales", c.partial], ["Pendientes", c.pending], ["Vacías", c.empty], ["Sin estructura", c.uninitialized], ["Inactivas con histórico", c.inactiveWithHistory], ["Inactivas sin histórico", c.inactiveWithoutHistory], ["Excluidas por no haber iniciado", c.excludedNotStarted]] as const;
  return <section className={styles.section} aria-labelledby="coverage-title"><div className={styles.sectionHead}><div><p className={styles.eyebrow}>Alcance y disponibilidad</p><h2 id="coverage-title">Cobertura del período</h2></div><span className={styles.scope}>{scopeLabel(data.scope)}</span></div>
    <p className={styles.explanation}>Esperadas: sucursales autorizadas activas desde su inicio y sucursales inactivas que conservan un EERR histórico.</p>
    <dl className={styles.coverage}>{primary.map(([label, count]) => <div key={label}><dt>{label}</dt><dd>{count}</dd></div>)}</dl>
    <details className={styles.details}><summary>Ver detalle de cobertura</summary><dl className={styles.detailList}>{details.filter(([, count]) => count > 0).map(([label, count]) => <div key={label}><dt>{label}</dt><dd>{count}</dd></div>)}{details.every(([, count]) => count === 0) && <p>No hay otras clasificaciones para este período.</p>}</dl></details>
    {(c.inactiveWithHistory > 0 || c.inactiveWithoutHistory > 0) && <p className={styles.note}>Una sucursal inactiva sin EERR no se cuenta como faltante porque el modelo todavía no conserva su fecha de baja. <ContextHelp label="¿Cómo se cuentan las sucursales inactivas?">Las inactivas con EERR histórico sí forman parte del período. Sin fecha de baja, no podemos afirmar que una inactiva sin EERR haya debido presentar resultados.</ContextHelp></p>}
  </section>;
}

type Metric = DashboardResponse["consolidated"]["income"];
function MetricCard({ title, metric }: { title: string; metric: Metric }) {
  return <div className={styles.metric}><span>{title}</span><strong>{formatDashboardMetric(metric.value, metric.unit)}</strong>{metric.value === null && <small>{metricReason(metric.reason)}</small>}</div>;
}
export function Consolidated({ data }: { data: DashboardResponse }) {
  const value = data.consolidated, c = data.coverage;
  if (c.withEerr === 0) return <section className={styles.section} aria-labelledby="summary-title"><p className={styles.eyebrow}>Lectura mensual</p><h2 id="summary-title">Sin EERR para este período</h2><p>{c.expected === 0 ? "No hay sucursales esperadas en este alcance y período." : "Todavía no existen EERR para las sucursales esperadas."} La ausencia de registros no equivale a importe cero.</p><Link className={styles.link} href="/eerr">Ir a Estados de resultados →</Link></section>;
  const definitive = value.definitive;
  const excluded = data.branches.filter((branch) => branch.temporal === "EXPECTED" && branch.analysisStatus !== "COMPLETE");
  return <section className={styles.section} aria-labelledby="summary-title"><p className={styles.eyebrow}>Lectura mensual</p><h2 id="summary-title">{definitive ? "Consolidado definitivo" : `Subtotal de ${value.includedCount} de ${value.expectedCount} sucursales esperadas`}</h2>
    <p className={styles.explanation}>{definitive ? "Todas las fuentes esperadas están completas. Los porcentajes fueron recalculados sobre los totales." : "Solo se suman las bases de EERR completos. Los faltantes y las fuentes parciales no se tratan como cero; los resultados derivados aún no están disponibles."}</p>
    {value.includedCount > 0 ? <div className={styles.metrics}>
      <MetricCard title="Ingresos" metric={value.income} /><MetricCard title="Costos" metric={value.costs} />
      {definitive && <><MetricCard title="Margen Bruto" metric={value.grossMargin} /><MetricCard title="Margen Bruto %" metric={value.grossMarginPercent} /></>}
      <MetricCard title="Gastos Generales" metric={value.expenses} />
      {definitive && <><MetricCard title="Resultado Neto" metric={value.netResult} /><MetricCard title="Resultado Neto %" metric={value.netResultPercent} /><MetricCard title="Punto de Equilibrio" metric={value.breakEvenSales} /></>}
    </div> : <p className={styles.note}>{metricReason(value.income.reason)}</p>}
    {definitive ? <p className={styles.note}>El Punto de Equilibrio supone que se mantiene la mezcla observada entre ventas y costos variables. No hay Objetivo de Venta consolidado: las metas pertenecen a cada sucursal.</p> : <><p className={styles.note}>{metricReason(value.grossMargin.reason)} Margen Bruto, Resultado Neto, porcentajes y Punto de Equilibrio permanecen sin valor hasta completar la cobertura.</p>{excluded.length > 0 && <p className={styles.note}>Fuentes excluidas del subtotal: {excluded.map((branch) => `${branch.name} (${branchStatus(branch)})`).join("; ")}.</p>}</>}
  </section>;
}

function BranchCard({ branch }: { branch: DashboardBranch }) {
  const amounts = branch.blocks?.map((block) => ({ code: block.code, value: block.value, status: block.status })) ?? [];
  return <li className={styles.branch}><div className={styles.branchHead}><h3>{branch.name}</h3><span className={styles.state}>{branchStatus(branch)}</span></div><p>{branch.active ? "Activa" : branch.temporal === "EXPECTED" ? "Inactiva · EERR histórico" : "Inactiva"} · {branch.eerrId ? "Con EERR" : "Sin EERR"}</p>
    {branch.temporal === "EXPECTED" && branch.eerrId && <dl className={styles.branchValues}>{ROOTS.map((root) => { const block = amounts.find((item) => item.code === root.code); return <div key={root.code}><dt>{root.name}</dt><dd>{block?.value === null || block?.value === undefined ? "—" : formatDashboardMetric(block.value, "ARS")}{block && block.status !== "COMPLETE" && <small> {block.status === "PARTIAL" ? "Subtotal parcial" : "No completo"}</small>}</dd></div>; })}</dl>}
    {branch.temporal === "EXPECTED" && branch.analysisStatus !== "COMPLETE" && <p className={styles.reason}>{branchStatus(branch)}. Esta fuente no integra el subtotal de EERR completos.</p>}
    {branch.eerrId && <Link className={styles.link} href={`/eerr/${branch.eerrId}`}>Abrir EERR →</Link>}
  </li>;
}
export function Branches({ data }: { data: DashboardResponse }) {
  return <section className={styles.section} aria-labelledby="branches-title"><div className={styles.sectionHead}><div><p className={styles.eyebrow}>Detalle autorizado</p><h2 id="branches-title">Estado por sucursal</h2></div><Link className={styles.link} href="/eerr">Estados de resultados →</Link></div>
    {data.branches.length ? <ul className={styles.branches}>{data.branches.map((branch) => <BranchCard key={branch.branchId} branch={branch} />)}</ul> : <p>No hay sucursales accesibles en este alcance.</p>}
  </section>;
}
