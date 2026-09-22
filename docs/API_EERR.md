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

## Calendario del negocio

La zona oficial es **`America/Argentina/Buenos_Aires`**, centralizada como regla
fija en `@puro-origen/domain`. No se configura mediante `.env` ni depende de la
zona horaria del navegador, servidor o sistema operativo.

El instante actual y la fecha de inicio persistida de la sucursal se convierten
primero al calendario de Buenos Aires con `Intl.DateTimeFormat`. Sus respectivos
años y meses determinan el último y primer período permitidos. Por ejemplo, un
inicio `2026-10-01T01:00:00Z` pertenece a septiembre del negocio, mientras que
`2026-10-01T03:00:00Z` pertenece a octubre. Se conservan las fechas persistidas;
no se ejecutan migraciones ni se modifican sucursales existentes.

Los EERR guardan `year` y `month` como números explícitos: no se construye un
timestamp para representar el período. Los timestamps de creación y actualización
siguen siendo instantes ISO. La vista de EERR muestra sus fechas en Buenos Aires.

La API utiliza un reloj inyectable y es la autoridad final. La web comparte la
utilidad para el mes inicial y la validación anticipada del formulario; cada POST
vuelve a validar el calendario y los permisos en el servidor. Las pruebas fijan
instantes explícitos y comprueban también el cambio de mes exacto y de año.

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

## Estructura y carga manual (EP-04A)

Las rutas anteriores se conservan. `loadStatus` admite ahora SIN_CARGAR, PARCIAL
y CARGADO, calculados desde las celdas, sin estados de cierre. El detalle enlaza
la pantalla `/eerr/[id]`. No se calculan totales financieros.

Todas las rutas nuevas validan UUID v4, sesión, acceso y cuerpos estrictos sin
campos adicionales. Los nombres se normalizan; code/nodeId son generados por API.
Un EERR ajeno o inexistente devuelve 404. Lector consulta; Administrador y Editor
asignado editan también históricos de sucursales inactivas. No hay DELETE ni movimientos.

| Método y ruta (prefijo `/eerr/:id`) | Cuerpo | Respuesta |
| --- | --- | --- |
| GET `/structure` | — | 200 StructureResponse, sin escrituras |
| POST `/structure/initialize` | `{ expectedRevision }` | 201 StructureResponse; idempotente |
| POST `/items` | `{ expectedRevision, parentId, name, quantityEnabled?, unit? }` | 201 StructureResponse |
| PATCH `/items/:nodeId` | `{ expectedRevision, name }` | 200 StructureResponse |
| PUT `/items/:nodeId/amount` | `{ expectedRevision, state: "CARGADO", input: "1500,505" }` | 200, valor `"1500.51"` |
| PUT `/items/:nodeId/amount` | `{ expectedRevision, state: "SIN_CARGAR" }` | 200, entrada/valor null |
| POST `/categories/preview` | `{ expectedRevision, operation: "CREATE", parentCode, name }` | 201 CategoryPreviewResponse |
| POST `/categories/preview` | `{ expectedRevision, operation: "RENAME", code, name }` | 201 CategoryPreviewResponse |
| POST `/categories/confirm` | `{ expectedRevision, previewId, confirm: true }` | 201 StructureResponse |

`expectedRevision` es número entero no negativo; strings/null/fracciones se
rechazan. La carga admite cero mediante `input: "0"`; volver a SIN_CARGAR no
admite input, preserva el ítem e incrementa revisión. No se aceptan importes en
BLOCK/CATEGORY, resultados calculados del cliente, cantidad editable ni expresiones.

StructureResponse contiene `id`, `revision`, `structure` y `progress` con
`total`, `loaded`, `pending`, `status`. Un EERR previo sin estructura devuelve
`structure: null`, revisión 0 si estaba ausente, y progreso cero/SIN_CARGAR.
Esto no representa importes en cero. GET no prepara el EERR.

Un snapshot contiene schemaVersion, structureVersion, initializedAt ISO,
initializedBy y nodes. Cada nodo contiene nodeId, code, parentId, position, name y
kind (BLOCK/CATEGORY/ITEM). ITEM agrega quantityEnabled, unit opcional y amount:

```json
{
  "state": "CARGADO",
  "input": "0",
  "value": "0.00",
  "currency": "ARS",
  "scale": 2
}
```

Para SIN_CARGAR, input y value son null. Decimal128 nunca se expone como objeto
BSON: value siempre es string canónico con punto y dos decimales, o null.
La API aplica la política monetaria de DECISIONES.md, máximo `999999999999.99` ARS.
No hay separadores de miles. Entrada limitada a 80 caracteres; solo dígitos con
separador decimal opcional y dígitos a ambos lados. ROUND_HALF_UP es exacto con BigInt.

Las raíces tienen códigos reservados terminados en 001, 002 y 003 respectivamente:
`00000000-0000-4000-8000-000000000001`, `00000000-0000-4000-8000-000000000002`,
`00000000-0000-4000-8000-000000000003`. Categorías usan parentCode en la plantilla;
los snapshots traducen a parentId local. Los nombres se conservan por período.

La vista previa devuelve previewId, operación, nombre, padre global (code/name),
año/mes, expiresAt, affected, initialized, uninitialized y warning de alcance global.
No devuelve IDs ni nombres de sucursales ajenas, nodos locales, importes ni revisiones
internas de otros EERR. Dura cinco minutos; la confirmación está ligada al mismo
usuario y EERR. Cambiar plantilla, conjunto de EERR o revisiones invalida la vista
previa. Renombrar conserva identidades, valores y relaciones; solo afecta ese mes/año.

Los EERR sin estructura se cuentan, pero no se modifican por una publicación.
Reciben las categorías al prepararse explícitamente. Inicialización y publicación
se coordinan por plantilla dentro de transacciones. Las revisiones de los snapshots
se comparan e incrementan atómicamente, evitando sobrescribir ediciones concurrentes.

Errores: 400 entrada/invariante inválida; 401 sesión; 403 falta de edición;
404 no accesible; 409 revisión o preview obsoleta/vencida/utilizada/conflicto de
estructura; 503 entorno sin transacciones. Un conflicto de otro EERR se informa
sin revelar su información. No hay fallback de escrituras parciales.

## Verificación de EP-04A y validación manual

Pruebas de dominio: raíces, ciclos, padres, duplicados, código estable, progreso,
coma/punto, redondeo, límites y literales rechazados. HTTP usa guard y servicios
reales con persistencia en memoria; cubre permisos, historial inactivo, revisión,
publicación limitada al año/mes, previews y rollback simulado. Esquemas se construyen
sin metadatos ni conexión. La web prueba preservación de borradores y revisión.

La integración opcional `npm run test:integration:structure --workspace=api`
utiliza un mongod local indicado por MONGOD_BINARY y lanza su propio replica set
temporal en loopback. Verifica Decimal128, CAS, inicialización concurrente y rollback
real. No forma parte del check ni del CI sin MongoDB. No importa AppModule ni usa .env.
En EP-04A no existía PLAN_PRUEBAS.md; EP-04B1 incorpora ese plan con la cobertura
ampliada y mantiene las comprobaciones anteriores.

EP-03 y la funcionalidad principal de EP-04A fueron validados manualmente según
confirmación del usuario. EP-04B1 requiere validación funcional manual posterior. Los EERR de Calle 59
de agosto y septiembre no se modifican durante desarrollo ni por el merge.
Después del merge, preparar septiembre es una acción manual del usuario.
No ejecutar bootstrap ni cambiar al administrador. Agosto se elimina recién en EP-07.

Mutaciones manuales de EP-04A: ROUND_HALF_UP, cero cargado, nombre de raíz,
ITEM como padre, permiso Editor, expiración y revisiones globales, filtro CAS,
filtro mensual, timestamps de inicialización, atomicidad transaccional y
preservación de borradores. Las doce fueron detectadas y restauradas. La prueba
CAS usa una barrera para que ambas solicitudes lean la misma revisión antes de
competir en la escritura, evitando que el orden temporal oculte una regresión.


## Extensiones compatibles EP-04B1

Prevalecen sobre las restricciones históricas de EP-04A de las secciones anteriores.
PUT amount conserva ruta/cuerpo; input admite la gramática de DECISIONES.md y
hasta EXPRESSION_LIMITS.length (256) caracteres. Ejemplo:
`{ "expectedRevision": 2, "state": "CARGADO", "input": " (1000 + 500) / 3 " }`
produce input `"(1000 + 500) / 3"` y value `"500.00"`. El cliente no puede enviar
value, resultado ni expresión por otro campo. Cero usa input `"0"`; SIN_CARGAR
no admite input (ni null) y deja input/value null. Resultados en Decimal128, API strings.

| Método y ruta, prefijo /eerr/:id | Cuerpo | Resultado |
| --- | --- | --- |
| PUT /items/:nodeId/quantity | `{ expectedRevision, state: "CARGADO", input: "12" }` | quantity `{ state: "CARGADO", value: "12" }` |
| PUT /items/:nodeId/quantity | `{ expectedRevision, state: "SIN_CARGAR" }` | quantity `{ state: "SIN_CARGAR", value: null }` |
| PUT /items/:nodeId/note | `{ expectedRevision, note: "Texto" }` | nota local en node.note; vacío elimina |
| PUT /note | `{ expectedRevision, note: "Texto general" }` | nota general; vacío elimina |

Todas responden 200 StructureResponse; cantidad cero usa input `"0"`. Las rutas
requieren UUID v4 de EERR/nodo y revisión numérica entera 0..MAX_SAFE_INTEGER.
DTO estrictos, sin campos extra. input de cantidad es string de hasta 12 dígitos;
nota siempre string, no null. Cada escritura aplica rango/longitud también en dominio.
BLOCK/CATEGORY no admiten cantidad ni nota de ítem. Permisos y errores HTTP se
conservan: 400 entrada inválida, 401 sesión, 403 Lector, 404 ajeno/inexistente,
409 CAS obsoleto. No se devuelven detalles internos de persistencia.

StructureResponse agrega note (string o null) para el período. Los nodos pueden
incluir quantity y note; ausencia de quantity equivale a SIN_CARGAR, ausencia de
note a sin nota. Se conservan opcionales para no persistir defaults durante otras
ediciones. amount.input histórico ausente se expone null; value no se recalcula.
La nota general puede editarse sin preparar estructura. El progreso depende solo
de amount.state. Campos locales se preservan al publicar categorías globales.
La marca histórica quantityEnabled se conserva, pero la cantidad opcional está
disponible para todos los ítems en el alcance EP-04B1.

GET no ejecuta migraciones ni escrituras. No se toca Atlas para verificar estos
contratos. Plan actualizado en [PLAN_PRUEBAS.md](PLAN_PRUEBAS.md).

## Archivo recuperable EP-04UX.1

| Método y ruta, prefijo /eerr/:id | Cuerpo estricto | Respuesta |
| --- | --- | --- |
| PATCH /items/:nodeId/archive | `{ expectedRevision }` | 200 StructureResponse |
| PATCH /items/:nodeId/restore | `{ expectedRevision }` | 200 StructureResponse |

Ambos identificadores deben ser UUID v4. expectedRevision es entero numérico
0..MAX_SAFE_INTEGER; se rechazan campos adicionales. Solo ITEM: bloques y categorías
no admiten estas operaciones. 400 para nodo/transición/padre inválido, 401 sin sesión,
403 Lector, 404 EERR ajeno/inexistente, 409 revisión obsoleta. Administrador y Editor
asignado están autorizados, incluso en sucursales inactivas. Sin endpoints DELETE.

StructureResponse.structure.nodes conserva activos y archivados. El campo opcional
archive tiene `state: "ARCHIVED" | "ACTIVE"`, `at: string ISO` y `by: string` del actor.
Ausencia significa activo histórico; no hay migración durante GET. El helper de dominio
isArchived centraliza esta interpretación. Restaurar conserva at/by del último archivo.
progress excluye todos los archivados, cargados y pendientes, y vuelve a incluirlos
al restaurar. Mientras estén archivados se rechazan rename, amount, quantity y note.

Archivo/restauración actualizan atómicamente solo metadata, loadStatus y revisión;
conservan el snapshot restante, BSON/Decimal128 y timestamps originales. No crean
nodos ni cambian padre, posición, código, cantidad, expresión o notas. Comparten CAS
con todas las escrituras anteriores; conflictos no reintentan ni sobrescriben.
No hay cambios en catálogo global, otros EERR o períodos. Se conservan las restricciones
de unicidad del árbol, incluidos archivados. Publicar categorías preserva su estado.

## Movimientos EP-04B2

Prefijo `/eerr/:id`:

| Método y ruta | Cuerpo estricto | Respuesta |
| --- | --- | --- |
| PATCH /items/:nodeId/move | `{ expectedRevision, parentId, position }` | StructureResponse |
| POST /categories/move/preview | `{ expectedRevision, nodeId, parentId, position }` | CategoryMovePreviewResponse |
| POST /categories/move/confirm | `{ expectedRevision, previewId, confirm: true }` | StructureResponse |

UUID v4 para identificadores; posición entera 0..999, validada además contra hermanos
reales tras retirar el origen. Categorías: índice entre categorías; ítems: índice
entre hermanos activos. La UI presenta posiciones desde 1. Se rechazan campos extra,
identidades/códigos/bloques/valores financieros enviados como reemplazo del snapshot.

Preview incluye previewId, name, year/month, expiresAt, from/to (code/name/position),
block, affected/initialized/uninitialized, accessibleEerrs, warning y noOp. Solo revela
IDs de EERR accesibles; ajenos aparecen en conteos. No modifica estructura. Confirmación
verifica actor, origen, operación, vencimiento, revisión de plantilla y todos los EERR.
Preview de MOVE no sirve en confirmación de crear/renombrar, ni viceversa.

400: destino, tipo, ciclo, profundidad o posición inválidos; 401: sin sesión; 403:
Lector; 404: EERR inexistente/ajeno; 409: revisión/preview obsoleto o snapshots globales
incoherentes. Se conserva el régimen de permisos anterior. La publicación es todo o
nada y solo del período seleccionado. Un no-op no cambia el EERR ni la plantilla.

Archivo normaliza posiciones activas; restauración inserta y desplaza hermanos activos
sin reescribir BSON financiero. Esto reemplaza únicamente la conservación absoluta de
posiciones descrita en EP-04UX.1: el archivado conserva su posición de recuperación;
los activos deben mantener posiciones únicas. Nombre/código siguen siendo únicos.
