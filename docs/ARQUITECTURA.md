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

## Estructura y carga manual (EP-04A)

EerrModule incorpora StructureController, StructureService y StructureRepository.
Reutiliza el principal y acceso filtrado de EerrService; comprueba autorización
por operación sin importar Usuarios ni Autenticación.

Modelo híbrido: catálogo eerr_concepts (UUID, tipo, raíz), plantilla eerr_templates
(clave año-mes, versión, categorías) y snapshot embebido en EERR. Los bloques
reservados viven en dominio. No se resuelven nombres desde el catálogo al leer.
schemaVersion identifica formato; structureVersion parte de la versión mensual
al inicializar y avanza con cambios estructurales; revision avanza en toda edición.
No se depende de __v para concurrencia.

El repositorio convierte strings a Decimal128 y viceversa. Los esquemas y
subdocumentos tienen tipos explícitos, sin Mixed para nodos/celdas. Dominio
centraliza raíces, invariantes, normalización, progreso y dinero exacto con BigInt.
Shared-types consume tipos de dominio y publica contratos para ambas aplicaciones.
Los scripts previos compilan dominio y contratos; no hay dependencias externas nuevas.

Inicialización y publicación global adquieren el mismo bloqueo de escritura de
plantilla dentro de una transacción, evitando inicializaciones con categorías
atrasadas. Crear ítems transacciona catálogo y snapshot; renombrar ítems o guardar
importes utiliza una sola escritura atómica. Cada escritura compara revisión.

eerr_previews guarda identificador opaco, usuario, operación, período, revisiones
y expiración. La API valida vencimiento aunque TTL no haya borrado el documento.
Confirmar revalida acceso, revisiones y plantilla, y consume la vista previa en
la transacción. Los reintentos técnicos vuelven a comprobar las precondiciones;
no habilitan revisiones obsoletas. No hay fallback parcial mediante updateMany.

/eerr/[id] presenta el árbol y carga manual sin resultados financieros. Su reducer
conserva borradores tras 409 y recarga; solo elimina el de la celda cuyo guardado
fue confirmado. API/dominio mantienen la autoridad sobre permisos y reglas.

Las pruebas normales siguen sin MongoDB. La integración opcional
`npm run test:integration:structure --workspace=api` exige MONGOD_BINARY con ruta
absoluta a un ejecutable local. Lanza y elimina su propio replica set en loopback
y directorio temporal. No acepta URI externa ni utiliza AppModule, .env o bootstrap.
No instala infraestructura global. Contratos y validaciones: [API_EERR.md](API_EERR.md).


## Carga ampliada (EP-04B1)

Dominio incorpora money-expression (parser de constantes y racionales BigInt) y
eerr-fields (cantidades/notas). API y web consumen estas reglas puras; la API
recalcula y valida siempre. rationalMoney comparte rango y redondeo con los
literales originales. calculation-engine sigue reservado para EP-05/EP-06; no
se agregan relaciones ni dependencias nuevas.

Amount conserva input original y value Decimal128. NodeSchema agrega quantity
(subdocumento explícito state/value String) y note opcionales. Eerr agrega note
String opcional para la nota general, independiente de la inicialización. Los
esquemas no crean defaults para estos campos ausentes. La conversión pública
conserva ausencia; la interfaz interpreta SIN_CARGAR/sin nota sin escribir.

StructureService reutiliza editItem, permisos y write con el CAS existente para
importes/cantidades/notas de ítem. writeNote actualiza solo note y revision con
el mismo revisionFilter; no sustituye estructura, progreso ni createdAt. Una
publicación global conserva los nuevos datos locales y compite por la misma revisión.

field-editors presenta los controles; structure-workspace conserva el estado y
coordina envíos. El reducer utiliza claves de borrador por campo: UUID del importe,
quantity:UUID, note:UUID y period-note. Errores y recarga conservan todas las claves.
El CSS Module limita estilos al EERR; textarea mantiene saltos y foco visible.
Plan y límites: [PLAN_PRUEBAS.md](PLAN_PRUEBAS.md), [DECISIONES.md](DECISIONES.md).
