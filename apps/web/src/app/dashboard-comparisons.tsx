"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { BranchPeriodComparisonResponse, BranchTableResponse, ComparisonBranch, ComparisonMetrics, ConsolidatedPeriodComparisonResponse, TwoBranchComparisonResponse } from "@puro-origen/shared-types";
import { eerrApi, EerrApiError } from "./eerr/api";
import { marginInput, MONTHS, metricReason, periodLabel, scopeLabel, trafficLightLabel, validPeriod, type Period } from "./dashboard-model";
import { comparisonDescription, comparisonMetrics, comparisonPath, comparisonReason, formatComparisonValue, formatDifference, formatVariation, initialReference, itemComparisonOrNull, matchesComparison, matchesConsolidatedMargin, sourceStatus } from "./comparison-model";
import styles from "./dashboard.module.css";
import { ItemComparisonTable } from "./item-comparison-table";

type Result = BranchPeriodComparisonResponse | TwoBranchComparisonResponse | ConsolidatedPeriodComparisonResponse;
type QueryState<T> = { loading: boolean; data: T | null; error: string; applied: string };
function failureText(error: unknown): string {
  if (error instanceof EerrApiError) return error.status === 409 ? "Los datos cambiaron mientras se realizaba la consulta. Actualizá para reintentar." : error.message;
  return "No pudimos cargar la comparación. Intentá nuevamente.";
}
function useQuery<T>() {
  const [state, setState] = useState<QueryState<T>>({ loading: false, data: null, error: "", applied: "" });
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const lastValidation = useRef<(data: T) => boolean>(() => false);
  useEffect(() => () => { generation.current++; controller.current?.abort(); }, []);
  const run = useCallback((path: string, validate: (data: T) => boolean) => {
    lastValidation.current = validate;
    controller.current?.abort();
    const active = ++generation.current;
    const request = new AbortController(); controller.current = request;
    setState({ loading: true, data: null, error: "", applied: path });
    eerrApi<T>(path, { signal: request.signal }).then((data) => {
      if (request.signal.aborted || active !== generation.current) return;
      if (!validate(data)) throw new Error("Respuesta inconsistente");
      setState({ loading: false, data, error: "", applied: path });
    }).catch((error: unknown) => {
      if (!request.signal.aborted && active === generation.current) setState({ loading: false, data: null, error: failureText(error), applied: path });
    });
  }, []);
  const retry = () => { if (state.applied && !state.loading) run(state.applied, lastValidation.current); };
  return { state, run, retry };
}

function ReferencePicker({ period, onChange, prefix }: { period: Period; onChange: (next: Period) => void; prefix: string }) {
  return <div className={styles.referencePicker}>
    <label>Año de referencia<input aria-label={`${prefix}: año de referencia`} type="number" min="1" max="9999" step="1" value={period.year} onChange={(event) => onChange({ ...period, year: Number(event.target.value) })} /></label>
    <label>Mes de referencia<select aria-label={`${prefix}: mes de referencia`} value={period.month} onChange={(event) => onChange({ ...period, month: Number(event.target.value) })}>{MONTHS.map((month, index) => <option value={index + 1} key={month}>{month}</option>)}</select></label>
  </div>;
}
function MetricTable({ metrics, current, reference }: { metrics: ComparisonMetrics; current: string; reference: string }) {
  return <div className={styles.tableScroll} role="region" aria-label="Tabla de indicadores comparados" tabIndex={0}><table className={styles.comparisonTable}>
    <thead><tr><th scope="col">Indicador</th><th scope="col">Analizado · {current}</th><th scope="col">Referencia · {reference}</th><th scope="col">Diferencia</th><th scope="col">Variación</th></tr></thead>
    <tbody>{comparisonMetrics.map(({ name, label }) => { const metric = metrics[name]; return <tr key={name}><th scope="row">{label}</th><td>{formatComparisonValue(metric.current, metric.unit)}</td><td>{formatComparisonValue(metric.reference, metric.unit)}</td><td>{formatDifference(metric)}</td><td>{formatVariation(metric)}{metric.reason === "REFERENCE_NOT_POSITIVE" && <small>{comparisonReason(metric.reason)}</small>}{metric.status === "BLOCKED" && <small>{comparisonReason(metric.reason)}</small>}</td></tr>; })}</tbody>
  </table></div>;
}
export function GoalComparison({ data }: { data: BranchPeriodComparisonResponse }) {
  const goalComparison = data.goalComparison;
  if (!goalComparison) return <p className={styles.note}>La respuesta no incluye comparación de metas locales.</p>;
  const rows = [
    { key: "targetSales", label: "Objetivo de Venta" },
    { key: "targetDifference", label: "Diferencia contra objetivo" },
    { key: "targetCompliance", label: "Cumplimiento" },
  ] as const;
  const light = (side: typeof data.current) => {
    const indicator = side.branch.goalIndicators?.trafficLight;
    return <>{indicator ? <span className={styles.trafficLight} data-light={indicator.value}>{trafficLightLabel(indicator.value)}</span> : "—"}
      {indicator?.reason && <small>{metricReason(indicator.reason)}</small>}</>;
  };
  return <div className={styles.tableScroll} role="region" aria-label="Comparación temporal de metas locales" tabIndex={0}>
    <table className={styles.comparisonTable}><caption>Metas locales por período</caption>
      <thead><tr><th scope="col">Indicador</th><th scope="col">Analizado · {periodLabel(data.current.period)}</th><th scope="col">Referencia · {periodLabel(data.reference.period)}</th><th scope="col">Diferencia</th><th scope="col">Variación</th></tr></thead>
      <tbody>{rows.map(({ key, label }) => { const metric = goalComparison[key]; return <tr key={key}><th scope="row">{label}</th><td>{formatComparisonValue(metric.current, metric.unit)}{metric.current === null && <small>{metricReason(data.current.branch.goalIndicators?.[key].reason ?? null)}</small>}</td><td>{formatComparisonValue(metric.reference, metric.unit)}{metric.reference === null && <small>{metricReason(data.reference.branch.goalIndicators?.[key].reason ?? null)}</small>}</td><td>{formatDifference(metric)}</td><td>{formatVariation(metric)}{metric.reason && <small>{comparisonReason(metric.reason)}</small>}</td></tr>; })}
        <tr><th scope="row">Semáforo</th><td>{light(data.current)}</td><td>{light(data.reference)}</td><td colSpan={2}>Estado por período; sin variación numérica.</td></tr>
      </tbody>
    </table>
  </div>;
}
function QueryFeedback({ state, retry }: { state: QueryState<Result>; retry: () => void }) {
  return <><p className={styles.live} role="status" aria-live="polite">{state.loading ? "Consultando comparación…" : state.data ? "Comparación actualizada." : ""}</p>{state.data && <button type="button" onClick={retry}>Actualizar comparación aplicada</button>}{state.error && <div className={styles.feedback} role="alert"><p>{state.error}</p><button type="button" onClick={retry}>Reintentar comparación aplicada</button></div>}</>;
}
function BranchSelect({ label, branches, value, onChange }: { label: string; branches: ComparisonBranch[]; value: string; onChange: (id: string) => void }) {
  return <label>{label}<select value={value} onChange={(event) => onChange(event.target.value)}><option value="">Elegí una sucursal</option>{branches.map((branch) => <option value={branch.branchId} key={branch.branchId}>{branch.name}</option>)}</select></label>;
}
function BranchPeriods({ period, branches }: { period: Period; branches: ComparisonBranch[] }) {
  const [branch, setBranch] = useState(""); const [reference, setReference] = useState(() => initialReference(period));
  const query = useQuery<BranchPeriodComparisonResponse>();
  const compare = () => { if (!branch || !validPeriod(reference.year, reference.month)) return; const path = comparisonPath("branch-period", period, reference, branch); query.run(path, (data) => matchesComparison(data, period, reference, branch)); };
  const data = query.state.data;
  return <section className={styles.section} aria-labelledby="branch-period-title"><p className={styles.eyebrow}>Una sucursal · dos meses</p><h2 id="branch-period-title">Sucursal entre períodos</h2>
    <p>Período analizado: <strong>{periodLabel(period)}</strong>. Referencia inicial: mes anterior, editable.</p>
    <div className={styles.compareControls}><BranchSelect label="Sucursal analizada" branches={branches} value={branch} onChange={setBranch} /><ReferencePicker prefix="Sucursal entre períodos" period={reference} onChange={setReference} /><button type="button" onClick={compare} disabled={!branch || !validPeriod(reference.year, reference.month) || query.state.loading}>Comparar períodos</button></div>
    <QueryFeedback state={query.state} retry={query.retry} />
    {data && <><p className={styles.note}>{comparisonDescription(data.current.period, data.reference.period)} Fuente analizada: {sourceStatus(data.current.branch.status)}{data.current.branch.revision !== null ? `, revisión ${data.current.branch.revision}` : ""}; referencia: {sourceStatus(data.reference.branch.status)}{data.reference.branch.revision !== null ? `, revisión ${data.reference.branch.revision}` : ""}.</p><MetricTable metrics={data.metrics} current={periodLabel(data.current.period)} reference={periodLabel(data.reference.period)} /><GoalComparison data={data} /><ItemComparisonTable comparison={itemComparisonOrNull(data)} /></>}
  </section>;
}
function BranchTable({ period, table }: { period: Period; table: BranchTableResponse }) {
  return <div className={styles.tableScroll} role="region" aria-label="Todas las sucursales accesibles" tabIndex={0}><table className={styles.comparisonTable}><caption>Sucursales accesibles · {periodLabel(period)}</caption><thead><tr>{["Sucursal", "Estado de fuente", "Ingresos", "Costos", "Gastos generales", "Margen bruto", "Resultado neto", "Acción"].map((label) => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{table.branches.map((branch) => <tr key={branch.branchId}><th scope="row">{branch.name}</th><td>{sourceStatus(branch.status)}{!branch.active && <small>Histórica inactiva</small>}</td>{(["income", "costs", "expenses", "grossMargin", "netResult"] as const).map((name) => <td key={name}>{formatComparisonValue(branch.metrics[name], "ARS")}{branch.status !== "COMPLETE" && branch.metrics[name] !== null && <small>Subtotal no definitivo</small>}</td>)}<td>{branch.eerrId ? <Link href={`/eerr/${branch.eerrId}`}>Abrir EERR</Link> : "—"}</td></tr>)}</tbody></table>{table.branches.length === 0 && <p>No hay sucursales accesibles en este período.</p>}</div>;
}
export function TwoBranches({ period, branches }: { period: Period; branches: ComparisonBranch[] }) {
  const [current, setCurrent] = useState(""); const [reference, setReference] = useState("");
  const query = useQuery<TwoBranchComparisonResponse>();
  const compare = () => { if (!current || !reference || current === reference) return; query.run(comparisonPath("two-branches", period, period, current, reference), (data) => matchesComparison(data, period, period, current, reference)); };
  const data = query.state.data;
  return <div className={styles.subsection}><h3>Comparar dos sucursales</h3><p>En {periodLabel(period)}, diferencia = sucursal analizada menos sucursal de referencia.</p>
    {branches.length < 2 ? <p>Hacen falta dos sucursales accesibles para esta comparación.</p> : <div className={styles.compareControls}><BranchSelect label="Sucursal analizada" branches={branches} value={current} onChange={setCurrent} /><BranchSelect label="Sucursal de referencia" branches={branches} value={reference} onChange={setReference} /><button type="button" disabled={!current || !reference || current === reference || query.state.loading} onClick={compare}>Comparar sucursales</button></div>}
    {current && current === reference && <p role="alert">Elegí dos sucursales diferentes.</p>}
    <QueryFeedback state={query.state} retry={query.retry} />
    {data && <><p className={styles.note}>Analizada: {data.current.name} ({sourceStatus(data.current.status)}{data.current.revision !== null ? `, revisión ${data.current.revision}` : ""}). Referencia: {data.reference.name} ({sourceStatus(data.reference.status)}{data.reference.revision !== null ? `, revisión ${data.reference.revision}` : ""}).</p><MetricTable metrics={data.metrics} current={data.current.name} reference={data.reference.name} /></>}
  </div>;
}
function BranchesView({ period, table }: { period: Period; table: BranchTableResponse }) {
  return <section className={styles.section} aria-labelledby="branch-table-title"><p className={styles.eyebrow}>Alcance autorizado · {scopeLabel(table.scope)}</p><h2 id="branch-table-title">Sucursales del período</h2><p>Sin EERR o importes pendientes no equivalen a cero. Los valores parciales son solo subtotales de la fuente.</p><BranchTable period={period} table={table} /><TwoBranches period={period} branches={table.branches} /></section>;
}
function CoverageSide({ title, side }: { title: string; side: ConsolidatedPeriodComparisonResponse["current"] }) {
  const c = side.coverage;
  return <div className={styles.coverageSide}><h3>{title} · {periodLabel(side.period)}</h3><p>{side.consolidated.definitive ? "Consolidado definitivo" : side.consolidated.label}</p><dl><div><dt>Esperadas</dt><dd>{c.expected}</dd></div><div><dt>Con EERR</dt><dd>{c.withEerr}</dd></div><div><dt>Completas</dt><dd>{c.complete}</dd></div><div><dt>Incompletas</dt><dd>{c.partial + c.pending + c.empty + c.uninitialized}</dd></div><div><dt>Sin EERR</dt><dd>{c.withoutEerr}</dd></div></dl></div>;
}
export function ConsolidatedGoalComparison({ data }: { data: ConsolidatedPeriodComparisonResponse }) {
  const hasGoal = (side: typeof data.current) => side.consolidated.targetNetMargin !== undefined
    && !!side.consolidated.targetSales && !!side.consolidated.targetDifference
    && !!side.consolidated.targetCompliance && !!side.consolidated.trafficLight;
  if (!data.goalComparison || !hasGoal(data.current) || !hasGoal(data.reference))
    return <p className={styles.note}>La respuesta no incluye comparación de metas consolidadas.</p>;
  const names = [["targetSales", "Objetivo de Venta"], ["targetDifference", "Diferencia contra objetivo"], ["targetCompliance", "Cumplimiento"]] as const;
  const light = (side: typeof data.current) => <>{<span className={styles.trafficLight} data-light={side.consolidated.trafficLight.value}>{trafficLightLabel(side.consolidated.trafficLight.value)}</span>}{side.consolidated.trafficLight.reason && <small>{metricReason(side.consolidated.trafficLight.reason)}</small>}</>;
  return <div className={styles.tableScroll} role="region" aria-label="Comparación temporal de meta consolidada" tabIndex={0}><table className={styles.comparisonTable}>
    <caption>Meta consolidada transitoria · {marginInput(data.current.consolidated.targetNetMargin)} %</caption>
    <thead><tr><th scope="col">Indicador</th><th scope="col">Analizado · {periodLabel(data.current.period)}</th><th scope="col">Referencia · {periodLabel(data.reference.period)}</th><th scope="col">Diferencia</th><th scope="col">Variación</th></tr></thead>
    <tbody>{names.map(([name, label]) => { const metric = data.goalComparison[name]; return <tr key={name}><th scope="row">{label}</th><td>{formatComparisonValue(metric.current, metric.unit)}{metric.current === null && <small>{metricReason(data.current.consolidated[name].reason)}</small>}</td><td>{formatComparisonValue(metric.reference, metric.unit)}{metric.reference === null && <small>{metricReason(data.reference.consolidated[name].reason)}</small>}</td><td>{formatDifference(metric)}</td><td>{formatVariation(metric)}{metric.reason && <small>{comparisonReason(metric.reason)}</small>}</td></tr>; })}
      <tr><th scope="row">Semáforo</th><td>{light(data.current)}</td><td>{light(data.reference)}</td><td colSpan={2}>Estado por período; sin variación numérica.</td></tr>
    </tbody>
  </table></div>;
}
export function ConsolidatedComparisonResult({ data }: { data: ConsolidatedPeriodComparisonResponse }) {
  return <><p className={styles.note}>{scopeLabel(data.scope)}. {comparisonDescription(data.current.period, data.reference.period)} El cambio de población no explica por sí solo una variación financiera.</p><div className={styles.coveragePair}><CoverageSide title="Analizado" side={data.current} /><CoverageSide title="Referencia" side={data.reference} /></div>{(!data.current.consolidated.definitive || !data.reference.consolidated.definitive) && <p className={styles.note}>La cobertura incompleta impide una comparación financiera definitiva. No se interpreta el subtotal como consolidado completo.</p>}<MetricTable metrics={data.metrics} current={periodLabel(data.current.period)} reference={periodLabel(data.reference.period)} /><ConsolidatedGoalComparison data={data} /></>;
}
function ConsolidatedPeriods({ period, targetMargin }: { period: Period; targetMargin: string }) {
  const [reference, setReference] = useState(() => initialReference(period)); const query = useQuery<ConsolidatedPeriodComparisonResponse>();
  const compare = () => { if (!validPeriod(reference.year, reference.month)) return; query.run(comparisonPath("consolidated", period, reference, undefined, undefined, targetMargin), (data) => matchesComparison(data, period, reference) && matchesConsolidatedMargin(data, targetMargin)); };
  const data = query.state.data;
  return <section className={styles.section} aria-labelledby="consolidated-comparison-title"><p className={styles.eyebrow}>Alcance autorizado</p><h2 id="consolidated-comparison-title">Consolidado entre períodos</h2><p>Período analizado: <strong>{periodLabel(period)}</strong>. La referencia inicial es el mes anterior.</p>
    <div className={styles.compareControls}><ReferencePicker prefix="Consolidado" period={reference} onChange={setReference} /><button type="button" disabled={!validPeriod(reference.year, reference.month) || query.state.loading} onClick={compare}>Comparar consolidados</button></div>
    <QueryFeedback state={query.state} retry={query.retry} />
    {data && <ConsolidatedComparisonResult data={data} />}
  </section>;
}
export function Comparisons({ period, targetMargin }: { period: Period; targetMargin: string }) {
  const [mode, setMode] = useState<"periods" | "branches" | "consolidated">("periods");
  const table = useQuery<BranchTableResponse>();
  const loadTable = table.run;
  useEffect(() => { loadTable(`/analytics/branches?year=${period.year}&month=${period.month}`, (data) => data.period.year === period.year && data.period.month === period.month && !!data.sourceSignature && !!data.calculationVersion); }, [period.year, period.month, loadTable]);
  return <div className={styles.comparisons}><nav className={styles.modes} aria-label="Modos de comparación"><button type="button" aria-current={mode === "periods" ? "true" : undefined} onClick={() => setMode("periods")}>Sucursal entre períodos</button><button type="button" aria-current={mode === "branches" ? "true" : undefined} onClick={() => setMode("branches")}>Sucursales del período</button><button type="button" aria-current={mode === "consolidated" ? "true" : undefined} onClick={() => setMode("consolidated")}>Consolidado entre períodos</button></nav>
    <p className={styles.live} role="status" aria-live="polite">{table.state.loading ? "Cargando sucursales accesibles…" : table.state.data ? "Sucursales accesibles actualizadas." : ""}</p>
    {table.state.error && <div className={styles.feedback} role="alert"><p>{table.state.error}</p><button type="button" onClick={table.retry}>Reintentar sucursales</button></div>}
    {table.state.data && <button type="button" onClick={table.retry} disabled={table.state.loading}>Actualizar sucursales</button>}
    {mode === "periods" && table.state.data && <BranchPeriods period={period} branches={table.state.data.branches} />}
    {mode === "branches" && table.state.data && <BranchesView period={period} table={table.state.data} />}
    {mode === "consolidated" && <ConsolidatedPeriods key={targetMargin} period={period} targetMargin={targetMargin} />}
  </div>;
}
