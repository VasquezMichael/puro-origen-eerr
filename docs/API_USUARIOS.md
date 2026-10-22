# Administración de usuarios

Todos los endpoints de `/users` requieren sesión de Administrador. La API
decide permisos y validaciones; la web anticipa solo errores de formulario.
Las respuestas públicas contienen `id`, `name`, `email`, `isAdmin`, `active`,
`mustChangePassword` y `branchAccesses` (`branchId`, `role: EDITOR | READER`).
Nunca contienen hash, contraseña, `authVersion` ni campos internos de guarda.

| Método y ruta | Entrada | Resultado |
| --- | --- | --- |
| `GET /users` | — | Lista de usuarios públicos |
| `POST /users` | `name`, `email`, `password` (mínimo 12), `isAdmin?`, `branchAccesses?` | Usuario activo con cambio de contraseña pendiente |
| `PATCH /users/:id/branch-accesses` | `branchAccesses` completo | Usuario actualizado; reemplaza todos los accesos |
| `PATCH /users/:id/status` | `active: boolean` | Usuario actualizado; desactivar invalida sesiones anteriores |
| `PATCH /users/:id/password` | `password` (mínimo 12), `requireChange?` (por defecto `true`) | Usuario actualizado; invalida sesiones anteriores |

`branchAccesses` acepta una entrada por sucursal existente, incluso inactiva.
El Administrador conserva alcance global aunque tenga accesos declarados.
No existe una operación para editar nombre/email o convertir el rol Admin de
una cuenta existente. `PATCH status` rechaza self-disable y desactivar al último
Admin activo con 409; el estado idéntico es idempotente. Creación con email
duplicado responde 409. La UI refresca la lista tras cada escritura y traduce
errores HTTP sin presentar códigos internos como mensaje principal.
