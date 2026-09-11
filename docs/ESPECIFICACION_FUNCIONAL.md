# Especificación funcional

## Requisitos confirmados

### Propósito

Gestión integral de estados de resultados (EERR) de múltiples sucursales y períodos,
con una interfaz minimalista, fluida, funcional y responsive para escritorio y tablet.
No se definen fórmulas, permisos detallados ni criterios no provistos por el usuario.

### Acceso y navegación

- Autenticación mediante login.
- Wizard inicial.
- Elección entre Modo Editor y Modo Análisis.
- Perspectiva por sucursal: seleccionar sucursal y consultar sus períodos.
- Perspectiva por período: seleccionar período y consultar sus sucursales.
- Roles confirmados: Lector y Editor.
- Acceso cerrado mediante email y contraseña, sin registro público.
- Administrador global para gestión de usuarios, accesos y recuperación manual.
- Los permisos Lector y Editor se asignan por sucursal.

### Sucursales

- Gestión administrativa de sucursales, código automático e inmutable y cambios
  reversibles de estado según las decisiones de EP-02 en [DECISIONES.md](DECISIONES.md).
- Consulta limitada a sucursales asignadas para Lector/Editor; Administrador consulta todas.
- Fecha de inicio opcional; por defecto se utiliza la fecha de creación.
- Una sucursal inactiva conserva sus históricos.
- La corrección de históricos y la creación de EERR en sucursales inactivas se
  rigen por las decisiones aceptadas indicadas más abajo.

### Períodos

- Crear período prepara una plantilla mensual por sucursal.
- Contemplar el estado “sin cargar”.
- Cierre y bloqueo de períodos.
- Acción para completar con cero las celdas sin movimiento.
- La creación de períodos futuros permanece pendiente de definición.

### Carga y estructura

- Los registros nuevos comienzan en cero.
- Carga manual, Excel y CSV.
- Celdas numéricas y expresiones matemáticas, por ejemplo `1000 + 500`.
- Categorías dinámicas sin intervención técnica.
- Vista previa del cálculo.
- Notas y auditoría de modificaciones.
- Posibilidad de agregar ítems durante un período.
- Aplicar las decisiones aceptadas sobre códigos de categorías, nombres históricos,
  cantidades enteras y porcentajes con decimales.

### Clonación

- Clonar estructura copia categorías e ítems y coloca valores en cero.
- La estructura puede clonarse desde cualquier sucursal accesible.
- Clonar estructura y valores mantiene los montos.
- Por defecto se clona desde la misma sucursal.
- Si se clona desde otra sucursal debe existir una advertencia.
- No se copian notas.

### Resultados y análisis

- Ingresos, costos, margen bruto, gastos y resultado neto.
- Porcentaje neto sobre ventas.
- Punto de equilibrio.
- Objetivo de venta.
- Control de divisiones por cero.
- Dashboard, semáforos, comparativas y consolidado.
- Exportación a PDF y Excel.

## Decisiones aceptadas

Estas reglas se registran en [DECISIONES.md](DECISIONES.md), que tiene prioridad
ante discrepancias con la especificación:

- Sucursales inactivas: permiten corregir históricos, pero no crear EERR nuevos.
- Categorías identificadas internamente por código.
- Renombrar categorías no altera el nombre histórico.
- Cantidades enteras; porcentajes con decimales permitidos.
- Clonar valores no copia notas.
- Las categorías globales modifican todos los EERR del mismo período.

## Definiciones pendientes

- Definición final sobre quién puede crear bloques principales.
- Creación de períodos futuros.
- Feedback de usuarios finales.

Consultar [DECISIONES.md](DECISIONES.md). No resolver estos pendientes mediante
suposiciones ni derivar permisos o interacciones no especificadas entre reglas.

## Backlog evolutivo

Las mejoras futuras se registran por separado en
[BACKLOG_EVOLUTIVO.md](BACKLOG_EVOLUTIVO.md). El backlog no autoriza implementación
ni agrega requisitos confirmados. Cada milestone implementa únicamente su alcance.
