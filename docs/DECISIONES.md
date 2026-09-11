# Decisiones

## Arquitectura aceptada

- Monorepo npm, Node.js 24 y TypeScript; monolito modular sin microservicios.
- Next.js 16 en web; NestJS 12 ESM, Mongoose y MongoDB Atlas en API.
- Separar presentación, casos de uso, reglas puras, cálculos y contratos compartidos.
- Evitar dependencias circulares y justificar toda dependencia nueva.

## Decisiones funcionales aceptadas

- Las sucursales inactivas permiten corregir históricos, pero no crear EERR nuevos.
- Las categorías se identifican internamente por código.
- Renombrar categorías no debe alterar el nombre histórico.
- Las cantidades solo admiten enteros.
- Los porcentajes pueden tener decimales.
- Clonar valores no copia notas.
- Las categorías globales modifican todos los EERR del mismo período.

## Pendientes explícitos, sin resolver

- Definición final sobre quién puede crear bloques principales.
- Alcance exacto del rol administrador mencionado en la especificación.
- Creación de períodos futuros.
- Feedback de usuarios finales.

Estos pendientes no autorizan a inferir permisos ni comportamientos. Resolverlos
con el usuario antes de implementar la funcionalidad afectada.

## Decisiones técnicas de este milestone

Reutilizar las herramientas instaladas, sin agregar dependencias. Generar tipos de
Next antes del chequeo estático. Mantener las pruebas unitarias sin configuración
real ni Atlas; el e2e requiere aislamiento futuro. El check no establece umbrales
de cobertura ni simula pruebas en paquetes vacíos.
