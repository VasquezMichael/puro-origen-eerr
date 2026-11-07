# Puro de Origen — Gestión EERR

Aplicación web para la gestión, carga y análisis de **Estados de Resultados (EERR)** por sucursal y período.

El sistema fue desarrollado para centralizar información financiera que anteriormente debía analizarse de forma manual, permitiendo consultar resultados por sucursal, comparar períodos y obtener una visión consolidada del negocio.

## Funcionalidades principales

- Gestión de Estados de Resultados por sucursal y mes.
- Estructura configurable de categorías e ítems.
- Carga de importes, cantidades, notas y metas.
- Cálculo automático de:
  - ingresos;
  - costos;
  - gastos;
  - margen bruto;
  - resultado neto;
  - punto de equilibrio;
  - objetivo de ventas;
  - cumplimiento de objetivos.
- Comparación entre períodos.
- Comparación entre sucursales.
- Dashboard consolidado.
- Indicadores y semáforos de desempeño.
- Clonado de estructuras y valores.
- Importación de información.
- Exportación individual a PDF y Excel.
- Roles y permisos por usuario.
- Gestión del ciclo de vida de los EERR.

## Stack

### Frontend

- Next.js
- React
- TypeScript
- Tailwind CSS

### Backend

- NestJS
- TypeScript
- REST API
- Mongoose

### Persistencia

- MongoDB Atlas

### Infraestructura

- Render
- GitHub Actions
- Dominio y HTTPS mediante Render

## Arquitectura

El proyecto utiliza un monorepo compuesto por:

```text
apps/
├── web        # Aplicación Next.js
└── api        # API NestJS

packages/
├── calculation-engine
├── domain
└── shared-types
```

La lógica financiera se encuentra desacoplada de la interfaz y de la persistencia mediante un motor de cálculo independiente.

## Ambientes

El proyecto mantiene dos ambientes aislados.

### Demo / Staging

Utilizado para validar funcionalidades y nuevas versiones mediante información ficticia precargada.

### Producción

Ambiente utilizado con información real del negocio.

Acceso productivo:

`https://app.purodeorigen.com`

Los datos y credenciales de ambos ambientes permanecen completamente separados.

## Flujo de releases

```text
desarrollo
   ↓
Pull Request
   ↓
merge a main
   ↓
deploy en Demo
   ↓
validación
   ↓
tag de release
   ↓
deploy manual a Producción
```

La documentación completa del proceso se encuentra en:

`docs/RELEASE_WORKFLOW.md`

## Estado del proyecto

**v1.0.0 — Producción**

La primera versión funcional del sistema se encuentra desplegada y operativa.

El proyecto continúa en desarrollo incremental, incorporando mejoras y nuevas capacidades a partir del uso real del sistema.

## Próximas mejoras

Algunas funcionalidades previstas para futuras versiones:

- nuevas visualizaciones y comparativas;
- análisis más detallado por conceptos;
- mejoras en metas e indicadores;
- asistencia contextual;
- automatización de importaciones;
- funcionalidades de análisis asistido por IA.

## Contexto

El proyecto surge de una necesidad operativa real de **Puro de Origen**, con el objetivo de mejorar la lectura de resultados por sucursal y facilitar la toma de decisiones basada en datos.

El desarrollo incluyó relevamiento funcional, modelado del dominio, diseño de reglas de negocio, implementación full-stack, pruebas, preparación de datos demostrativos y despliegue de ambientes separados de staging y producción.
