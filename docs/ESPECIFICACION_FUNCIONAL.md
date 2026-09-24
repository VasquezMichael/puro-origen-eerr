# Especificación funcional

## Requisitos confirmados

### Propósito

Gestión integral de estados de resultados (EERR) de múltiples sucursales y períodos,
con una interfaz minimalista, fluida, funcional y responsive para escritorio y tablet.
No se definen fórmulas, permisos detallados ni criterios no provistos por el usuario.

### Acceso y navegación

- Autenticación mediante login.
- Wizard inicial.
- Inicio autenticado en Dashboard, sin elección de modo de trabajo.
- Perspectiva por sucursal: seleccionar sucursal y consultar sus períodos.
- Perspectiva por período: seleccionar período y consultar sus sucursales.
- Roles confirmados: Lector y Editor.
- Acceso cerrado mediante email y contraseña, sin registro público.
- Administrador global para gestión de usuarios, accesos y recuperación manual.
- Los permisos Lector y Editor se asignan por sucursal.

### Sucursales

- Gestión administrativa de sucursales, código automático e inmutable y cambios
  reversibles de estado según las decisiones de EP-02 en [DECISIONES.md](DECISIONES.md).
- Consulta limitada a sucursales asignadas para Lector/Editor; Administrador consulta todas.
- Fecha de inicio opcional; por defecto se utiliza la fecha de creación.
- Una sucursal inactiva conserva sus históricos.
- La corrección de históricos y la creación de EERR en sucursales inactivas se
  rigen por las decisiones aceptadas indicadas más abajo.

### Períodos

- Calendario oficial: `America/Argentina/Buenos_Aires`, tanto para el mes actual
  como para el mes de inicio de la sucursal. Los períodos se guardan como año y
  mes explícitos; la API aplica las validaciones definitivas.
- Crear período prepara una plantilla mensual por sucursal.
- Contemplar el estado “sin cargar”.
- Cierre y bloqueo de períodos.
- Acción para completar con cero las celdas sin movimiento.
- La creación de períodos futuros permanece pendiente de definición.

EP-03 implementa únicamente el contenedor mensual y la navegación por sucursal
o por período, con los permisos y restricciones de [DECISIONES.md](DECISIONES.md).
Un EERR existente comienza `SIN_CARGAR`; una combinación inexistente se muestra
como tal, sin interpretar su ausencia como importes en cero. No se crean registros
al consultar. La estructura financiera y clonación se incorporarán en EP-04;
cierre, reapertura y eliminación, en EP-07. Contratos: [API_EERR.md](API_EERR.md).

### Carga y estructura

- Las celdas nuevas comienzan SIN_CARGAR con valor null; cero requiere carga
  explícita. EP-04A reemplaza la antigua indicación de inicio automático en cero.
- Carga manual, Excel y CSV.
- Celdas numéricas y expresiones matemáticas, por ejemplo `1000 + 500`.
- Categorías dinámicas sin intervención técnica.
- Vista previa del cálculo.
- Notas y auditoría de modificaciones.
- Posibilidad de agregar ítems durante un período.
- Aplicar las decisiones aceptadas sobre códigos de categorías, nombres históricos,
  cantidades enteras y porcentajes con decimales.

### Clonación

- Clonar estructura copia categorías e ítems sin copiar importes; las nuevas
  celdas quedan SIN_CARGAR conforme a EP-04A. Completar con cero será explícito.
- La estructura puede clonarse desde cualquier sucursal accesible.
- Clonar estructura y valores mantiene los montos.
- Por defecto se clona desde la misma sucursal.
- Si se clona desde otra sucursal debe existir una advertencia.
- No se copian notas.

### Resultados y análisis

EP-04A implementa preparación explícita, tres bloques protegidos, categorías
globales con vista previa/confirmación, ítems locales, importes literales ARS
y revisión optimista. Permite cargar cero o volver a SIN_CARGAR. Históricos
inactivos admiten correcciones autorizadas; Lector consulta. Los EERR anteriores
no cambian hasta su preparación manual. Cantidades editables, notas, expresiones
y movimientos quedan para EP-04B; clonación, importación y completar sin movimiento
para EP-04C. Los siguientes resultados financieros pertenecen a EP-05/EP-06.

- Ingresos, costos, margen bruto, gastos y resultado neto.
- Porcentaje neto sobre ventas.
- Punto de equilibrio.
- Objetivo de venta.
- Control de divisiones por cero.
- Dashboard, semáforos, comparativas y consolidado.
- Exportación a PDF y Excel.

## Decisiones aceptadas

Estas reglas se registran en [DECISIONES.md](DECISIONES.md), que tiene prioridad
ante discrepancias con la especificación:

- Sucursales inactivas: permiten corregir históricos, pero no crear EERR nuevos.
- Categorías identificadas internamente por código.
- Renombrar categorías no altera el nombre histórico.
- Cantidades enteras; porcentajes con decimales permitidos.
- Clonar valores no copia notas.
- Las categorías globales modifican todos los EERR del mismo período.

## Definiciones pendientes

- Creación de períodos futuros.
- Feedback de usuarios finales.

Consultar [DECISIONES.md](DECISIONES.md). No resolver estos pendientes mediante
suposiciones ni derivar permisos o interacciones no especificadas entre reglas.

## Backlog evolutivo

Las mejoras futuras se registran por separado en
[BACKLOG_EVOLUTIVO.md](BACKLOG_EVOLUTIVO.md). El backlog no autoriza implementación
ni agrega requisitos confirmados. Cada milestone implementa únicamente su alcance.


## Incremento implementado EP-04B1

El importe acepta constantes con +, -, *, /, paréntesis, espacios y punto/coma
decimal. La vista previa usa el mismo dominio que la API, que recalcula el resultado.
Se conserva expresión original y resultado exacto normalizado. Cero y SIN_CARGAR
siguen siendo distintos; limpiar elimina entrada y resultado. No hay referencias
a celdas, resultados financieros ni ejecución de código.

Cada ítem permite cantidad entera opcional independiente del importe: 0 a
999999999999, o SIN_CARGAR. No participa del contador monetario ni se propaga.
Nota de ítem (1000) y nota general del EERR (4000) conservan saltos de línea;
las notas se abren/contraen, se editan o eliminan con contenido vacío. No se copiarán
al clonar. Guardar requiere revisión vigente; 409 conserva todos los borradores
y permite recargar sin perderlos. Lectores visualizan sin controles de escritura.

Compatibilidad: GET no inicializa campos ni estructura; ausencia significa sin
cantidad/sin nota. Los importes antiguos no se recalculan, y el valor guardado se
muestra aun sin expresión histórica. No se modifican datos reales de Calle 59.
EP-04B2: movimientos y reordenamiento. EP-04C: clonación/importación/completar cero.
Límites y gramática exactos en DECISIONES.md; contratos en API_EERR.md.


## Espacio de carga implementado EP-04UX

La carga mensual se realiza en una grilla jerárquica compacta. Bloques y
categorías pueden contraerse sin modificar datos. Importes y cantidades se
editan en la fila, con preview y guardado explícito; Enter guarda solo cambios
válidos. Menús compactos reúnen las acciones secundarias realmente disponibles.

Crear y renombrar se realiza en modales. La publicación de categorías conserva
su preview y confirmación. Detalle reúne nombre, expresión, cantidad y nota;
nota general tiene su propio modal. El detalle guarda cada campo por separado.
Cero y SIN_CARGAR se confirman y siguen siendo distintos.

En tablet, cantidad y nota se consultan/editan desde Detalle si no caben en la
grilla. Lector accede a la misma información sin controles de modificación.
Modales y menús admiten teclado y foco visible; cerrar un modal conserva los
borradores mientras se permanezca en el EERR. Conflictos ofrecen recarga de
datos sin perder los borradores de otros campos o formularios.

El rediseño no altera datos al consultar ni agrega escrituras automáticas.
No modifica contratos, reglas financieras, identificadores ni permisos.

## Incremento confirmado EP-04UX.1

La grilla prioriza el resultado guardado en ARS, seguido de la expresión original.
Cero y Sin cargar son estados diferentes; cantidad muestra el entero persistido.
No hay inputs permanentes: Editar importe/cantidad abre el campo y lo enfoca.
Guardar (o Enter válido) persiste y vuelve a lectura; Cancelar o Escape descarta
solo esa celda y restaura el foco. Errores y conflictos conservan los borradores.
Una expresión extensa puede desplegarse completa; históricos sin expresión no inventan una.

Archivar ítem requiere confirmar nombre, ubicación, sucursal y período. Retira solo
el ítem local de la carga y del progreso, conservando todos sus datos e identidad.
«Ver ítems archivados (N)» permite consultar sus valores sin editarlos. Restaurar
requiere confirmación y recupera el mismo ítem en su ubicación/posición, con sus
valores y participación en progreso. Si falta el padre, se informa un error y no
se restaura en una ubicación arbitraria. No hay eliminación física ni acción sobre
bloques o categorías. Archivo y restauración no modifican otros EERR.

Administrador y Editor asignado pueden archivar/restaurar, también en históricos
inactivos. Lector solo consulta. La API protege estas restricciones y rechaza
revisiones obsoletas con 409 sin sobrescribir datos. Archivados no contarán en
futuros cálculos, clonaciones ni como destinos activos de importación; esas funciones
siguen pendientes y las categorías requieren una decisión independiente.

Cuando un enlace interno abandona el workspace con borradores, se ofrece continuar
editando o descartar y salir. La recarga, cierre y salida externa usan la protección
nativa del navegador solo mientras hay cambios. No hay guardado automático ni
persistencia de borradores entre sesiones. Guardar/cancelar un campo no elimina
borradores de otros campos; cerrar un modal tampoco los descarta.

## EP-04UX.2: experiencia autenticada

El acceso válido abre Dashboard con saludo, enlaces a Estados de resultados y,
solo para Administrador, Sucursales. Los indicadores financieros se incorporarán
en una etapa posterior: esta base no muestra importes, porcentajes ni gráficos
ficticios. La selección de modos queda retirada; los roles permanecen vigentes.

Todas las pantallas autenticadas comparten navegación, ubicación, rol y cierre de
sesión. La opción actual usa aria-current. Login y contraseña temporal conservan
su composición independiente. En móvil/tablet compacto el menú dispone de control
visible, Escape y retorno del foco; no requiere hover.

El flujo EERR conserva ambas perspectivas, históricos, creación y apertura de
estructura. Administración conserva altas, edición, fecha de inicio y cambios
reversibles de estado con confirmación contextual. Editor/Lector no ven enlaces
administrativos ni obtienen acceso por URL directa.

Los borradores del workspace se conservan al continuar editando. Descartar permite
ir al destino elegido o cerrar sesión; ante un error de logout se mantienen.
No hay autoguardado ni escrituras por abrir Dashboard o montar el shell.

## EP-04B2: mover y ordenar

Los menús de categorías e ítems ofrecen Mover, Subir y Bajar según permisos y posición.
El primero no ofrece Subir; el último no ofrece Bajar. El modal presenta bloque,
padre actual, destinos válidos y posición. Categorías se ordenan entre categorías,
conservando el orden relativo de ítems locales; ítems entre hermanos activos.
Mover una categoría conserva todo su subárbol. INGRESOS, COSTOS y GASTOS GENERALES
permanecen protegidos y en su orden fijo. No se permiten movimientos entre bloques.

Categorías requieren revisar el alcance global del período y confirmar por separado;
el preview muestra ubicación anterior/nueva, período, bloque y EERR afectados. Ítems
se guardan solo en el EERR abierto. Ninguna operación cambia importes, expresiones,
cantidades, notas, códigos o identidad. No-op mantiene timestamps y revisiones.

Borradores incompatibles deben guardarse o cancelarse desde sus controles, o se puede
continuar editándolos. Los ajenos se preservan. Error 409 mantiene selección y exige
recargar; para categorías se debe generar un nuevo preview. No hay guardado al abrir
menús, elegir destino o generar preview. Se mantienen teclado, Escape, foco restaurado,
controles táctiles y navegación protegida por DraftNavigationGuard.

Archivados no se mueven ni cuentan en el orden activo. Restaurar recupera su padre e
inserta en su posición previa, acotada al rango actual, desplazando hermanos activos.
Si falta el padre se rechaza; nunca se elige otro automáticamente. Los permisos y
alcance histórico existentes se mantienen; no se modifican otros períodos.

## EP-04C1: elegir cómo inicializar

Después de crear un EERR se abre el espacio de carga con tres alternativas: Usar
estructura base, Clonar estructura y Clonar estructura y valores. Abandonar este paso
conserva el contenedor vacío. Un EERR preparado no muestra clonación; uno con notas u
otras ediciones no admite clonar aunque no tenga estructura.

El selector solo ofrece EERR reales, accesibles e inicializados hasta el período destino,
priorizando la misma sucursal y períodos recientes. Muestra sucursal/período, relación
con destino, estado, categorías, ítems y cargados; el UUID no es protagonista.

El preview separado informa ambos contextos, modo, bloques, categorías e ítems, importes
y cantidades cargados, ceros, SIN_CARGAR, inclusiones/exclusiones, plantilla y revisiones.
No escribe. Conflictos de plantilla se explican y bloquean confirmar. La plantilla
existente conserva todos sus nombres/categorías/orden; las requeridas se vinculan por
código y mismo parentesco/bloque. No se publica ni fusiona automáticamente.

Solo estructura deja valores sin cargar. Con valores conserva importes, expresiones y
cantidades exactos. Ningún modo copia notas, archivados, auditoría o cálculos. Valores
desde otra sucursal muestran advertencia destacada con ambos nombres y checkbox de
confirmación adicional. Cambiar origen/modo o generar nuevo preview retira consentimiento.

Confirmar protege contra doble envío y cambios concurrentes. Un 409 conserva modo/origen
y requiere preview nuevo; permite actualizar destino. Éxito abre la grilla y muestra
origen/modo temporalmente. Las acciones admiten teclado, foco, Escape y tablet. No hay
sobrescritura ni creación de períodos dentro de la confirmación. Permisos y corrección
de históricos inactivos mantienen sus reglas anteriores.

## Entrega EP-04C2: importar valores existentes

En un EERR inicializado, “Importar archivo” permite descargar CSV/XLSX, elegir
archivo, revisar errores/advertencias y valores actuales/nuevos, y confirmar.
La plantilla contiene todos los ítems activos, códigos estables e identificación
del EERR/estructura; las entradas editables se descargan vacías. No se admiten
.xls/.xlsm, fórmulas nativas ni mapeos por nombre. En XLSX, Instrucciones describe
el contexto y Carga distingue columnas informativas de las dos editables.

Editar solo importe_o_expresion y cantidad: vacío no modifica, cero es explícito y
SIN_CARGAR limpia valor/expresión. Cantidad es entero no negativo sin expresiones;
importe admite las expresiones exactas existentes escritas como texto sin =.
En XLSX, importe_o_expresion debe guardarse como Texto también para literales y
cero; una celda numérica se marca como error por fila y bloquea la confirmación,
porque la conversión a Number puede perder precisión. CSV conserva su semántica.
Los metadatos deben coincidir en todas las filas. No crea ni mueve categorías/ítems,
no modifica notas ni reimporta archivados. Una sola fila inválida impide todo cambio.

Cambios de valores anteriores al preview aparecen como valores actuales. Cambios
posteriores invalidan la confirmación completa. Un 409 conserva archivo y resumen;
se debe generar otro preview (o descargar plantilla nueva si cambió la estructura).
No se admite confirmación duplicada, aplicación parcial ni sobreescritura automática.
Los borradores manuales bloquean iniciar importación. Escape/cierre con archivo
pendiente pide confirmación; navegación protegida por el guard existente. Lector
solo descarga; Admin/Editor autorizado puede importar históricos inactivos.

## Entrega EP-04C3: completar pendientes

El menú general del EERR preparado ofrece “Completar pendientes con cero” a
Administrador/Editor asignado. El modal exige generar y revisar un preview antes
de “Completar con cero”. Informa sucursal/período, total activo, cargados, pendientes,
progreso antes/después y listado con bloque/ruta/ítem. Solo incluye los que cambiarán.

Carga 0,00 ARS en todos los importes activos SIN_CARGAR, sin crear expresión. No
modifica cantidades, notas, valores ya cargados, archivados ni estructura. No cierra
ni bloquea el período; las ediciones individuales siguen disponibles. Sin pendientes
informa que no hay cambios y deshabilita confirmar, sin escritura ni nueva revisión.

Borradores locales requieren guardarlos o descartarlos desde cada control, conservando
sus entradas al volver del modal. La confirmación usa la revisión del preview; ante
cualquier cambio concurrente devuelve 409 y mantiene el resumen para actualizarlo.
Envíos simultáneos/repetidos no duplican efectos. Escape/cancelar no escribe y queda
bloqueado durante una solicitud. Cantidades pendientes no impiden el 100 % monetario.

EP-04C2 fue validado manualmente por el usuario antes de comenzar EP-04C3.

## EP-05A.1: análisis básico disponible en la API

El análisis de un EERR existente devuelve subtotales de categorías, totales de
Ingresos, Costos y Gastos Generales, Margen Bruto y Resultado Neto en ARS y como
porcentaje de Ingresos. Selecciona bloques por código protegido y utiliza solo
importes guardados de ítems activos. Una categoría/bloque parcial muestra la suma
conocida marcada como parcial; las métricas entre bloques esperan a que todos sus
operandos estén completos. Sin ítems no equivale a cero, y un ingreso cero deja
indefinidos los porcentajes aunque los resultados monetarios sean válidos.

La respuesta es de solo lectura, identifica la revisión calculada, distingue
sin inicializar, vacío, pendiente, parcial, completo y denominador cero, y nunca
guarda cálculos derivados.

## EP-05A.2: cuadro de resultados en la interfaz

El workspace presenta antes de «Estructura y valores» un cuadro de solo lectura
para los tres roles autorizados. Contiene categorías y subcategorías históricas,
totales de Ingresos, Costos y Gastos Generales, Margen Bruto y Resultado Neto
en ARS y porcentaje. Los ítems permanecen en la grilla de carga. Estados vacíos,
pendientes, parciales y completos se expresan con texto y completitud local;
las métricas bloqueadas explican el motivo. El cero cargado se distingue del
valor ausente.

El cuadro muestra únicamente importes guardados y señala los borradores locales.
La revisión del análisis debe igualar la de la estructura visible antes de
mostrar resultados; actualización y errores del cuadro no impiden editar. Los
valores se formatean exactamente desde strings, sin cálculo financiero del cliente.
La tabla es accesible y se adapta a móvil sin ocultar los importes. Sin estructura
preparada se prioriza la inicialización. Punto de equilibrio y objetivo quedan
para EP-05B; dashboard, comparación y consolidación para EP-06.
