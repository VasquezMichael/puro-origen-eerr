# Arquitectura

La base es un monorepo npm sobre Node.js 24 y TypeScript, organizado como monolito
modular. Este milestone no implementa funcionalidades de negocio.

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
Los paquetes actuales contienen únicamente un módulo vacío; no hay reglas de
negocio implementadas ni dependencias internas declaradas. Si se agregan, adaptar
el orden de build a sus dependencias antes de consumir artefactos dist.

La web conserva ESLint, la API oxlint y Vitest, y los paquetes el compilador
TypeScript. La configuración raíz delega en los scripts existentes de cada workspace.
