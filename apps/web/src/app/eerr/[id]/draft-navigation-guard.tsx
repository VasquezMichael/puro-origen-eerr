"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "../overlays";
import styles from "../workspace.module.css";

/** Only same-tab internal links are intercepted. External departures use beforeunload. */
export function DraftNavigationGuard({
  dirty,
  busy,
}: {
  dirty: boolean;
  busy: boolean;
}) {
  const router = useRouter();
  const [destination, setDestination] = useState<string | null>(null);
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
        anchor.download ||
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
      setDestination(target.pathname + target.search + target.hash);
    }
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", click, true);
    const remove = () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", click, true);
    };
    removeGuard.current = remove;
    return remove;
  }, [dirty]);
  if (!destination || !dirty) return null;
  return (
    <Modal
      title="Borradores sin guardar"
      context="Salir del espacio de carga"
      busy={busy}
      onClose={() => setDestination(null)}
    >
      <p>
        Hay cambios sin guardar. Si salís, se descartarán. No se guardan
        automáticamente.
      </p>
      <div className={styles.actions}>
        <button disabled={busy} onClick={() => setDestination(null)}>
          Continuar editando
        </button>
        <button
          disabled={busy}
          onClick={() => {
            leaving.current = true;
            removeGuard.current();
            router.push(destination);
          }}
        >
          Descartar y salir
        </button>
      </div>
    </Modal>
  );
}
