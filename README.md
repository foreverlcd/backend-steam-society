# Steam Society · API

Backend de Steam Society: plataforma de mentorías para acercar a más mujeres a
carreras STEAM. Este repositorio contiene solo la API (NestJS 12); el frontend
(Next.js) vive en otro repositorio.

La documentación de producto, arquitectura, modelo de datos y decisiones está en
[`docs/`](docs/). El estado vivo está en [`docs/PROGRESS.md`](docs/PROGRESS.md).

## Requisitos

- Node.js 24
- pnpm
- Docker con Docker Compose

## Levantar el proyecto desde cero

1. Instala las dependencias:

```bash
pnpm install
```

2. Crea tu archivo de entorno a partir del ejemplo y rellena los valores:

```bash
cp .env.example .env
```

Variables principales:

- `DATABASE_URL`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`.
- `SESSION_SECRET`: mínimo 32 caracteres. Genera uno con
  `openssl rand -base64 48`.
- `SESSION_COOKIE_SECURE`: `false` solo en desarrollo local sobre HTTP; `true`
  en producción (cookie `__Host-sid`).
- `WEB_ORIGIN`: orígenes del frontend separados por coma. Se usa para CORS con
  credenciales y para la protección CSRF.
- `APP_URL`, `SMTP_URL`, `SMTP_FROM`: enlace de recuperación y correo saliente.
  En local, Mailpit expone SMTP en `127.0.0.1:1025` y la bandeja en
  `http://127.0.0.1:8025`.
- `BOOKING_REQUEST_TTL_HOURS`: plazo de respuesta de una solicitud de reserva,
  en horas (entero positivo, 48 por defecto; R-06, ADR-021).
- `ADMIN_EMAIL`, `ADMIN_PASSWORD`: solo para `pnpm db:seed`. El registro público
  nunca crea administradores.

No versiones `.env` ni compartas sus valores.

3. Levanta PostgreSQL y Mailpit:

```bash
docker compose up -d postgres mailpit
```

4. Genera el cliente de Prisma (no se versiona):

```bash
pnpm db:generate
```

5. Aplica las migraciones:

```bash
pnpm db:migrate
```

6. Crea el admin inicial (opcional, pero necesario para las rutas de admin de
   etapas posteriores):

```bash
pnpm db:seed
```

7. Arranca la API en modo watch:

```bash
pnpm start:dev
```

8. Comprueba que responde:

```bash
curl http://localhost:3000/health
# {"status":"ok","db":"up"}
```

La API falla rápido si PostgreSQL no responde al arrancar: `PrismaService` llama a
`$connect()` en `onModuleInit`. El `503` de `/health` aplica cuando la base cae
después de que la API ya está levantada. Cuando la base vuelve, `/health` responde
`200` otra vez sin reiniciar la API.

## API

`/health` queda fuera del prefijo de versión. El resto de rutas usa `/v1`.

| Método | Ruta | Autenticación | Descripción |
|---|---|---|---|
| GET | `/health` | Pública | Estado de la API y de la base |
| POST | `/v1/auth/register` | Pública | Registro `mentee` o `mentor` |
| POST | `/v1/auth/login` | Pública | Crea la sesión |
| POST | `/v1/auth/logout` | Sesión | Destruye la sesión |
| POST | `/v1/auth/password/forgot` | Pública | Solicita enlace de recuperación |
| POST | `/v1/auth/password/reset` | Pública | Consume el token y cambia la contraseña |
| GET | `/v1/me` | Sesión | Devuelve la usuaria autenticada |
| GET | `/v1/me/profile` | Sesión `mentor`/`mentee` | Perfil propio con áreas e idiomas |
| PUT | `/v1/me/profile` | Sesión `mentor`/`mentee` | Edita el perfil propio |
| POST | `/v1/me/profile/submit` | Sesión `mentor` | Envía el perfil a revisión |
| GET | `/v1/me/onboarding` | Sesión `mentor`/`mentee` | Configuración versionada, respuestas y taxonomías |
| PUT | `/v1/me/onboarding` | Sesión `mentor`/`mentee` | Guarda respuestas del onboarding |
| GET | `/v1/me/offerings` | Sesión `mentor` | Lista las ofertas propias |
| POST | `/v1/me/offerings` | Sesión `mentor` | Crea una oferta 1:1 |
| PATCH | `/v1/me/offerings/:id` | Sesión `mentor` | Edita una oferta propia |
| POST | `/v1/me/offerings/:id/archive` | Sesión `mentor` | Archiva una oferta (borrado lógico) |
| GET | `/v1/me/availability` | Sesión `mentor` | Devuelve las reglas de disponibilidad |
| PUT | `/v1/me/availability` | Sesión `mentor` | Reemplaza todas las reglas de disponibilidad |
| GET | `/v1/mentors?q=&areaId=&language=&country=&isFree=&maxPriceMinor=&currency=&limit=&cursor=` | Pública | Catálogo de mentoras aprobadas con ofertas activas |
| GET | `/v1/mentors/:id` | Pública | Detalle público de una mentora y sus ofertas |
| GET | `/v1/mentors/:id/slots?offeringId&from&to` | Pública | Slots reservables de una mentora |
| GET | `/v1/me/recommendations?limit=` | Sesión `mentee` | Recomendaciones explicables (máx. 10) |
| POST | `/v1/bookings` | Sesión `mentee` | Solicita una reserva 1:1 |
| GET | `/v1/bookings?status=&limit=&cursor=` | Sesión `mentee`/`mentor` | Lista reservas propias con cursor |
| GET | `/v1/bookings/:id` | Sesión `mentee`/`mentor` | Detalle de una reserva propia |
| POST | `/v1/bookings/:id/accept` | Sesión `mentor` | Acepta una solicitud |
| POST | `/v1/bookings/:id/decline` | Sesión `mentor` | Rechaza una solicitud |
| POST | `/v1/bookings/:id/cancel` | Sesión `mentee`/`mentor` | Cancela una reserva |
| POST | `/v1/bookings/:id/complete` | Sesión `mentor` | Marca la sesión como realizada |
| POST | `/v1/bookings/:id/no-show` | Sesión `mentee`/`mentor` | Registra una ausencia |
| GET | `/v1/admin/mentors?status=` | Sesión `admin` | Lista perfiles de mentoras |
| GET | `/v1/admin/mentors/:id` | Sesión `admin` | Detalle con perfil y onboarding completo |
| POST | `/v1/admin/mentors/:id/approve` | Sesión `admin` | Aprueba una mentora |
| POST | `/v1/admin/mentors/:id/reject` | Sesión `admin` | Rechaza con `{ "reason": "..." }` |
| POST | `/v1/admin/mentors/:id/suspend` | Sesión `admin` | Suspende una mentora aprobada |
| POST | `/v1/admin/mentors/:id/reactivate` | Sesión `admin` | Reactiva una mentora suspendida |

`GET /v1/admin/mentors/:id` devuelve `{ mentor, onboarding }`. `mentor` incluye el perfil, `minNoticeHours`, `maxAdvanceDays`, áreas, idiomas y estado; `onboarding` reutiliza la configuración versionada con `steps`, `answers`, `completion` y `options`. Responde `404 MENTOR_PROFILE_NOT_FOUND` si no existe y `400` si el UUID es inválido.

Ejemplo de registro:

```bash
curl -i -X POST http://localhost:3000/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "ada@example.com",
    "password": "correct-horse-battery",
    "role": "mentee",
    "birthDate": "2000-01-01"
  }'
```

### Sesiones, CSRF y CORS

- La sesión viaja en una cookie `HttpOnly`; en producción se llama
  `__Host-sid`, es `Secure` y `SameSite=Lax`, y dura 7 días.
- En desarrollo sobre HTTP se usa `sid` porque los navegadores no aceptan una
  cookie `__Host-` sin `Secure`. No uses `SESSION_COOKIE_SECURE=false` en
  producción.
- CORS usa `credentials: true` solo con los orígenes explícitos de
  `WEB_ORIGIN`; nunca `*`.
- Las peticiones que cambian estado desde otro origen pasan por la protección
  CSRF de NestJS 12. El frontend debe estar en `WEB_ORIGIN`.
- El login y la recuperación están limitados por IP + correo con
  `@nestjs/throttler`.

### Recuperación de contraseña

El endpoint `forgot` responde siempre `202` para no revelar si el correo existe.
El token es aleatorio de 32 bytes, se guarda solo su hash SHA-256, caduca en una
hora y es de un solo uso. Al cambiarla se revocan todas las sesiones de esa
usuaria. En local, abre `http://127.0.0.1:8025` para ver el correo de Mailpit.

### Ofertas, disponibilidad y slots

- Una mentora `approved` y activa crea ofertas `one_to_one` con `title`,
  `description?`, `durationMinutes` (15–240), `isFree` y `priceMinor`/`currency`
  (ISO 4217, `PEN` por defecto). Una oferta gratuita normaliza `priceMinor` a 0;
  una de pago exige `priceMinor > 0`.
- `PUT /v1/me/availability` recibe `{ rules: [{ weekday, startTime, endTime,
  timezone, validFrom?, validTo? }] }` y reemplaza todas las reglas. `weekday`
  usa ISO (1 = lunes, 7 = domingo); las horas son `HH:mm`; las fechas son
  `YYYY-MM-DD`.
- `GET /v1/mentors/:id/slots` exige `offeringId`, `from` y `to` (máximo 90 días),
  aplica antelación mínima/máxima y devuelve `{ startsAt, endsAt, timezone,
  localStart, localEnd }` por slot. Los slots ocupados por sesiones no se
  devuelven.

### Catálogo y recomendaciones (1.6)

- `GET /v1/mentors` es público y solo devuelve mentoras `approved` con cuenta
  `active`. Acepta `q` (texto completo en español + trigramas), `areaId`,
  `language` (ISO 639-1), `country` (ISO 3166-1 alfa-2), `isFree`,
  `maxPriceMinor`, `currency` (default `PEN`), `limit` (1–50, default 20) y
  `cursor`. Cada ítem incluye sus ofertas activas y `nextCursor` es opaco.
- `GET /v1/mentors/:id` devuelve el detalle público con ofertas; responde
  `404 MENTOR_NOT_FOUND` si la mentora no está aprobada o la cuenta no está
  activa. Un cursor inválido responde `400 INVALID_CURSOR`.
- `GET /v1/me/recommendations?limit=` es solo para `mentee` con perfil. Devuelve
  `items` con `{ mentorId, mentor, score, breakdown, reason }` y `meta` con
  `totalCandidates`, `eligibleCandidates`, `horizonDays` y `limit`. El máximo
  es 10 y el valor por defecto es 3.
- El motor es una función pura y explicable: filtros duros (idioma, área,
  disponibilidad en 14 días, gratuidad/presupuesto, bloqueo) y puntaje
  ponderado provisional 35/20/15/15/10/5. La razón se arma solo con los dos
  componentes con más puntos y nunca con un LLM. La especificación y los
  pendientes de producto están en `docs/08-MATCHING.md`.
- La evaluación sintética se ejecuta con `pnpm eval:matching` (20 mentees y 30
  mentoras, precision@3 con meta 0,6). La comparación con pares reales sigue
  pendiente.

### Reservas (1.5)

- `POST /v1/bookings` recibe `{ offeringId, startsAt, message? }`. `startsAt` es
  un ISO UTC que debe coincidir con un slot generado por la disponibilidad. La
  mentee debe tener perfil completo y la mentora debe estar `approved`.
- La reserva nace en `requested` y fija `expiresAt` con
  `BOOKING_REQUEST_TTL_HOURS` (48 h por defecto). Se crea la `session` 1:1 y la
  `booking` en una sola transacción; la exclusión SQL impide solapes de la
  mentora (R-15) y la comprobación transaccional impide solapes de la mentee
  (R-12).
- Aceptar una reserva gratuita exige `{ meetingUrl }` y pasa a `confirmed`.
  Aceptar una de pago pasa a `awaiting_payment` sin crear ningún pago (el
  módulo de pagos es del Hito 2). `decline` y `cancel` aceptan `{ reason? }`.
- `complete` exige que la sesión haya terminado; `no-show` exige que haya
  empezado. La persona que llama queda registrada en `noShowParty`.
- Una reserva gratuita confirmada solo se puede cancelar antes de `startsAt`;
  la política de cancelación de reservas de pago queda pendiente (DA-05).
- El vencimiento se evalúa al leer o actuar sobre la reserva y con una tarea
  periódica cada 60 s; la actualización es idempotente. Una reserva vencida
  libera su `session`.
- Las notificaciones se envían después del commit y son best-effort: un fallo de
  correo no revierte la reserva (ADR-022).
- R-07: una reserva gratuita siempre tiene `paymentRequired = false` y
  `priceMinor = 0`; no existe ninguna tabla de pagos en el Hito 1.
- Errores estables: `BOOKING_NOT_FOUND`, `BOOKING_FORBIDDEN`,
  `BOOKING_ROLE_NOT_ALLOWED`, `MENTEE_PROFILE_REQUIRED`,
  `BOOKING_SLOT_UNAVAILABLE`, `BOOKING_SLOT_TAKEN`,
  `BOOKING_MENTEE_OVERLAP`, `BOOKING_STATUS_CONFLICT`, `BOOKING_EXPIRED`,
  `INVALID_BOOKING_TRANSITION`, `MEETING_URL_REQUIRED`.

### Perfiles, onboarding y aprobación

- `mentor` y `mentee` editan su propio perfil; un `admin` no tiene perfil de mentoría.
- El onboarding usa `ONBOARDING_VERSION = 1`. `GET /v1/me/onboarding` devuelve las preguntas, las respuestas guardadas, las opciones de áreas/idiomas y `completion: { complete, missing }`. `PUT` acepta guardados parciales y responde `409 ONBOARDING_VERSION_MISMATCH` si la versión no coincide.
- Las áreas principales son raíces (Ciencia, Tecnología, Ingeniería, Matemáticas) y las subáreas deben ser hijas activas de la raíz elegida.
- La edad no se envía en el onboarding: se deriva de `birth_date`. La etapa exacta de la mentee se guarda en `career_stage`; `education_level` queda como proyección gruesa.
- Una mentora pasa de `draft` a `pending_review` con `POST /v1/me/profile/submit`; si faltan respuestas obligatorias, responde `400 ONBOARDING_INCOMPLETE` con `details.missing`. Solo un `admin` puede aprobar, rechazar, suspender o reactivar. Cada transición queda en `audit_log`, que es append-only.
- Editar el perfil no cambia el estado; una mentora aprobada puede corregir sus datos y el admin conserva la suspensión como control.
- `pnpm db:seed` crea el admin y siembra los idiomas y las áreas provisionales.

## Base de datos (Prisma 7)

El esquema vive en `prisma/schema.prisma` y la configuración del CLI en
`prisma.config.ts`. Las tablas de autenticación son `user`, `auth_session` y
`password_reset_token`. La etapa 1.3 añade `language`, `mentor_profile`,
`mentee_profile`, las tablas de áreas/idiomas por perfil, `onboarding_response`
y `audit_log`; 1.4 añade `offering` y `availability_rule`; 1.5 añade `session` y
`booking` con exclusión SQL, CHECKs e índice único parcial; 1.6 añade
`search_vector` generada, `pg_trgm` e índices GIN/trigramas en
`mentor_profile` y `area`.

Comandos disponibles:

```bash
pnpm db:migrate    # Crear o aplicar migraciones en desarrollo
pnpm db:generate   # Regenerar el cliente tras cambiar el esquema
pnpm db:validate   # Validar el esquema y la configuración
pnpm db:seed       # Crear/actualizar el admin desde ADMIN_EMAIL y ADMIN_PASSWORD
pnpm db:studio     # Abrir Prisma Studio
```

`src/generated/prisma/` no se versiona: se recrea con `pnpm db:generate`.
Ejecuta ese comando después de un `git clone` o de cambiar
`prisma/schema.prisma`, antes de compilar o arrancar la API.

## Tests

Los tests unitarios no necesitan base de datos:

```bash
pnpm test
```

Los e2e usan una base separada, `steam_society_test`, y aplican las migraciones
automáticamente. Créala una vez:

```bash
docker compose exec postgres sh -c 'createdb -U "$POSTGRES_USER" steam_society_test'
```

Luego ejecuta:

```bash
pnpm test:e2e
```

Los e2e truncan las tablas de autenticación, perfiles, onboarding, ofertas,
disponibilidad, reservas y auditoría antes de cada prueba. No apuntes
`steam_society_test` a una base con datos reales.

La evaluación sintética del matching no toca la base:

```bash
pnpm eval:matching
```

Comprobaciones de la definición de terminado:

```bash
pnpm build
pnpm lint
pnpm test
pnpm test:e2e
pnpm eval:matching
```

## Seguridad

- Nunca se registran contraseñas, tokens ni datos personales en logs.
- Los errores de login no distinguen entre correo inexistente y contraseña
  incorrecta.
- El registro público solo acepta `mentee` y `mentor`; el admin se crea con el
  seed.
- Este proyecto maneja autenticación, reservas y pagos: es zona roja. Nada va a
  producción sin revisión de un desarrollador senior.
