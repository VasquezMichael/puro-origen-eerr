"use client";
import Link from "next/link";
import { useContext, useId, useRef, useState, type ReactNode } from "react";
import { SessionContext } from "../session-context";
import { navigationItems, roleLabel, type Section } from "../session-model";
import styles from "./workspace.module.css";

export function WorkspaceShell({
  children,
  role,
  isAdmin = false,
  status = "",
  section = "eerr",
  title,
  actions,
}: {
  children: ReactNode;
  role?: string;
  isAdmin?: boolean;
  status?: string;
  section?: Section;
  title?: string;
  actions?: ReactNode;
}) {
  const session = useContext(SessionContext);
  const [menuOpen, setMenuOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const admin = session?.user.isAdmin ?? isAdmin;
  const label = role ?? (session ? roleLabel(session.user) : "");
  const items = navigationItems(admin);
  return (
    <div className={styles.shell} data-app-shell>
      <a className={styles.skip} href="#eerr-main">
        Ir al contenido principal
      </a>
      <aside
        className={styles.sidebar}
        data-menu-open={menuOpen}
        onKeyDown={(event) => {
          if (event.key === "Escape" && menuOpen) {
            event.preventDefault();
            setMenuOpen(false);
            trigger.current?.focus();
          }
        }}
      >
        <div className={styles.brandRow}>
          <Link href="/" className={styles.brand}>
            <span aria-hidden="true">PO</span>
            <strong>
              Puro de Origen<small>Gestión de resultados</small>
            </strong>
          </Link>
          <button
            ref={trigger}
            className={styles.navigationToggle}
            aria-expanded={menuOpen}
            aria-controls={menuId}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? "Cerrar menú" : "Abrir menú"}
          </button>
        </div>
        <nav
          id={menuId}
          aria-label="Navegación principal"
          onClick={(event) => {
            if ((event.target as Element).closest("a")) setMenuOpen(false);
          }}
        >
          {items.map((item) => (
            <Link
              key={item.section}
              href={item.href}
              aria-current={item.section === section ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <p className={styles.sidebarFoot}>
          Un espacio para cada sucursal.
          <br />
          Una mirada clara del período.
        </p>
      </aside>
      <div className={styles.content}>
        <header className={styles.topbar}>
          <nav aria-label="Ubicación" className={styles.breadcrumbs}>
            {title ? (
              <span>{title}</span>
            ) : (
              <>
                <Link href="/eerr">← Estados de resultados</Link>
                <span aria-hidden="true">/</span>
                <span>Estructura y carga</span>
              </>
            )}
          </nav>
          <div className={styles.headerActions}>
            {actions}
            <span>{label}</span>
            <button
              onClick={session?.requestLogout}
              disabled={!session || session.loggingOut}
            >
              {session?.loggingOut ? "Cerrando sesión…" : "Cerrar sesión"}
            </button>
          </div>
        </header>
        <main id="eerr-main" className={styles.main} tabIndex={-1}>
          {status && (
            <p className={styles.live} role="status" aria-live="polite">
              {status}
            </p>
          )}
          {session?.error && (
            <p className={styles.error} role="alert">
              {session.error}
            </p>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
