# Plan de pruebas del EERR

## EP-04B1: aislamiento y comandos

`npm run check` verifica tipos, lint, pruebas y build sin .env real, AppModule,
bootstrap ni MongoDB. Pruebas deterministas con fechas fijas y datos ficticios.
No se modifica la zona horaria global ni se usa Atlas. Node 24; dependencias ya
instaladas, sin nuevas bibliotecas ni cambios al lockfile.

| Capa | Cobertura |
| --- | --- |
| Dominio, money-expression.test.mjs | Literales, coma/punto, espacios, precedencia, paréntesis, asociatividad, cuatro operaciones, unarios, racionales sin redondeo intermedio, HALF_UP y límites exactos |
| Dominio, expresiones rechazadas | División por cero, sintaxis incompleta, paréntesis, texto/código, exponentes, miles, negativos finales, máximo, longitud, tokens, profundidad y tamaño de literal |
| Dominio, eerr-fields.test.mjs | Cantidades enteras/cero/ausencia, negativos/fracciones/texto/exponentes/rango, independencia del progreso; notas con saltos, trim, vacío y límites |
| HTTP con guard y servicios reales | Recalcular expresión y rechazar resultado del cliente; cero/limpieza; cantidad independiente; notas crear/editar/eliminar/localidad; UUID/revisión/campos extra |
| Permisos HTTP | Administrador, Editor asignado, Editor ajeno y Lector en cada uno de los cuatro campos, incluyendo histórico inactivo |
| Concurrencia HTTP | 409 por revisión obsoleta para importe, cantidad y ambas notas; conserva dato persistido y oculta detalles internos |
| Compatibilidad | GET legado sin escrituras; ausencia de expresión/cantidad/notas; renombrar conserva importe y no agrega los nuevos campos; nota general sin preparar estructura |
| Esquemas | Construcción real en Vitest sin metadatos, String explícito de cantidades/notas, Decimal128, conversión y validación sin conexión |
| Smoke Node | Carga ESM real del repositorio, servicio y controlador compilados, además de los servicios anteriores |
| Web reducer | Borradores separados por campo; error/409 y recarga conservan todos; guardar limpia solo el confirmado |

El caso previo de rechazo de `1+2` se actualiza a `1+`: las expresiones ahora son
válidas. Las pruebas de normalizeMoney mantienen su contrato de literal estricto;
la nueva evaluación usa evaluateMoneyExpression y comparte rationalMoney.

## Integración MongoDB local opcional

`npm run test:integration:structure --workspace=api` requiere MONGOD_BINARY como
ruta absoluta a un mongod local. La prueba lanza su propio replica set temporal
en loopback, no acepta URI externa y cierra/elimina únicamente sus recursos.
No forma parte del CI sin MongoDB. Mantiene las cuatro pruebas de EP-04A y agrega:

- Expresión original + Decimal128, cantidad exacta máxima y notas multilínea;
  eliminación real con ausencia de campos, preservando identidad/importe/createdAt.
- Carrera determinista entre nota general y edición de snapshot, con barrera
  antes de ambas escrituras: solo una gana y la otra recibe 409 del mismo CAS.

## Mutaciones manuales

Se altera una regla a la vez, se exige fallo de aserción y se restaura el archivo
original antes de continuar. Se recompila dominio tras restaurarlo. Casos:

1. HALF_UP convertido en comparación estricta.
2. Máximo monetario desactivado.
3. Precedencia alterada.
4. División por cero convertida en cero válido.
5. Límite de profundidad desactivado.
6. Límite de tokens desactivado.
7. Cantidad negativa admitida.
8. Longitud de notas desactivada.
9. Progreso monetario calculado desde cantidades.
10. Permiso de escritura de Editor desactivado.
11. CAS retirado de las escrituras reales del repositorio (integración local).
12. Recarga de web borrando borradores.

Las doce mutaciones fueron detectadas y restauradas. La de CAS se comprobó
mediante fallos de aserción con dos escrituras ganadoras; no se contabilizó como
detección un intento anterior que falló por la configuración temporal de conexión.

Resultado local: 306 pruebas normales aprobadas (170 API/Vitest, 6 smoke ESM,
124 dominio y 6 web), 132 más que la base; además 6 de integración MongoDB local
(2 nuevas). Sin omitir ni desactivar controles.

## Interfaz y validación manual

Smoke local en navegador aislado sobre build de producción, con toda respuesta
de API interceptada y datos ficticios. Verificar escritorio y tablet, incluyendo
1440, 1024, 768, 480 y 360 px: preview, errores cercanos, compatibilidad sin input,
cantidad opcional, notas desplegables, 409 y recarga con cuatro borradores, guardado,
cero/limpieza, consulta de Lector, ausencia de superposición/desborde y foco visible.
Los PUT de esa verificación solo actualizan fixtures del proceso de prueba.

La validación funcional real de EP-04A ya fue confirmada por el usuario. Para
EP-04B1 queda la validación manual posterior del usuario con su entorno y tablet
física; no se usan ni cambian los EERR reales de agosto/septiembre durante desarrollo.
No se prueba ni implementa clonación, movimientos, auditoría completa o EP-05/06.


## EP-04UX: grilla, overlays y borradores

Pruebas normales: workspace.test.mjs renderiza componentes React reales mediante
react-dom/server y un loader local de TSX (TypeScript ya instalado). Solo CSS se
sustituye por nombres de clases para SSR; no se simulan componentes ni dominio.
Cubre jerarquía/plegado/profundidad, capacidades por tipo/rol, cambios explícitos,
preview exacto, errores y bloqueo de guardado, cero/SIN_CARGAR, cantidad sin ARS,
notas, semántica de overlays, navegación real y conservación de formularios.
El render no ejecuta efectos; las interacciones se comprueban en navegador.

Smoke reproducible opcional: test/workspace.browser.mjs. Requiere Playwright y
Chromium instalados fuera del repositorio; no agrega dependencias del producto.
Con la web compilada en http://127.0.0.1:3100 y sin iniciar la API:

```powershell
$env:PLAYWRIGHT_MODULE = '<ruta absoluta a playwright/index.mjs>'
$env:BROWSER_BINARY = '<ruta absoluta al ejecutable Chromium>'
node apps/web/test/workspace.browser.mjs
```

Intercepta toda llamada API con fixtures; aborta cualquier destino externo no
esperado. Nunca importa AppModule, lee .env, ejecuta bootstrap ni usa Atlas.
Verifica 1440×900, 1280×720, 1024×768, 768×1024 y 390×844. Incluye:

- Plegado, sangría multinivel, textos largos y ausencia de escrituras al montar.
- Edición por Enter, preview, error local y guardado explícito.
- Borradores de cuatro campos y nombres al cerrar/reabrir, errores y 409.
- Conflictos dentro de renombrado y publicación, recarga y nuevo preview.
- Envío único, bloqueo de cierre durante escritura y restauración del foco.
- Todos los modales, notas multilínea, menús por teclado y top layer sin recortes.
- Administrador, Editor, Lector y acceso rechazado; preparación explícita.
- Geometría sin desbordes ni controles superpuestos y capturas en carpeta temporal.

El CI normal sigue sin navegador/MongoDB y ejecuta las pruebas de render y estado.
El smoke del navegador se ejecuta localmente contra el build de producción.
La validación funcional de EP-04A/EP-04B1 fue confirmada por el usuario. Queda
para el usuario la evaluación del nuevo diseño en su tablet física y flujo real.

Resultado EP-04UX: 332 pruebas normales aprobadas (170 API, 6 smoke ESM,
124 dominio y 32 web; 26 nuevas), más smoke real en los cinco tamaños.
Nueve mutaciones manuales detectadas por fallos de aserción y restauradas:
plegado desactivado, profundidad anulada, menú de Lector habilitado, detección
de cambios anulada, guardado habilitado con expresión inválida, guardado
habilitado con conflicto, controles de edición para Lector, cierre habilitado
durante escritura y recarga que elimina borradores. Las pruebas web se vuelven
a ejecutar sobre los originales restaurados.

## EP-04UX.1 — lectura, archivo recuperable y borradores

- Dominio: legacy activo, archivo de cargados/pendientes fuera del progreso,
  reinclusión al restaurar, metadata inválida rechazada, bloques no archivables,
  publicación global conserva estado e identidad.
- HTTP aislado: Administrador/Editor/Lector/ajeno sobre históricos inactivos;
  archivo/restauración preservan valores, timestamps y otros EERR; GET sin escritura;
  restricciones ITEM, UUID, revisión/campos extra, transiciones repetidas, padre
  faltante; edición de archivados rechazada en nombre/importe/cantidad/nota;
  conflictos de archivo/archivo, archivo/importe y restauración obsoleta.
- Esquema Mongoose construido sin metadatos reflectivos ni conexión: tipos de
  archive y serialización histórica/nueva. Smoke real de módulos compilados vigente.
- Integración opcional con replica set efímero exclusivamente loopback: nueve casos,
  incluidos actualización parcial BSON/timestamps y CAS con barrera entre escrituras.
  No admite URI externa ni AppModule; requiere MONGOD_BINARY local.
- Web unitario: jerarquía resultado/expresión, legacy sin expresión inventada,
  cero/Sin cargar, input ausente al consultar, preview/errores, cantidad,
  expresión larga desplegable, archivados fuera de grilla, permisos y CANCEL aislado.
- Navegador Chromium real con todas las respuestas API interceptadas: cinco tamaños
  1440×900, 1280×720, 1024×768, 768×1024 y 390×844. Verifica edición/foco, Enter/Escape,
  cancelación sin escritura, ausencia de blur autosave, errores/409 y borradores,
  categorías globales, notas, cantidad, permisos, archivo/restauración/listado,
  doble envío, foco y geometría de overlays. Verifica modal de navegación interna,
  continuar/descartar, beforeunload condicionado y retiro al limpiar. Capturas en TEMP.
  Comando: `node apps/web/test/workspace.browser.mjs`, con PLAYWRIGHT_MODULE y
  BROWSER_BINARY locales; web aislada en 127.0.0.1:3100. No arranca API ni usa Atlas.

La validación visual con fixtures no sustituye la aceptación funcional manual del
usuario ni la revisión en dispositivos/navegadores finales. El texto y la aparición
de beforeunload dependen del navegador (incluido cierre forzado de móviles).
No se modifican datos reales, el ítem real Digitales ni el administrador; sin bootstrap.

Verificación del incremento: `npm run check` aprobó 359 pruebas (188 API Vitest,
6 cargas reales de módulos compilados, 129 dominio y 36 web), además de nueve
integraciones MongoDB efímeras y los cinco recorridos completos en Chromium.
Se detectaron y restauraron ocho mutaciones manuales: incluir archivados en progreso,
incluirlos en grilla, Cancelar borrando todos los borradores, inputs siempre visibles,
omitir permiso de archivo, permitir editar archivados, quitar CAS del repositorio y
alterar timestamps al archivar. Las fallas fueron aserciones de comportamiento,
no errores de compilación. La recarga nativa con borrador también se verificó en
navegador: muestra beforeunload y cancelar conserva la entrada.

## EP-04UX.2: navegación, sesión y Dashboard

- Unitarias `navigation.test.mjs`: roles global/por sucursal/mixtos, destinos
  autorizados, un único shell, aria-current, menú accesible, saludo y accesos,
  ausencia de modos/métricas ficticias, login y contraseña temporal sin shell.
- Chromium `navigation.browser.mjs`: los cinco tamaños 1440×900, 1280×720,
  1024×768, 768×1024 y 390×844. Sesión válida/inválida en todas las rutas,
  login/logout, Dashboard sin escrituras, ambas perspectivas/contexto EERR,
  workspace único, roles Editor/Lector, URL administrativa protegida, altas,
  edición/fecha, error de duplicado y desactivación/reactivación simuladas.
- Borradores: tres destinos laterales, continuar conservando texto, descartar,
  un beforeunload, Atrás/Adelante sin entradas artificiales, logout confirmado
  y fallo de logout con conservación. Menú responsive, Escape y retorno del foco.
- Se repite `workspace.browser.mjs` para preservar toda la regresión de carga,
  conflictos, archivo/restauración, modales, permisos y geometría de EP-04UX.1.
- Ambos scripts requieren PLAYWRIGHT_MODULE y BROWSER_BINARY locales y una web
  aislada en 127.0.0.1:3100. Interceptan todas las solicitudes de API con fixtures;
  ninguna inicia Nest, utiliza .env, bootstrap o MongoDB. Capturas `ep04ux2-*`
  quedan en TEMP. No forman parte del CI unitario sin navegador instalado.

La revisión en Chromium con fixtures no reemplaza la aceptación del usuario con
sus dispositivos finales. La confirmación de recorridos SPA requiere Navigation
API; el aviso nativo de salida depende del navegador. No se modifica la zona
horaria global del proceso de pruebas ni se usan datos financieros de producción.

Mutaciones manuales detectadas por aserciones y restauradas: mostrar navegación
administrativa a todos, alterar Editor por Lector, retirar aria-current, exponer
el acceso rápido administrativo y reintroducir la tarjeta/texto Modo Editor.

Resultado local EP-04UX.2: `npm run check` aprobó 368 pruebas (188 API,
6 cargas de módulos compilados, 129 dominio y 45 web; nueve unitarias nuevas),
tipos, lint y compilación de API/web. Los dos recorridos Chromium aprobaron
los cinco tamaños; no se ejecutó integración MongoDB en este incremento visual.

## EP-04B2

Pruebas de dominio: orden estable, normalización activa, no-op con posiciones históricas,
raíces protegidas, ciclos, profundidad de subárbol, categorías con ítems intercalados,
conservación de datos, restauración acotada y padre ausente. HTTP: DTO estricto, permisos,
CAS, alcance local/global, preview sin cambios, revisiones ajenas, incoherencia y rollback.
MongoDB efímero exclusivamente loopback: BSON preservado, CAS real concurrente entre
movimiento/renombre/archivo, rollback multi-EERR y restauración sin posiciones duplicadas.
No usa AppModule, .env, Atlas ni bootstrap.

Interfaz: acciones por posición/rol, destinos filtrados, preview separado, selección
preservada ante 409 y recarga, borradores relacionados/ajenos y destinos desaparecidos.
Smoke de navegador con API interceptada en 1440×900, 1280×720, 1024×768, 768×1024 y
390×844; se verifica movimiento, preview, confirmación, error, foco, Escape y desbordes.
Los scripts opcionales usan PLAYWRIGHT_MODULE y BROWSER_BINARY y servidor web aislado
en 127.0.0.1:3100. No iniciar API ni usar datos reales. Las suites previas de workspace
y navegación conservan cobertura de carga, notas, archivo, Dashboard y shell.

Validación ejecutada de EP-04B2: los tres smoke de navegador (movement, workspace y
navigation) pasaron en los cinco tamaños y se inspeccionaron capturas reales. Siete
mutaciones fueron detectadas y revertidas: permitir cruce de bloques, escribir no-op
en dominio y API, incluir archivados en hermanos activos, perder lugares de categorías,
restaurar siempre al final y omitir revisiones globales. Capturas y logs sintéticos
permanecen en el directorio temporal local; no contienen datos reales. La validación
con usuarios y dispositivos físicos permanece como comprobación manual posterior.

## EP-04C1

Dominio eerr-clone: identidades nuevas/códigos estables, mapeo de parentesco, valores
positivos/cero/SIN_CARGAR, expresiones consistentes y legado sin expresión, cantidades,
exclusión de notas/archivo/auditoría, independencia, semilla y plantilla autoritativa
con categorías adicionales/nombres/orden distintos; incompatibilidades de códigos,
parentesco, ciclos y posiciones. Normaliza activos tras excluir archivados.

HTTP aislado con guard real: listado ordenado y filtrado, ambos modos, ausencia de
escrituras en preview, destinos parciales/editados, permisos, históricos inactivos,
consentimiento entre sucursales, tokens ligados/vencidos, cambios de origen/destino/
plantilla, doble confirmación y rollback. Token usa clave ficticia y reloj fijo. Se
mantienen construcción real de esquemas y smoke de módulos ESM compilados por Nest.

Integración opcional `npm run test:integration:structure --workspace=api`: replica set
MongoDB efímero en loopback, sin URI externa. Clonación en ambos modos, Decimal128,
createdAt preservado/updatedAt nuevo, origen intacto, rollback después de plantilla y
snapshot, dos confirmaciones, origen cambiado, plantilla cambiada e inicialización
base competidora. No importa AppModule, no lee .env ni ejecuta bootstrap.

Web unitario: tres opciones y elegibilidad, preview/alcance/exclusiones, consentimiento,
bloqueo por incompatibilidad/carga y borradores. Smoke `clone.browser.mjs` en Chromium
real con API interceptada: creación separada y navegación a inicialización, selección
preferente, errores, incompatibilidad, advertencia, checkbox, 409, nuevo preview,
envío único, grilla final, permisos, foco y geometría. Tamaños: 1440×900, 1280×720,
1024×768, 768×1024, 390×844. Requiere PLAYWRIGHT_MODULE, BROWSER_BINARY y web aislada
en 127.0.0.1:3100, sin API real. Capturas sintéticas en TEMP: ep04c1-<ancho>-<escena>.png.
Se repiten workspace, movement y navigation para regresión de funcionalidades previas.
La verificación con fixtures no reemplaza aceptación del usuario en dispositivos físicos.

Validación EP-04C1: cuatro smoke de Chromium aprobados en los cinco tamaños (20
escenarios), con inspección de capturas de selección, preview, incompatibilidad,
error y 409. Se corrigió el retorno de foco al cerrar la clonación. Nueve mutaciones
detectadas por aserciones y revertidas: copiar archivados, copiar valores en modo
estructura, reutilizar nodeId, aceptar expresión inconsistente, ignorar parentesco
de plantilla, omitir consentimiento entre sucursales, ignorar actor del token,
permitir clonación sin Editor y habilitar confirmación de preview incompatible.
Los logs y las capturas sintéticas quedan en TEMP; no se versionan datos reales.

Cierre local: npm run check aprobó 510 pruebas (265 API, 9 cargas ESM, 174 dominio,
62 web), con 79 casos nuevos; además 21 integraciones MongoDB locales (7 nuevas).
Tipos, lint y builds aprobados; git diff --check y revisión de secretos sin hallazgos.
No se usaron .env real, Atlas ni bootstrap y no se agregaron dependencias.

## EP-04C2 — importación CSV/XLSX

Pruebas nuevas de dominio: semántica vacío/cero/SIN_CARGAR, parser monetario exacto,
cantidad, rangos, códigos, duplicados, archivo, identidad y límites. API aislada:
descarga/reapertura, CSV escapado/BOM/UTF-8, XLSX importe textual y rechazo de
todo importe numérico por fila, cantidad numérica válida, fórmulas/cache, macros,
DTD, coordenadas esparsas, ZIP expandido, metadatos, multipart, permisos, preview,
concurrencia, token/actor/archivo/expiración y preservación de notas. Runtime ESM
carga los tres componentes Nest compilados sin AppModule ni conexión.

Ocho integraciones nuevas en réplica MongoDB efímera loopback: Decimal128 y campos
exactos, rollback tras escritura, competencia/reintento, archivo/movimiento/valores
entre preview y confirmar, CAS de repositorio y bloqueo completo por fila inválida.
Ejecutar `npm run test:integration:structure --workspace=api` con MONGOD_BINARY local.

`apps/web/test/import.browser.mjs` usa Chromium y API interceptada con fixtures: cinco
tamaños 1440×900, 1280×720, 1024×768, 768×1024, 390×844; descargas reales reabiertas
por el lector CSV/XLSX, preview válido/inválido, 409 conservado, descarte, foco,
envío único, actualización y Lector. Sin API real, secretos ni Atlas. Capturas
en TEMP `ep04c2-<ancho>-<escena>.png`; inspección visual de escritorio y móvil.
Se mantiene pendiente aceptación del usuario en Excel/LibreOffice de escritorio
y dispositivos físicos: reapertura automatizada no equivale a esa aceptación.

Once mutaciones deliberadas detectadas y revertidas: matching por nombre, vacío
como limpieza, cero ignorado, confirmación parcial, omisión del CAS, fórmula
cacheada aceptada, nota sobrescrita, archivado permitido, omisión de permisos,
identidad estructural ignorada y límite de entrada omitido. Se reforzó la aserción
de operación explícita para cero; las pruebas fallan ante esa regresión.

Cierre local EP-04C2: npm ci y npm run check aprobados; 626 pruebas (330 API,
12 cargas ESM, 213 dominio y 71 web), 116 nuevas. Integración local: 29 casos,
ocho nuevos. Cinco suites Chromium en cinco tamaños: 25 escenarios aprobados.
Lint final sin advertencias nuevas, tipos/builds/formato/diff y revisión de secretos
aprobados. No se ejecutó bootstrap ni se inició una API contra Atlas. Durante la
reinstalación se detectó y detuvo un npm run dev preexistente que bloqueaba archivos;
no se reinició ni se inspeccionó su configuración. Las pruebas usaron solo fixtures
y MongoDB efímero local; no permiten certificar la actividad previa de ese servidor.

## EP-04C3 — completar importes pendientes

Dominio: selección íntegra por estado activo, exclusión de cargados/ceros/archivados,
rutas/orden, plan puro, 0.00 sin expresión, cantidades ausentes/intactas, no-op y
progreso. HTTP real aislado: guard/DTO, roles e históricos, contexto, no escritura
en preview, preservación de campos, revisión, tokens ligados/expirados/de otra
operación, doble confirmación, rollback y bloqueo de selecciones cliente.

Integración MongoDB efímera: lote Decimal128, preservación completa del BSON ajeno
a la operación, rollback después de escritura, CAS y carrera real, cambios de
importe/movimiento/archivo, no-op, edición posterior con expresión y vuelta a
SIN_CARGAR. Reutiliza el runner local con limpieza de procesos/directorio. No usa
AppModule, .env, bootstrap, Atlas ni datos reales. Esquemas reales se construyen
durante Vitest; dos nuevas cargas ESM de servicio/controlador compilados.

Web SSR: advertencias, resumen/progreso/lista, bloqueo por borradores, conflicto,
envío/no-op/token ausente. `test/complete-pending.browser.mjs` recorre en Chromium
1440×900, 1280×720, 1024×768, 768×1024 y 390×844 con API interceptada: borrador
conservado, preview/409/nuevo preview, cancelación, envío único, no-op, grilla/progreso,
cantidades, permisos, foco, Escape y geometría. Requiere PLAYWRIGHT_MODULE,
BROWSER_BINARY y web compilada aislada en 127.0.0.1:3100, sin API. Capturas sintéticas
en TEMP ep04c3-<ancho>-<escena>.png. Queda aceptación manual en dispositivos finales.

Once mutaciones detectadas y restauradas: incluir archivados, cambiar cantidades,
sobrescribir expresiones existentes, inventar input "0", omitir CAS, aplicar lote
parcial, escribir no-op, permitir Lector, introducir cierre persistido, borrar
borradores al recargar y alterar progreso. Fallaron pruebas de comportamiento;
la de cierre agregó temporalmente un campo al esquema y al update para comprobar
que la preservación completa del documento detecta esa ampliación indebida.

Cierre local EP-04C3: npm run check aprobado con 675 pruebas (360 API, 14 cargas
ESM, 222 dominio y 79 web), 49 nuevas. Integración MongoDB efímera: 37 aprobadas,
ocho nuevas. Regresión Chromium de completar pendientes, carga manual e importación:
15 escenarios aprobados en los cinco tamaños; capturas de escritorio y móvil revisadas.
Las once mutaciones fueron restauradas antes del check y la integración finales.
Tipos, lint, compilación, diff y revisión de secretos aprobados; sin dependencias nuevas.
.env sigue ignorado y no se leyó. No se ejecutó bootstrap, API contra Atlas ni
operaciones sobre administrador/datos reales. Permanece la aceptación visual manual.

## Corrección H-01 — precisión de importes XLSX

La regresión XLSX comprueba que importes numéricos 0, enteros, decimales y el
literal XML `0.004999999999999999999` producen error por fila/campo sin plan de
`0.01`. Los mismos importes como texto, expresiones, cero, SIN_CARGAR y vacío
conservan su semántica. La plantilla abre nuevamente con columna F en formato
Texto; fórmulas siguen bloqueadas. Cantidades numéricas enteras en rango y CSV
siguen admitidos. Una integración en MongoDB local efímero verifica que el
preview con un importe numérico rechaza todo el lote sin cambiar ítems ni revisión;
otra conserva como Decimal128 el resultado exacto del literal textual largo.

Una mutación deliberada que vuelve a convertir la celda numérica mediante
`String(value)` hace fallar la prueba del literal largo y se restaura. El smoke
Chromium comprueba el mensaje de corrección, el archivo retenido, reemplazo y
confirmación bloqueada en cinco tamaños. La aceptación manual en Excel/LibreOffice
y dispositivos finales permanece pendiente.

## EP-05A.1 — motor y API de análisis

Pruebas puras del paquete con node:test: tres bloques, árbol multinivel, ítem
directo, subtotal padre sin duplicación, orden e identidades, archivo, metadata
irrelevante, histórico sin expresión, cuatro estados de ámbito, completitud,
dependencias de cada KPI, negativos, cero denominador, porcentaje periódico y
redondeo simétrico, máximo individual/agregado, snapshot inválido, ausencia de
mutación y determinismo. HTTP aislado: guard real, roles, histórico inactivo,
404/400/401, EERR sin inicializar, contrato/revisión, Decimal128 y 500 estable.
La carga ESM compilada cubre servicio y controlador nuevos.

La integración MongoDB efímera existente agrega lecturas antes/después de edición,
cero, limpieza, archivo/restauración, importación y completar pendientes; comprueba
Decimal128, revisión y GET sin escrituras. Usar exclusivamente el runner local con
MONGOD_BINARY; nunca Atlas ni AppModule. EP-05A.2 añadirá pruebas web y navegador.

En EP-05A.1 se ejecutaron diez mutaciones manuales compilables, detectadas y
restauradas: selección equivocada por nombre de bloque, pendiente como completo,
inclusión de archivados, duplicación del total, conversión del agregado a Number,
límite individual aplicado al agregado, KPI parcial, gasto pendiente bloqueando
Margen Bruto, ámbito vacío como completo y redondeo porcentual anticipado.

## EP-05A.2 — cuadro web

Pruebas web deterministas cubren orden, jerarquía, subtotales sin duplicación,
estados y motivos, cero explícito, signos y números mayores al entero seguro,
redondeo porcentual HALF_UP simétrico y exclusión de funciones diferidas. La
prueba de navegador con API simulada debe cubrir lectura completa/parcial, vacío,
error y reintento, revisión coincidente y divergente, guardado, borradores y
Lector. Revisar 1440×900, 1280×720, 1024×768, 768×1024 y 390×844, con
capturas y comprobación de desbordes. No requiere .env ni conexión a MongoDB.

En EP-05A.2 se detectaron y restauraron nueve mutaciones manuales: cálculo en
frontend, conversión monetaria a Number, nulo como cero, margen parcial,
aceptación de respuesta antigua, revisión ignorada, pérdida de borradores,
cuadro oculto al Lector y estado expresado sin texto. Las pruebas de navegador
utilizan exclusivamente respuestas simuladas; resta aceptación visual manual
con datos de negocio.
