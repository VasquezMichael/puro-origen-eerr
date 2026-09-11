# Flujo de desarrollo

## Preparación

Usar Node.js 24 y npm. Leer AGENTS.md raíz y las reglas específicas del workspace,
inspeccionar el repositorio y ejecutar `git status`. Ante cambios locales,
detenerse y reportarlos. Con árbol limpio:

```sh
git switch main
git pull --ff-only origin main
git switch -c chore/nombre-del-milestone
npm ci
```

Para este milestone, la rama es `chore/base-desarrollo-automatizado`.
Limitar cada milestone al alcance acordado y registrar mejoras en el backlog.
No agregar dependencias sin justificar su necesidad.

## Verificación

```sh
npm run typecheck --workspaces --if-present
npm run lint --workspaces --if-present
npm test --workspaces --if-present
npm run build --workspaces --if-present
git diff --check
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
configuración y conecta a MongoDB; no forma parte del check ni debe ejecutarse en
este milestone. Aislarlo antes de incorporarlo a CI. Las pruebas unitarias actuales
no importan AppModule. El build no inicia el servidor. No usar el .env real en CI.
La web conserva fuentes de Google y puede requerir red al compilar.

## CI y entrega

GitHub Actions ejecuta npm ci, tipos, lint, pruebas y build sobre Node.js 24 en cada
Pull Request y push a main. No configura secretos ni servicios de MongoDB.
CI no despliega, no modifica datos externos y no fusiona ramas.

Corregir fallos o reportar el bloqueo; solo con todas las verificaciones aprobadas
hacer commit en español y `git push -u origin <rama>`. Informar rama, archivos,
comandos y resultados, decisiones, supuestos y pendientes; confirmar que no se
versionaron secretos. En este milestone no crear ni fusionar el Pull Request.
Para futuros PR, usar la plantilla y solicitar revisión humana; nunca merge automático.
