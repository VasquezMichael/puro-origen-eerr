# Flujo de desarrollo

## Preparación

Usar Node.js 24 y npm. Leer AGENTS.md raíz y las reglas específicas del workspace,
inspeccionar el repositorio y ejecutar `git status`. Ante cambios locales,
detenerse y reportarlos. Para un milestone nuevo, con árbol limpio:

```sh
git switch main
git pull --ff-only origin main
git switch -c chore/nombre-del-milestone
npm ci
```

El comando de creación anterior es un ejemplo. El nombre y tipo de rama dependen
del milestone: `feature/*` para funcionalidades, `fix/*` para correcciones y
`chore/*` para infraestructura o mantenimiento. Si el usuario indica continuar una
rama existente, conservarla sin cambiar a main ni crear otra rama. Nunca trabajar
ni fusionar directamente sobre main.
Limitar cada milestone al alcance acordado y registrar mejoras en el backlog.
No agregar dependencias sin justificar su necesidad.

## Verificación

```sh
npm run typecheck --workspaces --if-present
npm run lint --workspaces --if-present
npm test --workspaces --if-present
npm run build --workspaces --if-present
git diff --check
git diff --cached --check
git check-ignore apps/api/.env
git ls-files
```

Los alias raíz `typecheck`, `lint`, `test` y `build` ejecutan esos mismos comandos.
`npm run check` los encadena y se detiene ante un fallo. Revisar además el diff y
los archivos versionados para detectar secretos sin exponer valores sensibles.
Nunca leer, imprimir, copiar ni versionar apps/api/.env.

El typecheck web genera primero los tipos de rutas de Next para funcionar en un
checkout limpio. Todos los workspaces verifican tipos y compilan. El lint cubre
web y API; las pruebas actuales cubren el controlador de API (una prueba unitaria).
Los paquetes vacíos aún no tienen lint ni pruebas y la web no tiene pruebas:
`--if-present` omite esos scripts, no implica cobertura. Incorporar herramientas
y pruebas relevantes cuando se agregue código, justificando nuevas dependencias.

El e2e existente (`npm run test:e2e --workspace=api`) importa AppModule, que carga
configuración y conecta a MongoDB; no forma parte del check. Aislar su configuración
y persistencia antes de ejecutarlo automáticamente o incorporarlo a CI. Las pruebas unitarias actuales
no importan AppModule. El build no inicia el servidor. No usar el .env real en CI.
La web conserva fuentes de Google y puede requerir red al compilar.

## CI y entrega

GitHub Actions ejecuta npm ci, tipos, lint, pruebas y build sobre Node.js 24 en cada
Pull Request y push a main. No configura secretos ni servicios de MongoDB.
CI no despliega, no modifica datos externos y no fusiona ramas.
La revisión de espacios utiliza el rango base–head del Pull Request y before–sha
del push, con historial completo. Para el primer push de una rama (before nulo),
se compara contra el árbol vacío de Git.

Corregir fallos o reportar el bloqueo; solo con todas las verificaciones aprobadas
Codex debe hacer commit y `git push -u origin <rama>`. Usar Conventional Commits con
prefijos `feat`, `fix`, `chore`, `docs`, `test` o `refactor` y descripción en español.
Informar rama, archivos,
comandos y resultados, decisiones, supuestos y pendientes; confirmar que no se
versionaron secretos. Al cerrar cada milestone, registrar las decisiones confirmadas
en DECISIONES.md, los riesgos en el informe de cierre y los pendientes en DECISIONES.md
o BACKLOG_EVOLUTIVO.md según corresponda. No resolver pendientes por suposición.
La creación y el merge del PR quedan fuera de la ejecución automática de Codex.
Usar la plantilla al preparar un PR y mantener revisión humana antes del merge;
nunca hacer merge automático.
