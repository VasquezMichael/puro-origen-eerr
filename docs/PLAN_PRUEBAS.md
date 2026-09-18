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
