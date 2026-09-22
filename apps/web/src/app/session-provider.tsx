"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LoginForm } from "./login-form";
import {
  LOGOUT_REQUEST,
  SESSION_EXPIRED,
  SessionContext,
} from "./session-context";
import type { SessionUser } from "./session-model";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const generation = useRef(0);
  const sending = useRef(false);
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    const controller = new AbortController();
    const current = generation.current;
    fetch(`${API_URL}/auth/me`, {
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.status === 401 || response.status === 403) return null;
        if (!response.ok)
          throw new Error(
            "No pudimos comprobar la sesión. Intentá nuevamente.",
          );
        return ((await response.json()) as { user: SessionUser }).user;
      })
      .then((result) => {
        if (!controller.signal.aborted && current === generation.current) {
          setUser(result);
          setError("");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted && current === generation.current) {
          setUser(null);
          setError("No pudimos comprobar la sesión. Intentá nuevamente.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [pathname]);
  useEffect(() => {
    function expired() {
      generation.current++;
      setUser(null);
      setError("Tu sesión venció. Volvé a ingresar.");
    }
    window.addEventListener(SESSION_EXPIRED, expired);
    return () => window.removeEventListener(SESSION_EXPIRED, expired);
  }, []);
  async function logout() {
    if (sending.current) return false;
    sending.current = true;
    setLoggingOut(true);
    setError("");
    try {
      const response = await fetch(`${API_URL}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok)
        throw new Error("No pudimos cerrar la sesión. Intentá nuevamente.");
      generation.current++;
      setUser(null);
      router.replace("/");
      return true;
    } catch {
      setError("No pudimos cerrar la sesión. Intentá nuevamente.");
      return false;
    } finally {
      sending.current = false;
      setLoggingOut(false);
    }
  }
  function requestLogout() {
    const event = new CustomEvent(LOGOUT_REQUEST, {
      cancelable: true,
      detail: { proceed: logout },
    });
    if (document.dispatchEvent(event)) void logout();
  }
  function authenticated(next: SessionUser) {
    generation.current++;
    setUser(next);
    setError("");
    router.replace("/");
  }
  if (loading || !user || user.mustChangePassword)
    return (
      <LoginFrame>
        {loading ? (
          <p role="status" className="session-status">
            Comprobando sesión…
          </p>
        ) : (
          <>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <LoginForm
              user={user}
              onAuthenticated={authenticated}
              onLogout={requestLogout}
              loggingOut={loggingOut}
            />
          </>
        )}
      </LoginFrame>
    );
  return (
    <SessionContext.Provider value={{ user, requestLogout, loggingOut, error }}>
      {children}
    </SessionContext.Provider>
  );
}
export function LoginFrame({ children }: { children: ReactNode }) {
  return (
    <main className="shell">
      <section className="brand-panel">
        <div className="brand-mark">PO</div>
        <div>
          <p className="brand-name">Puro de Origen</p>
          <p className="brand-product">Gestión EERR</p>
        </div>
        <div className="brand-message">
          <p>Información clara para tomar mejores decisiones.</p>
          <span>Controlá cada sucursal y período desde un único lugar.</span>
        </div>
      </section>
      <section className="content-panel">{children}</section>
    </main>
  );
}
