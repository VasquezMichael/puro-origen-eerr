# Backlog evolutivo

Estas mejoras quedan registradas para evaluación futura; este documento no las
incorpora al MVP ni establece prioridad o fecha de implementación.

- Chatbot/IA para consultar y analizar EERR.
- Interpretación de tendencias y dashboards.
- Ayuda contextual mediante tooltips.
- Evaluar creación de períodos futuros; EP-03 los rechaza y no habilita esta mejora.
- Modo oscuro si queda fuera del MVP.
- Aislar configuración y persistencia del e2e existente antes de incorporarlo a CI.
- Revisar las vulnerabilidades reportadas por npm ci en las dependencias existentes
  (7 al cerrar EP-03: 2 bajas, 1 moderada y 4 altas), evaluar
  su alcance y actualizar con verificación; no aplicar correcciones forzadas a ciegas.
- Incorporar lint y pruebas en paquetes al implementar sus reglas; agregar pruebas
  web cuando exista comportamiento funcional que verificar.
- Completar la validación visual manual de EP-03 en escritorio y tablet: ambas
  perspectivas, creación, mensajes, foco y navegación. El entorno de desarrollo
  no dispuso de navegador; el control HTTP y el build no sustituyen esta revisión.

Cualquier mejora futura debe agregarse a este backlog. Los requisitos funcionales
confirmados están en ESPECIFICACION_FUNCIONAL.md y las decisiones pendientes en
DECISIONES.md; no convertir propuestas en requisitos sin validación.
