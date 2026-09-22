"use client";
import { createContext, useContext } from "react";
import type { SessionUser } from "./session-model";

export const LOGOUT_REQUEST = "puro:logout-request";
export const SESSION_EXPIRED = "puro:session-expired";
export type LogoutRequest = CustomEvent<{ proceed: () => Promise<boolean> }>;
export const SessionContext = createContext<{
  user: SessionUser;
  requestLogout: () => void;
  loggingOut: boolean;
  error: string;
} | null>(null);
export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error("La página requiere una sesión comprobada");
  return session;
}
export function notifySessionExpired() {
  window.dispatchEvent(new Event(SESSION_EXPIRED));
}
