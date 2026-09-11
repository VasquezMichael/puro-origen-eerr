# Guía para agentes

## Arquitectura y responsabilidades

Monorepo npm con Node.js 24 y TypeScript. Mantener un monolito modular, sin
microservicios ni dependencias circulares.

- `apps/web`: Next.js 16, App Router, presentación e interacción; puerto 3000.
  No colocar reglas financieras ni lógica central del dominio aquí. Respetar
  también las instrucciones de `apps/web/AGENTS.md` y leer las guías locales de Next.
- `apps/api`: NestJS 12, ESM, casos de uso, validación, autenticación y persistencia
  con Mongoose y MongoDB Atlas; puerto 3001.
- `packages/domain`: reglas puras independientes de NestJS, React y MongoDB.
- `packages/calculation-engine`: cálculos financieros deterministas, puros y testeables.
- `packages/shared-types`: contratos y tipos realmente compartidos.

Las aplicaciones pueden consumir paquetes; los paquetes no importan aplicaciones.
Consultar `docs/ARQUITECTURA.md` antes de introducir relaciones nuevas.

## Convenciones

Usar TypeScript estricto y las herramientas y estilos existentes de cada workspace.
En ESM de la API y paquetes, preservar imports compatibles con NodeNext.
No introducir dependencias sin justificar su necesidad. Evitar duplicar reglas.
Agregar pruebas significativas a reglas y cálculos cuando se implementen.
Cada milestone puede implementar funcionalidades únicamente dentro del alcance
proporcionado. No inventar requisitos ni resolver pendientes mediante suposiciones;
consultarlos con el usuario antes de implementar la parte afectada.

Aplicar este orden de autoridad para las definiciones del proyecto:

1. Decisiones confirmadas en `docs/DECISIONES.md`.
2. Especificación funcional en `docs/ESPECIFICACION_FUNCIONAL.md`.
3. Alcance concreto del milestone.
4. `docs/BACKLOG_EVOLUTIVO.md`, que registra mejoras y no autoriza implementación.

El alcance delimita qué se implementa en cada milestone; no habilita a contradecir
decisiones confirmadas ni a implementar toda la especificación. Registrar decisiones,
riesgos y pendientes al cerrar cada milestone, y mejoras futuras en el backlog.

## Git y verificaciones obligatorias

Inspeccionar estructura, package.json y todos los AGENTS.md aplicables; ejecutar
`git status`. Si hay cambios locales, detenerse y reportarlos sin descartarlos.
Para un milestone nuevo, con árbol limpio, cambiar a main, ejecutar
`git pull --ff-only origin main` y crear una rama específica. Si el usuario indica
continuar en una rama existente, conservarla. No desarrollar ni crear commits
directamente sobre main; integrar cambios mediante Pull Request.
Usar Conventional Commits con prefijos `feat`, `fix`, `chore`, `docs`, `test` o
`refactor` y descripción en español. Codex debe hacer commit y push solo tras aprobar
las verificaciones. Codex Work debe completar el circuito automatizado de PR,
verificación de CI, Squash and merge y limpieza descrito abajo. Nunca ocultar errores.

Desde la raíz, con Node.js 24 y dependencias instaladas mediante `npm ci`:

```sh
npm run typecheck --workspaces --if-present
npm run lint --workspaces --if-present
npm test --workspaces --if-present
npm run build --workspaces --if-present
git diff --check
git diff --cached --check
```

`npm run check` agrupa tipos, lint, pruebas y build. Además revisar archivos
versionados y el diff para detectar secretos, sin imprimir valores sensibles.
El check y CI deben funcionar sin .env real y sin MongoDB. No ejecutar el e2e
actual que importa AppModule hasta aislar su configuración y persistencia.
Reportar rama, archivos modificados, comandos y resultados, supuestos, riesgos y
pendientes; confirmar el tratamiento de secretos y el estado de commit/push, PR,
CI, merge, ramas eliminadas y sincronización final de main.

## Cierre automatizado de cada milestone

1. Ejecutar todas las verificaciones locales requeridas, revisar el diff completo
   del milestone y comprobar que no haya secretos ni archivos .env reales versionados.
   Solo se permiten ejemplos ficticios como `.env.example`.
2. Crear commits Conventional Commits en español y publicar la rama sin force push.
3. Crear un Pull Request hacia main y completar todos los apartados de
   `.github/pull_request_template.md` con cambios, pruebas, impacto, riesgos y pendientes.
4. Esperar y comprobar el resultado real de GitHub Actions para la última revisión
   del PR. Verificar todos los controles, conflictos, revisiones y bloqueos antes
   de integrar. Un CI pendiente, ausente o fallido no equivale a aprobación.
5. Corregir fallos dentro del alcance, repetir las verificaciones afectadas y el
   check completo, publicar la corrección y esperar nuevamente el CI. No omitir,
   desactivar controles ni alterar protecciones para conseguir una aprobación.
6. Hacer Squash and merge únicamente con todas las verificaciones aprobadas y sin
   conflictos, secretos, revisiones bloqueantes ni incertidumbres importantes.
   Comprobar que el head del PR siga siendo el que se verificó.
7. Confirmar el merge, registrar su commit y eliminar la rama remota integrada.
   Con árbol local limpio, cambiar a main y actualizarlo mediante fast-forward
   desde origin/main. Eliminar la rama local solo tras comprobar que no contiene
   trabajo adicional y que sus cambios quedaron integrados por el squash.
   Si Git no reconoce la ascendencia por el squash, eliminarla explícitamente
   solo con esa evidencia; nunca descartar trabajo local para limpiar.
8. Terminar con main limpio y sincronizado con origin/main; verificar estado,
   igualdad de commits y eliminación de ambas ramas. Informar cualquier bloqueo.

La revisión humana se conserva para decisiones funcionales no documentadas,
cambios de alcance, operaciones irreversibles sobre datos, secretos, credenciales
o infraestructura y fallos que no puedan resolverse dentro del milestone.
Si se necesita una decisión humana, detener la parte afectada e informar el motivo;
no hacer merge mientras persista el bloqueo. El circuito autorizado no requiere
una aprobación humana adicional cuando todos estos controles están satisfechos.

## Secretos y datos

Nunca leer, imprimir, copiar ni versionar `apps/api/.env`. Verificar con
`git check-ignore apps/api/.env` que sigue ignorado y con el listado de archivos
versionados que no está incluido. No incluir credenciales reales en documentación,
pruebas ni logs. Solo usar ejemplos ficticios. No escribir datos externos ni hacer
migraciones destructivas. CI no recibe secretos ni inicia la API contra Atlas.
