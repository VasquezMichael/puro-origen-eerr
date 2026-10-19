import type { EerrCapabilities, EerrLifecycleStatus, EerrTransitionResponse } from "@puro-origen/shared-types";

export type LifecycleAction = "close" | "reopen" | "delete";

export async function runLifecycleTransition(
  action: LifecycleAction,
  id: string,
  expectedRevision: number,
  request: (path: string, options: RequestInit) => Promise<EerrTransitionResponse>,
  refresh: () => Promise<unknown>,
): Promise<
  | { kind: "success"; result: EerrTransitionResponse }
  | { kind: "conflict" }
  | { kind: "missing" }
  | { kind: "disabled" }
> {
  try {
    const result = await request(`/eerr/${id}${action === "delete" ? "" : `/${action}`}`, {
      method: action === "delete" ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedRevision }),
    });
    return { kind: "success", result };
  } catch (cause) {
    const status = cause && typeof cause === "object" && "status" in cause ? cause.status : null;
    if (status === 404) return { kind: "missing" };
    if (status === 503 && action === "delete") return { kind: "disabled" };
    if (status === 409) {
      try { await refresh(); }
      catch (refreshError) {
        if (refreshError && typeof refreshError === "object" && "status" in refreshError && refreshError.status === 404)
          return { kind: "missing" };
        throw refreshError;
      }
      return { kind: "conflict" };
    }
    throw cause;
  }
}

export function lifecycleActions(
  canEdit: boolean,
  status: EerrLifecycleStatus,
  everClosed: boolean,
  capabilities: EerrCapabilities | null,
): LifecycleAction[] {
  if (!canEdit) return [];
  if (status === "CLOSED") return ["reopen"];
  return capabilities?.softDeleteEnabled && !everClosed ? ["close", "delete"] : ["close"];
}
