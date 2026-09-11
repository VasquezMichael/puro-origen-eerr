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
No inventar requisitos: registrar decisiones pendientes y mejoras futuras en los
documentos correspondientes. Este milestone solo establece la base de desarrollo.

## Git y verificaciones obligatorias

Inspeccionar estructura, package.json y todos los AGENTS.md aplicables; ejecutar
`git status`. Si hay cambios locales, detenerse y reportarlos sin descartarlos.
Con árbol limpio, cambiar a main, ejecutar `git pull --ff-only origin main` y crear
una rama específica. Nunca trabajar directamente en main ni hacer merge automático.
Escribir commits en español. Solo hacer commit y push tras aprobar las verificaciones;
crear PR únicamente cuando el usuario lo solicite. Nunca ocultar errores.

Desde la raíz, con Node.js 24 y dependencias instaladas mediante `npm ci`:

```sh
npm run typecheck --workspaces --if-present
npm run lint --workspaces --if-present
npm test --workspaces --if-present
npm run build --workspaces --if-present
git diff --check
```

`npm run check` agrupa tipos, lint, pruebas y build. Además revisar archivos
versionados y el diff para detectar secretos, sin imprimir valores sensibles.
El check y CI deben funcionar sin .env real y sin MongoDB. No ejecutar el e2e
actual que importa AppModule hasta aislar su configuración y persistencia.
Reportar rama, archivos modificados, comandos y resultados, supuestos, riesgos y
pendientes; confirmar el tratamiento de secretos y el estado de commit/push.

## Secretos y datos

Nunca leer, imprimir, copiar ni versionar `apps/api/.env`. Verificar con
`git check-ignore apps/api/.env` que sigue ignorado y con el listado de archivos
versionados que no está incluido. No incluir credenciales reales en documentación,
pruebas ni logs. Solo usar ejemplos ficticios. No escribir datos externos ni hacer
migraciones destructivas. CI no recibe secretos ni inicia la API contra Atlas.
