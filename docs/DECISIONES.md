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
- Los accesos de sucursal se almacenan desde este milestone, pero su validación
  contra sucursales reales se incorporará con el módulo de sucursales.
