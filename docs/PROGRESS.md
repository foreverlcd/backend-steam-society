# PROGRESS: estado vivo (actualizar al terminar cada sesión)

Última actualización: 2026-10-24 · Etapa vigente: **1.1a** (Prisma + área + health + CORS + README)

## Hecho (con evidencia)
- Entorno: Node 24.22.1, pnpm 12.15.0, NestJS 12.2 (ESM, Vitest, oxlint).
- Docker Compose: Postgres 18.6-alpine, `healthy`, publicado en `127.0.0.1:5433`, volumen en `/var/lib/postgresql`.
- Prisma 7.10.1 configurado: `prisma.config.ts`, `prisma/schema.prisma` (solo generator + datasource, SIN modelos), `PrismaService` (PrismaPg) y `PrismaModule` NO global en `src/shared/prisma/`. `prisma validate` y `prisma generate` OK. `prisma migrate status` conecta y dice "no migration found".
- `ConfigModule` global, `enableShutdownHooks()` en `main.ts`.
- `HealthModule` existe pero es un STUB (devuelve un objeto fijo; sus 3 tests validan el stub, no el contrato).
- Commits en `main`: `0a589d0` (prisma y configs), `31924f9` (health stub).

## En curso: Etapa 1.1a (ver contrato en `05-ROADMAP.md`)
- [ ] Modelo `area` + migración creada y aplicada.
- [ ] `HealthService` con `PrismaService` (`SELECT 1`), `HealthModule` importa `PrismaModule`.
- [ ] `GET /health` → 200 `{status:'ok',db:'up'}` / 503 `{status:'error',db:'down'}`.
- [ ] Tests Vitest con `PrismaService` falso (base arriba y base caída); sin tests duplicados entre controller y service.
- [ ] CORS configurable con `WEB_ORIGIN` (lista separada por comas) + `.env.example` + prueba de preflight con curl.
- [ ] README: cómo levantar el proyecto desde cero.

## Decisiones tomadas en esta sesión
- El agente implementa; el desarrollador revisa cada diff. Commits por el agente en rama `feat/…`; sin push; el merge lo hace el desarrollador.
- Arranque con la base caída: **falla rápido** (comportamiento actual de `$connect()`); documentarlo en el README. El 503 de `/health` aplica con la app ya levantada y la base que cae después.
- CORS: `WEB_ORIGIN` admite varios orígenes separados por comas. API en 3000, web en 3001.
- La migración la ejecuta el agente (el desarrollador aprueba el comando); la base ya está arriba.
- `/health` queda sin prefijo de versión; el resto de la API irá bajo `/v1`.

## Bloqueos y decisiones pendientes (ver `07-DECISIONS.md`)
- Antes de la 1.2: autenticación (P-01) y validación (P-02). El agente investiga y propone; decide el desarrollador.
- Pendiente del equipo de producto: preguntas de onboarding, lista de áreas STEAM, % de comisión, plazo de respuesta de solicitudes, política de cancelación (DA-05).

## Siguiente
1. Cerrar 1.1a. 2. Etapa 1.1b: repo web (Next.js) en sesión aparte con su propio `AGENTS.md`; aquí solo se verifica CORS. 3. Preparar decisiones P-01 y P-02 para la 1.2.

## Registro de sesiones
| Fecha | Qué se hizo | Quién |
|---|---|---|
| 2026-10-22 | Bootstrap NestJS | Desarrollador |
| 2026-10-24 | Docker + Prisma 7 configurado; revisión de 1.1a; paquete de contexto añadido | Desarrollador + agente |
