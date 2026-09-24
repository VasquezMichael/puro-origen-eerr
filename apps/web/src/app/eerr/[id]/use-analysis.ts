"use client";
import { useEffect, useState } from "react";
import type { AnalysisResponse } from "@puro-origen/shared-types";
import { eerrApi } from "../api";

type AnalysisState =
  | { kind: "loading"; id: string; revision: number; attempt: number }
  | { kind: "ready"; id: string; revision: number; attempt: number; data: AnalysisResponse }
  | { kind: "mismatch"; id: string; revision: number; attempt: number }
  | { kind: "error"; id: string; revision: number; attempt: number };

export function useAnalysis(id: string, revision: number, attempt: number): AnalysisState {
  const [state, setState] = useState<AnalysisState>({ kind: "loading", id, revision, attempt });
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      for (let retry = 0; retry < 3; retry++) {
        try {
          const data = await eerrApi<AnalysisResponse>(`/eerr/${id}/analysis`, { signal: controller.signal });
          if (controller.signal.aborted) return;
          if (data.eerrId === id && data.sourceRevision === revision) {
            setState({ kind: "ready", id, revision, attempt, data });
            return;
          }
          if (retry === 2) {
            setState({ kind: "mismatch", id, revision, attempt });
            return;
          }
          await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, 250);
            controller.signal.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
          });
          if (controller.signal.aborted) return;
        } catch {
          if (!controller.signal.aborted) setState({ kind: "error", id, revision, attempt });
          return;
        }
      }
    })();
    return () => controller.abort();
  }, [id, revision, attempt]);
  // El render puede preceder al cleanup del efecto tras un guardado.
  return state.id === id && state.revision === revision && state.attempt === attempt ? state : { kind: "loading", id, revision, attempt };
}
