# Creación y contexto del EERR (EP-03)

## Modelo

La entidad `Eerr`, colección `eerr`, representa un contenedor mensual de una
sucursal. Su `_id` es un UUID v4 generado en el servidor, expuesto como `id`.
El índice primario de MongoDB garantiza su unicidad. `branchId` referencia el
ObjectId de Sucursal; `createdBy`, el ObjectId del usuario autenticado.

Identificador, sucursal, año, mes y creador son inmutables. `createdAt` registra
la fecha de creación y `updatedAt` la de modificación, mediante timestamps.
El índice único `{ branchId: 1, year: -1, month: -1 }` impide dos EERR de la misma
sucursal, año y mes. El servicio comprueba duplicados antes de escribir y convierte
también la colisión de índice concurrente en HTTP 409, sin detalles de MongoDB.

El estado de **carga** inicial es `loadStatus: "SIN_CARGAR"`. No representa cierre
ni bloqueo. Los documentos previos no definen un enum de ciclo de vida; EP-03 no
introduce `ABIERTO` ni transiciones. Su definición corresponde a EP-07.
No hay categorías, ítems, importes, notas ni registros financieros ficticios.

## Contratos HTTP

Todas las rutas requieren la cookie de sesión existente y revalidan el usuario
y sus asignaciones mediante el guard global. No se acepta un creador o permisos
enviados por el cliente.

| Método y ruta | Entrada | Resultado |
| --- | --- | --- |
| `POST /eerr` | JSON `{ "branchId": "123456789012345678901234", "year": 2026, "month": 8 }` (ejemplo ficticio) | 201, contenedor creado |
| `GET /eerr` | Sin filtros | Lista de EERR de todas las sucursales accesibles |
| `GET /eerr?branchId=…` | ObjectId de sucursal | Lista de esa sucursal, año/mes descendentes |
| `GET /eerr/context?year=2026&month=8` | Año y mes | Una entrada por cada sucursal accesible, incluso inactiva o sin EERR |
| `GET /eerr/:id` | UUID v4 | Contenedor accesible o 404 |

Cada EERR público contiene `id`, `branchId`, `year`, `month`, `loadStatus`,
`createdBy`, `createdAt` y `updatedAt`. Las fechas se serializan en ISO 8601.
No se exponen `__v` ni campos internos de Sucursal.

En la perspectiva mensual, cada entrada contiene:

- Existente: `{ branch, exists: true, eerr: { id, ... } }`.
- Inexistente: `{ branch, exists: false, eerr: null }`.

La inexistencia nunca significa importes en cero. `SIN_CARGAR` describe un EERR
que sí existe; `exists: false` describe su ausencia. Consultar no crea registros.

## Validación y acceso

- El cuerpo de creación requiere números enteros: año 1–9999 y mes 1–12. No
  convierte strings, booleanos ni null a números. Las query strings admiten solo
  representaciones decimales enteras; rechazan parámetros repetidos o adicionales.
- La creación rechaza sucursal inexistente, inactiva, período futuro o anterior
  al mes de inicio. El mismo mes de inicio se admite aunque la fecha sea posterior
  al primer día de ese mes. La fecha inicial omitida en EP-02 sigue siendo la de creación.
- Administrador consulta todas las sucursales y crea en cualquiera activa.
  Editor consulta sus asignadas y crea en las activas donde es Editor.
  Lector consulta sus asignadas y no crea. El rol se evalúa para la sucursal concreta.
- Una sucursal inactiva conserva acceso a todos sus históricos. La web la marca
  como inactiva y no ofrece creación. La API vuelve a comprobar su estado al crear.
- En operaciones con `branchId`, una sucursal no asignada devuelve el mismo 403
  tanto si existe como si no: la autorización precede a la búsqueda. Al consultar
  UUID, el filtro de sucursales se aplica en la búsqueda; desconocido y ajeno
  devuelven el mismo 404. No se expone existencia de EERR ajenos.
- 400: entrada inválida o restricción de calendario/estado. 401: sesión ausente
  o inválida. 403: falta de permiso. 404: recurso no encontrado/accesible.
  409: contenedor duplicado.

## Interfaz y límites

`/eerr`, enlazado desde el panel inicial, ofrece las perspectivas por sucursal
y por mes, consulta de detalle, creación confirmada, prevención de doble envío
y mensajes de carga, éxito y error. No presenta importes ni totales.

EP-04 incorpora estructura financiera y clonación. EP-07 define cierre, reapertura
y eliminación. No existen PATCH, DELETE ni transiciones de EERR en EP-03.
Períodos futuros permanecen en el backlog, sin habilitación de creación.

Las pruebas montan módulos Nest con el guard y servicios reales, conexión
simulada y modelo en memoria. Verifican la colisión concurrente simulada y el índice
declarado en el esquema; no prueban un servidor MongoDB real ni escriben en Atlas.
