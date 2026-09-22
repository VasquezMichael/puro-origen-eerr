"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LOGOUT_REQUEST, type LogoutRequest } from "../../session-context";
import { Modal } from "../overlays";
import styles from "../workspace.module.css";

type NavigationForDrafts = EventTarget & {
  traverseTo: (key: string) => { finished: Promise<unknown> };
};
type HistoryNavigation = Event & {
  navigationType: string;
  destination: { url: string; key: string; sameDocument: boolean };
};
type Departure =
  | { kind: "link"; href: string }
  | { kind: "history"; key: string; navigation: NavigationForDrafts }
  | { kind: "logout"; proceed: () => Promise<boolean> };

/** No synthetic history entries: links, logout and cancellable same-document traversal share confirmation. */
export function DraftNavigationGuard({
  dirty,
  busy,
}: {
  dirty: boolean;
  busy: boolean;
}) {
  const router = useRouter();
  const [destination, setDestination] = useState<Departure | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const leaving = useRef(false);
  const removeGuard = useRef(() => {});
  useEffect(() => {
    if (!dirty) return;
    function beforeUnload(event: BeforeUnloadEvent) {
      if (leaving.current) return;
      event.preventDefault();
      event.returnValue = "";
    }
    function click(event: MouseEvent) {
      if (
        leaving.current ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const anchor = (event.target as Element).closest<HTMLAnchorElement>(
        "a[href]",
      );
      if (
        !anchor ||
        anchor.hasAttribute("download") ||
        (anchor.target && anchor.target !== "_self")
      )
        return;
      const target = new URL(anchor.href, location.href);
      if (
        target.origin !== location.origin ||
        (target.pathname === location.pathname &&
          target.search === location.search)
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      setError("");
      setDestination({
        kind: "link",
        href: target.pathname + target.search + target.hash,
      });
    }
    function logout(event: Event) {
      if (leaving.current) return;
      event.preventDefault();
      setError("");
      setDestination({
        kind: "logout",
        proceed: (event as LogoutRequest).detail.proceed,
      });
    }
    const navigation = (window as Window & { navigation?: NavigationForDrafts })
      .navigation;
    function traverse(event: Event) {
      const change = event as HistoryNavigation;
      if (
        leaving.current ||
        !event.cancelable ||
        change.navigationType !== "traverse" ||
        !change.destination.sameDocument ||
        !navigation
      )
        return;
      const target = new URL(change.destination.url);
      if (
        target.origin !== location.origin ||
        (target.pathname === location.pathname &&
          target.search === location.search)
      )
        return;
      event.preventDefault();
      setError("");
      setDestination({
        kind: "history",
        key: change.destination.key,
        navigation,
      });
    }
    navigation?.addEventListener("navigate", traverse);
    document.addEventListener(LOGOUT_REQUEST, logout);
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", click, true);
    const remove = () => {
      navigation?.removeEventListener("navigate", traverse);
      document.removeEventListener(LOGOUT_REQUEST, logout);
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", click, true);
    };
    removeGuard.current = remove;
    return remove;
  }, [dirty]);
  async function leave() {
    if (!destination || submitting.current || busy) return;
    submitting.current = true;
    setWaiting(true);
    setError("");
    try {
      if (destination.kind === "logout") {
        if (!(await destination.proceed()))
          throw new Error(
            "No pudimos cerrar la sesión. Tu borrador se conserva; podés reintentar.",
          );
      } else {
        leaving.current = true;
        if (destination.kind === "history")
          await destination.navigation.traverseTo(destination.key).finished;
        else router.push(destination.href);
        removeGuard.current();
      }
    } catch (cause) {
      leaving.current = false;
      setError((cause as Error).message);
    } finally {
      submitting.current = false;
      setWaiting(false);
    }
  }
  if (!destination || !dirty) return null;
  return (
    <Modal
      title="Borradores sin guardar"
      context={
        destination.kind === "logout"
          ? "Cerrar sesión"
          : "Salir del espacio de carga"
      }
      busy={busy || waiting}
      onClose={() => setDestination(null)}
    >
      <p>
        Hay cambios sin guardar. Si salís, se descartarán. No se guardan
        automáticamente.
      </p>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <div className={styles.actions}>
        <button disabled={busy || waiting} onClick={() => setDestination(null)}>
          Continuar editando
        </button>
        <button disabled={busy || waiting} onClick={() => void leave()}>
          Descartar y salir
        </button>
      </div>
    </Modal>
  );
}
