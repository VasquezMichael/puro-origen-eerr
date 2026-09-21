import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./workspace.module.css";

export function WorkspaceShell({
  children,
  role,
  isAdmin = false,
  status,
}: {
  children: ReactNode;
  role: string;
  isAdmin?: boolean;
  status: string;
}) {
  return (
    <div className={styles.shell}>
      <a className={styles.skip} href="#eerr-main">
        Ir al espacio de carga
      </a>
      <aside className={styles.sidebar}>
        <Link href="/" className={styles.brand}>
          <span aria-hidden="true">PO</span>
          <strong>
            Puro de Origen<small>Gestión de resultados</small>
          </strong>
        </Link>
        <nav aria-label="Navegación principal">
          <Link href="/">Inicio</Link>
          <Link href="/eerr" aria-current="location">
            Estados de resultados
          </Link>
          {isAdmin && <Link href="/admin/sucursales">Sucursales</Link>}
        </nav>
        <p className={styles.sidebarFoot}>
          Un espacio para cada sucursal.
          <br />
          Una mirada clara del período.
        </p>
      </aside>
      <div className={styles.content}>
        <header className={styles.topbar}>
          <Link href="/eerr">← Estados de resultados</Link>
          <span>{role}</span>
        </header>
        <main id="eerr-main" className={styles.main} tabIndex={-1}>
          <p className={styles.live} role="status" aria-live="polite">
            {status || "Sin cambios pendientes"}
          </p>
          {children}
        </main>
      </div>
    </div>
  );
}
