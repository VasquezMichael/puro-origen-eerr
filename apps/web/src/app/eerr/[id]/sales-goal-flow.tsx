"use client";
import { useEffect, useRef, useState } from "react";
import type { AnalysisResponse, SalesGoalResponse } from "@puro-origen/shared-types";
import type { SalesGoalMode } from "@puro-origen/domain";
import { eerrApi, EerrApiError } from "../api";
import { ProjectionsSection } from "./projections-section";
import { SalesGoalModal } from "./sales-goal-modal";
import { canonicalSalesGoal, initialSalesGoalDraft, salesGoalDirty, type SalesGoalDraft } from "./sales-goal-form";

export function SalesGoalFlow({ id, revision, analysis, visible, canEdit, disabled,
  context, onRefreshStructure, onRefreshAnalysis, onDirtyChange, onBusyChange }: {
  id: string; revision: number; analysis: AnalysisResponse | null; visible: boolean;
  canEdit: boolean; disabled: boolean; context: string;
  onRefreshStructure: () => Promise<boolean>; onRefreshAnalysis: () => void;
  onDirtyChange: (dirty: boolean) => void; onBusyChange: (busy: boolean) => void;
}) {
  const [kind, setKind] = useState<"form" | "delete" | null>(null);
  const [draft, setDraft] = useState<SalesGoalDraft>({ mode: "NET_MARGIN_PERCENT", value: "" });
  const [pendingMode, setPendingMode] = useState<SalesGoalMode | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [refreshPending, setRefreshPending] = useState(false);
  const [refreshRequested, setRefreshRequested] = useState(false);
  const [savedRevision, setSavedRevision] = useState<number | null>(null);
  const sending = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const synced = savedRevision !== null && refreshRequested && visible && revision >= savedRevision && analysis?.sourceRevision === revision;
  const shownKind = synced ? null : kind;
  const dirty = shownKind === "form" && salesGoalDirty(draft, analysis?.salesGoal ?? null);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useEffect(() => onBusyChange(busy), [busy, onBusyChange]);
  useEffect(() => () => { onDirtyChange(false); onBusyChange(false); }, [onDirtyChange, onBusyChange]);

  function reset() {
    setKind(null);
    setPendingMode(null);
    setConfirmDiscard(false);
    setError("");
    setConflict(false);
    setRefreshPending(false);
    setRefreshRequested(false);
    setSavedRevision(null);
  }
  function openForm() {
    if (!analysis || !canEdit || disabled) return;
    setDraft(initialSalesGoalDraft(analysis.salesGoal));
    reset(); setKind("form");
  }
  function openDelete() {
    if (!analysis?.salesGoal || !canEdit || disabled) return;
    reset(); setKind("delete");
  }
  function close() {
    if (sending.current || busy || refreshPending) return;
    if (confirmDiscard) { setConfirmDiscard(false); return; }
    if (dirty) { setConfirmDiscard(true); return; }
    reset();
  }
  function changeMode(mode: SalesGoalMode) {
    if (mode === draft.mode) return;
    if (draft.value) setPendingMode(mode);
    else setDraft({ mode, value: "" });
    setError("");
  }
  async function refresh(afterSave: boolean) {
    if (sending.current) return;
    sending.current = true; setBusy(true); setError("");
    try {
      const ok = await onRefreshStructure();
      if (!ok) { setError("No pudimos actualizar la estructura. Reintentá sin reenviar la meta."); return; }
      onRefreshAnalysis();
      setRefreshRequested(true);
      if (!afterSave && !refreshPending) setConflict(false);
    } finally { sending.current = false; setBusy(false); }
  }
  async function submit(goal: SalesGoalDraft | null) {
    if (!visible || !canEdit || disabled || sending.current || conflict || refreshPending || pendingMode) return;
    let canonical: ReturnType<typeof canonicalSalesGoal> | null = null;
    if (goal) {
      try { canonical = canonicalSalesGoal(goal); }
      catch (cause) {
        setError((cause as Error).message);
        inputRef.current?.focus();
        return;
      }
    }
    sending.current = true; setBusy(true); setError("");
    try {
      const response = await eerrApi<SalesGoalResponse>(`/eerr/${id}/sales-goal`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedRevision: revision, goal: canonical }),
      });
      setRefreshRequested(false);
      setSavedRevision(response.revision);
      setRefreshPending(true);
    } catch (cause) {
      if (cause instanceof EerrApiError && cause.status === 409) setConflict(true);
      setError((cause as Error).message);
      if (goal && !(cause instanceof EerrApiError && cause.status === 409)) inputRef.current?.focus();
      return;
    } finally { sending.current = false; setBusy(false); }
    await refresh(true);
  }
  return <>
    {refreshPending && !synced && <p role="status">Actualizando resultados…</p>}
    {visible && analysis && (!refreshPending || synced) && <ProjectionsSection analysis={analysis} canEdit={canEdit}
      disabled={disabled || busy} onConfigure={openForm} onDelete={openDelete} />}
    {shownKind && <SalesGoalModal kind={shownKind} context={context} saved={analysis?.salesGoal ?? null}
      draft={draft} pendingMode={pendingMode} busy={busy} ready={visible && !disabled} error={error}
      conflict={conflict} refreshPending={refreshPending} confirmDiscard={confirmDiscard}
      inputRef={inputRef} onClose={close} onDiscard={reset}
      onValue={(value) => { setDraft((current) => ({ ...current, value })); setError(""); }}
      onMode={changeMode} onConfirmMode={() => { if (pendingMode) setDraft({ mode: pendingMode, value: "" }); setPendingMode(null); }}
      onCancelMode={() => setPendingMode(null)} onSave={() => void submit(draft)}
      onDelete={() => void submit(null)} onRefresh={() => void refresh(false)} />}
  </>;
}
