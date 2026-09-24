"use client";
import { useState, type CSSProperties } from "react";
import type { AnalysisResponse } from "@puro-origen/shared-types";
import { formatAnalysisMoney, formatAnalysisPercent } from "./analysis-format";
import { metricStatus, scopeStatus, statementRows, type StatementRow } from "./analysis-model";
import { useAnalysis } from "./use-analysis";
import styles from "./results-statement.module.css";

function AnalysisRow({ row }: { row: StatementRow }) {
  if (row.kind === "section") return <tr className={styles.sectionRow}><th scope="row" colSpan={3}>{row.label}</th></tr>;
  const status = row.kind === "metric" ? metricStatus(row.metric) : scopeStatus(row.scope);
  const value = row.kind === "metric" ? row.metric.value : row.scope.value;
  const formatted = value === null ? "—" : row.kind === "metric" && row.metric.unit === "PERCENT" ? formatAnalysisPercent(value) : formatAnalysisMoney(value);
  const hierarchy = row.kind === "category" ? `${row.depth === 1 ? "Categoría" : "Subcategoría"} de ${row.parentLabel}` : undefined;
  return (
    <tr className={row.kind === "category" ? styles.categoryRow : styles.totalRow}>
      <th scope="row" className={styles.concept} style={row.kind === "category" ? { "--depth": row.depth } as CSSProperties : undefined}>
        {row.label}{hierarchy && <span className={styles.parent}>{hierarchy}</span>}
      </th>
      <td data-label="Estado" className={styles.status}>{status}</td>
      <td data-label={row.kind === "metric" && row.metric.unit === "PERCENT" ? "Porcentaje" : "Importe"} className={styles.value} aria-label={value === null ? `${row.label}: sin valor. ${status}` : undefined}>{formatted}</td>
    </tr>
  );
}

export function StatementTable({ analysis }: { analysis: AnalysisResponse }) {
  return <table className={styles.table} aria-label="Cuadro de resultados del EERR">
    <thead><tr><th scope="col">Concepto</th><th scope="col">Estado o completitud</th><th scope="col">Importe o porcentaje</th></tr></thead>
    <tbody>{statementRows(analysis).map((row) => <AnalysisRow key={row.key} row={row} />)}</tbody>
  </table>;
}

export function ResultsStatement({ id, revision, hasDrafts, onRefreshStructure }: {
  id: string;
  revision: number;
  hasDrafts: boolean;
  onRefreshStructure: () => Promise<boolean>;
}) {
  const [attempt, setAttempt] = useState(0);
  const state = useAnalysis(id, revision, attempt);
  async function refresh() {
    if (state.kind === "mismatch") await onRefreshStructure();
    setAttempt((current) => current + 1);
  }
  return <section className={styles.statement} aria-labelledby="results-title">
    <div className={styles.heading}>
      <div><p className={styles.eyebrow}>Análisis del período</p><h2 id="results-title">Cuadro de resultados</h2></div>
      {hasDrafts && <p className={styles.savedNotice}>Calculado con los datos guardados</p>}
    </div>
    <div aria-live="polite" aria-atomic="true">
      {state.kind === "loading" && <div className={styles.loading}>Actualizando resultados…</div>}
      {state.kind === "mismatch" && <div className={styles.message}>Los datos cambiaron. Actualizando resultados… <button type="button" onClick={() => void refresh()}>Actualizar cuadro</button></div>}
      {state.kind === "error" && <div className={styles.message}>No pudimos cargar el cuadro de resultados. La estructura sigue disponible. <button type="button" onClick={() => void refresh()}>Reintentar cuadro</button></div>}
    </div>
    {state.kind === "ready" && state.data.initialized && <StatementTable analysis={state.data} />}
  </section>;
}
