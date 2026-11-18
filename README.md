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
- `TRUST_PROXY`: cuántos proxies hay delante de la API. `0` en desarrollo;
  `1` detrás de Caddy, para que la cookie segura funcione y el límite de
  peticiones vea la IP real.
- `WEB_ORIGIN`: orígenes del frontend separados por coma. Se usa para CORS con
  credenciales y para la protección CSRF.
- `APP_URL`, `SMTP_URL`, `SMTP_FROM`: enlaces de los correos y servidor SMTP
  (proveedor elegido: Brevo). `SMTP_URL` es obligatorio en producción.
- `EMAIL_DISPATCH_INTERVAL_MS`: cada cuánto se envía la cola de correos
  (10000 por defecto; `0` la apaga, como en los e2e).
  En local, Mailpit expone SMTP en `127.0.0.1:1025` y la bandeja en
  `http://127.0.0.1:8025`.
- `BOOKING_REQUEST_TTL_HOURS`: plazo de respuesta de una solicitud de reserva,
  en horas (entero positivo, 48 por defecto; R-06, ADR-021).
- `EMAIL_VERIFICATION_TTL_HOURS`: validez del enlace de verificación de correo,
  en horas (entero positivo, 48 por defecto; ADR-024).
- `PASSWORD_BREACH_CHECK`: `off` (por defecto) o `hibp`. Con `hibp`, al
  registrarse o cambiar la contraseña se consulta Have I Been Pwned por rango
  (k-anonimato: solo salen los 5 primeros caracteres del hash SHA-1, con
  relleno). Si la contraseña aparece en filtraciones: `400 PASSWORD_BREACHED`.
  Si el servicio no responde en 3 s, se acepta la contraseña (no bloquea).
- `MFA_ENCRYPTION_KEY`: clave de 32 bytes en base64 que cifra los secretos del
  2FA. Obligatoria en producción (la API no arranca sin ella). En desarrollo,
  si falta, se deriva de `SESSION_SECRET` y se muestra un aviso. Genérala con:
  `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
  Respáldala: sin ella no se pueden descifrar los 2FA ya registrados.
- `ADMIN_EMAIL`, `ADMIN_PASSWORD`: solo para `pnpm db:seed`. El registro público
  nunca crea administradores. El admin se crea con el correo ya verificado y
  debe activar el 2FA en su primer uso.

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

| Método | Ruta                                                                                        | Autenticación            | Descripción                                                                       |
| ------ | ------------------------------------------------------------------------------------------- | ------------------------ | --------------------------------------------------------------------------------- |
| GET    | `/health`                                                                                   | Pública                  | Estado de la API y de la base                                                     |
| POST   | `/v1/auth/register`                                                                         | Pública                  | Registro `mentee` o `mentor`                                                      |
| POST   | `/v1/auth/login`                                                                            | Pública                  | Crea la sesión; con 2FA activo responde `{ "mfaRequired": true }`                 |
| POST   | `/v1/auth/login/mfa`                                                                        | Pública (reto pendiente) | Segundo paso con `{ "code" }` o `{ "recoveryCode" }`                              |
| POST   | `/v1/auth/email/verify`                                                                     | Pública                  | Confirma el correo con `{ "token" }` (204)                                        |
| POST   | `/v1/auth/email/resend`                                                                     | Sesión                   | Reenvía el enlace de verificación (202; `409 EMAIL_ALREADY_VERIFIED`)             |
| POST   | `/v1/auth/logout`                                                                           | Sesión                   | Destruye la sesión                                                                |
| POST   | `/v1/auth/password/forgot`                                                                  | Pública                  | Solicita enlace de recuperación                                                   |
| POST   | `/v1/auth/password/reset`                                                                   | Pública                  | Consume el token y cambia la contraseña                                           |
| GET    | `/v1/me`                                                                                    | Sesión                   | Devuelve la usuaria autenticada (incluye `emailVerified` y `mfaEnabled`)          |
| GET    | `/v1/me/mfa`                                                                                | Sesión                   | Estado del 2FA: `{ enabled, required, recoveryCodesRemaining }`                   |
| POST   | `/v1/me/mfa/totp/setup`                                                                     | Sesión                   | Inicia la configuración: `{ secret, otpauthUri }`                                 |
| POST   | `/v1/me/mfa/totp/confirm`                                                                   | Sesión                   | Confirma con `{ "code" }` y devuelve `{ recoveryCodes }` (una sola vez)           |
| POST   | `/v1/me/mfa/recovery-codes`                                                                 | Sesión                   | Regenera los códigos con `{ "code" }`                                             |
| POST   | `/v1/me/mfa/disable`                                                                        | Sesión                   | Desactiva con `{ "password", "code" }` (204; no permitido al admin)               |
| GET    | `/v1/me/sessions`                                                                           | Sesión                   | Sesiones activas: `{ id, current, signedInAt, lastActiveAt, userAgent }`          |
| DELETE | `/v1/me/sessions/:id`                                                                       | Sesión                   | Cierra una sesión (204; `404 SESSION_NOT_FOUND`, `400 INVALID_SESSION_ID`)        |
| POST   | `/v1/me/sessions/revoke-others`                                                             | Sesión                   | Cierra todas las demás: `{ revoked }`                                             |
| POST   | `/v1/me/password`                                                                           | Sesión                   | Cambia la contraseña con `{ "password", "code"?, "newPassword" }` (204)           |
| POST   | `/v1/me/email`                                                                              | Sesión                   | Pide cambiar el correo con `{ "password", "code"?, "newEmail" }` (202)            |
| GET    | `/v1/me/export`                                                                             | Sesión                   | Descarga todos tus datos en JSON (`steam-society-mis-datos-AAAA-MM-DD.json`)      |
| POST   | `/v1/me/delete`                                                                             | Sesión                   | Elimina la cuenta con `{ "password", "code"?, "confirmation": "ELIMINAR" }` (204) |
| GET    | `/v1/me/profile`                                                                            | Sesión `mentor`/`mentee` | Perfil propio con áreas e idiomas                                                 |
| PUT    | `/v1/me/profile`                                                                            | Sesión `mentor`/`mentee` | Edita el perfil propio                                                            |
| POST   | `/v1/me/profile/submit`                                                                     | Sesión `mentor`          | Envía el perfil a revisión                                                        |
| GET    | `/v1/me/onboarding`                                                                         | Sesión `mentor`/`mentee` | Configuración versionada, respuestas y taxonomías                                 |
| PUT    | `/v1/me/onboarding`                                                                         | Sesión `mentor`/`mentee` | Guarda respuestas del onboarding                                                  |
| GET    | `/v1/me/offerings`                                                                          | Sesión `mentor`          | Lista las ofertas propias                                                         |
| POST   | `/v1/me/offerings`                                                                          | Sesión `mentor`          | Crea una oferta 1:1                                                               |
| PATCH  | `/v1/me/offerings/:id`                                                                      | Sesión `mentor`          | Edita una oferta propia                                                           |
| POST   | `/v1/me/offerings/:id/archive`                                                              | Sesión `mentor`          | Archiva una oferta (borrado lógico)                                               |
| GET    | `/v1/me/availability`                                                                       | Sesión `mentor`          | Devuelve las reglas de disponibilidad                                             |
| PUT    | `/v1/me/availability`                                                                       | Sesión `mentor`          | Reemplaza todas las reglas de disponibilidad                                      |
| GET    | `/v1/mentors?q=&areaId=&language=&country=&isFree=&maxPriceMinor=&currency=&limit=&cursor=` | Pública                  | Catálogo de mentoras aprobadas con ofertas activas                                |
| GET    | `/v1/mentors/:id`                                                                           | Pública                  | Detalle público de una mentora y sus ofertas                                      |
| GET    | `/v1/mentors/:id/slots?offeringId&from&to`                                                  | Pública                  | Slots reservables de una mentora                                                  |
| GET    | `/v1/me/recommendations?limit=`                                                             | Sesión `mentee`          | Recomendaciones explicables (máx. 10)                                             |
| POST   | `/v1/bookings`                                                                              | Sesión `mentee`          | Solicita una reserva 1:1                                                          |
| GET    | `/v1/bookings?status=&limit=&cursor=`                                                       | Sesión `mentee`/`mentor` | Lista reservas propias con cursor                                                 |
| GET    | `/v1/bookings/:id`                                                                          | Sesión `mentee`/`mentor` | Detalle de una reserva propia                                                     |
| POST   | `/v1/bookings/:id/accept`                                                                   | Sesión `mentor`          | Acepta una solicitud                                                              |
| POST   | `/v1/bookings/:id/decline`                                                                  | Sesión `mentor`          | Rechaza una solicitud                                                             |
| POST   | `/v1/bookings/:id/cancel`                                                                   | Sesión `mentee`/`mentor` | Cancela una reserva                                                               |
| POST   | `/v1/bookings/:id/complete`                                                                 | Sesión `mentor`          | Marca la sesión como realizada                                                    |
| POST   | `/v1/bookings/:id/no-show`                                                                  | Sesión `mentee`/`mentor` | Registra una ausencia                                                             |
| GET    | `/v1/admin/mentors?status=`                                                                 | Sesión `admin`           | Lista perfiles de mentoras                                                        |
| GET    | `/v1/admin/mentors/:id`                                                                     | Sesión `admin`           | Detalle con perfil y onboarding completo                                          |
| POST   | `/v1/admin/mentors/:id/approve`                                                             | Sesión `admin`           | Aprueba una mentora                                                               |
| POST   | `/v1/admin/mentors/:id/reject`                                                              | Sesión `admin`           | Rechaza con `{ "reason": "..." }`                                                 |
| POST   | `/v1/admin/mentors/:id/suspend`                                                             | Sesión `admin`           | Suspende una mentora aprobada                                                     |
| POST   | `/v1/admin/mentors/:id/reactivate`                                                          | Sesión `admin`           | Reactiva una mentora suspendida                                                   |

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
  `@nestjs/throttler`; el segundo paso del 2FA, por cuenta (`mfa:<userId>`).

### Verificación de correo y 2FA (ADR-024)

- El registro envía un enlace `${APP_URL}/verify-email?token=...` (token de 32
  bytes, solo se guarda su hash SHA-256, caduca según
  `EMAIL_VERIFICATION_TTL_HOURS`). La página del web llama a
  `POST /v1/auth/email/verify`. Reenviar invalida los enlaces anteriores. En
  local, el correo llega a Mailpit (`http://127.0.0.1:8025`).
- Sin verificar se puede entrar y navegar, pero las rutas con
  `@RequireVerifiedEmail` (`POST /v1/bookings`, `POST /v1/me/profile/submit`)
  responden `403 EMAIL_NOT_VERIFIED`.
- 2FA con TOTP (RFC 6238: SHA-1, 6 dígitos, 30 s, tolerancia de ±1 paso), sin
  dependencias nuevas. Configurar: `totp/setup` (muestra el secreto y el URI
  `otpauth://`) y `totp/confirm` con el primer código; devuelve 10 códigos de
  recuperación `XXXXX-XXXXX` de un solo uso. Un código TOTP no se acepta dos veces.
- Es **obligatorio para `admin`**: sin 2FA solo puede usar `/me`, logout,
  `/me/mfa/*` y el reenvío de verificación; el resto responde
  `403 MFA_ENROLLMENT_REQUIRED`, y no puede desactivarlo
  (`403 MFA_REQUIRED_FOR_ROLE`). Es opcional para mentora y mentee.
- Con 2FA, el login es en dos pasos: `POST /v1/auth/login` responde
  `{ "mfaRequired": true }` y guarda un reto de 5 minutos en la sesión; luego
  `POST /v1/auth/login/mfa`. Errores: `401 INVALID_MFA_CODE` y
  `401 MFA_CHALLENGE_EXPIRED`.

### Cuenta: sesiones, cambios y datos personales (F2)

- **Confirmar que eres tú (step-up):** cambiar contraseña o correo y eliminar
  la cuenta piden la contraseña actual y, si la cuenta tiene 2FA, un código
  (`401 INVALID_CREDENTIALS`, `400 MFA_CODE_REQUIRED`, `401 INVALID_MFA_CODE`).
- **Sesiones activas:** el `id` público es parte del SHA-256 del id de sesión;
  el id real nunca sale de la API. Cambiar la contraseña, activar el 2FA o
  eliminar la cuenta cierra las demás sesiones.
- **Cambio de correo:** se envía un enlace al correo nuevo (reutiliza
  `POST /v1/auth/email/verify`) y un aviso al actual. Al confirmar, el correo
  anterior recibe otro aviso. `409 EMAIL_UNCHANGED` / `409 EMAIL_TAKEN`.
- **Exportar datos:** cada módulo aporta su sección (`account`, `profile`,
  `scheduling`, `bookings`) mediante `PersonalDataRegistry`
  (`src/shared/personal-data/`). Una mentora no recibe el mensaje privado de
  quien la reservó.
- **Eliminar cuenta:** se rechaza con reservas abiertas a futuro
  (`409 ACCOUNT_HAS_OPEN_BOOKINGS`, con `details.openBookings`) y para el admin
  (`403 ADMIN_SELF_DELETE_FORBIDDEN`). Si se permite, todo ocurre en una
  transacción: la cuenta queda anonimizada (`status = deleted`), el perfil y la
  disponibilidad se borran o vacían, las ofertas se archivan y se cierran todas
  las sesiones. Las reservas y la auditoría se conservan sin datos personales.
  Una reserva pedida al mismo tiempo no puede colarse: el borrado y la reserva
  usan los mismos locks y se vuelve a comprobar dentro de la transacción.
  Los pagos no se tocan (decisión pendiente, P-03). La retención es
  **provisional** hasta DA-04. Detalle en `docs/03-DATA-MODEL.md`.

### Correo saliente (cola con reintentos)

- Ningún módulo envía correo directo: `MailerService` arma el mensaje y lo
  guarda en `email_outbox` (`src/shared/mail/`). El despachador lo envía cada
  10 s y, si el proveedor falla, reintenta a 1 min, 5 min, 30 min, 2 h y 6 h.
  Un rechazo 5xx (dirección inválida) falla de inmediato, sin reintentos.
- Los enlaces que caducan (restablecer contraseña, confirmar correo) no se
  envían ni se reintentan después de su vencimiento.
- El cuerpo (que puede llevar un enlace con token) se borra en cuanto el
  correo sale de `pending`. Las filas terminadas se borran a los 30 días.
- Sin `SMTP_URL`, los correos quedan en cola (en desarrollo usa Mailpit).
- Varias instancias pueden correr a la vez: cada una toma filas distintas
  (`FOR UPDATE SKIP LOCKED`).
- Entrega **al menos una vez**: si el proceso se cae justo después de que el
  proveedor aceptó el correo, se reenvía al vencer el bloqueo (10 min). Cada
  correo lleva un `Message-ID` fijo (`<id>@outbox.steam-society>`) para que el
  cliente de correo reconozca el duplicado.
- La caducidad se revisa justo antes de cada envío, no solo al tomar el lote.
- **Recordatorio 24 h antes:** cada 5 min se encola un correo para la mentee y
  la mentora de cada reserva confirmada que empieza en menos de 24 h, en la
  zona horaria de cada una y con el enlace de la sesión. Sale una sola vez:
  primero se encolan los dos correos con `dedupe_key`
  (`booking.reminder:<id>:mentee|mentor`) y después se marca
  `booking.reminder_sent_at`; si algo falla en medio, el siguiente ciclo no
  duplica. Al cancelar la reserva, los recordatorios que aún no salieron se
  retiran. Si la reserva se confirmó con menos de 24 h,
  basta el correo de aceptación. Caduca al empezar la sesión.

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
  `BOOKING_REQUEST_TTL_HOURS` (48 h por defecto), pero nunca después de
  `startsAt`: una solicitud no puede sobrevivir a su sesión. Se crea la `session` 1:1 y la
  `booking` en una sola transacción; la exclusión SQL impide solapes de la
  mentora (R-15) y la comprobación transaccional impide solapes de la mentee
  (R-12).
- Aceptar una reserva gratuita pasa a `confirmed`; la sesión ocurre en la
  videollamada de la app. `{ meetingUrl }` (solo `https://`) es opcional, como
  enlace alternativo. Aceptar una de pago pasa a `awaiting_payment` y se confirma cuando el módulo de pagos acredita el cobro. Aceptar
  revalida que la mentora siga `approved`. `decline` y `cancel` aceptan
  `{ reason? }`.
- `complete` exige que la sesión haya terminado; `no-show` exige que haya
  empezado. `noShowParty` registra a la persona **ausente**: si reporta la
  mentora, la ausente es la mentee, y viceversa.
- Una reserva gratuita confirmada solo se puede cancelar antes de `startsAt`;
  una de pago, como mínimo antes de `endsAt` (la política completa sigue
  pendiente en DA-05).
- `POST /v1/bookings` tiene un límite de 10 solicitudes por minuto por cuenta.
- El vencimiento se evalúa al leer o actuar sobre la reserva y con una tarea
  periódica cada 60 s; la actualización es idempotente. Una reserva vencida
  libera su `session`.
- Las notificaciones se envían después del commit y son best-effort: un fallo de
  correo no revierte la reserva (ADR-022).
- R-07: una reserva gratuita siempre tiene `paymentRequired = false` y
  `priceMinor = 0`; el módulo de pagos rechaza cobrarla
  (`BOOKING_NOT_AWAITING_PAYMENT`).
- Errores estables: `BOOKING_NOT_FOUND`, `BOOKING_FORBIDDEN`,
  `BOOKING_ROLE_NOT_ALLOWED`, `MENTEE_PROFILE_REQUIRED`,
  `BOOKING_SLOT_UNAVAILABLE`, `BOOKING_SLOT_TAKEN`,
  `BOOKING_MENTEE_OVERLAP`, `BOOKING_STATUS_CONFLICT`, `BOOKING_EXPIRED`,
  `INVALID_BOOKING_TRANSITION`, `CALL_UNAVAILABLE`, `CALL_NOT_OPEN`.

### Videollamada dentro de la app

- 1:1 con WebRTC: el audio y el video van directo entre los dos navegadores
  (cifrados por WebRTC). El servidor solo hace de **señalización**: reenvía la
  negociación y no guarda ni graba nada.
- `GET /v1/bookings/:id/call`: datos de la llamada (`open`, `opensAt`,
  `closesAt`, nombre de la otra persona, `iceServers`). Solo para la mentee y la
  mentora de una reserva `confirmed`.
- `GET /v1/bookings/:id/call/events` (Server-Sent Events): `ready`,
  `peer-joined`, `peer-left`, `signal`, `replaced` (la misma cuenta abrió la
  llamada en otra pestaña) y `ping` cada 25 s.
- `POST /v1/bookings/:id/call/signal`: `{ kind: 'description', description }`
  o `{ kind: 'candidate', candidate }`. Responde `{ delivered }`. Límite de 300
  por minuto.
- La llamada abre 15 min antes de `startsAt` y cierra 30 min después de
  `endsAt` (`CALL_NOT_OPEN` fuera de esa ventana).
- Servidores ICE: STUN público de Cloudflare (`CALL_STUN_URLS`). Con
  `CALL_TURN_KEY_ID` y `CALL_TURN_API_TOKEN` (Cloudflare Realtime, gratis hasta
  1000 GB/mes) se agregan credenciales TURN temporales (4 h) para las redes donde
  STUN no basta (datos móviles, redes corporativas).
- La señalización vive en memoria del proceso: sirve mientras la API corra en
  **una sola instancia**. Para varias, cambiar `InMemoryCallSignaling` por un
  canal compartido (p. ej. Postgres `LISTEN/NOTIFY`) detrás del mismo puerto.
- Los correos de aceptación y recordatorio llevan el enlace
  `APP_URL/call/<bookingId>`.

### Pagos (módulo desacoplado)

Los pagos viven en `src/modules/payments/` detrás del puerto `PaymentGateway`
(ADR-010, ADR-025). Reservas no sabe que existen: pagos usa dos métodos
exportados de `BookingsService` (`getPayable`, `confirmPayment`). Para quitar el
módulo basta con sacarlo de `AppModule`; para conectar un proveedor real se
escribe un adaptador nuevo y se mapea en `payments.module.ts`.

| Variable            | Valores                          | Uso                                                                                                                                          |
| ------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `PAYMENTS_PROVIDER` | `disabled` (por defecto), `fake` | `disabled` en el piloto (solo gratuitas). `fake` simula la pasarela en desarrollo; la API **no arranca** con `fake` y `NODE_ENV=production`. |
| `PAYMENTS_FEE_BPS`  | 0–10000 (1500 por defecto)       | Comisión en puntos básicos, provisional (F0). `fee + net = amount` lo garantiza un CHECK.                                                    |

- `GET /v1/payments/config` (público): `{ enabled, provider }`.
- `POST /v1/payments/checkout` (mentee dueña): `{ bookingId }` →
  `{ paymentId, bookingId, provider, status, checkoutUrl, amountMinor, currency }`. Reutiliza el
  checkout abierto (doble clic seguro) y permite reintentar tras un fallo.
- `POST /v1/payments/webhooks/:provider` (público, 60/min): registra el evento
  una sola vez por `(provider, eventId)`, liquida el pago solo desde
  `created|pending` y luego confirma la reserva (pasos secuenciales, sin
  transacción única; ver `docs/PAYMENTS.md`).
- Errores: `PAYMENTS_DISABLED` (503), `PAYMENT_ALREADY_PAID`,
  `PAYMENT_STATUS_CONFLICT`, `PAYMENT_PROVIDER_NOT_FOUND`, `INVALID_WEBHOOK`.
- Con `fake`, el checkout redirige a `/payments/fake-checkout` del web, donde
  se simula "aprobado" o "rechazado". No mueve dinero.
- Fuera de alcance hasta el Hito 2: reembolsos, ledger, payouts y conciliación.
- Guía completa (diagramas, invariantes, cómo conectar un proveedor real o
  quitar el módulo): [`docs/PAYMENTS.md`](docs/PAYMENTS.md).
  Si un pago llega cuando la reserva ya venció, el pago queda `paid`, la
  reserva no se confirma y se registra un error para seguimiento manual.

### Seguridad de la comunidad (ADR-029)

- **Bloquear:** `POST /v1/me/blocks { userId }` (mentee o mentora; 20 por
  hora). Cancela las reservas abiertas entre ambas personas y desde entonces
  ninguna puede reservar con la otra. La persona bloqueada solo ve una
  cancelación y, al reservar, el mismo error neutro que si la mentora no
  estuviera disponible. `GET /v1/me/blocks` lista y
  `DELETE /v1/me/blocks/:userId` desbloquea.
- **Reportar:** `POST /v1/reports { reportedUserId, bookingId?, reason,
details? }` (10 por hora). `reason`: `harassment`, `inappropriate_content`,
  `spam_or_fraud`, `safety_concern`, `no_show`, `other`. Si se indica una
  reserva, debe ser entre ambas personas. Cada admin activo recibe un correo
  sin nombres ni detalles, con el enlace a la cola.
- **Moderación (admin):** `GET /v1/admin/reports?status=open|resolved|dismissed`
  (la cola abierta, de la más antigua a la más nueva), `GET /v1/admin/reports/:id`
  y `POST /v1/admin/reports/:id/resolve { action: dismiss|warn|suspend, note }`.
  `warn` envía un aviso genérico a la persona reportada; `suspend` la suspende.
- **Suspender:** `POST /v1/admin/users/:id/suspend { reason }` cierra todas sus
  sesiones, impide el inicio de sesión y cancela sus reservas abiertas (se avisa
  a la otra persona). `POST /v1/admin/users/:id/reactivate` la reactiva. No se
  puede suspender a otra cuenta admin desde aquí.
- Todo queda en `audit_log` (`report.resolved`, `user.suspended`,
  `user.reactivated`, `booking.cancelled_by_admin`).
- Exportar datos incluye los bloqueos hechos y los reportes **enviados**; los
  reportes recibidos no se exportan para no exponer a quien reportó. Al borrar la
  cuenta se borran sus bloqueos y el texto de sus reportes.

### Operación del piloto (admin)

- `GET /v1/admin/overview`: personas por rol y estado, altas en 30 días,
  mentoras pendientes y aprobadas, reservas de 30 días por estado, confirmadas
  en los próximos 7 días, reportes abiertos y correos fallidos o pendientes.
- `GET /v1/admin/users?q=&role=&status=` (búsqueda por correo o nombre) y
  `GET /v1/admin/users/:id` (reservas, reportes, bloqueos recibidos e historial
  de auditoría).
- `GET /v1/admin/bookings?status=&userId=&from=&to=` y
  `POST /v1/admin/bookings/:id/cancel { reason }` (avisa a ambas personas).

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
pnpm db:seed       # Crear/actualizar el admin (verificado) desde ADMIN_EMAIL y ADMIN_PASSWORD
pnpm db:studio     # Abrir Prisma Studio
```

`src/generated/prisma/` no se versiona: se recrea con `pnpm db:generate`.
Ejecuta ese comando después de un `git clone` o de cambiar
`prisma/schema.prisma`, antes de compilar o arrancar la API.

## Despliegue

El repo incluye un `Dockerfile` (objetivos `runtime` y `migrate`), CI en `.github/workflows/ci.yml` y scripts `scripts/db-backup.sh` / `scripts/db-restore.sh`. Funciona con cualquier PostgreSQL vía `DATABASE_URL`. Pasos, variables y simulacro de restauración: [docs/RUNBOOK.md](docs/RUNBOOK.md).

Producción en una VM gratuita de Oracle Cloud (Ampere A1, ARM) con Docker Compose, Caddy (HTTPS), PostgreSQL 18, coturn (TURN) y backups diarios: archivos en [`deploy/`](deploy/) y guía paso a paso en [docs/DEPLOY-ORACLE.md](docs/DEPLOY-ORACLE.md).

## Datos demo y guion de demostración

Con la API corriendo y `pnpm db:seed` hecho, crea 3 mentoras aprobadas (con
ofertas gratuitas y una de pago) y 2 mentoradas ficticias. Casi todo pasa por la
API; dos pasos van directo a la base con Prisma porque la API no puede hacerlos
sin intervención: marcar los correos demo como verificados (no hay bandeja) y
aprobar las mentoras (la API de admin exige el código 2FA del admin; la
aprobación deja la misma fila de auditoría). Por eso el script necesita
`DATABASE_URL` y `ADMIN_EMAIL` (el admin que figura como aprobador), pero ya no
`ADMIN_PASSWORD`:

```bash
DEMO_PASSWORD='una-contraseña-de-12+' pnpm db:seed:demo
```

Es idempotente, restablece la contraseña de las cuentas demo al
`DEMO_PASSWORD` indicado (útil si la olvidaste; puedes guardarla en tu `.env`)
y se niega a correr con `NODE_ENV=production`. Las cuentas usan
`@demo.steamsociety.local`. El guion de 5 minutos está en
[`docs/DEMO.md`](docs/DEMO.md).

## Prueba de carga (k6)

`load/k6-read.js` cubre catálogo, detalle, slots y recomendaciones con los
umbrales de `docs/discovery/06-NFR-CAPACITY.md`. Se ejecuta con la imagen de
Docker de k6 (no se instala nada en el proyecto). Desde una sola máquina el
limitador devolvería 429, así que la API se levanta con `THROTTLE_DISABLED=true`
(prohibido en producción):

```bash
PAYMENTS_PROVIDER=fake THROTTLE_DISABLED=true node dist/main
docker run --rm --network host -e SCENARIO=baseline \
  -e MENTEE_EMAIL=camila.huaman@demo.steamsociety.local \
  -e MENTEE_PASSWORD="$DEMO_PASSWORD" \
  -v "$PWD/load:/load:ro" grafana/k6:1.0.0 run /load/k6-read.js
```

Escenarios: `smoke` (1 VU, 1 min), `baseline` (20 VUs, 5 min) y `spike`
(0→100 VUs). Nunca contra producción.

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

Para correr dos ramas a la vez (por ejemplo, en worktrees), usa otra base de
test con `E2E_DATABASE_NAME=steam_society_test_<sufijo>`; debe empezar con
`steam_society_test` y se crea sola.

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
