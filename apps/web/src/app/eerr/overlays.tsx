"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import styles from "./workspace.module.css";

/** Native dialog supplies inert background and focus containment; drafts live in the workspace. */
export function Modal({
  title,
  context,
  busy,
  onClose,
  children,
}: {
  title: string;
  context: string;
  busy: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const contextId = useId();
  useEffect(() => {
    const origin = document.activeElement as HTMLElement | null;
    const element = dialog.current!;
    element.showModal();
    return () => {
      element.close();
      if (origin?.isConnected) origin.focus();
    };
  }, []);
  useEffect(() => {
    heading.current?.focus();
  }, [title]);
  return (
    <dialog
      ref={dialog}
      className={styles.modal}
      aria-labelledby={titleId}
      aria-describedby={contextId}
      aria-busy={busy}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header className={styles.modalHeader}>
        <div>
          <h2 id={titleId} ref={heading} tabIndex={-1}>
            {title}
          </h2>
          <p id={contextId}>{context}</p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={onClose}
          aria-label="Cerrar ventana"
        >
          Cerrar ×
        </button>
      </header>
      <div className={styles.modalBody}>{children}</div>
      <footer className={styles.modalFooter}>
        Los borradores se conservan al cerrar, mientras permanezcas en este
        EERR.
      </footer>
    </dialog>
  );
}

/** Popover is in the browser top layer, outside clipping/stacking containers. */
export function ActionMenu({
  name,
  actions,
  disabled = false,
}: {
  name: string;
  actions: { label: string; run: () => void }[];
  disabled?: boolean;
}) {
  const id = useId();
  const menu = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [expanded, setExpanded] = useState(false);
  function show() {
    const rect = trigger.current!.getBoundingClientRect();
    setPosition({
      top: Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - 370)),
      left: Math.max(8, Math.min(rect.right - 260, window.innerWidth - 276)),
    });
    menu.current!.showPopover();
    menu.current!.querySelector<HTMLButtonElement>("button")?.focus();
  }
  function close() {
    menu.current?.hidePopover();
    trigger.current?.focus();
  }
  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-label={`Acciones de ${name}`}
        aria-haspopup="menu"
        aria-expanded={expanded}
        aria-controls={id}
        disabled={disabled}
        onClick={show}
      >
        Acciones <span aria-hidden="true">⋯</span>
      </button>
      <div
        ref={menu}
        id={id}
        popover="auto"
        role="menu"
        aria-label={`Acciones de ${name}`}
        className={styles.menu}
        style={position}
        onToggle={(event) => setExpanded(event.newState === "open")}
        onKeyDown={(event) => {
          const buttons = Array.from(
            menu.current!.querySelectorAll<HTMLButtonElement>("button"),
          );
          const current = buttons.indexOf(
            document.activeElement as HTMLButtonElement,
          );
          if (event.key === "Escape" || event.key === "Tab") {
            close();
            if (event.key === "Escape") event.preventDefault();
          }
          if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
            event.preventDefault();
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? buttons.length - 1
                  : (current +
                      (event.key === "ArrowDown" ? 1 : -1) +
                      buttons.length) %
                    buttons.length;
            buttons[next]?.focus();
          }
        }}
      >
        {actions.map((action) => (
          <button
            role="menuitem"
            type="button"
            key={action.label}
            onClick={() => {
              close();
              action.run();
            }}
          >
            {action.label}
          </button>
        ))}
      </div>
    </>
  );
}
