# Especificación funcional

Registro del alcance solicitado para la gestión integral de estados de resultados
(EERR) por sucursal y período. Este milestone documenta el alcance; no lo implementa.
No se definen fórmulas, permisos detallados ni criterios no provistos por el usuario.

## Interacción y acceso

- Modos Editor y Análisis.
- Perspectivas por sucursal o por período.
- Roles Lector y Editor.
- Diseño responsive para escritorio y tablet.

## Carga y gestión

- Carga manual, Excel y CSV.
- Expresiones matemáticas en celdas.
- Clonación de estructura.
- Clonación de estructura y valores.
- Notas.
- Auditoría de modificaciones.
- Cierre y bloqueo de períodos.

## Resultados y análisis

- Ingresos, costos, margen bruto, gastos y resultado neto.
- Porcentaje neto sobre ventas.
- Punto de equilibrio.
- Objetivo de venta.
- Control de divisiones por cero.
- Dashboard, semáforos, comparativas y consolidado.
- Exportación a PDF y Excel.

## Reglas aceptadas

- Sucursales inactivas: permiten corregir históricos, pero no crear EERR nuevos.
- Categorías identificadas internamente por código.
- Renombrar categorías no altera el nombre histórico.
- Cantidades enteras; porcentajes con decimales permitidos.
- Clonar valores no copia notas.
- Las categorías globales modifican todos los EERR del mismo período.

## Definiciones pendientes

Quedan sin resolver quién puede crear bloques principales, el alcance exacto del
rol administrador mencionado en la especificación, la creación de períodos futuros
y el feedback de usuarios finales. Ver DECISIONES.md. No derivar permisos adicionales
ni resolver interacciones no especificadas entre reglas durante este milestone.
