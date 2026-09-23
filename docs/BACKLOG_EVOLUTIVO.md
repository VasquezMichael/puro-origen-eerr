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
- EP-03: validación manual confirmada por el usuario antes de EP-04A.
- Validar visualmente EP-04A en escritorio y tablet: preparación explícita de
  septiembre de Calle 59, categorías globales, carga, cero, limpieza, teclado y
  conflictos con dos sesiones. No hay navegador disponible en el entorno;
  pruebas del reducer y build no sustituyen revisión visual.
- Evaluar límites de EP-04A con datos representativos antes de ampliar 1000 nodos
  por EERR o 200 EERR por publicación mensual.
- Automatizar integración MongoDB local aislada en un job específico si se adopta
  esa infraestructura; el CI actual continúa sin MongoDB ni secretos.

- EP-04C2: aceptar manualmente CSV/XLSX en Excel o LibreOffice de escritorio y
  probar en dispositivos físicos. Chromium con fixtures y reapertura automatizada
  ya se verifican; no reemplazan la aceptación operativa.
- EP-04C2: auditoría de producción sin vulnerabilidades; quedan cinco avisos
  preexistentes de desarrollo en el árbol de @nestjs/mau. Revisar en mantenimiento
  separado, junto con las dependencias transitivas deprecadas del soporte XLSX.

Cualquier mejora futura debe agregarse a este backlog. Los requisitos funcionales
confirmados están en ESPECIFICACION_FUNCIONAL.md y las decisiones pendientes en
DECISIONES.md; no convertir propuestas en requisitos sin validación.
