# Arquitectura

La base es un monorepo npm sobre Node.js 24 y TypeScript, organizado como monolito
modular.

| Workspace | Tecnología y responsabilidad |
| --- | --- |
| apps/web | Next.js 16 con App Router; interfaz en puerto 3000, sin reglas financieras ni lógica central del dominio |
| apps/api | NestJS 12 ESM; casos de uso, validación, autenticación y persistencia; puerto 3001 |
| packages/domain | Reglas de negocio puras, independientes de NestJS, React y MongoDB |
| packages/calculation-engine | Funciones financieras puras, deterministas y testeables |
| packages/shared-types | Contratos y tipos realmente compartidos |

La persistencia de ejecución utiliza Mongoose y MongoDB Atlas. La compilación y
las pruebas unitarias no deben abrir conexiones ni requerir secretos.

Las aplicaciones consumen paquetes, nunca al revés. Los paquetes puros no dependen
de frameworks ni de persistencia. Toda nueva dependencia entre workspaces debe
justificarse y comprobarse para evitar ciclos. No introducir microservicios.
`packages/calculation-engine` no debe depender de NestJS, React, Mongoose ni de
detalles de persistencia. Mantener el orden de build acorde a las dependencias
entre workspaces antes de consumir artefactos dist.

La web conserva ESLint, la API oxlint y Vitest, y los paquetes el compilador
TypeScript. La configuración raíz delega en los scripts existentes de cada workspace.

El módulo HTTP `BranchesModule` y `UsersModule` consumen
`BranchesPersistenceModule`, que registra el esquema y el servicio de sucursales.
Este módulo no importa Usuarios ni Autenticación. `AuthModule` consume Usuarios
y registra el guard global que revalida el usuario y sus asignaciones por solicitud.
La interfaz `/admin/sucursales` consulta la API con la sesión existente; la API
decide el acceso y restringe todas las operaciones administrativas.

`EerrModule` consume `BranchesPersistenceModule` y registra su propio esquema y
servicio. No requiere importar `AuthModule` ni `UsersModule`; usa el principal
revalidado por el guard global, sin dependencias circulares. El servidor aplica
las reglas de creación y limita las consultas por sucursales accesibles.
La web `/eerr` presenta ambas perspectivas mediante consultas REST con sesión,
sin persistencia ni cálculos financieros en el navegador.
Los contratos y el modelo de EP-03 están en [API_EERR.md](API_EERR.md).

API y web consumen `@puro-origen/domain` para el calendario fijo
`America/Argentina/Buenos_Aires`. `businessMonthAt` convierte instantes con
`Intl.DateTimeFormat`; `eerrCalendarIssue` compara períodos explícitos y recibe
el instante actual como argumento. No depende de Nest, React, MongoDB ni de la
zona del sistema operativo. La API suministra ese instante mediante `EerrClock`,
reemplazable en pruebas; la web reutiliza las mismas funciones y constante.

Los scripts previos de las aplicaciones compilan el paquete antes de tipos,
build, pruebas de API y desarrollo, para que los imports ESM y declaraciones
funcionen en un checkout limpio. Esta dependencia interna evita duplicar reglas;
no se incorpora ninguna biblioteca externa. El dominio incorpora pruebas con
`node:test` sobre su compilación y reutiliza oxlint para lint. Los cambios de TZ
se prueban en procesos hijos aislados, sin mutar el entorno global de las pruebas.

## Estructura y carga manual (EP-04A)

EerrModule incorpora StructureController, StructureService y StructureRepository.
Reutiliza el principal y acceso filtrado de EerrService; comprueba autorización
por operación sin importar Usuarios ni Autenticación.

Modelo híbrido: catálogo eerr_concepts (UUID, tipo, raíz), plantilla eerr_templates
(clave año-mes, versión, categorías) y snapshot embebido en EERR. Los bloques
reservados viven en dominio. No se resuelven nombres desde el catálogo al leer.
schemaVersion identifica formato; structureVersion parte de la versión mensual
al inicializar y avanza con cambios estructurales; revision avanza en toda edición.
No se depende de __v para concurrencia.

El repositorio convierte strings a Decimal128 y viceversa. Los esquemas y
subdocumentos tienen tipos explícitos, sin Mixed para nodos/celdas. Dominio
centraliza raíces, invariantes, normalización, progreso y dinero exacto con BigInt.
Shared-types consume tipos de dominio y publica contratos para ambas aplicaciones.
Los scripts previos compilan dominio y contratos; no hay dependencias externas nuevas.

Inicialización y publicación global adquieren el mismo bloqueo de escritura de
plantilla dentro de una transacción, evitando inicializaciones con categorías
atrasadas. Crear ítems transacciona catálogo y snapshot; renombrar ítems o guardar
importes utiliza una sola escritura atómica. Cada escritura compara revisión.

eerr_previews guarda identificador opaco, usuario, operación, período, revisiones
y expiración. La API valida vencimiento aunque TTL no haya borrado el documento.
Confirmar revalida acceso, revisiones y plantilla, y consume la vista previa en
la transacción. Los reintentos técnicos vuelven a comprobar las precondiciones;
no habilitan revisiones obsoletas. No hay fallback parcial mediante updateMany.

/eerr/[id] presenta el árbol y carga manual junto al cuadro financiero de solo
lectura. Su reducer conserva borradores tras 409 y recarga; solo elimina el de
la celda cuyo guardado fue confirmado. API/dominio mantienen la autoridad sobre
permisos y reglas.

Las pruebas normales siguen sin MongoDB. La integración opcional
`npm run test:integration:structure --workspace=api` exige MONGOD_BINARY con ruta
absoluta a un ejecutable local. Lanza y elimina su propio replica set en loopback
y directorio temporal. No acepta URI externa ni utiliza AppModule, .env o bootstrap.
No instala infraestructura global. Contratos y validaciones: [API_EERR.md](API_EERR.md).


## Carga ampliada (EP-04B1)

Dominio incorpora money-expression (parser de constantes y racionales BigInt) y
eerr-fields (cantidades/notas). API y web consumen estas reglas puras; la API
recalcula y valida siempre. rationalMoney comparte rango y redondeo con los
literales originales. calculation-engine sigue reservado para EP-05/EP-06; no
se agregan relaciones ni dependencias nuevas.

Amount conserva input original y value Decimal128. NodeSchema agrega quantity
(subdocumento explícito state/value String) y note opcionales. Eerr agrega note
String opcional para la nota general, independiente de la inicialización. Los
esquemas no crean defaults para estos campos ausentes. La conversión pública
conserva ausencia; la interfaz interpreta SIN_CARGAR/sin nota sin escribir.

StructureService reutiliza editItem, permisos y write con el CAS existente para
importes/cantidades/notas de ítem. writeNote actualiza solo note y revision con
el mismo revisionFilter; no sustituye estructura, progreso ni createdAt. Una
publicación global conserva los nuevos datos locales y compite por la misma revisión.

field-editors presenta los controles; structure-workspace conserva el estado y
coordina envíos. El reducer utiliza claves de borrador por campo: UUID del importe,
quantity:UUID, note:UUID y period-note. Errores y recarga conservan todas las claves.
El CSS Module limita estilos al EERR; textarea mantiene saltos y foco visible.
Plan y límites: [PLAN_PRUEBAS.md](PLAN_PRUEBAS.md), [DECISIONES.md](DECISIONES.md).


## Espacio de carga híbrido (EP-04UX)

La ruta /eerr/[id] utiliza WorkspaceShell, integrado solo en el espacio de carga.
La navegación enlaza Inicio y Estados de resultados; Sucursales se muestra al
Administrador porque la ruta disponible es administrativa. Login, selector y
administración conservan su presentación. Sin nuevas rutas ni dependencias.

La tabla semántica presenta nodos planos como filas ordenadas e indentadas por
profundidad. visibleRows resuelve exclusivamente presentación y plegado, sin
mutar el snapshot. ValueEditor mantiene edición directa de importe/expresión y
cantidad; reutiliza dominio para validación y preview. No hay autosave.

Modal utiliza dialog/showModal nativo: fondo inerte, foco contenido, restauración
al disparador y Escape controlado. ActionMenu usa popover en la capa superior
del navegador, con navegación por flechas/Home/End, Escape y nombres accesibles.
El CSS Module workspace.module.css concentra tokens y estilos locales; no cambia
los estilos globales ni la API. Se requiere un navegador moderno con dialog y popover.

El reducer conserva borradores por clave de campo. Nombres y unidades de creación
también se almacenan en el workspace, fuera del ciclo de vida del modal. Cerrar no
descarta; al reabrir se recuperan. El detalle guarda cada campo por separado, con
la revisión vigente devuelta por la escritura anterior. No simula atomicidad
entre endpoints distintos. El bloqueo de envío por ref evita solicitudes dobles.

HTTP 409 identifica la operación, conserva todos los borradores, invalida el
preview y bloquea nuevas escrituras hasta recargar/revisar. La recarga actualiza
solo datos persistidos; no recarga la página. La API sigue siendo autoridad final.

## EP-04UX.1: archivo local y lectura prioritaria

El dominio define metadata opcional de archivo y el predicado `isArchived`, usado
por el progreso y la grilla web. Los contratos mantienen StructureResponse y suman
ItemArchiveRequest (expectedRevision). La API conserva autoridad de permisos,
transiciones, validación de ITEM/padre y revisión. El repositorio usa un único
findOneAndUpdate con CAS, arrayFilters por nodeId y kind, $set del archivo y
loadStatus, e incremento de revisión. `timestamps: false` conserva los timestamps
originales. No reemplaza el snapshot ni reconvierte importes durante archivo/restauración.
La ausencia histórica de archive se interpreta activa sin escritura de lectura.

La web separa estado de edición local del borrador agregado en editorReducer.
CANCEL elimina solo una clave; SAVED elimina únicamente el campo confirmado.
ValueEditor vuelve a lectura después de una respuesta exitosa; errores y 409
conservan entrada y edición. El formato monetario opera sobre strings canónicos,
sin Number ni cambio de parser/precisión. Expresiones largas usan details/summary.
DraftNavigationGuard intercepta enlaces internos del mismo tab y mantiene un
beforeunload condicionado a borradores. Modal y ActionMenu conservan top layer,
foco y bloqueo durante envío; si el ítem iniciador desaparece, el foco vuelve al main.
La vista de archivados es de consulta; restaurar es una confirmación separada.

Archivo es local al EERR, no al catálogo ni a categorías globales. Futuras reglas de
cálculo y clonación/importación deberán filtrar con isArchived; no se implementan
esos módulos en EP-04UX.1. Identidad, padre, posición y valores se recuperan intactos.
No se agregan dependencias, migraciones, variables de entorno ni conexiones en pruebas unitarias.

## EP-04UX.2: sesión y navegación compartidas

El layout raíz compone SessionProvider, que comprueba `/auth/me` antes de montar
las páginas autenticadas. LoginFrame conserva la composición de acceso; una sesión
inválida o con contraseña temporal no monta el shell. La sesión se vuelve a
comprobar al cambiar de ruta y los 401 retiran la vista autenticada. La API sigue
siendo autoridad: no se cambia autenticación, cookies, contratos ni permisos.

WorkspaceShell se reutiliza por composición en Dashboard, selector/contextos EERR,
administración de sucursales y estructura/carga. Cada pantalla tiene un único
shell; no se migran rutas ni se anidan layouts visuales. Acepta sección activa,
título/breadcrumb, acciones y estado. SessionContext comparte usuario, cierre de
sesión y errores; session-model centraliza destinos y etiquetas de rol.

La barra lateral usa los tokens existentes y se transforma en menú desplegable en
anchos de hasta 800 px. El botón expone aria-expanded/aria-controls; Escape cierra
y devuelve el foco. La navegación queda en el flujo, sin superponerse al contenido.

DraftNavigationGuard comparte confirmación para enlaces y la solicitud cancelable
de logout. Solo ejecuta el POST de cierre después de descartar; un fallo conserva
el borrador. Mantiene un único beforeunload mientras hay cambios. En navegadores
con Navigation API cancela los recorridos internos de Atrás/Adelante antes de
perder estado y los retoma con traverseTo; no inserta entradas artificiales.
La API estándar está disponible en versiones actuales de los navegadores;
versiones antiguas sin ella conservan guardas de enlaces/logout/beforeunload, pero
no la confirmación de recorridos SPA. No hay almacenamiento persistente de borradores.

Dashboard solo presenta saludo, accesos autorizados y el aviso de indicadores
futuros. No consulta métricas ni escribe al montar. Las rutas permanecen `/`,
`/eerr`, `/eerr/[id]` y `/admin/sucursales`; no existían rutas de modos que redirigir.

## EP-04B2: movimientos y orden

`packages/domain/src/eerr-order.ts` centraliza orden por posición y código, hermanos
activos, raíz financiera, movimiento, destinos válidos y restauración. API y web
consumen estas reglas puras. GET no normaliza ni escribe; el orden físico del array
no representa el orden visual. Las escrituras normalizan los hermanos activos de
origen y destino a índices contiguos desde cero.

El repositorio aplica cambios indexados exclusivamente a parentId y position bajo
CAS documental; conserva BSON financiero, identidad, archivo y creación. El servicio
local exige expectedRevision. Categorías usan plantilla por año/mes, preview opaco
con vencimiento de cinco minutos, revisión de todos los EERR y transacción snapshot.
El bloqueo de plantilla coordina publicación e inicialización. Un fallo revierte
plantilla, revisiones y snapshots completos. No se reparan categorías incoherentes.
Los EERR sin estructura heredan la plantilla al inicializarse.

MovementForm reutiliza Modal y ActionMenu. No hay drag-and-drop. Los borradores del
nodo/subárbol o estructurales bloquean el movimiento; los ajenos se conservan. Un 409
invalida el preview, mantiene selección y requiere recarga y nueva revisión explícita.

## EP-04C1: clonación

EerrModule agrega CloneController, CloneService y ClonePreviewToken, reutilizando
StructureRepository, EerrService, BranchesService y EerrClock. Sin importaciones de
aplicaciones desde paquetes, ciclos ni nuevas dependencias. eerr-clone en dominio
valida origen, compatibilidad y copia mediante lista explícita de campos permitidos.
El mapeo por código estable genera nuevas instancias y aplica toda la plantilla destino.

El preview no persiste metadata: HMAC-SHA256 con clave derivada y ámbito exclusivo de
clonación a partir del secreto ya configurado; no introduce variable de entorno. El
token no sirve para autenticación. Une actor, modo, extremos, revisiones y huella del
snapshot/plantilla, vence con EerrClock y no contiene valores financieros. No agrega
versiones: usa revision y version existentes; la huella verifica integridad de lectura.

Confirmación: transacción snapshot, relectura, compatibilidad, bloqueo mensual compartido
con inicialización/publicación y CAS de destino no preparado. Semilla de plantilla y
snapshot son atómicos. Conserva createdAt/createdBy; updatedAt e initializedAt son de
la nueva operación. Origen y otros EERR permanecen intactos. Las estructuras BSON se
convierten usando storedStructure/publicStructure existentes; no se reconvierten valores
del origen en su documento. El resultado copiado se valida pero nunca se reemplaza
por el resultado de evaluar la expresión. Errores no dejan plantilla parcial.

CloneFlow y CloneSummary reutilizan Modal, estilos locales y API con sesión. Solo se
montan en EERR no preparado con autorización. Borradores pendientes bloquean el inicio;
modo/origen sobreviven errores y 409, que retira preview y consentimiento adicional.
El éxito actualiza el workspace y anuncia origen/modo durante quince segundos. Crear
un contenedor navega a /eerr/[id] sin inicialización automática. No hay acceso a Atlas
en pruebas: HTTP en memoria y replica set temporal loopback opcional.

## Importación EP-04C2

`domain/eerr-import` centraliza límites, identidad compatible y plan puro de cambios.
La API adapta CSV/XLSX a filas; `ImportService` valida acceso y firma previews con
HMAC derivado del secreto existente (sin nueva variable de entorno). Se reenvía el
archivo al confirmar: no se persiste archivo ni preview, no hay temporales ni logs
del contenido. `StructureRepository.writeImport` aplica un único update de campos
indexados con CAS dentro de transacción, Decimal128, progreso y revision+1; conserva
notas, estructura, creación e inicialización. La web presenta/descarga y nunca
reemplaza la autoridad de la API. `ImportFlow` integra el guard de borradores.

Límites: 2 MiB de entrada, 12 MiB expandidos, 64 entradas ZIP, dos hojas, 1000 filas,
2048 caracteres por celda y 2000 cambios. Preflight con yauzl 3.4.0 (MIT) limita
expansión real/declarada; saxes 6.0.0 (ISC) rechaza DTD, fórmulas, coordenadas
esparsas excesivas y contenido activo. JSZip 3.10.1 (MIT/GPL-3.0-or-later, opción MIT)
reempaca solo partes ya validadas antes de cargar la biblioteca, evitando diferencias
entre parsers ZIP. Sin parser ZIP/XML propio ni extracción al disco.

Biblioteca XLSX: @protobi/exceljs 4.4.0-protobi.10 (MIT), fork mantenido de ExcelJS;
se evaluaron mantenimiento, licencia, auditoría npm, escritura/lectura y compatibilidad
ESM con Node 24. UUID se fija a 11.1.1 mediante override limitado a ese paquete
para resolver GHSA-w5hq-g745-h8pq. Platform-express sube a 12.1.0 para Multer 2.4.0
corregido; no se actualiza indiscriminadamente el árbol. Referencias:
https://github.com/exceljs/exceljs/discussions/3008 y https://github.com/protobi/exceljs.
Auditoría de producción: cero vulnerabilidades. Quedan cinco avisos preexistentes
en herramientas de desarrollo del árbol @nestjs/mau, fuera de esta importación.

CSV escapa delimitadores/comillas y neutraliza inyección en nombres/rutas. XLSX
exige celdas de importe guardadas como texto: ExcelJS entrega los números nativos
como `Number` y puede perder precisión antes del parser monetario exacto. Esas
celdas generan un error por fila y campo, sin plan de cambio ni token de confirmación.
Cantidad conserva su validación de entero y rango. Se rechazan fórmulas aun con
caché, macros, enlaces externos y partes no admitidas. Un libro con objetos,
gráficos u otros componentes adicionales debe
volcarse sobre la plantilla; no es un importador de planillas arbitrarias.

## EP-04C3: completar pendientes

`domain/eerr-complete-pending` valida la estructura y construye un plan puro, en
orden visual, de importes activos SIN_CARGAR. Reutiliza loadProgress/activeSiblings,
sin parser monetario ni expresiones artificiales. Contratos CompletePending* en
shared-types; CompletePendingService/Controller en EerrModule, sin dependencias nuevas.

Reutiliza ImportToken con discriminante exclusivo complete-pending, verificación
de tipo y expiración (cinco minutos). Un token de importación no autoriza esta
operación. Firma actor/EERR/revisión/huella del snapshot/digest del plan. No persiste
preview. Confirmar relee bajo transacción snapshot y recalcula todo; la lista del
cliente no se acepta. Reutiliza writeImport como escritor indexado de valores,
pasándole exclusivamente importes. Conserva BSON del resto del documento, aplica
Decimal128 y CAS una vez. No hay bucles de escrituras individuales ni fallback parcial.

CompletePendingFlow se abre desde el menú general, reutiliza Modal y estilos
locales; CompletePendingSummary presenta conteos, progreso y lista desplazable.
El workspace mantiene borradores y alimenta DraftNavigationGuard con el modal y
el estado de envío. El éxito actualiza el reducer por RELOAD; no cierra el período.
El no-op y los conflictos no llaman al escritor ni cambian timestamps.

## EP-05A.1: motor financiero y lectura del cuadro

`@puro-origen/calculation-engine` depende solamente de `domain`: recibe un snapshot
público y validado, identifica los tres bloques por sus códigos protegidos y suma
los valores monetarios persistidos de los ítems activos con `BigInt`. Recorre el
parentesco para acumular cada ítem una vez en su bloque y en cada categoría
ascendente; los subtotales no se vuelven a sumar. No usa nombres, orden del array,
`nodeId` transversal, cantidades, notas ni expresiones originales como entrada
financiera. `shared-types` publica el contrato del motor para API y web;
el orden de compilación es domain → calculation-engine → shared-types → aplicaciones.

`AnalysisController/AnalysisService` agregan `GET /eerr/:id/analysis` al EerrModule.
`EerrService.readAuthorized` comparte el filtro de acceso existente y devuelve un
solo documento con snapshot y revisión. La conversión Decimal128 → string ocurre
antes del motor. El GET no escribe ni inicializa, no requiere transacción para ese
documento y devuelve `sourceRevision`; futuras lecturas de varios EERR requerirán
una política de consistencia distinta. Un snapshot inválido produce 500 con código
estable `INVALID_PERSISTED_DATA`, sin reparaciones ni detalles BSON. No hay caché,
ETag ni resultados derivados persistidos. `calculationVersion: 1` identifica la
versión de las fórmulas para futuros clientes/cachés.

## EP-05A.2: cuadro calculado en el workspace

Antes de la grilla de estructura y valores, `ResultsStatement` presenta bloques,
categorías jerárquicas y métricas del GET de análisis. `analysis-model` organiza
únicamente la presentación por códigos de raíz y referencias de categoría;
`analysis-format` formatea strings sin convertir importes a punto flotante y
redondea el porcentaje de cuatro a dos decimales con HALF_UP simétrico. No hay
fórmulas financieras en la web ni derivados persistidos.

`useAnalysis` consulta por separado de la estructura. El reducer conserva
borradores tras recargas y conflictos; cada revisión nueva dispara otra lectura.
Solo se renderizan cifras cuando `sourceRevision` coincide con la revisión visible.
Respuestas anteriores se abortan, una diferencia se reintenta hasta tres veces y
después ofrece actualización manual de estructura y análisis. Un error del GET
afecta solo al cuadro. La tabla usa encabezados, texto de estado y relación
explícita de jerarquía; en móvil las filas se adaptan sin ocultar valores.

Punto de equilibrio y objetivo quedan para EP-05B; dashboard, comparaciones y
consolidación, para EP-06.

## EP-05B.1: meta persistida y proyecciones bajo demanda

`salesGoal` es un subdocumento opcional del EERR con modalidad, valor decimal
exacto Decimal128, fecha y actor de actualización. Documentos previos sin campo
se leen como meta nula, sin migración. Los IDs de usuarios existentes son ObjectId;
`updatedBy` conserva el identificador textual autenticado. Solo el endpoint
`PUT /eerr/:id/sales-goal` escribe la meta, con revisión CAS y no-op canónico.
Las demás escrituras actualizan campos específicos y la preservan; clonar toma
únicamente estructura y valores, nunca meta. No se almacenan derivados.

El motor puro recibe snapshot y meta del mismo documento leído por AnalysisService.
Calcula contribución, punto de equilibrio, objetivo y referencia con enteros BigInt
y racionales exactos; los mínimos monetarios se redondean al centavo superior.
La referencia usa el objetivo ya redondeado y aplica HALF_UP. El resultado se
identifica con `sourceRevision` y `calculationVersion: 2`. EP-05A.2 ignora los
campos nuevos hasta EP-05B.2; no hay cálculo financiero en la web.
