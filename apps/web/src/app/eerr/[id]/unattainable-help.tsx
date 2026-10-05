"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { formatAnalysisPercent } from "./analysis-format";
import styles from "./results-statement.module.css";

export function unattainableHelpText(contributionPercent: string | null): string {
  if (contributionPercent === null)
    return "La meta debe ser menor al margen de contribución actual. Con la estructura vigente, el margen neto puede aproximarse a ese porcentaje, pero no alcanzarlo mientras existan gastos generales.";
  return `La meta debe ser menor al margen de contribución actual del ${formatAnalysisPercent(contributionPercent)}. Puede aproximarse a ese valor, pero no alcanzarlo mientras existan gastos generales.`;
}

export function UnattainableHelp({ contributionPercent }: { contributionPercent: string | null }) {
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLSpanElement>(null);
  const openRef = useRef(false);
  const pinnedRef = useRef(false);
  const suppressFocus = useRef(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);

  const cancelLeave = useCallback(() => {
    if (leaveTimer.current !== null) clearTimeout(leaveTimer.current);
    leaveTimer.current = null;
  }, []);
  const place = useCallback(() => {
    const trigger = button.current;
    const panel = popover.current;
    if (!trigger || !panel || !panel.matches(":popover-open")) return;
    const anchor = trigger.getBoundingClientRect();
    const size = panel.getBoundingClientRect();
    const left = Math.max(8, Math.min(anchor.left, window.innerWidth - size.width - 8));
    const below = anchor.bottom + 8;
    const top = below + size.height <= window.innerHeight - 8
      ? below : Math.max(8, anchor.top - size.height - 8);
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  }, []);
  const hide = useCallback((restoreFocus = false) => {
    cancelLeave();
    pinnedRef.current = false;
    if (!openRef.current) return;
    openRef.current = false;
    if (popover.current?.matches(":popover-open")) popover.current.hidePopover();
    setOpen(false);
    if (restoreFocus && button.current) {
      suppressFocus.current = true;
      button.current.focus({ preventScroll: true });
      queueMicrotask(() => { suppressFocus.current = false; });
    }
  }, [cancelLeave]);
  const show = useCallback(() => {
    cancelLeave();
    if (!popover.current || openRef.current) return;
    popover.current.showPopover();
    openRef.current = true;
    setOpen(true);
    place();
  }, [cancelLeave, place]);
  const scheduleLeave = useCallback(() => {
    cancelLeave();
    if (pinnedRef.current || document.activeElement === button.current) return;
    leaveTimer.current = setTimeout(() => hide(), 120);
  }, [cancelLeave, hide]);

  useEffect(() => {
    const panel = popover.current;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || !openRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      hide(true);
    }
    function onPointerDown(event: PointerEvent) {
      if (!openRef.current || !(event.target instanceof Node)) return;
      if (!button.current?.contains(event.target) && !popover.current?.contains(event.target)) hide();
    }
    function onFocusIn(event: FocusEvent) {
      if (!openRef.current || !(event.target instanceof Node)) return;
      if (!button.current?.contains(event.target) && !popover.current?.contains(event.target)) hide();
    }
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("focusin", onFocusIn, true);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("focusin", onFocusIn, true);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      cancelLeave();
      if (panel?.matches(":popover-open")) panel.hidePopover();
    };
  }, [cancelLeave, hide, place]);

  return <span className={styles.helpAnchor}>
    <button ref={button} type="button" className={styles.helpButton}
      aria-label="¿Por qué esta meta es inalcanzable?" aria-controls={id}
      aria-expanded={open} aria-describedby={open ? id : undefined}
      onPointerEnter={(event) => { if (event.pointerType === "mouse") show(); }}
      onPointerLeave={(event) => { if (event.pointerType === "mouse") scheduleLeave(); }}
      onFocus={() => { if (!suppressFocus.current) show(); }}
      onBlur={() => queueMicrotask(() => {
        if (document.activeElement !== button.current && !popover.current?.contains(document.activeElement)) hide();
      })}
      onClick={() => {
        if (pinnedRef.current) hide(true);
        else { pinnedRef.current = true; show(); }
      }}>?</button>
    <span ref={popover} id={id} role="tooltip" popover="manual" tabIndex={-1}
      className={styles.helpPopover}
      onPointerEnter={cancelLeave}
      onPointerLeave={(event) => { if (event.pointerType === "mouse") scheduleLeave(); }}>
      {unattainableHelpText(contributionPercent)}
    </span>
  </span>;
}
