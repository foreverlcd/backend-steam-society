# PROGRESS: estado vivo (actualizar al terminar cada sesión)

Última actualización: 2026-11-18 · **MVP del piloto completo en código, sin desplegar**: videollamada propia con chat de texto (ADR-028), correos con outbox (ADR-027), seguridad de la comunidad y vistas admin del piloto (ADR-029), paquete de despliegue Oracle (`docs/DEPLOY-ORACLE.md`) con coturn y `TRUST_PROXY`. CI verde en ambos repos. Siguiente: desplegar en Oracle (acceso, dominio, Brevo) y probar con usuarias reales. · Anterior (2026-11-17): **F2 identidad hecha en código (ADR-024)**: verificación de correo y 2FA TOTP, backend y web (probado en navegador con el correo real de Mailpit). · **Arnés de agentes listo** (`docs/HARNESS.md`); siguiente: quick wins de UX ejecutados con el arnés (`docs/exec-plans/active/`). · **Hito 1 cerrado en código** en las ramas `feat/close-milestone-1` (backend y web). Hay una revisión senior de 1.5/1.6 con 10 hallazgos corregidos, un módulo de pagos desacoplado (ADR-025, `disabled` por defecto y `fake` en desarrollo), y la etapa 1.7 tiene datos demo, guion, k6 y límites de peticiones. Las recomendaciones de F0 se aceptaron como provisionales (ADR-026). Gates: backend 267 unitarios + 64 e2e, build y lint; web 69 tests, build, lint y format. Pendiente humano: demo con 3 personas, evaluación de matching con 10 pares reales y decisión sobre los parches de seguridad de `next` y `multer`.

## Hecho (con evidencia)
- Entorno: Node 24.22.1, pnpm 12.15.0, NestJS 12.2 (ESM, Vitest, oxlint).
- Docker Compose: Postgres 18.6-alpine en `127.0.0.1:5433` y Mailpit `v1.27` (SMTP `1025`, bandeja `8025`).
- Prisma 7.10.1: `prisma.config.ts`, `PrismaService` (PrismaPg) y `PrismaModule` NO global en `src/shared/prisma/`.
- Modelo `Area`: `id` uuid v7 por defecto de base (`uuidv7()`), `name` único, `parent_id` opcional con FK `ON DELETE RESTRICT`, `active` default `true`, `created_at` `timestamptz(3)`, `@@map("area")`.
- Migraciones aplicadas en desarrollo y en `steam_society_test`: `20261024173759_add_area`, `20261024212009_fix_area_columns_and_uuidv7`, `20261024214215_add_identity`, `20261024215500_add_user_birth_date_check`, `20261024222451_add_profiles_and_audit`, `20261024224250_add_career_stage`, `20261024224933_use_jsonb_for_json_columns`, `20261026161007_add_offerings_and_availability`, `20261026162005_use_time_for_availability`, `20261030234248_add_sessions_and_bookings` y `20261031002413_add_catalog_search` (11).
- `GET /health` (sin prefijo): 200 `{status:'ok',db:'up'}` / 503 `{status:'error',db:'down'}`. El fallo se registra con `Logger` usando solo el nombre del error y su código de Prisma (nunca el mensaje ni la cadena de conexión).
- CORS: `WEB_ORIGIN` separada por comas; `parseWebOrigins()` normaliza. Sin variable, CORS desactivado. Con orígenes, `credentials: true`.
- `X-Powered-By` eliminada con `app.useSecurityHeaders()` (NestJS 12.1+); `configureApp()` centraliza seguridad, CORS, CSRF, sesión, prefijo `/v1` y el pipe de validación.
- 2026-10-25: formateo de `profiles`/e2e y auditoría/instalación de skills; commits `abd478a`, `3c44c54`, `006ec54` y `ab2c55b` en `chore/close-1.3`, sin push.
- Identidad 1.2:
  - `user` (`user_role`, `user_status`, email único y CHECK `email = lower(email)`), `password_reset_token` y `auth_session` (tabla propia para no chocar con `session` de mentoría).
  - `POST /v1/auth/register` (solo `mentee`/`mentor`; fecha de nacimiento; `acceptTerms: true` y `guardianConsent` si <14 desde 2026-11-18; email normalizado; Argon2id), `POST /v1/auth/login`, `POST /v1/auth/logout`, `POST /v1/auth/password/forgot`, `POST /v1/auth/password/reset`, `GET /v1/me`.
  - Sesión con `express-session` + `connect-pg-simple`; cookie `__Host-sid` (`Secure`, `HttpOnly`, `SameSite=Lax`, 7 días) en producción y `sid` en desarrollo HTTP (`SESSION_COOKIE_SECURE=false`). Se regenera al entrar, se destruye al salir y se revocan todas las sesiones al cambiar la contraseña.
  - Recuperación: token aleatorio de 32 bytes, hash SHA-256 en base, TTL 1 hora, un solo uso, misma respuesta `202` exista o no el correo. El envío usa `SMTP_URL` (Mailpit en local).
  - CSRF con `enableCsrfProtection({ trustedOrigins })`; rate limit por IP + correo en login y recuperación con `@nestjs/throttler`.
  - Seed de admin con `ADMIN_EMAIL`/`ADMIN_PASSWORD`; nunca por registro público. Probado en `steam_society_test`: `admin|active|$argon2id`.
  - Validación con Zod 4 + `StandardSchemaValidationPipe`; `ConfigModule` valida el entorno al arrancar y falla rápido si falta `SESSION_SECRET` o es corto.
- Tests: `feat/1.4-offerings-availability` reporta 115 unitarios (15 archivos) y 36 e2e el 2026-10-26. Tras el merge de 1.4 en `main` (2026-10-30): `pnpm build`, `pnpm lint` y 115 unitarios verdes; 38 e2e (4 archivos) verdes contra `steam_society_test` en `127.0.0.1:5433`, con las 9 migraciones aplicadas.
- Tests 2026-10-31 (1.6): `pnpm build`, `pnpm lint`, 228 unitarios (18 archivos) y 55 e2e (6 archivos) verdes contra `steam_society_test` con las 11 migraciones; `pnpm eval:matching` reporta precision@3 = 1,000.
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
- [x] Admin: `GET /v1/admin/mentors?status=`, `GET /v1/admin/mentors/:id`, `approve`, `reject`, `suspend`, `reactivate`; rechazo con motivo.
- [x] Detalle admin: `{ mentor, onboarding }` con perfil, `minNoticeHours`, `maxAdvanceDays`, áreas, idiomas, pasos, respuestas, completitud y opciones; reutiliza `buildOnboarding('mentor', ...)`.
- [x] Frontend admin: bandeja con filtros por estado y cursor, detalle completo del onboarding, acciones aprobar/rechazar/suspender/reactivar y manejo de 401/403; 40 tests verdes en `feat/1.3-admin-panel`.
- [x] Máquina de estados pura y test exhaustivo; transiciones admin + `audit_log` en una transacción; perfil editable sin cambiar estado.
- [x] Tests de rol, validación, versión de onboarding, jerarquía de áreas, auditoría append-only y flujo completo de aprobación.
- [x] Hardening: `completion: { complete, missing }` en onboarding, `submit` rechaza incompletos con `ONBOARDING_INCOMPLETE`, test de contrato config↔Zod.
- [x] Hardening: edad derivada de `birth_date` (fuera del onboarding) y `career_stage` exacto con backfill; `education_level` queda como proyección gruesa.
- [x] Hardening: `answer`/`metadata` en `jsonb`, `:id` de admin validado como UUID, `areaIds` de `PUT /profile` valida la jerarquía guardada y `areaIds: []` con área principal se rechaza.
- [ ] Revisión del diff por el desarrollador.

## Etapa 1.4: ofertas y disponibilidad
- [x] Tablas `offering` y `availability_rule`; enum `offering_type`; migraciones `20261026161007_add_offerings_and_availability` y `20261026162005_use_time_for_availability`.
- [x] CHECKs: precio gratuito/pagado, duración 15–240, capacidad, `one_to_one` ⇒ capacidad 1, moneda ISO 4217; weekday 1–7, orden y rango de horas, zona no vacía, `valid_to >= valid_from`.
- [x] `temporal-polyfill` 1.0.6 aislado en `src/shared/time/` y en el dominio de slots; P-07 resuelta (ADR-020).
- [x] CRUD de ofertas: `GET|POST /v1/me/offerings`, `PATCH /v1/me/offerings/:id`, `POST /v1/me/offerings/:id/archive`; archivo lógico y ownership.
- [x] Disponibilidad: `GET|PUT /v1/me/availability`; reemplazo transaccional; zona por regla con default `user.timezone`.
- [x] Slots públicos: `GET /v1/mentors/:id/slots?offeringId&from&to`; antelación mínima/máxima, duración, DST, rango máximo 90 días y slots ocupados.
- [x] Puerto `SessionConflictPort` con `NoSessionConflictAdapter` (devuelve `[]`) para respetar el orden de migraciones; adaptador real en 1.5.
- [x] Tests: 42 de scheduling (11 dominio, 13 ofertas, 10 disponibilidad, 8 slots) + 8 e2e de CHECKs/CRUD/slots; total del repo 115 unitarios y 36 e2e.
- [x] Documentos actualizados (`PROGRESS`, `05-ROADMAP`, `07-DECISIONS`, `03-DATA-MODEL`).
- [ ] Revisión del diff por el desarrollador y merge; frontend: cliente/tipos/pruebas listos en rama, UI pendiente.

## Etapa 1.5: reservas (zona roja)
- [x] Migración `20261030234248_add_sessions_and_bookings` con `session`/`booking`, enums `session_status`, `booking_status`, `cancel_actor` y `no_show_party`; aplicada en `steam_society` y `steam_society_test`.
- [x] SQL a mano: `btree_gist`, exclusión `session_no_overlap` (R-15), índice único parcial `booking_active_seat_uk`, CHECKs de fechas, precio/moneda, cancelación, no-show y completado.
- [x] Máquina de estados pura `booking-status.ts` con test exhaustivo de transiciones y guardas temporales.
- [x] `POST /v1/bookings` con validación de disponibilidad, perfil de mentee, mentora aprobada, oferta activa, locks de asesoría por mentee/mentora y creación transaccional de `session` + `booking`.
- [x] `GET /v1/bookings` (cursor y filtro por estado) y `GET /v1/bookings/:id` con vencimiento evaluado al leer.
- [x] Acciones `accept` (gratuita exige `meetingUrl`; de pago → `awaiting_payment`), `decline`, `cancel`, `complete` y `no-show` con `UPDATE ... WHERE status = <leído>`.
- [x] Vencimiento idempotente al consultar/actuar + tarea `@Interval(60_000)` con `@nestjs/schedule`; libera la sesión y notifica.
- [x] `NotificationsPort` + adaptador de correo; envío después del commit, best-effort, sin outbox (ADR-022).
- [x] `PrismaSessionConflictAdapter` reemplaza `NoSessionConflictAdapter`; los slots públicos ya excluyen sesiones no canceladas.
- [x] `MenteeProfilePort` evita que `bookings` lea `mentee_profile`; sin perfil responde `400 MENTEE_PROFILE_REQUIRED`.
- [x] Tests: 219 unitarios (17 archivos) y 50 e2e (5 archivos), incluidos concurrencia, R-12, R-15, vencimiento idempotente, CHECKs y R-07.
- [x] Contrato de 1.5 publicado en `README.md`; `docs/02`, `03`, `04`, `05`, `06` y ADR-014 actualizados.
- [ ] Revisión del diff por el desarrollador y revisión senior de la zona roja.
- [ ] UI del frontend de reservas y prueba de contrato real.

## Etapa 1.6: catálogo y recomendaciones
- [x] Migración `20261031002413_add_catalog_search` con `pg_trgm`, `search_vector` generada (headline A, bio B, city C) e índices GIN/trigramas; aplicada en `steam_society` y `steam_society_test`.
- [x] `GET /v1/mentors` público con `q`, `areaId`, `language`, `country`, `isFree`, `maxPriceMinor`, `currency`, `limit` y cursor opaco `{ rank, userId }` en base64url; solo mentoras `approved` con cuenta `active`.
- [x] `GET /v1/mentors/:id` público con detalle y ofertas activas; `404 MENTOR_NOT_FOUND` para no aprobadas o inexistentes.
- [x] `GET /v1/me/recommendations?limit=` para `mentee` con perfil; filtros duros, puntaje ponderado, desglose y razón; máximo 10, default 3.
- [x] Motor puro `recommend()` con configuración provisional 35/20/15/15/10/5, horizonte 14 días, reliability neutral 0,5 y disponibilidad calculada con la oferta activa de menor duración.
- [x] Módulos de composición `catalog` (profiles + scheduling) y `matching` (profiles + scheduling + dominio puro), sin crear dependencia `profiles → scheduling`.
- [x] Tests: 9 unitarios nuevos de `recommend` (filtros, orden, pesos, razón, áreas raíz/hija, rango 0–100) y 5 e2e de catálogo/cursor/detalle/recomendaciones; total 228 unitarios (18 archivos) y 55 e2e (6 archivos).
- [x] Script `pnpm eval:matching` con fixture de 20 mentees y 30 mentoras; precision@3 = 1,000 (meta 0,6).
- [x] README, `docs/02`, `docs/03`, `docs/05` y `docs/08` actualizados.
- [x] UI de catálogo/recomendaciones en el frontend: `/mentors` con filtros y paginación, `/mentors/[id]` con ofertas, slots y solicitud de reserva, y recomendaciones en el dashboard de mentorada.
- [x] UI de ofertas, disponibilidad, reservas y perfil: `/dashboard/offerings`, `/dashboard/availability`, `/dashboard/bookings` y `/dashboard/profile`, con navegación por rol.
- [x] Datos demo en desarrollo: `demo.mentora@steam.test` (aprobada, 2 ofertas y 3 franjas) y `demo.mentee@steam.test` (onboarding/perfil y 1 reserva `requested`); contraseña `DemoSteam2026!`. Verificado por API: catálogo 1 mentora con 2 ofertas, recomendaciones score 90, 27 slots y reserva creada.
- [ ] Revisión del diff por el desarrollador y revisión senior de la zona roja.
- [ ] Evaluación humana con 10 pares reales y ajuste de pesos si hace falta.
- [ ] Prueba manual en navegador del flujo catálogo → detalle → reserva → aceptación (requiere API en `localhost:3000` y web en `localhost:3001`).

## F2: identidad (verificación de correo y 2FA, ADR-024)
Rama `feat/f2-identity` (cambios sin commit al escribir esto).
- [x] Migración `20261117150930_add_email_verification_and_mfa`: tablas `email_verification_token`, `user_totp` y `mfa_recovery_code`, CHECKs a mano y backfill (las cuentas existentes quedan verificadas). Detalle en `docs/03-DATA-MODEL.md`.
- [x] Verificación de correo: `POST /v1/auth/email/verify` (204) y `POST /v1/auth/email/resend` (202; `409 EMAIL_ALREADY_VERIFIED`); enlace `${APP_URL}/verify-email?token=`, TTL `EMAIL_VERIFICATION_TTL_HOURS` (48). `@RequireVerifiedEmail` en `POST /v1/bookings` y `POST /v1/me/profile/submit` (`403 EMAIL_NOT_VERIFIED`).
- [x] 2FA TOTP (RFC 6238, sin dependencias nuevas): secreto cifrado con AES-256-GCM (`MFA_ENCRYPTION_KEY`), anti-repetición con `last_used_time_step`, 10 códigos de recuperación de un solo uso. Endpoints `GET /v1/me/mfa`, `POST /v1/me/mfa/totp/setup|totp/confirm|recovery-codes|disable`; login en dos pasos con `POST /v1/auth/login/mfa`; límite por cuenta (`mfa:<userId>`); auditoría `user.mfa_enabled` y `user.mfa_disabled`.
- [x] Obligatorio para admin (`AccountPolicyGuard`, `@AllowWithoutMfa`): `403 MFA_ENROLLMENT_REQUIRED` y `403 MFA_REQUIRED_FOR_ROLE`. `AuthUser` incluye `emailVerified` y `mfaEnabled`.
- [x] Seeds: el admin nace verificado; `seed-demo` verifica correos y aprueba mentoras por Prisma con auditoría (la API de admin exige 2FA); ahora pide `DATABASE_URL` y `ADMIN_EMAIL`, no `ADMIN_PASSWORD`.
- [x] Gate: se agregó el paso `tsc --noEmit` a `scripts/gate.sh`.
- [x] Tests: 296 unitarios y 70 e2e; `scripts/gate.sh full` en verde.
- [x] Docs: ADR-024, `03-DATA-MODEL.md`, README, `06-CONVENTIONS.md`, `05-ROADMAP.md`, `FLOWS.md` §9 y §10.
- [x] UI web: paso de código o código de recuperación en el login, `/verify-email`, aviso con reenvío, página Seguridad, admin redirigido a activar el 2FA.
- [ ] Pendiente: revisión del desarrollador de la zona roja; QR en la activación (requiere dependencia); flujo de soporte si se pierden teléfono y códigos.
- Aplazado sin decidir (ADR-024): roles `superadmin`/finanzas/soporte/moderación y WebAuthn. SMS rechazado. Sin flujo de recuperación si se pierden el dispositivo y los códigos (hoy, manual en base). Respaldar `MFA_ENCRYPTION_KEY`.

## F2: cuenta (sesiones, cambios y datos personales)
Rama `feat/f2-account` (backend). Plan: `docs/exec-plans/completed/2026-11-17-f2-account.md`.
- [x] Sesiones activas: listar, cerrar una y cerrar las demás (`/v1/me/sessions`). Cambiar contraseña o activar 2FA cierra las demás.
- [x] Cambiar contraseña y correo con step-up (contraseña + código 2FA si lo tiene); avisos por correo; migración `20261117155718_add_email_change`.
- [x] HIBP opcional (`PASSWORD_BREACH_CHECK=hibp`), k-anonimato, sin bloquear si falla.
- [x] Exportar datos (`GET /v1/me/export`) y eliminar cuenta (`POST /v1/me/delete`) con `PersonalDataRegistry`: cada módulo exporta y borra lo suyo. Retención provisional (DA-04); pagos fuera (P-03).
- [x] Tests: e2e `account-security` (7) y `account` (5), unitarios del servicio y del registro; gate full verde.
- [x] Web (rama `feat/f2-account` del web): sesiones, contraseña, correo, descargar datos y eliminar cuenta en `/account/security`; tests y prueba real en navegador con ui-shots (incluida la eliminación). Revisión codex: 1 hallazgo (secretos en el formulario tras eliminar), arreglado.

## Decisiones tomadas (acumuladas)
### 1.6 (2026-10-31)
- `catalog` es un módulo de composición que importa `profiles` y `scheduling`; `matching` importa ambos y mantiene el motor en dominio puro. Así `profiles` no depende de `scheduling`.
- Búsqueda: `search_vector` generada en PostgreSQL con `to_tsvector('spanish', ...)` y `pg_trgm` como respaldo; el cursor es opaco (`base64url` de `{ rank, userId }`) y ordena por `rank DESC, userId ASC`.
- Matching: pesos provisionales 35/20/15/15/10/5, horizonte 14 días, N=3 y reliability neutral 0,5; la razón usa solo los dos componentes con más puntos y `points > 0`.
- Disponibilidad: se calcula con la oferta activa de menor duración como proxy de "tiene un slot reservable"; el hard filter exige al menos un slot en 14 días.
- Áreas: coincidencia exacta vale 1; raíz/hija en cualquier dirección vale 0,5, tanto en el filtro duro como en el puntaje.
- Onboarding v1 no pregunta presupuesto ni "solo gratuitas": `onlyFree` y `maxPriceMinor` quedan `null`; `price_fit` da 10 si hay oferta gratuita y 5 neutral si solo hay pago.
- La evaluación sintética es una línea base; no reemplaza el juicio humano ni justifica cambiar pesos sin evidencia.

### 1.5 (2026-10-30)
- `@nestjs/schedule@12.0.2` (compatible con NestJS 12; usa `cron@4.4.0`) y `ScheduleModule.forRoot()` en `AppModule`.
- `BOOKING_REQUEST_TTL_HOURS` validado en entorno, entero positivo, 48 h por defecto (ADR-021).
- API de reservas: `POST/GET /v1/bookings`, `GET /v1/bookings/:id` y acciones `accept`, `decline`, `cancel`, `complete`, `no-show`.
- Aceptar una reserva gratuita exige `meetingUrl`; las de pago pasan a `awaiting_payment` sin módulo de pagos (Hito 2).
- `cancel_reason` almacena también el motivo de rechazo para no añadir columnas fuera de `docs/03`.
- Vencimiento: evaluación al leer/actuar + tarea cada 60 s; `UPDATE` idempotente con guarda de estado.
- Notificaciones después del commit, best-effort, sin outbox; errores solo con nombre de error.
- Se reutilizan los puertos de `scheduling` exportados; el adaptador real de sesiones reemplaza `NoSessionConflictAdapter`.
- Las reservas 1:1 crean una `session` por solicitud; la exclusión `session_no_overlap` protege R-15 y un lock de asesoría por mentee/mentor protege R-12.
- El plazo de pago de `awaiting_payment` queda pendiente del Hito 2: por ahora conserva `expires_at` de la solicitud.

### 1.4 (2026-10-26)
- P-07 aceptada (ADR-020): `temporal-polyfill` 1.0.6, aislado en `src/shared/time/` y en el dominio de slots; Node 24.22.1 no expone `Temporal`.
- Ofertas `one_to_one` con capacidad 1 y duración 15–240; gratuita ⇒ `priceMinor = 0`; de pago ⇒ `priceMinor > 0`; moneda ISO 4217 con `PEN` por defecto.
- Crear/editar ofertas y reemplazar disponibilidad exigen mentora `approved` y usuaria `active`; archivar la oferta es lógico y se permite aunque la mentora deje de estar aprobada.
- Slots públicos exigen mentora `approved`, usuaria `active`, oferta `active` y no archivada. `SessionConflictPort` devuelve `[]` en 1.4; el adaptador real llega en 1.5.
- DST con `disambiguation: 'compatible'`: se omite una hora local inexistente en un gap y no se duplica la hora repetida en un overlap; rango máximo de consulta 90 días.
- `availability_rule.start_time`/`end_time` son `TIME(0)`; la API usa `HH:mm` y el repositorio traduce. La primera migración usó `varchar(5)` y una segunda migración nueva hizo el cast sin borrar datos.
- `scheduling` no lee tablas de `profiles`: usa `MentorSettingsPort`, implementado por `ProfilesMentorSettingsAdapter` sobre el servicio exportado de `profiles`.
- El frontend tiene ahora cliente, tipos y pruebas de 1.4 en la rama `feat/1.4-scheduling-client` (4 commits, HEAD `d627a37`), sin UI; 36 tests, build y lint verdes. `format:check` global sigue fallando solo por archivos preexistentes de `.agents/skills`.

### 1.3
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
- Detalle admin: `GET /v1/admin/mentors/:id` devuelve `{ mentor, onboarding }`; `mentor` añade `minNoticeHours` y `maxAdvanceDays` al resumen de la bandeja y `onboarding` reutiliza `buildOnboarding('mentor', ...)`.
- La UI admin no duplica reglas de completitud: muestra `onboarding.completion` y los pasos que devuelve la API; las acciones se deshabilitan según el estado de la máquina de estados.

## Modo acelerado y decisiones 2026-10-30
- Workflow ACELERADO adoptado en `AGENTS.md` de ambos repos: se encadenan las tareas de la etapa sin pedir confirmación del plan; solo se para en 'Detente y pregunta' o al cerrar la etapa. Se mantiene la calidad obligatoria y el informe único de cierre (máx. 25 líneas).
- `opencode.json` (ambos repos): se añadieron allows para `pnpm test:e2e`, `pnpm format`, `pnpm format:check`, `pnpm exec prisma migrate dev *`, `pnpm exec prisma migrate deploy`, `docker compose up|start|stop *`. Todos los deny existentes siguen al final; `pnpm add` sigue en `ask`.
- P-07: aceptada como ADR-020 (`temporal-polyfill` 1.0.6 aislado en `src/shared/time/` y en el dominio de slots). El ADR se incorporó a `docs/07-DECISIONS.md` en esta rama para no dejar el número huérfano; la implementación vive en `feat/1.4-offerings-availability`.
- P-10 parcial (ADR-021): plazo de respuesta de solicitudes de 48 h, configurable con `BOOKING_REQUEST_TTL_HOURS` (entero positivo; ejemplo en `.env.example` y README). La comisión queda para el Hito 2.
- P-11 (ADR-022): en el Hito 1 no hay bus de eventos ni outbox; el caso de uso llama a `NotificationsPort` después de confirmar la transacción y un fallo de correo se registra sin revertir la reserva. El outbox se decide en el Hito 2.
- P-12 (ADR-023): vencimiento evaluado al consultar + tarea periódica en proceso con `@nestjs/schedule`; actualización idempotente. Verificado con el registro npm: `@nestjs/schedule@12.0.2` declara peers `@nestjs/core` y `@nestjs/common` `^11.0.0 || ^12.0.0`; es compatible con NestJS 12. El intervalo se define en 1.5.
- Auditoría e2e: `pnpm test:e2e` reportó PostgreSQL `steam_society_test` en `127.0.0.1:5433`, 11 migraciones y 55/55 tests verdes. La base de desarrollo es `steam_society` (misma instancia, base distinta); `docker compose port postgres 5432` confirma `127.0.0.1:5433`.
- No se tomaron decisiones PENDIENTES fuera de las aprobadas en el mensaje del desarrollador.

## Etapa 1.6: fusionada en `main` (revisión pendiente)
- `feat/1.6-catalog-matching` (creada desde `main` `b04fd2e`, publicada en `origin` hasta `f4fa857`): catálogo público, búsqueda, recomendaciones, migración de búsqueda, tests y script de evaluación. Fusionada en `main` con `--no-ff` en `2cfb03b`; tag local `backup/pre-merge-feat/1.6-catalog-matching`.
- `main` del backend (`2cfb03b`, publicado en `origin`) contiene accelerated-mode, 1.3 admin detail, 1.4 ofertas/disponibilidad, 1.5 reservas y 1.6 catálogo/recomendaciones.
- Web: `feat/1.6-catalog-client` (creada desde `feat/1.3-admin-panel`, merge local de `feat/1.4-scheduling-client` en `2cd66dc`) tiene la UI completa: catálogo, detalle con reserva, recomendaciones, ofertas, disponibilidad, reservas y perfil. Commits `cdb0687` (clientes API), `e7632d0` (catálogo público), `a13b282` (dashboard), `c915f53` (docs), `999f9a2` (ajustes de disponibilidad y cancelación) y `e210dac` (perfil de mentora sin onboarding). Fusionada en `main` web con `--no-ff` en `f834ce8` y publicada; gates: build, lint, `tsc --noEmit` y 65 tests (15 archivos) verdes.

## Mapa de ramas (2026-10-31)
| Repo | Rama | Estado |
|---|---|---|
| Backend | `main` | `2cfb03b` publicado en `origin`; incluye 1.5 y 1.6 (228 unitarios y 55 e2e) |
| Backend | `feat/1.5-bookings` | Fusionada en `main` con `--no-ff`; revisión senior pendiente |
| Backend | `feat/1.6-catalog-matching` | `f4fa857` publicada en `origin`; fusionada en `main` con `--no-ff` (`2cfb03b`); revisión pendiente |
| Web | `main` | `f834ce8` publicado en `origin`; incluye la UI 1.3–1.6 (65 tests) |
| Web | `feat/1.3-admin-panel` | `7733765` publicada en `origin`; fusionada en `main` web |
| Web | `feat/1.4-scheduling-client` | `d627a37` publicada en `origin`; fusionada en `main` web |
| Web | `feat/1.6-catalog-client` | `e210dac` publicada en `origin`; fusionada en `main` web (`f834ce8`); revisión pendiente |

## Skills

- Política: revisión de solo lectura antes de instalar; copia manual de la carpeta a `.agents/skills/<id>/`; sin `npx skills add`, sin ejecutar scripts, sin symlinks y sin auto-actualización. Cada actualización se revisa y se registra en `docs/SKILLS.md`.
- Instaladas: `prisma-client-api` (prisma/skills, `ba3f9d7`, permiso `allow`) y `supabase-postgres-best-practices` (supabase/agent-skills, `c9be0e9`, permiso `ask`).
- No instalada: `prisma-cli` (prisma/skills, `ba3f9d7`): `prisma init` auto-instala skills y las referencias usan `npx`/`bunx`; queda pendiente de decisión del desarrollador.
- `opencode.json`: `skill * ask`, deny de `find-skills`, `caveman*`, `shadcn` y `migrate-radix-to-base`; allow exacto de `prisma-client-api`. El ID real de Postgres es `supabase-postgres-best-practices`; la regla explícita `postgres-best-practices` se conserva como alias y la regla general `skill * ask` cubre el ID real.

## Cierre del Hito 1 (2026-11-16)
- **Revisión senior de 1.5/1.6** (agente revisor independiente, solo lectura). Corregidos: (1) `no_show_party` guardaba a quien reportaba y ahora guarda a la persona ausente; (2) una solicitud podía aceptarse y completarse después de su sesión, y ahora `expires_at = min(TTL, starts_at)`; (3) `meetingUrl` aceptaba `javascript:`/`data:`, y ahora solo `https`; (4) no había límites en reservas ni en rutas públicas; (5) la violación de exclusión no se mapeaba con el adaptador `pg` (`driverAdapterError.cause.originalCode`); (6) un cursor con `userId` que no es UUID daba 500; (7) se podía cancelar una reserva de pago ya terminada; (8) carrera al vencer, que ahora tiene la guarda `expires_at > now` en el `UPDATE`; (9) las ofertas grupales contaban como gratis o con disponibilidad; (10) `accept` no revalidaba a la mentora.
- **Pagos (ADR-025):** `payment` + `webhook_event`, migración `20261116213734_add_payments`, `POST /v1/payments/checkout`, `POST /v1/payments/webhooks/:provider`, `GET /v1/payments/config`. Web: botón Pagar y `/payments/fake-checkout`.
- **1.7:** `pnpm db:seed:demo`, `docs/DEMO.md` y `load/k6-read.js` (baseline local en verde; detalle en `05-ROADMAP.md`).
- **Web:** la mentee puede reportar que la mentora no asistió; el estado muestra quién faltó; validación `https` del enlace.
- **Permisos del agente (`opencode.json`, ambos repos):** se bloquean force, delete, mirror, all y tags en cualquier posición del `git push`; solo se permite `git push origin <rama>`.
- **Entorno local:** el puerto 5433 lo usa también `qhali-pg` (otro proyecto). Para trabajar, el desarrollador autorizó detenerlo temporalmente.

## Pendiente / riesgos para revisión con lupa
- Pagos: el webhook `fake` no lleva firma (solo desarrollo; la API no arranca con `fake` en producción). Un proveedor real **debe** verificar la firma en `parseWebhook`.
- Pagos: si el pago se acredita cuando la reserva ya venció, el pago queda `paid` sin confirmar la reserva (se registra un error). Hace falta un reembolso (Hito 2, DA-05).
- Pagos: el plazo de pago reutiliza el `expires_at` de la solicitud (como máximo hasta `starts_at`); se decidirá un plazo propio en el Hito 2.
- Reservas: no hay tope de solicitudes `requested` por par mentee–mentora. El límite de 10/min mitiga, pero una mentee aún puede ocupar varios horarios durante el TTL. Es una regla de producto (propuesta: máximo 2 pendientes por mentora).
- Reservas: el timeout de las transacciones interactivas es el valor por defecto de Prisma (5 s); con mucha contención sobre la misma mentora P2028 daría 500. Medir en F5.
- No-show: no hay ventana superior para reportarlo y cualquiera de las dos partes puede adelantarse a `complete` una vez iniciada la sesión. Revisarlo con reputación (Hito 3).
- k6: `THROTTLE_DISABLED` lee `process.env` en tiempo de petición; la validación de entorno impide activarlo en producción.
- Seguridad de dependencias (2026-11-16, resuelto): `next` 16.4.3 → 16.4.6 en el web y overrides de pnpm `multer` 2.5.0 y `body-parser` 2.4.0 en el backend (`pnpm-workspace.yaml`). `pnpm audit --prod` quedó limpio en ambos repos. Quitar los overrides cuando `@nestjs/platform-express` traiga esas versiones. Quedan avisos solo en dependencias de desarrollo (backend 24, web 1), sin revisar.
- Sin edad mínima por decisión del desarrollador (ADR-026, revisado el 2026-11-17). Riesgo de salvaguarda y de datos de menores abierto en DA-01/DA-04.
- 1.5 (zona roja): revisar la transacción de creación (`pg_advisory_xact_lock` mentee→mentora + exclusión SQL), la guarda `WHERE status = <leído>` de cada transición, el vencimiento idempotente y la cancelación de la sesión en la misma transacción.
- 1.5: `meetingUrl` lo aporta la mentora; la API no genera enlaces. Al confirmar una reserva de pago (Hito 2) habrá que exigirlo también.
- 1.5: las notificaciones son best-effort y sin outbox; si el proceso cae después del commit, el correo se pierde. Reintentos/outbox se deciden en el Hito 2 (ADR-022).
- 1.5: la tarea `@Interval(60_000)` corre en cada instancia; el `UPDATE` es idempotente, pero no hay leader election. Aceptable con una instancia.
- 1.5: una reserva gratuita confirmada solo se cancela antes de `starts_at`; la cancelación de una reserva de pago queda pendiente de DA-05.
- 1.5: `cancel_reason` guarda también el motivo de rechazo; si producto quiere distinguirlos, requiere una columna nueva.
- 1.6: la relevancia del catálogo depende del diccionario español de PostgreSQL y de umbrales trigrama (0,2); revisar con búsquedas reales y considerar `unaccent`/sinónimos si aparecen falsos negativos.
- 1.6: el cursor usa `rank` flotante + `userId`; si dos mentoras empatan exactamente y una cambia de ranking entre páginas, puede haber saltos. Revisar con datos reales y, si molesta, congelar el ranking por consulta.
- 1.6: los pesos y umbrales son provisionales y el fixture sintético da precision@3 = 1,000 por clusters; no es evidencia de calidad real. La evaluación humana de 10 pares sigue pendiente.
- 1.6: el onboarding v1 no pregunta presupuesto ni "solo gratuitas"; `price_fit` usa un valor neutral cuando solo hay ofertas de pago. Si producto añade esas preguntas, hay que versionar el onboarding.
- 1.6: la disponibilidad para matching usa la oferta activa de menor duración como proxy; una mentora con una oferta corta pero sin slots de la oferta que la mentee quiere puede aparecer. Revisar con el flujo de reserva real.
- 1.6: el cálculo de solape recorre minuto a minuto; con muchas reglas/slots puede crecer. Medir antes de aumentar el horizonte o el número de candidatas.
- 1.4: el frontend ya tiene UI de ofertas, disponibilidad y slots en `main` web (65 tests verdes), pero la prueba de contrato en navegador contra la API real sigue pendiente.
- 1.4: el cliente frontend está probado con `fetch` mock; la prueba manual del flujo completo (catálogo → detalle → reserva → aceptación) queda para la revisión del desarrollador.
- 1.4: `pnpm format:check` del frontend falla solo por archivos preexistentes de `.agents/skills/*`; los archivos nuevos y modificados se formatearon con Prettier. `pnpm build`, `pnpm lint` y `pnpm test` del frontend están verdes (65 tests).
- 1.6 web: las ofertas grupales se muestran en el catálogo, pero la reserva grupal no está disponible porque el backend solo crea reservas 1:1.
- 1.6 web: los datos demo (`demo.mentora@steam.test`, `demo.mentee@steam.test`) son solo para desarrollo y no deben usarse en producción; no se usaron datos reales.
- 1.6 web: la UI se probó con `fetch` mock y por API con datos demo; falta la prueba manual en navegador (el merge ya se hizo).
- 1.6 web: los filtros de área e idioma del catálogo dependen de `GET /me/onboarding` y solo se muestran con sesión; si producto quiere filtrado público completo, hace falta un endpoint público de áreas/idiomas.
- 1.4: `PUT /v1/me/availability` reemplaza todas las reglas; no hay edición individual ni validación de solapes entre reglas (el generador deduplica slots).
- 1.4: `start_time`/`end_time` son `TIME(0)`; el frontend debe enviar `HH:mm` sin segundos. `validFrom`/`validTo` son fechas `YYYY-MM-DD`.
- 1.4: el rango máximo de slots es 90 días; si el frontend necesita más, consultar por semanas o paginar.
- 1.4: el catálogo público ya existe en 1.6 (`GET /v1/mentors`); `GET /v1/mentors/:id/slots` sigue exigiendo `offeringId` y una mentora aprobada.
- 1.4: `MentorSettingsPort` se apoya en `ProfilesService`; revisar que no aparezca un ciclo si `profiles` necesita `scheduling` más adelante.
- El `.env` local ya permite arrancar la API, ejecutar el seed y usar Mailpit; sigue sin versionarse (no se leyó ni editó desde el agente).
- Verificación de correo: hoy el registro queda `status = active` y `email_verified_at = null`; no se implementó el flujo de verificación. Decidir si entra en 1.2 o se pospone.
- P-05 sigue pendiente: Mailpit es solo desarrollo; el proveedor transaccional no está elegido.
- Rate limit en memoria: se reinicia con el proceso y no se comparte entre instancias. Aceptable para el MVP de una instancia; revisar al escalar.
- `req.ip` depende de `TRUST_PROXY` (número de proxies delante de la API; 1 detrás de Caddy).
- `auth_session` no tiene FK a `user` (el `userId` vive en el JSON); la revocación es SQL sobre `sess->>'userId'`. Revisar si conviene mover el `userId` a una columna propia más adelante y borrar sesiones al eliminar una cuenta.
- El envío de correo de recuperación es fire-and-forget; si falla, se registra solo el nombre del error y el token queda válido hasta caducar. Revisar si se necesita reintento/outbox.
- Helmet completo: se mantienen los defaults de `useSecurityHeaders()`; revisar CSP/HSTS con el frontend real.
- 1.3: el onboarding acepta guardados parciales; `completion` ya se calcula en servidor y `submit` bloquea incompletos. El frontend debe consumir `completion` y no duplicar la regla.
- 1.3: el perfil `approved` sigue editable por decisión de producto; las ediciones post-aprobación no se auditan. Si se quiere re-revisión al cambiar campos sensibles, es una regla nueva.
- 1.3: `onboarding_response` puede conservar filas antiguas de `age`; `GET /v1/me/onboarding` filtra a los códigos vigentes. Decidir si se hace una limpieza de datos en una migración posterior.
- 1.3: el detalle admin ya muestra todas las respuestas del onboarding, pero la UI no muestra el historial de `audit_log` ni quién revisó antes; si se necesita trazabilidad visible, es una tarea nueva.
- 1.3: la UI admin está integrada en `main` web y se probó con `fetch` y componentes mockeados, no contra la API real; falta una prueba de contrato frontend-API antes del piloto.
- 1.3: los seeds de áreas e idiomas son provisionales; el equipo de producto debe entregar las listas definitivas.
- 1.3: la ruta pública de catálogo ya existe en 1.6 y aplica "solo `approved` visible" (`GET /v1/mentors` y `GET /v1/mentors/:id`).
- Skills: `prisma-cli` no se instaló; decidir si se acepta una versión adaptada sin `prisma init`/`npx` o si se deja fuera.

## Siguiente
1. Que tres personas del equipo completen `docs/DEMO.md` sin ayuda (aceptación de 1.7) y la evaluación de matching con 10 pares reales.
2. Revisar los avisos de dependencias de desarrollo (`pnpm audit`).
3. F1 (fundación de producción) según `docs/discovery/08-ROADMAP-V3.md`, con las respuestas provisionales de ADR-026.
4. F2: verificación de correo y 2FA listos (ADR-024); sesiones, cambios de contraseña/correo, exportar y eliminar cuenta listos en backend. UI web lista. Consentimiento espera DA-04; roles separados, aplazados.

## Descubrimiento y diseño para producción (2026-11-01)
- **Rama:** `docs/discovery` desde `develop` (`40de1ef`), publicada junto con `develop`. Solo lectura y documentos: no se modificó `src`, `test`, `prisma` ni la web.
- **Entregables:** `docs/discovery/00-README.md` + `01-HARDCODES.md`, `02-CONFIG-ROLES.md`, `03-PRODUCTION-READINESS.md`, `04-ENVIRONMENTS-RELEASE.md`, `05-FREE-INFRASTRUCTURE.md`, `06-NFR-CAPACITY.md`, `07-ADMIN-V2.md`, `08-ROADMAP-V3.md`.
- **Hallazgos clave:** 90 filas de hardcodes (~70 valores ajustables, 10 listas de referencia); no existe capa de configuración de negocio; roles solo `mentee|mentor|admin`; sin 2FA ni verificación de correo; sin CI, Dockerfile de producción ni OpenAPI; sin backups, logs estructurados, métricas ni alertas; admin actual solo con bandeja de mentoras.
- **Infraestructura propuesta:** Oracle A1 Always Free (2 OCPU/12 GB/200 GB) + Neon Free PostgreSQL 18 São Paulo; alternativa B: PostgreSQL 18 autoalojado en la misma VM. Brevo/Mailtrap, Cloudflare Free, GitHub Actions Free, Sentry/UptimeRobot/Grafana Free.
- **Límites que se rompen a 12 meses:** Neon (100 CU-h y 1 GB), Brevo (300/día), CPU de la VM con recomendaciones/slots concurrentes y GitHub Actions si se superan ~100 PR/mes.
- **Verificación externa:** límites de proveedores consultados con `webfetch` oficial el 2026-11-01; citas ≤15 palabras. Los límites gratuitos cambian y deben revalidarse antes de contratar.
- **Gates:** no se ejecutaron build/lint/test de código porque no hubo cambios de código; los últimos gates siguen siendo backend 228 unitarios + 55 e2e y web 65 tests/build/lint.
- **Pendiente:** aprobación del paquete, decisión de replicarlo en el repo web, aprobación de ADR-024 (cuentas privilegiadas separadas) y respuestas de `08-ROADMAP-V3.md`. Las decisiones pendientes de `docs/07-DECISIONS.md` no se tomaron.

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
| 2026-10-30 | Modo ACELERADO en ambos repos; allows de verificación/migraciones; ADR-020 a 023 (P-07, P-10 parcial, P-11, P-12); `BOOKING_REQUEST_TTL_HOURS`; auditoría e2e (28/28 en `steam_society_test`); mapa de ramas aprobado | Agente (revisión del desarrollador) |
| 2026-10-30 | Detalle admin `GET /v1/admin/mentors/:id` con onboarding completo y e2e; UI admin con bandeja, filtros, detalle y acciones; 73 unitarios y 30 e2e backend, 40 tests frontend | Agente (revisión del desarrollador) |
| 2026-10-26 | 1.4 Ofertas/disponibilidad/slots: migraciones, dominio DST, CRUD, puerto de sesiones falso, puerto de settings de mentora, tests y docs; frontend: rama `feat/1.4-scheduling-client` con cliente/tipos/pruebas de 1.4 (36 tests verdes, sin UI) | Agente (revisión del desarrollador) |
| 2026-10-30 | Merges locales `chore/git-policy` (`d9d9b1e`), 1.3 (`69f8f2a`) y 1.4 (`275f3cd`); gates: 115 unitarios y 38 e2e verdes; 9 migraciones al día. Push bloqueado por el `deny` final `git push *` de `opencode.json` | Agente (instrucción del desarrollador) |
| 2026-10-30 | 1.5 Reservas (zona roja): migración con exclusión/CHECKs, máquina de estados, API, locks, vencimiento, notificaciones, adaptador de sesiones, tests y contrato; gates 219 unitarios, 50 e2e, build/lint verdes; rama publicada en `origin` | Agente (pendiente de revisión) |
| 2026-10-30 | Merge `--no-ff` de 1.5 en `main` (`7d9cda7`); gates 219 unitarios y 50 e2e verdes; `main` publicado en `origin` | Agente (instrucción del desarrollador) |
| 2026-10-31 | 1.6 Catálogo/recomendaciones: migración de búsqueda, endpoints públicos, motor puro, módulos `catalog`/`matching`, tests y script de evaluación; gates 228 unitarios y 55 e2e verdes; `main` en `b04fd2e`; rama publicada en `origin` (`62154e6`) | Agente (pendiente de revisión) |
| 2026-10-31 | Web 1.3–1.6: merge local de 1.3/1.4 en `feat/1.6-catalog-client` (`2cd66dc`) y commits `cdb0687`, `e7632d0`, `a13b282`, `c915f53`, `999f9a2`, `e210dac`; catálogo público, detalle con slots/reserva, recomendaciones, ofertas, disponibilidad, reservas y perfil; 65 tests, build, lint y `tsc --noEmit` verdes; datos demo verificados por API | Agente (pendiente de revisión) |
| 2026-10-31 | Merges `--no-ff` de 1.6 en `main` backend (`2cfb03b`) y web (`f834ce8`); gates backend 228 unitarios + 55 e2e y web 65 tests/build/lint verdes; `main` y todas las ramas locales publicadas en `origin`; tags locales `backup/pre-merge-feat/1.6-catalog-matching` y `backup/pre-merge-feat/1.6-catalog-client` | Agente (instrucción del desarrollador) |
| 2026-11-01 | Descubrimiento y diseño: `docs/discovery/00-08` (hardcodes, configuración/roles, readiness, release, infraestructura gratuita, NFR/capacidad, admin v2, roadmap v3); sin tocar código; pendiente de aprobación | Agente |
| 2026-11-16 | Cierre del Hito 1: revisión de zonas rojas 1.5/1.6 con 10 correcciones, módulo de pagos desacoplado (ADR-025), F0 provisional (ADR-026), 1.7 (seed demo, guion, k6, rate limits), web con botón Pagar y checkout simulado; reglas de push del agente endurecidas | Agente (pendiente de revisión) |
| 2026-11-17 | Decisiones de F0 del desarrollador registradas (ADR-026); el seed demo ahora restablece la contraseña de las cuentas ficticias | Agente |
| 2026-11-17 | F2 identidad (ADR-024): verificación de correo, 2FA TOTP obligatorio para admin, login en dos pasos, seeds adaptados y paso `tsc` en el gate; 296 unitarios y 70 e2e, gate full en verde | Agente (pendiente de revisión) |
| 2026-11-17 | Arnés de agentes (`docs/HARNESS.md`): gate único `scripts/gate.sh` en ambos repos, `check-boundaries.mjs` dentro de `pnpm lint`, principios de oro, `exec-plans/` y deuda técnica, roles (implementador, revisor, jardinero), `delegate.sh` (sonnet/haiku/codex/agy/opencode), subagentes `.claude/agents`, `ui-shots` en el web y mapa visual `docs/FLOWS.md` + `docs/PAYMENTS.md` | Agente |
| 2026-11-17 | Paquete de despliegue Oracle A1 (`chore/deploy-oracle`): `deploy/` (compose prod con postgres, migrate, api, web, caddy, coturn y backup; Caddyfile con `flush_interval -1`; turnserver.conf; `.env.prod.example`; `backup.sh`) y `docs/DEPLOY-ORACLE.md`. Validado: `compose config`, `caddy validate`, build amd64 de ambas imágenes, migrate + `/health`, coturn con TURN REST y TLS, backup/restore. Pendiente: build arm64 real (`TRUST_PROXY` y adaptador coturn ya resueltos) | Agente, revisado |
| 2026-11-17 | Outbox de correos (ADR-027) y videollamada propia WebRTC 1:1 con señalización SSE (ADR-028), probada de punta a punta con dos navegadores | Agente |
| 2026-11-18 | Seguridad de la comunidad y operación del piloto (ADR-029): bloqueos, reportes, moderación, suspensión y vistas admin (resumen, personas, reservas, reportes); web de reportar/bloquear, personas bloqueadas y `/help` | Agente (revisado por codex) |
| 2026-11-18 | `TRUST_PROXY` para la cookie segura detrás de Caddy; adaptador coturn (TURN REST) en `ConfiguredIceServers`; despliegue Oracle fusionado | Agente |
| 2026-11-18 | CI: los e2e de pagos fallaban en GitHub porque el workflow fija `PAYMENTS_PROVIDER=disabled`; `test/setup-e2e.ts` ahora fuerza `fake`. Primer CI verde | Agente |
| 2026-11-18 | Chat de texto dentro de la videollamada (web): canal de datos WebRTC negociado, sin pasar por la API ni guardarse; probado por el desarrollador en dos navegadores | Agente |
| 2026-11-18 | Consentimiento legal en el registro (Ley 29733): `acceptTerms: true` obligatorio, `guardianConsent` obligatorio para menores de 14 (`400 GUARDIAN_CONSENT_REQUIRED`); columnas `terms_accepted_at`, `terms_version` (`LEGAL_TERMS_VERSION = '2026-11-18'`) y `guardian_consent_at` (migración `20261118152922_add_user_legal_consent`), incluidas en la exportación. Textos legales en borrador; DA-01 y DA-04 siguen abiertas | Agente |
| 2026-11-18 | Sitio público en la web: inicio, `/para-mentees` y `/para-mentoras` (contenido del mock original, marca Steam Society, sin cifras ni testimonios inventados), `/privacidad`, `/terminos` y `/cookies` en borrador, aviso de cookies informativo, consentimiento en el registro, SEO (canonical, OG `/og`, sitemap, robots, JSON-LD) y GEO (`llms.txt`, crawlers de IA permitidos en lo público). Compose de producción pasa `NEXT_PUBLIC_SITE_URL` y los contactos de soporte (`SUPPORT_EMAIL`, `SUPPORT_WHATSAPP`) al build de la web | Agente |
| 2026-11-20 | Revisión de seguridad (dos agentes, solo lectura) y arreglos: el límite de intentos en login, reset y verificación ya no se salta rotando cookies de cuentas propias (clave IP + correo siempre; `throttle-tracker.ts`); registro limitado por IP (`REGISTER_RATE_LIMIT`, 30 cada 10 min); la API no arranca en producción con los secretos de ejemplo `change-me`. Web: `frame-ancestors 'none'`/`X-Frame-Options`, `Permissions-Policy`, chat de llamada acotado (200 mensajes, 5/s) y checkout solo https. Pendientes (Baja): pedir contraseña al activar 2FA y avisar por correo; consentimiento del tutor verificable (DA-01/DA-04); TURN hacia la IP privada de la VM (`no-tcp-relay` + iptables); cerrar el SSE de llamada al revocar la sesión | Agente |
| 2026-11-20 | Llamadas: el stream SSE comprueba la sesión en cada `ping` (25 s) y termina si fue revocada (cierre remoto, cambio/reset de contraseña, 2FA); un error del store no corta la llamada. Plan `docs/exec-plans/completed/2026-11-20-call-session-revoke.md` | Agente |
