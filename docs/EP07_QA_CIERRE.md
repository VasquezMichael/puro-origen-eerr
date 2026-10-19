# EP-07: QA de cierre funcional

Fecha: 19 de octubre de 2026. Base revisada: `edddcb652d284502ee57a118e1c4c45f8e344bce`.

## Resultado

**EP-07 está cerrada funcionalmente. DELETE no está habilitado operativamente.**
Las pruebas
automatizadas y la inspección del código no revelaron un defecto bloqueante del
MVP. La validación visual con el runner externo y las pruebas contra MongoDB
local o staging controlado siguen pendientes; estas últimas son obligatorias
antes de habilitar DELETE.

| Capacidad | Evidencia automatizada o de código |
| --- | --- |
| OPEN → CLOSED → edición → OPEN | `eerr-lifecycle.service.spec.ts`, `post-close-edit.service.spec.ts`, `lifecycle-workspace.test.mjs` |
| Cierre con/sin importes pendientes | `eerr-lifecycle.service.spec.ts`; solo cuentan importes activos `SIN_CARGAR`, no cantidades opcionales |
| Completar ceros antes de cerrar | `lifecycle-workspace.test.mjs` exige que close use la revisión nueva |
| CLOSED editable y auditoría | `structure.http.spec.ts`, `sales-goal.http.spec.ts`, `complete-pending.http.spec.ts`, `import.http.spec.ts`; las operaciones efectivas generan `POST_CLOSE_EDIT`, los no-op no |
| Reapertura | `eerr-lifecycle.service.spec.ts`; conserva `everClosed` y último `closedAt/closedBy` |
| Eliminación | `eerr-lifecycle.service.spec.ts`, `eerr.http.spec.ts`; solo OPEN nunca cerrado, y 503 sin `EERR_SOFT_DELETE_ENABLED=true` |
| Soft delete | `eerr.http.spec.ts`, `analytics.http.spec.ts`, `structure.http.spec.ts`, `structure.repository.lifecycle.spec.ts`; consultas y CAS excluyen históricos |
| Permisos y concurrencia | `eerr-lifecycle.service.spec.ts`, `eerr.http.spec.ts`, `lifecycle.test.mjs`; revisión obsoleta produce 409 sin evento adicional |
| Legacy | `eerr-lifecycle.spec.ts`, `eerr-lifecycle.service.spec.ts`, `analytics.http.spec.ts`; campos ausentes equivalen a OPEN, nunca cerrado y activo |
| Dashboard y consolidado | `analytics.http.spec.ts`, `dashboard.test.mjs`; lifecycle se muestra por EERR individual y no altera el cálculo consolidado |
| Workspace | `lifecycle-workspace.test.mjs`; Actualizar sincroniza EERR y estructura, 404 retira datos obsoletos, 409 no reintenta y se preservan borradores válidos |

`npm run check` aprobó sin `.env` real ni MongoDB. Los tests que usan repositorios
en memoria prueban el comportamiento de la aplicación, pero no demuestran por sí
solos el rollback ni la semántica del índice en un servidor MongoDB.

## Validaciones pendientes

- QA visual en 390 px, tablet y escritorio: badge, advertencia, grupo de
  acciones, diálogos, scroll, foco, Escape, teclado y overflow. El runner
  versionado `apps/web/test/workspace.browser.mjs` necesita
  `PLAYWRIGHT_MODULE` y `BROWSER_BINARY` externos; no estaban configurados en
  esta revisión. No se instaló una dependencia permanente.
- Antes de activar DELETE, validar en MongoDB local o staging controlado la
  transacción de mutación más auditoría, rollback real, índice único parcial,
  conflicto entre dos activos y coexistencia de histórico soft-deleted con
  activo. Después, ejecutar el rollout controlado de `ARQUITECTURA.md`. No se
  consultaron Atlas ni índices reales. La declaración actual es única sobre
  `branchId/year/month`, con `partialFilterExpression: { deletedAt: null }`;
  incluye `deletedAt` ausente o null y excluye fechas de borrado. Producción
  configura `autoIndex: false`.
- Repetir QA del recorrido completo con navegador y base de prueba controlada
  cuando ambos runners estén disponibles. Las pruebas actuales cubren los
  componentes y flujos con fixtures, no una operación real de extremo a extremo.

## Herramienta demo e históricos soft-deleted

No usar `demo:dataset apply`, `clean` ni `demo:restore` con históricos
soft-deleted hasta corregir y probar su convivencia con EP-07:

1. `plan` lee todos los EERR de agosto/septiembre de 2026 sin filtrar
   `deletedAt`. Un histórico más un activo en la misma clave parece duplicado;
   un histórico único puede aparecer como candidato a reemplazo.
2. `apply` hace `replaceOne` por `_id` con un documento que no conserva los
   campos de lifecycle ni coordina el historial de auditoría. Podría reactivar
   un histórico o convertir un EERR CLOSED en OPEN implícito.
3. `clean` borra físicamente los seis IDs registrados. `restore` también borra
   documentos de los slots antes de insertarlos; deben preservar históricos y
   evitar dejar eventos de auditoría sin su EERR o reponer estados obsoletos.
4. Rediseñar las verificaciones de plan, huellas, backup y registro de
   aplicación para distinguir activos de históricos; rechazar CLOSED y
   `everClosed`, proteger los IDs auditados y probar los cuatro modos con
   fixtures que incluyan histórico + activo antes de volver a usarlos.

Esta deuda no habilita DELETE ni exige cambios en la aplicación normal durante
el cierre funcional de EP-07.
