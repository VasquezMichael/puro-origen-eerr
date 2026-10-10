# Dataset demostrativo integral del MVP

`demo-acceptance-v1` prepara exclusivamente los EERR de **CALLE 13, CALLE 50 y CALLE 59** para agosto y septiembre de 2026. Todos los importes son ficticios, netos de IVA y solo sirven para aceptación funcional. No son datos contables reales. El manifiesto versionado está en `apps/api/src/scripts/demo-dataset.manifest.ts`; contiene siete categorías globales y 18 ítems locales con códigos estables. Cada EERR recibe 28 nodos con `nodeId` propios, 18 importes cargados, una nota general, tres notas de ítem, cantidades donde corresponde y una meta. El motor de dominio valida expresiones, cantidades y estructura; el motor financiero calcula las cifras esperadas.

La herramienta no se ejecuta al iniciar API o web ni desde CI. Solo se usa de forma administrativa y explícita. No crea ni modifica sucursales, usuarios, permisos ni períodos ajenos. `plan` es la acción predeterminada y no escribe en MongoDB. Puede cargar internamente `apps/api/.env` para obtener `MONGODB_URI`, sin mostrarlo. El proceso oculta host y credenciales: muestra el nombre exacto de la base y una huella del cluster. La configuración de `apply` y `clean` debe entregarse por el entorno del operador; esas acciones no cargan `.env` automáticamente.

Desde `apps/api`:

```sh
npm run demo:dataset --workspace=api -- plan
```

El plan resuelve los nombres normalizados por coincidencia exacta, valida un administrador activo único y las fechas de inicio con el calendario `America/Argentina/Buenos_Aires`, y comprueba que no haya EERR ajenos compartiendo la plantilla global de agosto o septiembre. Muestra los seis IDs existentes o ausencias, revisiones, presencia de estructura/importes/notas/metas, acciones `CREATE`, `REPLACE` o `PRESERVE`, plantillas y conceptos afectados, recuentos, resultados y comparaciones del motor, registro de aplicación, advertencias y SHA-256 del estado leído. Si existen datos previos, `REPLACE` exige revisión humana del plan. No presume su origen a partir de su contenido. Para un EERR reemplazado se conserva `_id`, `createdAt` y `createdBy`; aumentan la revisión y `updatedAt`. La autoría de esta operación queda en `structure.initializedBy`, `salesGoal.updatedBy` y el registro administrativo: el esquema EERR no tiene `updatedBy` general.

Una ejecución futura de `apply` exige el `--plan-hash` recién emitido, el nombre exacto de la base y la frase **`APLICAR DATASET DEMO INTEGRAL`**. El plan imprime el comando hipotético completo. Se debe proporcionar `MONGODB_URI` de forma segura en el entorno, sin registrarlo en historial o archivos versionados. Antes de escribir genera y vuelve a leer una copia BSON Extended JSON local en `.local/demo-dataset-backups/`, ignorado por Git; comprueba su checksum. Revalida las fuentes dentro de una transacción con lectura snapshot y escritura `majority`; si cambiaron, aborta. En esa misma transacción registra en `eerr_demo_applications` el manifiesto, los seis IDs, huellas completas de los EERR/plantillas/conceptos y qué documentos estructurales existían antes. Este registro no cambia el modelo productivo. Una repetición sobre el mismo dataset y registro intactos es un no-op sin backup ni incremento de revisión. MongoDB debe admitir transacciones; si no, la carga falla sin aplicar parcialmente.

`clean` es una operación posterior, separada y no ejecutada en esta etapa. Exige plan actual, base exacta y frase **`ELIMINAR SEIS EERR DEMO`**. Solo acepta los seis IDs registrados por `apply` si las huellas completas de EERR, plantillas y conceptos siguen intactas; hace backup y los elimina en una transacción. Restaura las plantillas que existían antes de `apply`, elimina las plantillas nuevas y solo borra conceptos creados por `apply` que no estén referenciados por otro EERR o plantilla. Si aparece un EERR ajeno en esos meses, una fuente cambia o el contenido no coincide, aborta. No sustituye la eliminación funcional de EP-07.

Para una ejecución futura, revisar primero la salida de `plan`, identificar todos los `REPLACE` y guardar su hash. Con `MONGODB_URI` ya configurada de forma segura, ejecutar desde la raíz:

```sh
npm run demo:dataset --workspace=api -- apply --database <base-exacta> --plan-hash <hash-del-plan> --confirm "APLICAR DATASET DEMO INTEGRAL"
```

Verificar después con `plan`: los seis EERR deben quedar `PRESERVE`, el registro `application` debe indicar `registered: true, exact: true`, ambos meses deben estar completos y las cifras deben coincidir con la tabla de abajo. Guardar la ruta absoluta del backup devuelta por `apply`. Si algo difiere, detenerse sin repetir una aplicación de reemplazo. Para eliminar el dataset más adelante, obtener **un plan nuevo** y usar su hash:

```sh
npm run demo:dataset --workspace=api -- clean --database <base-exacta> --plan-hash <hash-actual> --confirm "ELIMINAR SEIS EERR DEMO"
```

Verificar con otro `plan` que los seis EERR estén ausentes y no haya registro de aplicación. Las plantillas previas y conceptos compartidos pueden permanecer deliberadamente; comprobarlos antes del go-live.

La copia previa a cada operación contiene los documentos EERR, plantillas, conceptos y el registro administrativo alcanzados en Extended JSON, incluidos Decimal128 y fechas. En un fallo transaccional no se requiere restauración: MongoDB revierte el lote. Ante un problema posterior, detener la operación y conservar el archivo. El comando de contingencia `npm run demo:restore --workspace=api -- --backup <ruta-del-backup> --database <base> --plan-hash <hash-actual> --confirm "RESTAURAR BACKUP DATASET DEMO"` requiere `MONGODB_URI` entregado por el entorno seguro. Exige un plan actual, base/cluster coincidentes y estado exactamente posterior a `apply` o `clean`; restaura dentro de una transacción o aborta. La ruta debe estar dentro del directorio controlado e ignorado. Esta recuperación es supervisada y no sustituye una evaluación de cambios legítimos posteriores. La ejecución real de `clean` y la verificación de base vacía son obligatorias antes de poner el MVP en producción. Una base con otros EERR fuera de este dataset requiere evaluación independiente; esta herramienta jamás los elimina.

Antes del go-live, ejecutar `clean` bajo control operativo, comprobar que no quedan EERR demo, revisar plantillas/conceptos preservados y verificar por separado que la base destinada a producción no contiene otros datos de prueba. Conservar o destruir los backups conforme a la política operativa aplicable; nunca versionarlos. La limpieza administrativa de este dataset no implementa la eliminación funcional de EP-07.

## Resultados esperados

Los importes se expresan en ARS. `Objetivo` es la venta mínima calculada por el motor, no una cifra persistida. La meta porcentual de CALLE 13 es intencionalmente inalcanzable; el motivo esperado es `TARGET_MARGIN_UNATTAINABLE`.

| Sucursal | Mes | Ingresos | Costos | Gastos generales | Resultado neto | Objetivo |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| CALLE 13 | ago | 1.100.031,75 | 500.200,50 | 459.400,00 | 140.431,25 | No calculable |
| CALLE 13 | sep | 1.270.012,90 | 680.166,00 | 474.550,00 | 115.296,90 | No calculable |
| CALLE 50 | ago | 1.300.045,85 | 538.888,80 | 587.000,00 | 174.157,05 | 1.310.025,53 |
| CALLE 50 | sep | 1.340.019,20 | 553.940,45 | 591.700,00 | 194.378,75 | 1.332.554,80 |
| CALLE 59 | ago | 1.800.015,70 | 729.900,00 | 690.300,00 | 379.815,70 | 1.749.794,20 |
| CALLE 59 | sep | 2.100.039,25 | 827.165,00 | 696.400,00 | 576.474,25 | 1.803.587,81 |
| Consolidado | ago | 4.200.093,30 | 1.768.989,30 | 1.736.700,00 | 694.404,00 | No aplica |
| Consolidado | sep | 4.710.071,35 | 2.061.271,45 | 1.762.650,00 | 886.149,90 | No aplica |

Entre agosto y septiembre, CALLE 13 vende más pero cae su resultado; CALLE 50 crece levemente y CALLE 59 mejora con fuerza. El ingreso consolidado aumenta 509.978,05 y el resultado neto 191.745,90. Las comparaciones exactas por sucursal, entre sucursales y del consolidado se emiten en `plan` mediante `compareMetricValues` y `aggregateEerr`; no se recalculan con fórmulas del script.

## Riesgos operativos

- Las plantillas de categoría son globales por período. El plan bloquea otros EERR en agosto o septiembre; verificar su ausencia y revisar los reemplazos identificados.
- Los códigos del manifiesto deben seguir libres o coincidir exactamente con el catálogo esperado. No reusar este dataset sobre una base distinta sin nuevo plan.
- El backup puede contener datos previos del negocio. Mantenerlo privado, fuera de Git; no enviarlo a logs, tickets ni PR.
- Para restauración posterior a una aplicación ya comprometida se necesita una intervención supervisada con el backup y un nuevo control de concurrencia. Nunca sobrescribir cambios legítimos aparecidos después.

## Matriz de verificación aislada

| Regla | Cobertura |
| --- | --- |
| Manifiesto de tres sucursales y dos meses, códigos, seis estructuras completas, importes exactos, expresiones, cantidades, ceros, notas y metas | `demo-dataset.spec.ts` valida estructura y resultados con dominio/motor. |
| Comparaciones mensuales, entre sucursales y consolidado | `demo-dataset.spec.ts` comprueba importes y diferencias del motor. |
| Plan sin escrituras ni secretos en salida; coincidencia exacta, ausencia/ambigüedad de sucursal, período ilegal y EERR ajeno | `demo-dataset.integration.ts` usa un replica set local y un reloj fijo. |
| Confirmaciones distintas, base y hash; revalidación de fuentes; backup legible previo a escritura | `demo-dataset.integration.ts` prueba rechazos, cambios entre plan/apply y lectura de backup. |
| Reemplazo con ID/creación preservados, seis IDs registrados, no-op, rollback total | `demo-dataset.integration.ts` inspecciona documentos reales y provoca un fallo dentro de la transacción. |
| Clean limitado a seis IDs registrados, bloqueo tras edición, plantillas previas y conceptos compartidos, usuarios/sucursales intactos | `demo-dataset.integration.ts` inspecciona el estado anterior y posterior en MongoDB local. |
| Restore de backups de apply y clean con confirmación distinta | `demo-dataset.integration.ts` verifica ambas recuperaciones en transacción. |

Estas pruebas no conectan a Atlas ni cargan `apps/api/.env`. `npm run check` ejecuta solo las unitarias; la integración requiere indicar un binario `mongod` local mediante `MONGOD_BINARY` y ejecutar `npm run test:integration:structure --workspace=api`.
