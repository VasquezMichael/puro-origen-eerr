# Decisiones

## Arquitectura aceptada

- Monorepo npm, Node.js 24 y TypeScript; monolito modular sin microservicios.
- Next.js 16 en web; NestJS 12 ESM, Mongoose y MongoDB Atlas en API.
- Separar presentación, casos de uso, reglas puras, cálculos y contratos compartidos.
- Evitar dependencias circulares y justificar toda dependencia nueva.

## Decisiones funcionales aceptadas

- El acceso es cerrado, sin registro público.
- El inicio de sesión utiliza email y contraseña.
- El Administrador es un rol global; Lector y Editor se asignan por sucursal.
- Los administradores crean usuarios, asignan accesos y restablecen contraseñas.
- Durante el MVP no se envían correos de recuperación.
- El primer administrador se crea mediante un comando seguro que se rechaza si ya existe otro.
- Las sucursales inactivas permiten corregir históricos, pero no crear EERR nuevos.
- Las categorías se identifican internamente por código.
- Renombrar categorías no debe alterar el nombre histórico.
- Las cantidades solo admiten enteros.
- Los porcentajes pueden tener decimales.
- Clonar valores no copia notas.
- Las categorías globales modifican todos los EERR del mismo período.

## Pendientes explícitos, sin resolver

- Creación de períodos futuros.
- Feedback de usuarios finales.

Estos pendientes no autorizan a inferir permisos ni comportamientos. Resolverlos
con el usuario antes de implementar la funcionalidad afectada.

## Decisiones técnicas de la base automatizada

Reutilizar las herramientas instaladas, sin agregar dependencias. Generar tipos de
Next antes del chequeo estático. Mantener las pruebas unitarias sin configuración
real ni Atlas; el e2e requiere aislamiento futuro. El check no establece umbrales
de cobertura ni simula pruebas en paquetes vacíos.

## Decisiones técnicas de autenticación

- La sesión se mantiene en una cookie HttpOnly, SameSite=Lax, con vigencia de
  ocho horas; el navegador no recibe el token en el cuerpo de la respuesta.
- Las contraseñas se almacenan con bcrypt y nunca se devuelven desde la API.
- La autorización revalida en base de datos que el usuario continúe activo y que
  conserve su condición de administrador.
- Los accesos por sucursal se validan al crear usuarios o reasignarlos: identificadores
  MongoDB válidos, sucursales existentes y sin duplicados dentro del usuario.

## Decisiones confirmadas de sucursales (EP-02)

- Datos mínimos: id de MongoDB, código interno, nombre, fecha de inicio, estado
  activa/inactiva y timestamps de creación y modificación. Sin campos operativos adicionales.
- Código automático generado por la API con UUID aleatorio nativo de Node.js,
  prefijo `SUC-`, índice único e inmutable. No depende del nombre ni de una secuencia global.
- Nombre obligatorio; se normalizan Unicode, mayúsculas, acentos y espacios
  redundantes para detectar duplicados mediante índice único. La clave de
  normalización es interna y no se expone en las respuestas.
- Fecha de inicio opcional en la creación; por defecto coincide con la fecha de
  creación. La API acepta fechas ISO válidas y la interfaz permite elegir el día.
- Solo el Administrador global crea, edita nombre/fecha y cambia el estado.
- Desactivación reversible mediante cambio explícito e idempotente de estado.
  No existe borrado físico ni endpoint DELETE; la información se conserva.
- Administradores consultan todas las sucursales. Lectores y Editores consultan
  únicamente las asignadas, incluidas las inactivas para conservar acceso histórico.
- El guard revalida los accesos desde el usuario persistido, sin incluir passwordHash.
- La persistencia de sucursales se comparte con Usuarios mediante un módulo sin
  rutas ni dependencia de Autenticación; se evita un ciclo entre módulos.

## Requisitos confirmados a implementar con períodos

- Impedir creación de EERR nuevos en sucursales inactivas.
- Permitir correcciones de históricos en sucursales inactivas.

EP-02 modela el estado reversible y conserva información y accesos; estas operaciones
de EERR se implementarán con períodos. Son requisitos confirmados, no mejoras del backlog.

## Creación y contexto del EERR (EP-03)

- El calendario oficial del negocio es `America/Argentina/Buenos_Aires`, una
  regla fija de dominio, sin variable de entorno. Tanto el instante actual como
  la fecha de inicio persistida de la sucursal se convierten primero a ese
  calendario para obtener el año y mes. No se usa UTC ni la zona del sistema.
- El período persiste como `year` y `month` explícitos, nunca como timestamp.
  A las `2026-10-01T01:00:00Z` todavía es septiembre; octubre comienza a las
  `2026-10-01T03:00:00Z` en Buenos Aires. La API es la autoridad de validación.
- `packages/domain` centraliza la zona y las reglas calendarias, compartidas
  por API y web mediante `Intl.DateTimeFormat`, sin bibliotecas externas.
- Un `Eerr` es un contenedor mensual, colección `eerr`, con UUID v4 propio como
  clave primaria MongoDB. UUID, sucursal, año, mes y creador son inmutables.
- Hay como máximo un EERR por sucursal/año/mes, con validación previa e índice
  único compuesto. Una colisión concurrente devuelve conflicto controlado.
- La creación requiere una sucursal activa y un mes no futuro ni anterior al
  mes de inicio de esa sucursal. Se admiten año y mes numéricos enteros válidos.
- Administrador crea en cualquier sucursal activa; Editor solo en las activas
  asignadas con ese rol; Lector no crea. La consulta incluye históricos de
  sucursales inactivas y respeta todas las asignaciones.
- La inexistencia se representa explícitamente con `exists: false, eerr: null`,
  nunca con ceros. Consultar no crea ni modifica datos.
- `loadStatus: SIN_CARGAR` es estado de carga de un contenedor existente. No es
  estado de cierre; no se define aún un ciclo de vida ni sus transiciones (EP-07).
- EP-03 no genera estructura ni valores. Clonación y estructura quedan para
  EP-04; cierre, reapertura y eliminación para EP-07. Períodos futuros siguen pendientes.
- La restricción de creación en sucursales inactivas queda implementada. La
  corrección de históricos se mantiene confirmada para el milestone de edición.

Consultar [API_EERR.md](API_EERR.md) para contratos y validaciones.

## Estructura e ingreso manual básico (EP-04A)

- Snapshot independiente de nodos planos con parentId, nombre, posición y código.
  `code` es UUID estable del concepto; `nodeId`, UUID de su instancia. Ambos se
  generan en la API, independientemente del nombre. Catálogo estable, plantilla
  mensual versionada y snapshot embebido tienen responsabilidades separadas.
- Exactamente tres bloques protegidos: INGRESOS, COSTOS y GASTOS GENERALES.
  Nadie agrega bloques, los renombra, mueve, elimina ni reutiliza sus códigos reservados.
- Categorías y subcategorías globales por año/mes: Administrador o Editor de un
  EERR autorizado del período puede crear o renombrar. No obtiene acceso a valores ajenos.
- Vista previa y confirmación obligatorias, ligadas al usuario, EERR de origen,
  operación, período, plantilla, revisiones y vencimiento de cinco minutos.
  Solo se muestran conteos y datos globales; nunca información de sucursales ajenas.
- Plantilla, catálogo y snapshots se escriben en una transacción. Sin soporte
  transaccional se rechaza, sin fallback parcial. Conflictos locales bloquean
  toda la publicación con un mensaje sin datos ajenos; deben resolverse con los
  usuarios autorizados antes de generar una nueva vista previa.
- Renombrar mantiene código, instancia, relaciones e importes, y modifica solo
  nombres del mismo año/mes. Los demás períodos conservan sus nombres históricos.
  Esto precisa el alcance de la regla histórica anterior.
- Ítems locales: Administrador/Editor asignado crea y renombra. Nombres obligatorios
  normalizados; sin duplicados entre hermanos tras normalizar Unicode, espacios,
  mayúsculas y acentos. ITEM no admite hijos.
- Toda celda nueva empieza SIN_CARGAR con entrada y resultado null. Cero requiere
  carga explícita: CARGADO con resultado `"0.00"`. Esta decisión posterior reemplaza
  la antigua inicialización automática de registros en cero.
- Progreso: sin ítems o ninguno cargado → SIN_CARGAR; algunos → PARCIAL; todos y
  al menos uno → CARGADO. Son estados de carga, no de cierre.
- ARS, escala 2, ROUND_HALF_UP; API con strings y persistencia Decimal128. Máximo
  `999999999999.99` ARS por celda, rechazando también entradas superiores antes del
  redondeo. Límite conservador de 14 dígitos significativos, inferior a Decimal128.
  Nunca se convierte primero a Number. BigInt permite resolver los literales
  exactamente sin bibliotecas nuevas ni configuración global.
- Solo literales no negativos con punto o coma, sin miles, signos, notación
  científica, expresiones ni evaluadores dinámicos.
- Inicialización explícita e idempotente: bloques y categorías vigentes, sin ítems
  ni importes ficticios. Conserva UUID, período, sucursal, creador y ambos timestamps
  originales; registra initializedAt/initializedBy e incrementa revision.
  GET nunca inicializa; documentos previos devuelven structure: null.
- Escrituras con expectedRevision, comparación e incremento atómicos. Revisión
  ausente equivale a cero. HTTP 409 conserva borradores y exige recargar/revisar;
  no hay reintento automático de una edición monetaria obsoleta.
- Históricos inactivos admiten correcciones autorizadas; nuevos períodos siguen
  prohibidos en sucursales inactivas. Lector nunca modifica.
- Límites técnicos: 1000 nodos por EERR, profundidad de 12 contando el bloque,
  nombres de 120 caracteres, unidad de 40 y entrada de 80. Publicación hasta
  200 EERR por período; superar el límite exige revisión técnica, nunca lotes parciales.

## Decisiones para incrementos posteriores

- EP-04B: expresiones seguras; notas por celda y período; cantidad opcional entera
  no negativa (cero válido, fracciones rechazadas). No se calcula importe como
  cantidad × precio. EP-04A solo prepara quantityEnabled y unidad opcional visible.
- EP-04B: movimientos y reordenamiento dentro de una misma raíz. Durante el MVP
  no se reclasifica entre bloques; reclasificar requiere un concepto con otro código.
- EP-04C: clonación solo a destinos sin estructura/valores; importación sin
  sobrescritura implícita; ambas con vista previa. Completar sin movimiento será
  explícito. No copiar notas ni auditoría al clonar.
- EP-07: eliminación del período de prueba de agosto, no incluida en EP-04A.


## Expresiones, cantidades y notas (EP-04B1)

- Se amplía la restricción de literales de EP-04A: `amount.input` conserva la
  expresión original con solo trim exterior; `amount.value` contiene el resultado
  normalizado. No se agrega un segundo campo de expresión ni se modifica el
  importe de registros anteriores. Una entrada histórica ausente se presenta null.
- Gramática de constantes: `suma = producto ((+|-) producto)*`;
  `producto = unario ((*|/) unario)*`; `unario = (+|-)* primario`;
  `primario = número | (suma)`. Número: dígitos, opcionalmente punto/coma y más
  dígitos. Se aceptan espacios entre tokens, no dentro de un número. Multiplicación
  implícita, variables, funciones, exponentes y miles se rechazan. `1,000` significa
  decimal 1, no mil; `1,000.00` es inválido. Signos unarios se procesan explícitamente.
- Evaluación racional exacta con numerador/denominador BigInt, reducción por MCD
  en cada operación y ROUND_HALF_UP una sola vez al final. Se permiten resultados
  intermedios negativos; el resultado final debe estar entre 0 y 999999999999.99 ARS
  antes de redondear. División por cero se rechaza. Persistencia Decimal128 y API
  con strings de dos decimales, reutilizando la política monetaria existente.
- EXPRESSION_LIMITS centraliza: 256 caracteres de entrada, 128 tokens, 16 niveles
  de paréntesis, 80 dígitos por literal y 1024 caracteres por entero intermedio.
  No se usan eval, Function ni intérpretes de JavaScript, ni se agregan dependencias.
- Cantidad opcional independiente en cada ítem, conforme al alcance EP-04B1.
  `quantityEnabled` anterior se conserva por compatibilidad, sin restringir la
  nueva carga ni modificar su valor histórico. Cantidad: estado SIN_CARGAR y valor
  null, o CARGADO y string entero canónico entre 0 y 999999999999. Entrada de hasta
  12 dígitos, sin signos, espacios, fracciones o exponentes. Persistencia String
  exacta, sin coerción numérica. No multiplica importes ni altera su progreso.
- Nota del ítem: hasta 1000 unidades UTF-16; nota del EERR: hasta 4000. Límites
  compartidos por API y web; se rechaza exceso antes de trim. Saltos internos se
  conservan. Vacío tras trim elimina el campo. Solo texto plano, sin HTML ejecutable.
  Ambas notas y cantidades son locales. No se copiarán notas en futuras clonaciones.
- Todas las operaciones usan expectedRevision/CAS e incremento atómico de la misma
  revisión del EERR. Una nota general puede guardarse incluso sin estructura,
  sin prepararla. La nota general se actualiza mediante $set/$unset, sin reemplazar
  el snapshot. Cualquier edición invalida previews globales anteriores.
- GET no escribe: cantidades ausentes se interpretan SIN_CARGAR, notas ausentes
  sin nota. Campos nuevos quedan ausentes hasta una acción explícita. No hay
  migraciones, cambios de identidad/nombres/timestamps de creación ni recálculo
  automático de importes históricos. updatedAt avanza solo por edición explícita.
- Administrador y Editor asignado editan, incluso históricos inactivos; Lector
  solo consulta. Acceso ajeno devuelve 404. La API recalcula y no acepta resultados
  calculados por el cliente. No se altera el administrador ni se usa bootstrap.
- La web separa expresión, vista previa y valor guardado; mantiene borradores de
  importe, cantidad y ambas notas ante errores, 409 y recarga. Guardar un campo
  elimina únicamente su borrador. No hay reintento automático de escrituras.
- EP-04B2 difiere movimientos/reordenamiento dentro de raíz; EP-04C difiere
  clonación, importación y completar sin movimiento. Sin EP-05/EP-06 ni auditoría
  completa, cierre, reapertura o borrado de períodos.


## Experiencia del espacio de carga (EP-04UX)

- Patrón híbrido: grilla jerárquica para carga frecuente y modales para crear
  ítems/categorías, renombrar, consultar/editar detalle, notas y confirmaciones.
  Bloques protegidos y categorías se pliegan solo visualmente. No hay tarjetas
  por nodo ni formularios estructurales desplegados dentro de la grilla.
- Guardado explícito por campo; Enter envía únicamente un borrador válido y
  diferente del valor persistido. Sin guardado por blur. Expresión, resultado
  y estado guardado se distinguen; SIN_CARGAR no se interpreta como cero.
- El detalle completo ofrece nombre, importe, cantidad y nota. Cada campo tiene
  su guardado independiente, sin introducir un contrato de edición múltiple.
- Crear/renombrar categoría exige preview y confirmación global. Generar un
  preview no se anuncia como publicación. Cero y limpieza de valores tienen
  confirmación explícita, indicando que reemplazan solo ese campo y su borrador.
- Cerrar modal conserva borradores en memoria durante la estancia en el EERR.
  No se persisten en localStorage ni se prometen después de abandonar/recargar
  la página. Clic exterior no cierra el modal; Escape/cierre se bloquean al escribir.
- Mensajes y errores identifican el campo o formulario. Ante 409 se conserva
  el borrador, se recarga la revisión y se revisa antes de reenviar. Otros
  borradores no se eliminan por guardar un campo o cerrar un modal.
- Escritorio: navegación lateral y cinco columnas. Hasta 1100 px cantidad y
  nota pasan al detalle; estructura, importe y acciones permanecen. Hasta
  800 px la navegación se compacta arriba. En móvil las filas fluyen en dos
  columnas, sin desplazamiento horizontal obligatorio ni acciones ocultas.
- Administrador y Editor asignado mantienen edición de históricos inactivos;
  Lector ve valores, expresiones y notas en lectura, sin controles de escritura.
  No se cambia ningún permiso, regla, endpoint ni documento de MongoDB.
- EP-04B1 fue validado funcionalmente por el usuario. EP-04UX deja para EP-04B2
  movimientos/reordenamiento y para EP-04C clonación/importación/completar cero.
  No incorpora eliminación, cierre, cálculos derivados, dashboard ni gráficos.

## Lectura, edición explícita y archivo recuperable (EP-04UX.1)

- El importe persistido es la información principal (`1.500,00 ARS`), con la
  expresión original debajo. Cero se muestra `0,00 ARS`; SIN_CARGAR, «Sin cargar».
  Un importe histórico sin expresión no inventa una. Expresiones extensas ofrecen
  una vista abreviada y un desplegable accesible con el texto completo.
- Importe y cantidad se editan bajo demanda, con foco en la entrada, preview,
  Guardar/Enter y Cancelar/Escape. Cancelar descarta solo el borrador de esa celda;
  guardar vuelve a lectura. Blur y clic exterior no guardan ni descartan.
- Se autoriza archivo lógico exclusivamente de ITEM local. No hay DELETE ni
  eliminación física, ni archivo de bloques, categorías o subcategorías. Su gestión
  requiere una decisión independiente. No se implementan movimiento ni reordenamiento.
- `archive` es opcional: `{ state: "ARCHIVED" | "ACTIVE", at, by }`. Ausencia significa
  activo histórico; `at` es el instante ISO del último archivo y `by` su actor
  autenticado. Restaurar cambia solo el estado a ACTIVE, conservando esa metadata.
  Archivar nuevamente registra el nuevo archivo. No constituye auditoría completa.
- Archivo/restauración conservan nodeId, código, nombre, padre, posición, importes,
  expresión, cantidad, nota y todos los timestamps existentes, incluido updatedAt.
  La escritura modifica únicamente archive, loadStatus y la revisión CAS del EERR.
  No reescribe el snapshot ni Decimal128, ni modifica otros EERR o la categoría global.
  Esta regla específica prevalece sobre el avance de updatedAt de otras ediciones.
- Archivados no aparecen en la grilla activa ni cuentan como cargados o pendientes.
  Futuros cálculos, clonaciones e importaciones deberán excluirlos como origen de
  cálculo o destino activo. Esos módulos siguen fuera de alcance. Restaurar reincluye
  los valores y el progreso en la misma posición, sin crear identidad nueva.
- La estructura devuelve todos los nodos con su estado opcional explícito; dominio
  centraliza `isArchived`. GET no migra ni escribe. Restaurar con padre inexistente
  falla de manera controlada; nunca mueve ni crea categorías automáticamente.
  Se conservan las restricciones existentes de nombres/posiciones también para
  archivados: no se permite crear duplicados que impidan recuperar su ubicación.
- Administrador y Editor asignado pueden archivar/restaurar, incluso históricos de
  sucursales inactivas. Lector consulta archivados sin modificarlos; ajenos no acceden.
  La API rechaza edición de nombre, importe, cantidad y nota mientras esté archivado.
- Ambas operaciones exigen confirmación contextual y expectedRevision. Comparten
  el CAS existente: una sola escritura gana, la perdedora devuelve 409 sin sobrescribir.
  Solo una escritura exitosa incrementa revisión; invalida previews globales anteriores.
- Borradores agregados de celdas, notas y formularios se mantienen en memoria.
  Los enlaces internos que abandonan el workspace muestran un modal propio para
  continuar editando o descartar y salir. Recarga/cierre/salida externa usan
  beforeunload solo mientras hay cambios; el navegador controla su advertencia.
  Sin borradores no hay bloqueo. No se utiliza almacenamiento local, de sesión ni DB.

## EP-04UX.2: inicio y navegación unificados

- Dashboard es el inicio autenticado. Los modos Análisis/Editor y su pregunta de
  selección se retiran; no se sustituyen por otro selector de modo.
- Administrador global, Editor y Lector por sucursal se conservan intactos. Los
  permisos dependen de las asignaciones y la API, nunca de una preferencia visual.
- Menú principal: Dashboard, Estados de resultados y Sucursales exclusivamente
  para Administrador. Una URL directa de administración conserva su autorización.
- Dashboard incluye saludo y accesos reales, con un estado informativo de la
  futura vista financiera. Indicadores, análisis y EP-05/EP-06 quedan diferidos.
- Selector por sucursal/período, históricos, creación, estructura y administración
  usan el mismo shell sin cambiar reglas, datos ni rutas.
- Salir por menú o cerrar sesión con borradores exige continuar o descartar. Un
  cierre fallido no descarta cambios. Recarga y cierre nativo usan beforeunload;
  no se persisten borradores entre sesiones. Atrás/Adelante no agrega historial.

## EP-04B2: orden global y local confirmado

La decisión confirmada es ordenar categorías **entre categorías**, conservando el
orden relativo de los ítems locales. En el mismo padre se intercambian los lugares
ocupados por categorías; los ítems mantienen su orden relativo. Al cambiar de padre,
la categoría se inserta antes de la categoría del rango elegido, o después de la
última; si no hay categorías se agrega al final. Luego se normalizan los hermanos
activos. El rango global no depende de cuántos ítems tenga cada sucursal.

Los ítems usan posición entre todos los hermanos activos y continúan admitiéndose
bajo bloques, como en el modelo previo. Todo movimiento conserva el bloque original,
identidad y datos; las categorías transportan el subárbol. Se prohíben ciclos,
autoparentesco, padres ITEM/inexistentes y superar la profundidad máxima existente.

Categorías afectan únicamente el mismo año/mes y requieren preview y confirmación
transaccional. Ítems afectan solo su EERR. Se mantienen permisos: Administrador y
Editor asignado; Lector consulta; ajenos reciben 404; históricos inactivos editables.
El preview enumera identificadores accesibles y cuenta los ajenos sin revelarlos.

Un no-op no altera snapshots, timestamps, revisiones ni versión de plantilla. El
preview sigue siendo metadata temporal consumible, sin cambios de dominio. Archivados
no participan del orden activo y retienen padre/posición. Restaurar inserta en el
índice preservado limitado al tamaño actual, desplazando activos; padre ausente
produce error. Esta regla actualiza el comportamiento de restauración de EP-04UX.1.
No hay migración ni normalización durante GET. Se difieren drag-and-drop, movimientos
entre bloques, archivo de categorías, eliminación, auditoría y cálculos derivados.

## EP-04C1: clonación controlada como inicialización

- Solo sobre un EERR existente sin estructura persistida, notas ni modificaciones:
  revision ausente/cero y loadStatus SIN_CARGAR. Una estructura parcial no está vacía.
  Nunca reemplazar, fusionar, borrar ni crear períodos durante la clonación.
- Modos ESTRUCTURA y ESTRUCTURA_Y_VALORES. Ambos copian solo ítems activos, códigos,
  nombres locales y jerarquía compatible, con nodeId nuevos. Solo estructura deja
  importes/expresiones/cantidades SIN_CARGAR. Con valores conserva exactamente resultado,
  expresión original, cantidades y diferencia entre cero y SIN_CARGAR. Se verifica
  consistencia de expresión/resultado sin sustituir el valor persistido por un recálculo.
- No copiar notas, archivo, auditoría, actores/timestamps del origen ni cálculos.
  Se preservan unidad y quantityEnabled como atributos estructurales existentes.
- Decisión confirmada: la plantilla destino es autoritativa, incluidas categorías
  adicionales, nombres y orden diferentes. Todas las categorías requeridas del origen
  deben existir por código con el mismo parentesco/bloque. Sus lugares entre hermanos
  se llenan según el orden destino; categorías adicionales se agregan después de esos
  lugares. Los ítems preservan su orden relativo y se normalizan posiciones activas.
- Sin registro de plantilla se permite sembrarla desde el snapshot origen, salvo que
  ya existan estructuras inicializadas en el período (incoherencia, requiere revisión).
  Una plantilla persistida vacía es autoritativa: no equivale a plantilla inexistente.
  Nunca modificar otros EERR, ni reparar/publicar categorías implícitamente.
- Decisión confirmada: conservar createdAt y createdBy del contenedor destino; registrar
  initializedAt/initializedBy actuales y actualizar updatedAt con la operación. No
  copiar revisiones del origen: primera inicialización incrementa revision de 0 a 1.
- Origen accesible, inicializado, válido y no posterior al destino; nunca el mismo EERR.
  Se admite mismo período de otra sucursal e históricos inactivos. La API ordena primero
  períodos previos de la misma sucursal (más reciente primero), luego mismo período de
  otra y finalmente restantes accesibles. Para valores se preselecciona misma sucursal.
- Valores de otra sucursal exigen advertencia y confirmCrossBranchValues=true ligado al
  preview concreto. No se exige para solo estructura o valores de la misma sucursal.
- Preview estrictamente sin escrituras: token firmado de cinco minutos ligado a actor,
  origen/destino, modo, revisiones existentes e integridad del contenido y plantilla.
  Confirmar revalida todo bajo transacción y CAS. Doble envío/reintento no sobrescribe.
  No se crea un sistema de versiones persistido adicional.
- Administrador y Editor autorizado en destino; lectura autorizada de origen (puede ser
  Lector allí). Lector lista fuentes consultables pero no inicializa. Permisos revalidados
  por guard y servicios; ninguna preferencia visual amplía acceso.
- Crear EERR sigue siendo una operación separada y redirige a elegir base o clonación.
  Inicialización base conserva su contrato idempotente. Se difieren reemplazo, selección
  parcial, notas/archivados, importación, cierre, auditoría completa y cálculos derivados.

## EP-04C2 — importación controlada de valores

- CSV UTF-8 con BOM y punto y coma, y XLSX con hojas Instrucciones/Carga. Solo
  importes/expresiones y cantidades de ITEM activos de un EERR inicializado.
- Columnas: eerr_id, revision_estructura, codigo_item, item, ruta,
  importe_o_expresion, cantidad. Código estable identifica; nombre/ruta informan.
- Vacío conserva; 0 carga cero; SIN_CARGAR (trim, sin distinción de mayúsculas)
  limpia el campo. Importe y cantidad independientes. Se reutilizan el parser
  racional, rangos, ARS y ROUND_HALF_UP existentes; nunca eval ni fórmulas Excel.
- En XLSX, `importe_o_expresion` debe guardarse como texto, incluso para 0 y
  números simples. Cualquier celda numérica de esa columna produce error por
  fila y bloquea el lote: ExcelJS convierte el literal a `Number` y puede alterar
  su precisión decimal. CSV mantiene su semántica de texto. Cantidad numérica
  conserva la validación existente de entero no negativo y rango.
- revision_estructura es un sello firmado de identidad estructural, no una revisión
  editable por el usuario. Incluye códigos, relaciones, posiciones y archivo;
  excluye nombre de ítem y valores/notas. Renombrar ítem conserva compatibilidad;
  altas, movimiento y archivo requieren nueva plantilla. La versión numérica
  existente por sí sola no distingue estos cambios; se conserva sin redefinirla.
- Preview sin escrituras, errores por fila y valores antes/después. Cualquier error
  bloquea toda confirmación. No-op no genera token ni actualiza timestamps.
- Confirmación ligada a actor, EERR, bytes del archivo, operaciones, identidad y
  revisión; vence en cinco minutos. Revalida bajo transacción y CAS. Conflictos
  preservan archivo/resumen en web, exigen nuevo preview y nunca aplican parcialmente.
- Admin y Editor asignado importan, incluso históricos inactivos; Lector solo
  descarga. No se revelan EERR ajenos. No se importan notas, estructura, actores,
  fechas, archivados ni cálculos derivados. Sin reemplazo estructural ni EP-04C3.

## EP-04C3: completar importes pendientes con cero

- Acción explícita sobre todos los ITEM activos cuyo amount.state es SIN_CARGAR
  en un EERR existente e inicializado. Sin selección parcial ni nuevas restricciones
  de calendario; históricos inactivos siguen editables por Admin/Editor asignado.
- Cada importe pasa a CARGADO, Decimal128 0.00 ARS, escala 2 e input null. No se
  inventa la expresión "0". Importes/expresiones ya cargados, cantidades (incluidas
  ausentes/SIN_CARGAR), notas, archivados, estructura y creación quedan intactos.
- loadStatus y progreso reflejan carga monetaria, nunca cierre. El período sigue
  editable: cada cero admite edición/expresión o volver individualmente a SIN_CARGAR.
  Cierre, reapertura y bloqueo permanecen diferidos a EP-07.
- Preview sin escrituras con contexto, pendientes, rutas y progreso antes/después.
  Sin pendientes: sin token, escritura, revisión ni timestamps. Confirmación vuelve
  a calcular el conjunto y verifica actor, operación, huella, revisión y vencimiento.
- Lote atómico mediante transacción y CAS, una revisión y updatedAt del reloj de
  servidor. El modelo vigente no tiene updatedBy en ediciones monetarias: no se
  introduce auditoría nueva ni se reemplazan createdBy/initializedBy. El actor
  autenticado autoriza la operación y queda ligado al preview.
- Borradores obligan a volver a guardarlos o descartarlos desde sus controles antes
  del preview; no se descartan automáticamente. 409 conserva modal y resumen, exige
  preview actualizado. Lector no obtiene acción ni permiso de preview/confirmación.

## EP-05A.1: resultados financieros básicos confirmados

- Ventas/Ingresos, Costos Totales y Gastos Totales corresponden íntegramente a los
  tres bloques protegidos identificados por código, no por nombre visible ni por
  `nodeId` entre períodos. Los ítems activos directos y descendientes participan
  una vez; archivados, cantidades, notas y expresiones originales no participan.
  Se usa el importe persistido, incluso en históricos sin expresión.
- Margen Bruto = Ingresos − Costos; Margen Bruto % = 100 × Margen Bruto / Ingresos.
  Resultado Neto = Margen Bruto − Gastos Generales; Resultado Neto % =
  100 × Resultado Neto / Ingresos. Los resultados derivados pueden ser negativos.
- Categorías y bloques sin ítems activos son `EMPTY`, sin valor, nunca cero
  implícito. Con ítems y ninguno cargado son `PENDING`, sin valor. Con mezcla son
  `PARTIAL` y muestran solo la suma conocida; todos cargados son `COMPLETE`,
  incluido el cero explícito. Para declarar ausencia real de movimientos se
  conserva un ítem con importe cero cargado.
- Margen Bruto requiere Ingresos y Costos completos y no vacíos; Resultado Neto
  requiere además Gastos completos y no vacíos. Los porcentajes requieren la
  métrica monetaria y denominador Ingresos distinto de cero. Los pendientes
  bloquean la métrica dependiente, sin interpretar SIN_CARGAR como cero; gastos
  pendientes no bloquean el Margen Bruto. Un denominador cero produce motivo
  `ZERO_DENOMINATOR`, nunca 0 % ficticio.
- Cálculo bajo demanda y de solo lectura sobre un snapshot/revisión. Decimal128
  persistido se transforma en string canónico; centavos y cocientes se calculan
  con BigInt, sin Number monetario. Dinero de salida: dos decimales; porcentaje
  de API: cuatro decimales, ambos con ROUND_HALF_UP simétrico. El límite por
  celda `999999999999.99` no limita subtotales: 1000 nodos admiten como cota
  conservadora `999999999999990.00` ARS de suma. No se persisten derivados.
- El análisis contiene `sourceRevision` y `calculationVersion: 1`. Admin,
  Editor y Lector autorizados leen, incluidos históricos inactivos; ajeno e
  inexistente devuelven 404. Datos persistidos inválidos fallan controladamente
  con 500/`INVALID_PERSISTED_DATA`, sin corregirse durante GET.

## EP-05A.2: presentación confirmada del cuadro

- El cuadro de resultados está antes de la grilla y es de solo lectura para Admin,
  Editor y Lector. La grilla sigue siendo el único espacio de carga. Sin
  estructura, se mantiene el flujo de inicialización y no se muestra el cuadro.
- Categorías y bloques pueden mostrar subtotal parcial identificado como tal;
  métricas derivadas esperan operandos completos. Vacío, pendiente y valor nulo
  muestran raya y motivo; cero explícito muestra `0,00 ARS`.
- Las cifras representan datos guardados, nunca borradores. Si hay cambios locales,
  el cuadro lo indica. Solo se muestran cifras de la revisión visible de la
  estructura; diferencias se reintentan de forma acotada y ofrecen actualización.
- Los strings monetarios se muestran con dos decimales y `ARS`; los porcentajes
  se redondean de cuatro a dos decimales con HALF_UP simétrico solo para lectura.
  No hay interpretación de color para la calidad financiera.

Punto de equilibrio, meta y objetivo requieren definiciones adicionales en
EP-05B; EP-06 conserva dashboard y comparación.

## EP-05B.1: proyecciones y meta confirmadas

- INGRESOS son ventas netas de IVA; COSTOS son mercadería vendida y costos
  variables; GASTOS GENERALES son mayormente fijos. Todos los importes son netos
  de IVA. La relación Costos/Ingresos observada estima la tasa variable; gastos
  semivariables no se descomponen todavía.
- Con I=Ingresos, C=Costos y G=Gastos, y contribución I−C positiva, el Punto de
  Equilibrio es `G×I/(I−C)`. Meta porcentual d sobre ventas: `G×I/((I−C)−I×d)`;
  meta monetaria A: `(G+A)×I/(I−C)`. El resultado en ambos casos es el mínimo
  de ventas requerido: se redondea hacia arriba al centavo con racional exacto.
- Cada EERR tiene cero o una meta, porcentaje `0.0000 ≤ d < 100.0000` o monto
  ARS `0.00..999999999999.99`. Los valores viajan como strings; se rechaza la
  precisión de entrada excesiva y se completa la escala contractual sin pérdida.
  La meta porcentual inalcanzable puede guardarse y produce motivo explícito.
- La modalidad alternativa es solo referencia: con meta porcentual, `d×objetivo`
  en ARS; con meta monetaria, `100×A/objetivo` en porcentaje. Utiliza el objetivo
  ya redondeado; se redondea con HALF_UP a dos o cuatro decimales. Objetivo cero
  deja el porcentaje de referencia no calculable.
- Meta por EERR, conservada en históricos y editable por Admin/Editor asignado,
  incluso con sucursal inactiva. Lector consulta. No se clona, importa ni comparte.
  Solo se configura en EERR inicializado. Su escritura usa CAS; la lectura no
  escribe. Los resultados se calculan siempre bajo demanda.
- Proyecciones requieren los tres bloques con ítems activos y carga completa,
  Ingresos positivos y contribución positiva. Pendientes, vacíos, cero ingresos,
  contribución no positiva, meta ausente e inalcanzable producen valor null y
  motivos distintos. Cero cargado en gastos y meta cero son válidos.

## EP-05B.2: presentación y edición web confirmadas

- El Cuadro de resultados conserva sus filas históricas y agrega, después de
  Resultado Neto, Punto de Equilibrio, meta principal opcional, Objetivo de Venta,
  referencia secundaria y supuestos. Son estimaciones, no certezas ni datos
  editables en la referencia. No se agregan al Dashboard general en esta etapa.
- Porcentaje de meta admite coma o punto de entrada y hasta cuatro decimales;
  monto admite hasta dos, sin miles ni expresiones. La web normaliza a string y
  utiliza la validación de dominio; la API conserva la autoridad final. El motor
  de API realiza en exclusiva fórmulas y redondeo hacia arriba del objetivo.
- El cambio de modalidad con valor escrito exige confirmar su limpieza. Guardar
  y eliminar son explícitos; eliminar exige confirmación y deja disponible el
  Punto de Equilibrio. Un 409 conserva el borrador hasta recargar y revisar.
  La navegación y salida con borrador quedan protegidas.
- Las cifras aparecen solo para la revisión visible de la estructura. Tras un
  PUT, incluso no-op, se actualizan estructura y análisis antes de cerrar el
  modal. La meta inalcanzable permanece válida y editable; faltantes muestran
  raya y motivo, nunca un cero supuesto. Admin y Editor asignado modifican;
  Lector consulta. El backend aplica los permisos efectivos.
- La meta es local al EERR y no se clona, importa ni comparte. EP-06 conserva
  Dashboard financiero, comparación y consolidación; EP-07 conserva cierre y
  eliminación del período.
