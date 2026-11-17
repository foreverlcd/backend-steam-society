# F1 backend: imagen Docker, CI, backups y runbook

- **Repo:** backend
- **Dificultad:** media (sonnet)
- **Rama:** feat/f1-foundation

## Objetivo
Dejar listo en código lo que F1 necesita sin tocar cuentas externas: imagen de producción de la API, CI en GitHub Actions que corre el gate completo, scripts de backup/restauración de PostgreSQL y un runbook. Proveedor de hosting y BD aún sin decidir (ADR-026 §7): todo debe ser genérico (cualquier PostgreSQL por `DATABASE_URL`).

## Contexto mínimo
- AGENTS.md, docs/HARNESS.md, docs/GOLDEN-PRINCIPLES.md
- package.json (scripts), scripts/gate.sh, docker-compose.yml, .env.example, src/config/env.ts, src/main.ts, prisma.config.ts
- test/test-database.ts y test/global-setup.ts (el e2e usa la BD `steam_society_test` derivada de `DATABASE_URL`)
- docs/discovery/08-ROADMAP-V3.md §2 (F1)

## Archivos a tocar
- `Dockerfile` (nuevo), `.dockerignore` (nuevo)
- `.github/workflows/ci.yml` (nuevo)
- `scripts/db-backup.sh`, `scripts/db-restore.sh` (nuevos)
- `docs/RUNBOOK.md` (nuevo)
- `README.md` (sección corta "Despliegue" que enlaza a RUNBOOK)

## Pasos
1. `Dockerfile` multi-stage con `node:24-alpine` (fija versión menor exacta), pnpm vía corepack con la versión de `packageManager` o la del lockfile; etapa build (`pnpm install --frozen-lockfile`, `pnpm db:generate`, `pnpm build`), etapa runtime solo con `dist/`, `node_modules` de producción (`pnpm prune --prod` o `pnpm deploy`), `prisma/` y `prisma.config.ts` para migraciones; usuario no root; `EXPOSE 3000`; `HEALTHCHECK` contra `GET /health`; `CMD ["node","dist/main"]`. Documenta en el runbook que las migraciones se aplican con `pnpm exec prisma migrate deploy` como paso previo (comando o servicio aparte), no al arrancar.
2. `.dockerignore`: excluye `.env*` (excepto `.env.example`), `node_modules`, `dist`, `.git`, `.harness`, `.claude`, `test`, `docs`, `load`.
3. `ci.yml`: en push y pull_request; servicio `postgres:18.6-alpine3.24` mapeado a 5433; Node 24; pnpm con caché; `pnpm install --frozen-lockfile`; `pnpm db:generate`; crea la BD de test si hace falta; corre `bash scripts/gate.sh full`. Variables de entorno con valores falsos que empiecen por `test-only-` (el escáner de secretos de gate.sh las ignora); `SESSION_COOKIE_SECURE=false`; `PAYMENTS_PROVIDER=disabled`. Ninguna credencial real. Permisos mínimos (`contents: read`). Además un job que haga `docker build` (sin push).
4. `db-backup.sh`: `pg_dump --format=custom` de `DATABASE_URL` a `backups/<fecha>.dump` (o la ruta de `BACKUP_DIR`), `set -euo pipefail`, nunca imprime la URL, conserva los últimos N (`BACKUP_KEEP`, por defecto 14). `db-restore.sh <archivo> <DATABASE_URL destino>`: `pg_restore --clean --if-exists --no-owner`, se niega a correr si el destino contiene `prod` salvo `--yes-really`. Añade `backups/` a `.gitignore`.
5. `docs/RUNBOOK.md` en español sencillo: requisitos, variables obligatorias en producción (tomar la lista de `src/config/env.ts`, sin valores), construir y correr la imagen, migrar, sembrar admin, backups (cron diario sugerido) y **simulacro de restauración** paso a paso (restaurar en una BD temporal y comprobar conteos), rotación de `SESSION_SECRET` y `MFA_ENCRYPTION_KEY` (advertir: perder la clave obliga a reinscribir la 2FA), qué revisar si la API no arranca. Marca con `[verificar]` todo lo que dependa del proveedor aún no elegido.
6. Verifica: `docker build .` funciona y la imagen arranca contra la BD local con `PAYMENTS_PROVIDER=fake` y responde `/health` (usa variables de entorno inline; NUNCA leas `.env`). `bash -n` de los scripts. Prueba backup + restore contra una BD temporal `steam_society_restore_check` en el Postgres local (5433) y bórrala al final.

## Criterio de terminado
- [ ] `docker build` OK; contenedor responde 200 en `/health`.
- [ ] Backup y restauración probados en BD temporal (anota conteos en la bitácora).
- [ ] `ci.yml` válido (sintaxis YAML) y reproduce `scripts/gate.sh full`.
- [ ] `scripts/gate.sh full` en verde.
- [ ] RUNBOOK.md escrito.

## Fuera de alcance
- Crear cuentas, dominios, TLS reales, Sentry/UptimeRobot (necesitan cuentas del dueño). Caddy: solo un ejemplo comentado en el runbook.
- Instalar dependencias nuevas en package.json.
- Publicar imágenes.

## Bitácora
| Fecha | Quién | Qué pasó |
|---|---|---|
| 2026-11-17 | sonnet (implementador) | Escribió Dockerfile, CI, scripts y RUNBOOK; no pudo correr `docker build` ni el simulacro (requerían aprobación). |
| 2026-11-17 | codex (revisor) | 1 hallazgo: los scripts borraban toda la query de `DATABASE_URL` (perdía `sslmode`). Arreglado: solo se quita `schema=`. |
| 2026-11-17 | planificador | `docker build` fallaba: `prisma generate` exige `DATABASE_URL` → placeholder solo en build. Imagen runtime 587 MB, no root, `healthy`, `/health` 200 en modo producción. Imagen `migrate` aplicó 13/13 migraciones en BD vacía. Simulacro backup→restore en BD temporal: conteos idénticos (10 usuarias, 1 reserva, 5 perfiles de mentora, 9 auditorías, 13 migraciones); restaurar sobre una URL con "prod" se rechaza. Hallazgo: `--env-file` de Docker no quita comillas (anotado en RUNBOOK §3). |
