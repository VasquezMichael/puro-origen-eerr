# Flujo de releases y ambientes — Gestión EERR

## 1. Objetivo

Este documento define el proceso de desarrollo, validación y despliegue de la aplicación Gestión EERR de Puro de Origen.

El objetivo principal es mantener separados los datos de prueba de los datos reales y evitar que una actualización llegue a producción sin haber sido previamente validada.

---

## 2. Ambientes

### Demo / Staging

Ambiente destinado a pruebas funcionales y validación de nuevas versiones.

Características:

- utiliza información ficticia;
- contiene sucursales y EERR de ejemplo;
- actualmente incluye información de agosto y septiembre de 2026;
- puede utilizarse libremente para probar nuevas funcionalidades;
- los cambios deben validarse aquí antes de pasar a producción;
- ningún dato de este ambiente debe considerarse información contable real.

Base de datos:

`puro_origen_eerr_demo`

La infraestructura y credenciales de MongoDB de este ambiente deben mantenerse separadas de producción.

---

### Producción

Ambiente oficial utilizado por los usuarios del sistema.

Acceso:

`https://app.purodeorigen.com`

API:

`https://api.purodeorigen.com`

Base de datos:

`puro_origen_eerr_prod`

Características:

- contiene exclusivamente información real;
- comenzó sin sucursales ni EERR precargados;
- la información se crea desde la aplicación;
- no debe cargarse el dataset utilizado en Demo;
- los despliegues son manuales;
- Auto-Deploy debe permanecer desactivado.

La versión inicial puesta en producción es:

`v1.0.0`

---

## 3. Flujo de trabajo

Toda modificación funcional o corrección debe seguir el siguiente circuito:

`desarrollo → PR → merge a main → deploy en Demo → validación → tag de release → deploy manual a Producción`

### 3.1 Desarrollo

Cada cambio debe realizarse en una rama independiente.

Ejemplos:

`feature/nueva-comparacion`

`fix/calculo-objetivo`

`chore/actualizar-dependencias`

Durante esta etapa se realizan:

- implementación;
- tests;
- validaciones técnicas;
- revisión de comportamiento local.

---

### 3.2 Pull Request

Cuando el cambio está terminado, se abre un Pull Request hacia `main`.

Antes del merge se debe comprobar:

- tests correctos;
- build correcto;
- ausencia de cambios accidentales;
- compatibilidad con funcionalidades existentes;
- impacto sobre datos y persistencia;
- cualquier cambio de configuración o infraestructura necesario.

---

### 3.3 Merge a `main`

Una vez aprobado el PR, se integra a `main`.

`main` representa el código candidato a convertirse en la próxima versión, pero un merge no implica automáticamente un despliegue a producción.

Producción debe mantener `Auto-Deploy` desactivado.

---

### 3.4 Deploy en Demo

La versión de `main` se despliega primero en el ambiente Demo / Staging.

Allí se realizan pruebas usando los datos ficticios existentes.

Dependiendo del cambio, se deben revisar:

- login y sesión;
- lectura y edición de EERR;
- cálculos;
- dashboard;
- comparaciones;
- consolidado;
- metas;
- exportación PDF;
- exportación XLSX;
- usuarios y permisos;
- comportamiento responsive;
- consola y errores de red.

No todos los puntos son obligatorios para cada cambio. La validación debe concentrarse en las áreas afectadas y en los flujos críticos relacionados.

---

## 4. Validación

Una versión puede avanzar a producción únicamente cuando el comportamiento esperado haya sido validado en Demo.

Si durante la validación aparece un problema:

`Demo → nueva corrección → PR → main → nuevo deploy Demo`

No se corrige directamente sobre Producción.

---

## 5. Creación de release

Una vez aprobada la versión en Demo se crea un tag.

Ejemplos:

`v1.0.1`

`v1.1.0`

`v2.0.0`

Como criterio general:

- `v1.0.1`: corrección o ajuste menor;
- `v1.1.0`: nueva funcionalidad compatible;
- `v2.0.0`: cambio estructural o funcional importante.

El tag identifica exactamente qué commit fue aprobado para producción.

Producción debe desplegar siempre un commit/tag identificado y validado, no simplemente “la última versión de main”.

---

## 6. Deploy a Producción

El despliegue productivo se realiza manualmente desde Render.

Antes del deploy verificar:

- versión/tag correcto;
- variables de entorno productivas;
- conexión a `puro_origen_eerr_prod`;
- `EERR_SOFT_DELETE_ENABLED=false` mientras la funcionalidad permanezca deshabilitada;
- `WEB_ORIGIN=https://app.purodeorigen.com`;
- frontend apuntando a `https://api.purodeorigen.com`;
- Auto-Deploy desactivado.

Nunca deben copiarse a producción:

- datos ficticios;
- usuarios demo;
- credenciales demo;
- URI de MongoDB Demo;
- dataset `demo-acceptance-v1`.

---

## 7. Smoke test posterior al deploy

Después de cada despliegue productivo realizar una verificación mínima.

Como mínimo:

1. abrir `https://app.purodeorigen.com`;
2. iniciar sesión;
3. confirmar persistencia de sesión al refrescar;
4. acceder al Dashboard;
5. acceder a un EERR existente, cuando corresponda;
6. confirmar que las consultas principales respondan correctamente;
7. revisar que no existan errores CORS o errores relevantes en consola;
8. cerrar sesión correctamente.

Si la release afecta exportaciones, análisis, usuarios u otra función crítica, agregar esas verificaciones al smoke test.

---

## 8. Rollback

Si una release productiva presenta un problema crítico:

1. detener nuevas modificaciones sobre producción;
2. identificar la última versión estable;
3. redeployar manualmente el tag anterior;
4. verificar el estado de la base de datos antes de asumir que el rollback de código es suficiente;
5. analizar cualquier cambio de datos producido por la versión fallida.

Un rollback de código no debe utilizarse para revertir datos automáticamente.

Los cambios de esquema, migraciones o transformaciones de información requieren un procedimiento específico.

---

## 9. Regla fundamental de ambientes

Demo y Producción son ambientes independientes.

`Demo ≠ Producción`

La base Demo puede utilizarse para experimentar y validar.

La base Producción contiene información real y debe modificarse exclusivamente mediante funcionalidades y procesos previamente aprobados.

Las credenciales, usuarios MongoDB, JWT y variables de entorno deben permanecer separadas entre ambos ambientes.

---

## 10. Flujo resumido

`feature / fix`

`↓`

`Pull Request`

`↓`

`tests + revisión`

`↓`

`merge a main`

`↓`

`deploy manual en Demo`

`↓`

`validación funcional`

`↓`

`tag vX.Y.Z`

`↓`

`deploy manual en Producción`

`↓`

`smoke test`

Este es el flujo estándar a utilizar para las próximas actualizaciones de Gestión EERR.
