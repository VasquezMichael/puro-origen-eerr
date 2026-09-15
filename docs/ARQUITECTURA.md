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
