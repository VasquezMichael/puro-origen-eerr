"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { DashboardResponse } from "@puro-origen/shared-types";
import { WorkspaceShell } from "./eerr/workspace-shell";
import { eerrApi, EerrApiError } from "./eerr/api";
import { roleLabel, type SessionUser } from "./session-model";
import { Branches, Consolidated, Coverage, PeriodPicker } from "./dashboard-sections";
import { acceptsDashboardResponse, currentPeriod, dashboardHref, periodFromQuery, periodKey, periodLabel, queryIsCanonical, viewFromQuery, visibleDashboard, type DashboardSnapshot, type Period } from "./dashboard-model";
import { Comparisons } from "./dashboard-comparisons";
import styles from "./dashboard.module.css";

export function dashboardError(error: unknown): string {
  if (error instanceof EerrApiError) {
    if (error.status === 409) return "Los datos cambiaron mientras se preparaba el Dashboard. Actualizá para obtener una vista consistente.";
    if (error.status === 400) return error.message.startsWith("El Dashboard admite hasta ")
      ? error.message
      : "El período solicitado no es válido. Elegí otro año y mes.";
    return error.message;
  }
  return "No pudimos cargar el Dashboard. Intentá nuevamente.";
}

export function Dashboard({ user }: { user: SessionUser }) {
  const router = useRouter();
  const search = useSearchParams();
  const [fallback] = useState<Period>(() => currentPeriod(new Date()));
  const query = search.toString();
  const period = useMemo(() => periodFromQuery(new URLSearchParams(query), fallback), [query, fallback]);
  const view = viewFromQuery(new URLSearchParams(query));
  const key = periodKey(period);
  const [refresh, setRefresh] = useState(0);
  const [visible, setVisible] = useState<DashboardSnapshot | null>(null);
  const generation = useRef(0);
  const refreshing = useRef(false);
  const requestKey = `${key}:${refresh}:${view}`;
  useEffect(() => {
    if (!queryIsCanonical(new URLSearchParams(query), period, view)) router.replace(dashboardHref(period, view), { scroll: false });
  }, [query, period, view, router]);
  useEffect(() => {
    if (view !== "summary") return;
    const controller = new AbortController();
    const request = ++generation.current;
    eerrApi<DashboardResponse>(`/analytics/dashboard?year=${period.year}&month=${period.month}`, { signal: controller.signal })
      .then((data) => {
        if (!acceptsDashboardResponse(request, generation.current, controller.signal.aborted)) return;
        if (data.year !== period.year || data.month !== period.month) throw new Error("El servidor respondió con otro período.");
        setVisible({ request: requestKey, signature: data.sourceSignature, data, error: "" });
      })
      .catch((failure: unknown) => { if (acceptsDashboardResponse(request, generation.current, controller.signal.aborted)) setVisible({ request: requestKey, signature: null, data: null, error: dashboardError(failure) }); })
      .finally(() => { if (request === generation.current) refreshing.current = false; });
    return () => { controller.abort(); refreshing.current = false; };
  }, [period.year, period.month, requestKey, view]);
  const loading = visible?.request !== requestKey;
  const error = loading ? "" : visible.error;
  const data = !loading ? visibleDashboard(visible, requestKey) : null;
  const select = (next: Period) => router.push(dashboardHref(next, view), { scroll: false });
  const refreshApplied = () => { if (loading || refreshing.current) return; refreshing.current = true; setRefresh((value) => value + 1); };
  return <WorkspaceShell section="dashboard" title="Dashboard" role={roleLabel(user)} isAdmin={user.isAdmin}>
    <div className={styles.dashboard}>
      <header className={styles.heading}><div><p className={styles.eyebrow}>{view === "summary" ? "Resumen mensual" : "Comparaciones financieras"} · {periodLabel(period)}</p><h1>Dashboard</h1><p>Resultados de las sucursales dentro de tu alcance autorizado.</p></div></header>
      <nav aria-label="Vistas del Dashboard" className={styles.views}>
        <Link href={dashboardHref(period, "summary")} aria-current={view === "summary" ? "page" : undefined}>Resumen</Link>
        <Link href={dashboardHref(period, "comparisons")} aria-current={view === "comparisons" ? "page" : undefined}>Comparaciones</Link>
      </nav>
      <PeriodPicker key={key} period={period} onSelect={select} onRefresh={refreshApplied} loading={view === "summary" && loading} hideRefresh={view === "comparisons"} />
      {view === "comparisons" ? <Comparisons key={`${key}:${refresh}`} period={period} /> : <>
        <div role="status" aria-live="polite" className={styles.live}>{loading ? `Cargando Dashboard de ${periodLabel(period)}…` : error ? "No se pudo actualizar el Dashboard." : `Dashboard de ${periodLabel(period)} actualizado.`}</div>
        {error && <section className={styles.feedback} role="alert"><p>{error}</p><button onClick={refreshApplied}>Reintentar</button></section>}
        {data && <div><Coverage data={data} /><Consolidated data={data} /><Branches data={data} /></div>}
      </>}
    </div>
  </WorkspaceShell>;
}
