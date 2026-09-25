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
- Extender lint y pruebas de los paquetes cuando se incorporen nuevas reglas.
- EP-03: validación manual confirmada por el usuario antes de EP-04A.
- Conservar la aceptación manual en dispositivos y navegadores finales para los
  flujos de EP-04. Ya existen pruebas automatizadas de navegador Chromium en
  cinco tamaños con API simulada; complementan, pero no sustituyen, la revisión
  visual y operativa humana.
- Evaluar límites de EP-04A con datos representativos antes de ampliar 1000 nodos
  por EERR o 200 EERR por publicación mensual.
- Automatizar integración MongoDB local aislada en un job específico si se adopta
  esa infraestructura; el CI actual continúa sin MongoDB ni secretos.
- Evaluar un job de navegador Chromium en CI; actualmente los recorridos se
  verifican localmente y no forman parte de la ejecución ordinaria de Actions.

- EP-04C2: aceptar manualmente CSV/XLSX en Excel o LibreOffice de escritorio y
  probar en dispositivos físicos. Chromium con fixtures y reapertura automatizada
  ya se verifican; no reemplazan la aceptación operativa.
- EP-04C2: auditoría de producción sin vulnerabilidades; quedan cinco avisos
  preexistentes de desarrollo en el árbol de @nestjs/mau. Revisar en mantenimiento
  separado, junto con las dependencias transitivas deprecadas del soporte XLSX.
- Revisar periódicamente si conviene migrar de `@protobi/exceljs` al paquete
  oficial, con pruebas de seguridad, compatibilidad y precisión.
- EP-06: definir equivalencias entre ítems creados independientemente antes de
  implementar comparaciones entre EERR.
- EP-05B.2: presentar y editar meta/proyecciones en web; explicar el supuesto
  de gastos semivariables. Evaluar clasificación fija/variable detallada en un
  incremento posterior, con decisión funcional previa.

Cualquier mejora futura debe agregarse a este backlog. Los requisitos funcionales
confirmados están en ESPECIFICACION_FUNCIONAL.md y las decisiones pendientes en
DECISIONES.md; no convertir propuestas en requisitos sin validación.
