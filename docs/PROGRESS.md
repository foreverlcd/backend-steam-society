# PROGRESS: estado vivo (actualizar al terminar cada sesión)

Última actualización: 2026-10-24 · Etapa vigente: **1.1a cerrada** (Prisma + área + health + CORS + README)

## Hecho (con evidencia)
- Entorno: Node 24.22.1, pnpm 12.15.0, NestJS 12.2 (ESM, Vitest, oxlint).
- Docker Compose: Postgres 18.6-alpine, `healthy`, publicado en `127.0.0.1:5433`.
- Prisma 7.10.1: `prisma.config.ts`, `PrismaService` (PrismaPg) y `PrismaModule` NO global en `src/shared/prisma/`.
- Modelo `Area`: `id` uuid v7 por defecto de base (`uuidv7()`), `name` único, `parent_id` opcional con FK `ON DELETE RESTRICT`, `active` default `true`, `created_at` `timestamptz(3)`, `@@map("area")`.
- Migraciones aplicadas: `20261024173759_add_area` y `20261024212009_fix_area_columns_and_uuidv7`. La segunda se creó con `--create-only` y usa `RENAME COLUMN` para no perder datos.
- `GET /health` (sin prefijo): 200 `{status:'ok',db:'up'}` / 503 `{status:'error',db:'down'}` con `SELECT 1` y `ServiceUnavailableException`. `HealthModule` importa `PrismaModule`; el fallo se registra con `Logger` y la cadena de conexión se redacta.
- Recuperación verificada en vivo: 200 → 503 (contenedor detenido) → 200 (contenedor reiniciado) sin reiniciar la API.
- CORS: `WEB_ORIGIN` separada por comas; `parseWebOrigins()` quita espacios, entradas vacías, barras finales y duplicados. Sin variable, CORS desactivado.
- Tests: 11 unitarios (4 archivos) + 1 e2e, verdes. `pnpm build`, `pnpm lint` y `pnpm test` verdes.
- README: puesta en marcha desde cero, comandos `db:*`, CORS y aviso de fallo rápido al arrancar.
- Commits de la sesión anterior en `main`: `fd884b7` (area + migración inicial), `5c9102d` (health contrato), `e8f2333` (CORS), `69f6598` (README).
- Commits en rama `feat/1.1a-prisma-postgres`: `28d177a` (docs pack), `6bdbe9a` (migración area), `f49bd23` (uuidv7), `2b08759` (health), `edb0bbc` (CORS), `ca71563` (README).

## Etapa 1.1a: contrato
- [x] Modelo `area` + migración creada y aplicada.
- [x] `HealthService` con `PrismaService`; `HealthModule` importa `PrismaModule`.
- [x] `GET /health` → 200 / 503.
- [x] Tests con dobles: base arriba, base caída, recuperación y redacción de logs.
- [x] CORS con `WEB_ORIGIN` + preflight verificado.
- [x] README desde cero.

## Decisiones tomadas en esta sesión
- P-08 aceptada: uuid v7 generado por PostgreSQL 18 (`uuidv7()` vía `dbgenerated`) en todas las tablas nuevas (ADR-015).
- Precisión de fechas: `@db.Timestamptz(3)`, alineado con `03-DATA-MODEL.md`.
- Arranque con la base caída: falla rápido (`$connect()` en `onModuleInit`); el 503 aplica con la API ya levantada.
- CORS: orígenes normalizados; sin `WEB_ORIGIN` queda desactivado (nunca `*`).
- Logs de health: causa del error sin credenciales ni cadena de conexión.

## Bloqueos y decisiones pendientes (ver `07-DECISIONS.md`)
- Antes de 1.2: autenticación (P-01) y validación (P-02). El agente investiga y propone; decide el desarrollador.
- Pendiente del equipo de producto: preguntas de onboarding, lista de áreas STEAM, % de comisión, plazo de respuesta de solicitudes, política de cancelación (DA-05).

## Siguiente
1. Revisar `git diff main...HEAD` y mergear `feat/1.1a-prisma-postgres`.
2. Etapa 1.1b: repo web (Next.js) en sesión aparte con su propio `AGENTS.md`; aquí solo se verifica CORS.
3. Preparar decisiones P-01 y P-02 para la 1.2.

## Registro de sesiones
| Fecha | Qué se hizo | Quién |
|---|---|---|
| 2026-10-22 | Bootstrap NestJS | Desarrollador |
| 2026-10-24 | Docker + Prisma 7 configurado; revisión de 1.1a; paquete de contexto añadido | Desarrollador + agente |
| 2026-10-24 | 1.1a cerrada: area uuidv7, migración correctiva, health con logs y recuperación, CORS normalizado, README | Agente (revisión del desarrollador) |
