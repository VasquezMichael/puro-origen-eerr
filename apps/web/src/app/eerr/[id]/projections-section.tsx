import type { AnalysisResponse } from "@puro-origen/shared-types";
import { formatAnalysisMoney, formatAnalysisPercent } from "./analysis-format";
import { formatGoalPercent } from "./sales-goal-form";
import styles from "./results-statement.module.css";

type Projection = AnalysisResponse["projections"]["breakEvenSales"];

export function projectionExplanation(reason: Projection["reason"], reference = false): string {
  switch (reason) {
    case "UNINITIALIZED": return "Disponible cuando se prepare la estructura del EERR.";
    case "PENDING_INPUTS": return "Disponible cuando se completen los importes requeridos.";
    case "EMPTY_INPUT": return "Falta definir al menos un ítem en uno de los bloques requeridos.";
    case "ZERO_REVENUE": return "No puede calcularse porque los ingresos son cero.";
    case "NON_POSITIVE_CONTRIBUTION_MARGIN": return "Los costos variables igualan o superan los ingresos.";
    case "GOAL_NOT_CONFIGURED": return "Configurá una meta para calcular el Objetivo de Venta.";
    case "TARGET_MARGIN_UNATTAINABLE": return "El margen deseado iguala o supera el margen de contribución actual.";
    case "ZERO_DENOMINATOR": return reference
      ? "No puede calcularse el porcentaje porque el Objetivo de Venta es cero."
      : "No puede calcularse porque el denominador es cero.";
    default: return "Resultado no disponible.";
  }
}

export function ProjectionMetric({ label, metric, description, reference = false }: {
  label: string; metric: Projection; description?: string; reference?: boolean;
}) {
  const display = metric.value === null ? "—" : metric.unit === "ARS"
    ? formatAnalysisMoney(metric.value) : formatAnalysisPercent(metric.value);
  const explanation = metric.value === null ? projectionExplanation(metric.reason, reference) : description;
  return <div className={reference ? styles.referenceMetric : styles.projectionMetric}>
    <h4>{label}</h4>
    <strong aria-label={metric.value === null ? `${label}: sin valor. ${explanation}` : undefined}>{display}</strong>
    {explanation && <p>{explanation}</p>}
  </div>;
}

export function SalesGoalSummary({ goal }: { goal: NonNullable<AnalysisResponse["salesGoal"]> }) {
  return <div className={styles.goalSummary}>
    <span className={styles.goalCaption}>Meta principal</span>
    <strong>{goal.mode === "NET_MARGIN_PERCENT" ? "Margen neto deseado" : "Ganancia neta deseada"}</strong>
    <span className={styles.goalValue}>{goal.mode === "NET_MARGIN_PERCENT"
      ? formatGoalPercent(goal.value) : formatAnalysisMoney(goal.value)}</span>
  </div>;
}

export function ProjectionsSection({ analysis, canEdit, disabled, onConfigure, onDelete }: {
  analysis: AnalysisResponse; canEdit: boolean; disabled: boolean;
  onConfigure: () => void; onDelete: () => void;
}) {
  const { salesGoal, projections } = analysis;
  const referenceLabel = !salesGoal ? "Referencia secundaria" : salesGoal.mode === "NET_MARGIN_PERCENT"
    ? "Ganancia neta estimada" : "Margen neto equivalente";
  return <section className={styles.projections} aria-labelledby="projections-title">
    <div className={styles.projectionsHeading}>
      <div><p className={styles.eyebrow}>Estimaciones del período</p><h3 id="projections-title">Proyecciones</h3></div>
      {canEdit && <div className={styles.goalActions}>
        <button type="button" disabled={disabled} onClick={onConfigure}>{salesGoal ? "Cambiar meta" : "Configurar meta"}</button>
        {salesGoal && <button type="button" disabled={disabled} onClick={onDelete}>Eliminar meta</button>}
      </div>}
    </div>
    <div className={styles.projectionGrid}>
      <ProjectionMetric label="Punto de Equilibrio" metric={projections.breakEvenSales}
        description="Venta mínima estimada para cubrir costos variables y gastos generales, sin generar ganancia ni pérdida." />
      {salesGoal ? <SalesGoalSummary goal={salesGoal} />
        : <p className={styles.noGoal}>Configurá una meta para calcular el Objetivo de Venta.</p>}
      <ProjectionMetric label="Objetivo de Venta" metric={projections.targetSales}
        description="Venta mínima estimada para alcanzar la meta configurada." />
      <ProjectionMetric label={referenceLabel} metric={projections.targetReference} reference
        description="Referencia informativa calculada sobre el Objetivo de Venta mostrado." />
    </div>
    <p className={styles.estimateNote}>Estimación basada en la relación actual entre costos variables y ventas.</p>
    <details className={styles.assumptions}><summary>Supuestos de estas proyecciones</summary>
      <ul>
        <li>Ingresos, Costos y Gastos se consideran netos de IVA.</li>
        <li>Costos representa costos variables asociados a las ventas.</li>
        <li>Gastos Generales se consideran mayormente fijos.</li>
        <li>La estimación utiliza la relación actual entre Costos e Ingresos.</li>
        <li>Los gastos semivariables no se descomponen en esta versión.</li>
      </ul>
    </details>
  </section>;
}
