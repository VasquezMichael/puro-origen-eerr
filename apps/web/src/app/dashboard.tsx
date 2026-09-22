"use client";
import Link from "next/link";
import { WorkspaceShell } from "./eerr/workspace-shell";
import { roleLabel, type SessionUser } from "./session-model";
import styles from "./eerr/workspace.module.css";

export function Dashboard({ user }: { user: SessionUser }) {
  return (
    <WorkspaceShell
      section="dashboard"
      title="Dashboard"
      role={roleLabel(user)}
      isAdmin={user.isAdmin}
    >
      <header className={styles.heading}>
        <p className={styles.eyebrow}>Hola, {user.name}</p>
        <h1>Dashboard</h1>
        <p className={styles.dashboardIntro}>
          Tu punto de partida para gestionar los estados de resultados de Puro
          de Origen.
        </p>
      </header>
      <section
        className={styles.quickAccess}
        aria-labelledby="quick-access-title"
      >
        <h2 id="quick-access-title">Accesos rápidos</h2>
        <div className={styles.actions}>
          <Link className={styles.quickLink} href="/eerr">
            Estados de resultados <span aria-hidden="true">→</span>
          </Link>
          {user.isAdmin && (
            <Link className={styles.quickLink} href="/admin/sucursales">
              Sucursales <span aria-hidden="true">→</span>
            </Link>
          )}
        </div>
      </section>
      <section
        className={styles.dashboardEmpty}
        aria-labelledby="dashboard-next-title"
      >
        <p className={styles.eyebrow}>Próximas etapas</p>
        <h2 id="dashboard-next-title">Una mirada centralizada del negocio</h2>
        <p>
          Los indicadores y análisis financieros se incorporarán en una etapa
          posterior. Por ahora, accedé a tus EERR desde Estados de resultados.
        </p>
      </section>
    </WorkspaceShell>
  );
}
