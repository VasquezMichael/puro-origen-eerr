# Decisiones

## Arquitectura aceptada

- Monorepo npm, Node.js 24 y TypeScript; monolito modular sin microservicios.
- Next.js 16 en web; NestJS 12 ESM, Mongoose y MongoDB Atlas en API.
- Separar presentación, casos de uso, reglas puras, cálculos y contratos compartidos.
- Evitar dependencias circulares y justificar toda dependencia nueva.

## Decisiones funcionales aceptadas

- El acceso es cerrado, sin registro público.
- El inicio de sesión utiliza email y contraseña.
- El Administrador es un rol global; Lector y Editor se asignan por sucursal.
- Los administradores crean usuarios, asignan accesos y restablecen contraseñas.
- Durante el MVP no se envían correos de recuperación.
- El primer administrador se crea mediante un comando seguro que se rechaza si ya existe otro.
- Las sucursales inactivas permiten corregir históricos, pero no crear EERR nuevos.
- Las categorías se identifican internamente por código.
- Renombrar categorías no debe alterar el nombre histórico.
- Las cantidades solo admiten enteros.
- Los porcentajes pueden tener decimales.
- Clonar valores no copia notas.
- Las categorías globales modifican todos los EERR del mismo período.

## Pendientes explícitos, sin resolver

- Definición final sobre quién puede crear bloques principales.
- Creación de períodos futuros.
- Feedback de usuarios finales.

Estos pendientes no autorizan a inferir permisos ni comportamientos. Resolverlos
con el usuario antes de implementar la funcionalidad afectada.

## Decisiones técnicas de la base automatizada

Reutilizar las herramientas instaladas, sin agregar dependencias. Generar tipos de
Next antes del chequeo estático. Mantener las pruebas unitarias sin configuración
real ni Atlas; el e2e requiere aislamiento futuro. El check no establece umbrales
de cobertura ni simula pruebas en paquetes vacíos.

## Decisiones técnicas de autenticación

- La sesión se mantiene en una cookie HttpOnly, SameSite=Lax, con vigencia de
  ocho horas; el navegador no recibe el token en el cuerpo de la respuesta.
- Las contraseñas se almacenan con bcrypt y nunca se devuelven desde la API.
- La autorización revalida en base de datos que el usuario continúe activo y que
  conserve su condición de administrador.
- Los accesos por sucursal se validan al crear usuarios o reasignarlos: identificadores
  MongoDB válidos, sucursales existentes y sin duplicados dentro del usuario.

## Decisiones confirmadas de sucursales (EP-02)

- Datos mínimos: id de MongoDB, código interno, nombre, fecha de inicio, estado
  activa/inactiva y timestamps de creación y modificación. Sin campos operativos adicionales.
- Código automático generado por la API con UUID aleatorio nativo de Node.js,
  prefijo `SUC-`, índice único e inmutable. No depende del nombre ni de una secuencia global.
- Nombre obligatorio; se normalizan Unicode, mayúsculas, acentos y espacios
  redundantes para detectar duplicados mediante índice único. La clave de
  normalización es interna y no se expone en las respuestas.
- Fecha de inicio opcional en la creación; por defecto coincide con la fecha de
  creación. La API acepta fechas ISO válidas y la interfaz permite elegir el día.
- Solo el Administrador global crea, edita nombre/fecha y cambia el estado.
- Desactivación reversible mediante cambio explícito e idempotente de estado.
  No existe borrado físico ni endpoint DELETE; la información se conserva.
- Administradores consultan todas las sucursales. Lectores y Editores consultan
  únicamente las asignadas, incluidas las inactivas para conservar acceso histórico.
- El guard revalida los accesos desde el usuario persistido, sin incluir passwordHash.
- La persistencia de sucursales se comparte con Usuarios mediante un módulo sin
  rutas ni dependencia de Autenticación; se evita un ciclo entre módulos.

## Requisitos confirmados a implementar con períodos

- Impedir creación de EERR nuevos en sucursales inactivas.
- Permitir correcciones de históricos en sucursales inactivas.

EP-02 modela el estado reversible y conserva información y accesos; estas operaciones
de EERR se implementarán con períodos. Son requisitos confirmados, no mejoras del backlog.
