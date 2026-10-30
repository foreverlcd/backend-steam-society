# PROGRESS: estado vivo (actualizar al terminar cada sesión)

Última actualización: 2026-10-30 · **Modo ACELERADO activo.** Rama `chore/accelerated-mode` en backend y frontend, creada desde `main`; contiene solo workflow, permisos y registro de decisiones, sin push. Las ramas `feat/1.3-admin-detail` (backend), `feat/1.3-admin-panel` (frontend), `feat/1.4-offerings-availability` (backend) y `feat/1.4-scheduling-client` (frontend) siguen pendientes de revisión y merge. `main` local `4b4b57e`, 6 commits adelante de `origin/main` `ac6eee7`, sin push. La ejecución de 1.5–1.7 espera la aprobación del mapa de ramas.

## Hecho (con evidencia)
- Entorno: Node 24.22.1, pnpm 12.15.0, NestJS 12.2 (ESM, Vitest, oxlint).
- Docker Compose: Postgres 18.6-alpine en `127.0.0.1:5433` y Mailpit `v1.27` (SMTP `1025`, bandeja `8025`).
- Prisma 7.10.1: `prisma.config.ts`, `PrismaService` (PrismaPg) y `PrismaModule` NO global en `src/shared/prisma/`.
- Modelo `Area`: `id` uuid v7 por defecto de base (`uuidv7()`), `name` único, `parent_id` opcional con FK `ON DELETE RESTRICT`, `active` default `true`, `created_at` `timestamptz(3)`, `@@map("area")`.
- Migraciones aplicadas en desarrollo y en `steam_society_test`: `20261024173759_add_area`, `20261024212009_fix_area_columns_and_uuidv7`, `20261024214215_add_identity`, `20261024215500_add_user_birth_date_check`, `20261024222451_add_profiles_and_audit`, `20261024224250_add_career_stage`, `20261024224933_use_jsonb_for_json_columns`.
- `GET /health` (sin prefijo): 200 `{status:'ok',db:'up'}` / 503 `{status:'error',db:'down'}`. El fallo se registra con `Logger` usando solo el nombre del error y su código de Prisma (nunca el mensaje ni la cadena de conexión).
- CORS: `WEB_ORIGIN` separada por comas; `parseWebOrigins()` normaliza. Sin variable, CORS desactivado. Con orígenes, `credentials: true`.
- `X-Powered-By` eliminada con `app.useSecurityHeaders()` (NestJS 12.1+); `configureApp()` centraliza seguridad, CORS, CSRF, sesión, prefijo `/v1` y el pipe de validación.
- 2026-10-25: formateo de `profiles`/e2e y auditoría/instalación de skills; commits `abd478a`, `3c44c54`, `006ec54` y `ab2c55b` en `chore/close-1.3`, sin push.
- Identidad 1.2:
  - `user` (`user_role`, `user_status`, email único y CHECK `email = lower(email)`), `password_reset_token` y `auth_session` (tabla propia para no chocar con `session` de mentoría).
  - `POST /v1/auth/register` (solo `mentee`/`mentor`; fecha de nacimiento; email normalizado; Argon2id), `POST /v1/auth/login`, `POST /v1/auth/logout`, `POST /v1/auth/password/forgot`, `POST /v1/auth/password/reset`, `GET /v1/me`.
  - Sesión con `express-session` + `connect-pg-simple`; cookie `__Host-sid` (`Secure`, `HttpOnly`, `SameSite=Lax`, 7 días) en producción y `sid` en desarrollo HTTP (`SESSION_COOKIE_SECURE=false`). Se regenera al entrar, se destruye al salir y se revocan todas las sesiones al cambiar la contraseña.
  - Recuperación: token aleatorio de 32 bytes, hash SHA-256 en base, TTL 1 hora, un solo uso, misma respuesta `202` exista o no el correo. El envío usa `SMTP_URL` (Mailpit en local).
  - CSRF con `enableCsrfProtection({ trustedOrigins })`; rate limit por IP + correo en login y recuperación con `@nestjs/throttler`.
  - Seed de admin con `ADMIN_EMAIL`/`ADMIN_PASSWORD`; nunca por registro público. Probado en `steam_society_test`: `admin|active|$argon2id`.
  - Validación con Zod 4 + `StandardSchemaValidationPipe`; `ConfigModule` valida el entorno al arrancar y falla rápido si falta `SESSION_SECRET` o es corto.
- Tests: 73 unitarios (11 archivos) verdes con `pnpm test`; `pnpm build` y `pnpm lint` verdes. El 2026-10-30 se ejecutaron 28 e2e (3 archivos) contra `steam_society_test` en `127.0.0.1:5433`: 28/28 verdes. La rama 1.4 reporta 115 unitarios y 36 e2e (no re-ejecutados en esta auditoría).
- README reescrito: puesta en marcha, variables, API, sesiones/CSRF/CORS, Mailpit, seed y base de tests.
- `feat/1.2-identity` fusionada en `main` con merge commit `64e8559` (`--no-ff`) y subida a `origin/main`; las ramas `feat/1.1a-prisma-postgres`, `chore/hardening-basics` y `feat/1.2-identity` también tienen upstream.
- Commits de la sesión anterior en `main`: `fd884b7` (area + migración inicial), `5c9102d` (health contrato), `e8f2333` (CORS), `69f6598` (README).
- Commits en rama `feat/1.1a-prisma-postgres`: `28d177a` (docs pack), `6bdbe9a` (migración area), `f49bd23` (uuidv7), `2b08759` (health), `edb0bbc` (CORS), `ca71563` (README).
- Commits en rama `chore/hardening-basics`: `88cf247` (log de health), `1ff119c` (X-Powered-By).

## Etapa 1.2: checklist
- [x] Registro con rol mentee/mentor y fecha de nacimiento.
- [x] Login, logout y `GET /v1/me`.
- [x] Recuperación de contraseña por correo (token de un solo uso).
- [x] Guardas globales de sesión y de rol (`@Public`, `@Roles`).
- [x] Rate limit en autenticación.
- [x] Seed de admin desde variables de entorno.
- [x] Tablas y migración aplicadas.
- [x] Tests de invariantes: email normalizado, Argon2id, token no almacenado en claro, un solo uso, revocación de sesiones, no enumeración de correos, CSRF y CORS.
- [x] Documentos y README actualizados.
- [ ] Revisión del diff por el desarrollador y revisión senior de la zona roja.

## Etapa 1.3: perfiles, onboarding y aprobación
- [x] Tablas `language`, `mentor_profile`, `mentee_profile`, `mentor_area`, `mentee_interest`, `mentor_language`, `mentee_language`, `onboarding_response` y `audit_log`; enums `mentor_status`, `education_level` y `career_stage`; migraciones `20261024222451_add_profiles_and_audit`, `20261024224250_add_career_stage` y `20261024224933_use_jsonb_for_json_columns`.
- [x] CHECKs de país, experiencia, antelación y versión; trigger `audit_log_append_only` para bloquear `UPDATE` y `DELETE`.
- [x] Seeds provisionales: idiomas `es`, `en`, `qu`; áreas Ciencia, Tecnología, Ingeniería y Matemáticas con subáreas.
- [x] `GET|PUT /v1/me/profile`, `POST /v1/me/profile/submit`, `GET|PUT /v1/me/onboarding`.
- [x] Onboarding versión 1 con las preguntas de producto entregadas; respuestas en `onboarding_response` y proyección a perfil/áreas/idiomas.
- [x] Admin: `GET /v1/admin/mentors?status=`, `approve`, `reject`, `suspend`, `reactivate`; rechazo con motivo.
- [x] Máquina de estados pura y test exhaustivo; transiciones admin + `audit_log` en una transacción; perfil editable sin cambiar estado.
- [x] Tests de rol, validación, versión de onboarding, jerarquía de áreas, auditoría append-only y flujo completo de aprobación.
- [x] Hardening: `completion: { complete, missing }` en onboarding, `submit` rechaza incompletos con `ONBOARDING_INCOMPLETE`, test de contrato config↔Zod.
- [x] Hardening: edad derivada de `birth_date` (fuera del onboarding) y `career_stage` exacto con backfill; `education_level` queda como proyección gruesa.
- [x] Hardening: `answer`/`metadata` en `jsonb`, `:id` de admin validado como UUID, `areaIds` de `PUT /profile` valida la jerarquía guardada y `areaIds: []` con área principal se rechaza.
- [ ] Revisión del diff por el desarrollador.

## Decisiones tomadas en esta sesión
- P-01 aceptada (ADR-016): `express-session` + `connect-pg-simple` + Argon2id, sin Passport.
- P-02 aceptada (ADR-017): Zod 4 + `StandardSchemaValidationPipe`.
- La tabla de sesiones de autenticación se llama `auth_session`; `session` queda para mentoría (1.5).
- La cookie `__Host-sid` se usa solo con `Secure`; en desarrollo HTTP se usa `sid` para que el navegador acepte la cookie.
- El registro público no crea admins; el seed tampoco asciende una cuenta existente que no sea admin.
- P-02 aceptada (ADR-017) y aplicada a los esquemas de perfiles/onboarding.
- ADR-018: onboarding versionado (`ONBOARDING_VERSION = 1`) y perfil editable siempre; editar no cambia `status`.
- `years_experience` se deriva del rango (`3-5` → 3, `6-9` → 6, `10+` → 10) y la respuesta original queda en `onboarding_response`.
- `career_stage` guarda la etapa exacta de la mentee; `education_level` queda como proyección gruesa para compatibilidad.
- La edad no se guarda en el onboarding: se deriva de `user.birth_date` para mostrarla.
- La completitud se calcula desde la config; el frontend no duplica las reglas de obligatoriedad.
- El área principal se guarda como respuesta y también en la tabla de áreas junto con las subáreas; la jerarquía se valida en el servicio.

## Modo acelerado y decisiones 2026-10-30
- Workflow ACELERADO adoptado en `AGENTS.md` de ambos repos: se encadenan las tareas de la etapa sin pedir confirmación del plan; solo se para en 'Detente y pregunta' o al cerrar la etapa. Se mantiene la calidad obligatoria y el informe único de cierre (máx. 25 líneas).
- `opencode.json` (ambos repos): se añadieron allows para `pnpm test:e2e`, `pnpm format`, `pnpm format:check`, `pnpm exec prisma migrate dev *`, `pnpm exec prisma migrate deploy`, `docker compose up|start|stop *`. Todos los deny existentes siguen al final; `pnpm add` sigue en `ask`.
- P-07: aceptada como ADR-020 (`temporal-polyfill` 1.0.6 aislado en `src/shared/time/` y en el dominio de slots). El ADR se incorporó a `docs/07-DECISIONS.md` en esta rama para no dejar el número huérfano; la implementación vive en `feat/1.4-offerings-availability`.
- P-10 parcial (ADR-021): plazo de respuesta de solicitudes de 48 h, configurable con `BOOKING_REQUEST_TTL_HOURS` (entero positivo; ejemplo en `.env.example` y README). La comisión queda para el Hito 2.
- P-11 (ADR-022): en el Hito 1 no hay bus de eventos ni outbox; el caso de uso llama a `NotificationsPort` después de confirmar la transacción y un fallo de correo se registra sin revertir la reserva. El outbox se decide en el Hito 2.
- P-12 (ADR-023): vencimiento evaluado al consultar + tarea periódica en proceso con `@nestjs/schedule`; actualización idempotente. Verificado con el registro npm: `@nestjs/schedule@12.0.2` declara peers `@nestjs/core` y `@nestjs/common` `^11.0.0 || ^12.0.0`; es compatible con NestJS 12. El intervalo se define en 1.5.
- Auditoría e2e: `pnpm test:e2e` reportó PostgreSQL `steam_society_test` en `127.0.0.1:5433`, 7 migraciones y 28/28 tests verdes. La base de desarrollo es `steam_society` (misma instancia, base distinta); `docker compose port postgres 5432` confirma `127.0.0.1:5433`.
- No se tomaron decisiones PENDIENTES fuera de las aprobadas en el mensaje del desarrollador.

## Etapa 1.4: en rama (no fusionada)
- `feat/1.4-offerings-availability` (HEAD `8ee0c09`, 7 commits desde `main`): ofertas, disponibilidad, slots con DST, migraciones `20261026161007_add_offerings_and_availability` y `20261026162005_use_time_for_availability`, 115 unitarios y 36 e2e reportados.
- `feat/1.4-scheduling-client` (frontend, HEAD `d627a37`, 4 commits): cliente/tipos/pruebas de scheduling, 36 tests reportados, sin UI.
- La UI de 1.4 y la ejecución de 1.5 quedan a la espera del mapa de ramas y del merge.

## Mapa de ramas (2026-10-30, pendiente de aprobación)
| Repo | Rama | Base | Commits | Tests | Riesgo / notas |
|---|---|---|---|---|---|
| Backend | `chore/accelerated-mode` | `4b4b57e` | 7 (incl. ajustes de docs) | 73 unit y 28 e2e verdes; build/lint verdes | Solo workflow, permisos y docs; sin código |
| Backend | `feat/1.3-admin-detail` | `4b4b57e` | 3 | 73 unit verdes; 30 e2e reportados; build/lint verdes | Zona roja (admin); conflictos de docs con accelerated y de `profiles` con 1.4 |
| Backend | `feat/1.4-offerings-availability` | `4b4b57e` | 7 | 115 unit verificados; 36 e2e reportados; build/lint verdes | Zona roja (scheduling); conflictos de docs y `profiles`; añade migraciones y `temporal-polyfill` |
| Web | `chore/accelerated-mode` | `00d327b` | 3 | 28 tests y lint verdes; build verde; `format:check` falla solo por `.agents/skills/*` | Solo workflow y permisos |
| Web | `feat/1.3-admin-panel` | `00d327b` | 4 | 40 tests verificados; lint verde; build reportado | Zona roja (admin); conflictos en `AGENTS.md`, README y `errors.ts` |
| Web | `feat/1.4-scheduling-client` | `00d327b` | 4 | 36 tests verificados; lint verde; build reportado | Zona roja (scheduling); conflictos en `AGENTS.md`, README y `errors.ts` |

Orden recomendado en ambos repos: `chore/accelerated-mode` → 1.3 → 1.4. No se ejecutó ningún merge; el desarrollador revisa y fusiona.

## Skills

- Política: revisión de solo lectura antes de instalar; copia manual de la carpeta a `.agents/skills/<id>/`; sin `npx skills add`, sin ejecutar scripts, sin symlinks y sin auto-actualización. Cada actualización se revisa y se registra en `docs/SKILLS.md`.
- Instaladas: `prisma-client-api` (prisma/skills, `ba3f9d7`, permiso `allow`) y `supabase-postgres-best-practices` (supabase/agent-skills, `c9be0e9`, permiso `ask`).
- No instalada: `prisma-cli` (prisma/skills, `ba3f9d7`): `prisma init` auto-instala skills y las referencias usan `npx`/`bunx`; queda pendiente de decisión del desarrollador.
- `opencode.json`: `skill * ask`, deny de `find-skills`, `caveman*`, `shadcn` y `migrate-radix-to-base`; allow exacto de `prisma-client-api`. El ID real de Postgres es `supabase-postgres-best-practices`; la regla explícita `postgres-best-practices` se conserva como alias y la regla general `skill * ask` cubre el ID real.

## Pendiente / riesgos para revisión con lupa
- El `.env` local ya permite arrancar la API, ejecutar el seed y usar Mailpit; sigue sin versionarse (no se leyó ni editó desde el agente).
- Verificación de correo: hoy el registro queda `status = active` y `email_verified_at = null`; no se implementó el flujo de verificación. Decidir si entra en 1.2 o se pospone.
- P-05 sigue pendiente: Mailpit es solo desarrollo; el proveedor transaccional no está elegido.
- Rate limit en memoria: se reinicia con el proceso y no se comparte entre instancias. Aceptable para el MVP de una instancia; revisar al escalar.
- `req.ip` depende de la configuración de proxy. Si la API queda detrás de un reverse proxy, configurar `trust proxy` para no agrupar a todas las usuarias bajo la IP del proxy; no se hizo porque depende del despliegue.
- `auth_session` no tiene FK a `user` (el `userId` vive en el JSON); la revocación es SQL sobre `sess->>'userId'`. Revisar si conviene mover el `userId` a una columna propia más adelante y borrar sesiones al eliminar una cuenta.
- El envío de correo de recuperación es fire-and-forget; si falla, se registra solo el nombre del error y el token queda válido hasta caducar. Revisar si se necesita reintento/outbox.
- Helmet completo: se mantienen los defaults de `useSecurityHeaders()`; revisar CSP/HSTS con el frontend real.
- 1.3: el onboarding acepta guardados parciales; `completion` ya se calcula en servidor y `submit` bloquea incompletos. El frontend debe consumir `completion` y no duplicar la regla.
- 1.3: el perfil `approved` sigue editable por decisión de producto; las ediciones post-aprobación no se auditan. Si se quiere re-revisión al cambiar campos sensibles, es una regla nueva.
- 1.3: `onboarding_response` puede conservar filas antiguas de `age`; `GET /v1/me/onboarding` filtra a los códigos vigentes. Decidir si se hace una limpieza de datos en una migración posterior.
- 1.3: `GET /v1/admin/mentors/:id` con onboarding completo está implementado en `feat/1.3-admin-detail` (pendiente de merge); la UI admin está en `feat/1.3-admin-panel` (pendiente de merge).
- 1.3: los seeds de áreas e idiomas son provisionales; el equipo de producto debe entregar las listas definitivas.
- 1.3: no hay ruta pública de catálogo todavía; la regla "solo `approved` visible" se implementará al crear esa ruta en 1.6.
- Skills: `prisma-cli` no se instaló; decidir si se acepta una versión adaptada sin `prisma init`/`npx` o si se deja fuera.

## Siguiente
1. Aprobar el mapa de ramas (E) y el orden de merge; no se ejecuta ningún merge sin esa aprobación.
2. Fusionar `chore/accelerated-mode` (workflow/permisos) en ambos repos; después 1.3 admin detail/panel y 1.4 backend/client, resolviendo los conflictos de docs y de `profiles` que se indiquen en el mapa.
3. Ejecutar la etapa 1.5 (reservas, zona roja) con la máquina de estados pura, exclusión SQL, test de concurrencia, vencimiento idempotente y `NotificationsPort`; luego 1.6 (catálogo/recomendaciones) y 1.7 (demo).
4. Web: implementar la UI de cada etapa leyendo primero el contrato publicado en README/PROGRESS del backend.
5. Revisión senior de autenticación y de las zonas rojas antes de producción; push de `main` solo con autorización del desarrollador.

## Registro de sesiones
| Fecha | Qué se hizo | Quién |
|---|---|---|
| 2026-10-22 | Bootstrap NestJS | Desarrollador |
| 2026-10-24 | Docker + Prisma 7 configurado; revisión de 1.1a; paquete de contexto añadido | Desarrollador + agente |
| 2026-10-24 | 1.1a cerrada: area uuidv7, migración correctiva, health con logs y recuperación, CORS normalizado, README | Agente (revisión del desarrollador) |
| 2026-10-24 | Hardening: log de health solo nombre+código, `X-Powered-By` eliminado, backlog 1.2 | Agente (revisión del desarrollador) |
| 2026-10-24 | 1.2 Identidad: sesiones, Argon2id, recuperación, CSRF, rate limit, seed, tests y docs | Agente (pendiente de revisión) |
| 2026-10-24 | Merge de `feat/1.2-identity` en `main` (`64e8559`), remoto `origin` configurado, tests verdes; push bloqueado por permisos | Agente (instrucción del desarrollador) |
| 2026-10-24 | 1.3 Perfiles/onboarding/aprobación: esquema, seeds, endpoints, máquina de estados, auditoría, tests y docs | Agente (pendiente de revisión) |
| 2026-10-24 | Hardening 1.3: completitud calculada, submit incompleto bloqueado, contrato config↔Zod, edad derivada y `career_stage` exacto | Agente (pendiente de revisión) |
| 2026-10-24 | Revisión pre-merge: `jsonb`, UUID en rutas admin, jerarquía de áreas en `PUT /profile` y tests e2e | Agente (pendiente de revisión) |
| 2026-10-24 | Merge local de 1.3 en `main` (`a3a42bc`); gates verdes; sin push | Agente (instrucción del desarrollador) |
| 2026-10-25 | Formato de `profiles`/e2e; permisos de skills; instalación revisada de `prisma-client-api` y `supabase-postgres-best-practices`; `prisma-cli` rechazada; docs actualizados; e2e no ejecutados | Agente (pendiente de revisión) |
| 2026-10-30 | Modo ACELERADO en ambos repos; allows de verificación/migraciones; ADR-020 a 023 (P-07, P-10 parcial, P-11, P-12); `BOOKING_REQUEST_TTL_HOURS`; auditoría e2e (28/28 en `steam_society_test`); mapa de ramas pendiente de aprobación | Agente (pendiente de revisión) |
