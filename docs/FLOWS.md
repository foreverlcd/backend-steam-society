# FLOWS · Mapa visual del sistema

Guía rápida con diagramas para orientarse antes de tocar código. Todo está sacado del código real (backend `src/`, web `../frontend-steam-society/src/`). Si un doc y el código discrepan, manda el código. Para pagos en detalle ver [PAYMENTS.md](PAYMENTS.md); para reglas de producto, [01-PRODUCT.md](01-PRODUCT.md).

## 1. Mapa del sistema

```mermaid
flowchart LR
  B["Navegador"] -->|"HTML/JS"| W["Next.js web :3001"]
  B -->|"fetch credentials include"| A["NestJS API :3000 prefijo /v1"]
  W -.->|"sirve la UI, no hace proxy"| B
  A --> D[("Postgres 18 :5433")]
  A -->|"SMTP_URL"| M["Mailpit / SMTP"]
  A -.->|"checkout y webhook"| P["Proveedor de pagos: disabled o fake"]
```

- La web (Next.js 16, App Router) llama a la API directo desde el navegador con `credentials: "include"`; no hay BFF ni proxy (`../frontend-steam-society/src/lib/api/client.ts`, `AGENTS.md`).
- La API vive en `/v1` (excepto `/health`); se configura en `src/app.setup.ts`, que también monta Helmet, CORS y sesiones.
- Sesión: cookie `httpOnly`, `sameSite=lax`, 7 días, guardada en Postgres (tabla `auth_session`, `connect-pg-simple`).
- CSRF: no hay token; `app.enableCsrfProtection({ trustedOrigins })` valida el origen contra `WEB_ORIGIN` (`src/shared/config/web-origins.ts`).
- El correo sale por `MailerService` (`src/modules/auth/mailer.service.ts`) con `SMTP_URL`; si no está definido, no envía.

## 2. Módulos del backend y sus dependencias

```mermaid
flowchart TD
  App["AppModule"] --> auth & profiles & scheduling & bookings & catalog & matching & payments & health
  bookings --> auth
  bookings --> profiles
  bookings --> scheduling
  bookings --> shared["shared: PrismaModule, clock, http"]
  catalog --> profiles
  catalog --> scheduling
  matching --> auth
  matching --> profiles
  matching --> scheduling
  payments --> auth
  payments --> bookings
  profiles --> auth
  scheduling --> auth
  scheduling --> profiles
```

- Las flechas son los `imports` reales de cada `*.module.ts` bajo `src/modules/` (más `src/app.module.ts`).
- `bookings` NO importa `payments`: solo expone `getPayable` y `confirmPayment` en `BookingsService`, y `payments` los llama por un adaptador (`src/modules/payments/infrastructure/bookings-booking-payment.adapter.ts`).
- `PrismaModule` (`src/shared/prisma/`) no es global: cada módulo que toca datos lo importa. `health` vive en `src/health/`.
- `auth` exporta `AuthService` y `MailerService`, y registra los guards globales (`APP_GUARD`) de sesión y roles.
- Las flechas son imports reales de TypeScript (tipos, decoradores, servicios y puertos), no solo los `imports` de los `*.module.ts`: por ejemplo `profiles`, `scheduling` y `matching` usan `CurrentUser`/`AuthUser` de `auth`. `scripts/check-boundaries.mjs` congela este grafo: una flecha nueva falla el lint hasta registrarla con un ADR.

## 3. Capas dentro de un módulo

```mermaid
flowchart LR
  pres["presentation: controllers, esquemas Zod"] --> app["application: servicios, puertos"]
  app --> dom["domain: reglas puras"]
  infra["infrastructure: Prisma, correo, tareas"] -->|"implementa puertos"| app
  infra --> dom
```

- Dirección permitida: `presentation → application → domain`; `infrastructure` implementa los puertos de `application` y puede usar `domain`. `domain` no importa Nest ni Prisma (`docs/02-ARCHITECTURE.md`).
- Ejemplo completo: `src/modules/bookings/` (`domain/booking-status.ts`, `application/bookings.service.ts` + `ports/`, `infrastructure/prisma-booking.repository.ts`, `presentation/bookings.controller.ts`).
- No todos los módulos son hexagonales: `profiles` y `auth` son planos (controller, service, repository en la misma carpeta); `catalog` solo tiene `application` y `presentation`; `matching` es una función pura (`domain/recommend.ts`) con un servicio fino.
- Los módulos se comunican por servicios y puertos exportados, nunca leyendo tablas ajenas.

## 4. Recorrido de la mentee

```mermaid
flowchart TD
  r["Registro: /register  POST /v1/auth/register"] --> o["Onboarding: /onboarding  GET y PUT /v1/me/onboarding"]
  o --> d["Dashboard: /dashboard  GET /v1/me/recommendations"]
  d --> c["Catalogo: /mentors  GET /v1/mentors"]
  d --> f
  c --> f["Ficha: /mentors/id  GET /v1/mentors/:id"]
  f --> h["Elegir horario  GET /v1/mentors/:id/slots"]
  h --> s["Solicitar  POST /v1/bookings  estado requested"]
  s --> a{"La mentora acepta"}
  a -->|"gratuita"| ok["confirmed"]
  a -->|"de pago"| ap["awaiting_payment"]
  ap -->|"Pagar: POST /v1/payments/checkout, webhook paid"| ok
  ok --> ses["Sesion por enlace externo"]
  ses --> fin["completed  o  no_show"]
  a -->|"rechaza o vence"| x["declined / expired"]
```

- Login en `/login` (`POST /v1/auth/login`); tras entrar, `homePathForRole` manda a mentee y mentora a `/dashboard` y al admin a `/admin` (`src/lib/auth/roles.ts`). Rutas privadas protegidas por `require-auth.tsx`.
- Reservas y pagos se ven en `/dashboard/bookings` (`bookings-view.tsx`); acciones: `GET /v1/bookings`, `POST /v1/bookings/:id/cancel`, `/no-show`. El pago de prueba usa `/payments/fake-checkout`.
- La mentee debe tener perfil de mentee para solicitar (`menteeProfileRequired` en `bookings.service.ts`).
- Verificación de correo: NO existe hoy. `prisma/schema.prisma` da `status = active` por defecto y no hay endpoint de verificación; el paso "verificar correo" aún no está construido.
- Un pago real queda desactivado por defecto (`GET /v1/payments/config`): el piloto solo tiene sesiones gratuitas.

## 5. Recorrido de la mentora

```mermaid
flowchart TD
  r["Registro como mentora: /register  POST /v1/auth/register"] --> p["Perfil: /dashboard/profile  GET y PUT /v1/me/profile"]
  p --> of["Ofertas: /dashboard/offerings  GET y POST /v1/me/offerings"]
  of --> av["Disponibilidad: /dashboard/availability  GET y PUT /v1/me/availability"]
  av --> sub["Enviar a revision  POST /v1/me/profile/submit"]
  sub --> adm["Admin: /admin  POST /v1/admin/mentors/:id/approve o reject"]
  adm -->|"approved"| rq["Solicitudes: /dashboard/bookings  GET /v1/bookings"]
  rq -->|"aceptar con enlace"| acc["POST /v1/bookings/:id/accept"]
  rq -->|"rechazar"| dec["POST /v1/bookings/:id/decline"]
  acc --> done["POST /v1/bookings/:id/complete  o  /no-show"]
```

- Pantallas en `../frontend-steam-society/src/app/(app)/dashboard/*` y `(app)/admin`; el menú sale de `src/components/layout/app-header.tsx`.
- Aceptar una reserva gratuita exige `meetingUrl`: la API no genera enlaces de video (`docs/04-STATE-MACHINES.md`).
- `complete` solo es válido desde `endsAt`; `no-show` solo después de `startsAt` (guardas en `booking-status.ts`).
- Solo perfiles `approved` aparecen en el catálogo y en las recomendaciones; el admin también puede `suspend` y `reactivate`.

## 6. Ciclo de vida de la reserva

```mermaid
stateDiagram-v2
  [*] --> requested: mentee POST /bookings
  requested --> confirmed: mentora accept si es gratuita
  requested --> awaiting_payment: mentora accept si es de pago
  requested --> declined: mentora decline
  requested --> cancelled: mentee cancel
  requested --> expired: sistema expire tras expiresAt
  awaiting_payment --> confirmed: sistema confirm_payment webhook paid
  awaiting_payment --> cancelled: mentee cancel
  awaiting_payment --> expired: sistema expire tras expiresAt
  confirmed --> cancelled: mentee o mentora cancel
  confirmed --> completed: complete al terminar la sesion
  confirmed --> no_show: no_show tras el inicio
  declined --> [*]
  cancelled --> [*]
  expired --> [*]
  completed --> [*]
  no_show --> [*]
```

- Fuente de verdad: `transitionBooking` en `src/modules/bookings/domain/booking-status.ts` (función pura con test exhaustivo en `booking-status.spec.ts`).
- Matices del código: la mentora solo puede cancelar desde `confirmed`; la mentee desde `requested`, `awaiting_payment` o `confirmed`. Una reserva gratuita confirmada solo se cancela antes de `startsAt`; una de pago, antes de `endsAt`.
- Vencimiento: tarea `@Interval(60_000)` en `infrastructure/bookings-expiration.task.ts` más evaluación al leer; `expiresAt = min(solicitud + BOOKING_REQUEST_TTL_HOURS, startsAt)`.
- Cada transición hace `UPDATE ... WHERE status = <leído>`; si cambió, responde `409 BOOKING_STATUS_CONFLICT`.

## 7. Ciclo de vida del perfil de mentora

```mermaid
stateDiagram-v2
  [*] --> draft
  draft --> pending_review: mentora submit
  pending_review --> approved: admin approve
  pending_review --> rejected: admin reject
  rejected --> pending_review: mentora submit
  approved --> suspended: admin suspend
  suspended --> approved: admin reactivate
```

- Tabla en `src/modules/profiles/domain/mentor-status.ts`; los endpoints están en `src/modules/profiles/profiles.controller.ts` (`/me/profile/submit` y `/admin/mentors/:id/{approve,reject,suspend,reactivate}`).
- Solo `approved` es visible públicamente. El perfil es editable en cualquier estado y editar no cambia `status`.
- Conflicto de estado concurrente: `409 MENTOR_STATUS_CONFLICT`. Las acciones del admin y el envío se auditan en `audit_log`.

## 8. Secuencia de una solicitud de reserva

```mermaid
sequenceDiagram
  actor Mentee
  participant Web as Web mentor-detail-view
  participant G as Guards CORS y CSRF, sesion, roles, throttle 10 por min
  participant C as BookingsController
  participant S as BookingsService
  participant R as PrismaBookingRepository
  participant DB as Postgres
  participant N as MailNotificationsAdapter
  Mentee->>Web: elige horario y envia
  Web->>G: POST /v1/bookings offeringId, startsAt, message
  G->>G: origen confiable, cookie valida, rol mentee
  G->>C: peticion autorizada
  C->>S: create(user, body) tras validar Zod
  S->>S: perfil de mentee, oferta activa, mentora approved
  S->>S: generateSlots valida horario, antelacion y solapes
  S->>R: create(session + booking)
  R->>DB: INSERT en una transaccion con locks
  DB-->>R: ok o violacion session_no_overlap
  R-->>S: Booking o SlotTakenError
  S->>N: send(requested) despues del commit
  N-->>S: fallo de correo solo se registra
  S-->>Web: 201 BookingResponse estado requested
```

- Guards: `SessionAuthGuard` y `RolesGuard` son globales (`auth.module.ts`); el throttle y `@Roles('mentee')` están en `src/modules/bookings/presentation/bookings.controller.ts`.
- Validación de horario con `generateSlots` (`src/modules/scheduling/domain/slot-generator.ts`).
- Red de seguridad en BD: restricción de exclusión `session_no_overlap` (`prisma/migrations/20261030234248_add_sessions_and_bookings/`) y error `SlotTakenError` mapeado a `bookingSlotTaken`.
- El correo se envía tras el commit; si falla, la reserva sigue válida (ADR-022).

## 9. Registro y verificación de correo (ADR-024)

```mermaid
sequenceDiagram
  actor Usuaria
  participant Web
  participant A as AuthController
  participant S as AuthService
  participant DB as Postgres
  participant M as MailerService
  participant Mail as Mailpit o SMTP
  Usuaria->>Web: completa el registro
  Web->>A: POST /v1/auth/register
  A->>S: register(body) tras validar Zod
  S->>DB: INSERT user con email_verified_at nulo
  S-->>Web: 201 AuthUser con emailVerified false
  S->>DB: guarda hash SHA-256 del token y expires_at
  S->>M: sendEmailVerification(email, token, horas)
  M->>Mail: enlace APP_URL/verify-email?token=...
  Note over S,M: si el correo falla solo se registra el error y la cuenta sigue creada
  Usuaria->>Web: abre el enlace
  Web->>A: POST /v1/auth/email/verify con token
  A->>S: verifyEmail(token)
  S->>DB: transaccion que consume el token y marca email_verified_at
  DB-->>S: ok o token invalido, vencido o usado
  S-->>Web: 204 o 400 INVALID_VERIFICATION_TOKEN
  Usuaria->>Web: pide otro enlace
  Web->>A: POST /v1/auth/email/resend con sesion
  A->>S: resendEmailVerification(user)
  S->>DB: borra tokens sin usar y crea uno nuevo
  S-->>Web: 202 o 409 EMAIL_ALREADY_VERIFIED
```

- Sin verificar, la usuaria entra y navega. `AccountPolicyGuard` (`src/modules/auth/account-policy.guard.ts`) responde `403 EMAIL_NOT_VERIFIED` solo en rutas con `@RequireVerifiedEmail` (`POST /v1/bookings`, `POST /v1/me/profile/submit`).
- Solo se guarda el hash del token; reenviar invalida los enlaces anteriores.

## 10. Login con 2FA (ADR-024)

```mermaid
sequenceDiagram
  actor Usuaria
  participant Web
  participant A as AuthController
  participant S as AuthService
  participant F as MfaService
  participant DB as Postgres
  Usuaria->>Web: correo y contrasena
  Web->>A: POST /v1/auth/login con throttle 5 por min
  A->>S: login(email, password)
  S-->>A: AuthUser con mfaEnabled
  alt cuenta sin 2FA
    A->>S: startSession(userId)
    A-->>Web: 200 AuthUser y cookie de sesion
  else cuenta con 2FA
    A->>S: startMfaChallenge(userId)
    Note over S: session.pendingMfa vale 5 minutos
    A-->>Web: 200 mfaRequired true
    Usuaria->>Web: codigo de la app o codigo de recuperacion
    Web->>A: POST /v1/auth/login/mfa con throttle por cuenta mfa userId
    A->>S: pendingMfaUserId(request)
    S-->>A: userId o 401 MFA_CHALLENGE_EXPIRED
    A->>F: verifySecondFactor(userId, prueba)
    F->>DB: lee user_totp, descifra el secreto y valida el paso de 30 s
    F->>DB: rechaza un paso ya usado o consume el codigo de recuperacion
    F-->>A: true o false
    A->>S: startSession(userId)
    A-->>Web: 200 AuthUser o 401 INVALID_MFA_CODE
  end
```

- El admin sin 2FA entra, pero `AccountPolicyGuard` responde `403 MFA_ENROLLMENT_REQUIRED` en todo salvo las rutas con `@AllowWithoutMfa` (`/me`, logout, `/me/mfa/*`, reenvío de verificación). Debe activar el 2FA con `POST /v1/me/mfa/totp/setup` y `totp/confirm`.
- El secreto TOTP se cifra con AES-256-GCM (`secret-box.ts`, `MFA_ENCRYPTION_KEY`). Detalle de las tablas en `docs/03-DATA-MODEL.md`.

## 11. Dónde tocar qué

| Si quieres cambiar... | Archivos |
|---|---|
| Reglas/transiciones de la reserva | `src/modules/bookings/domain/booking-status.ts` (+ `.spec.ts`), `application/bookings.service.ts` |
| Plazo de respuesta de solicitudes | `BOOKING_REQUEST_TTL_HOURS` en `src/config/env.ts`; tarea en `bookings/infrastructure/bookings-expiration.task.ts` |
| Cálculo de horarios libres, antelación | `src/modules/scheduling/domain/slot-generator.ts`, `availability-rule.ts` |
| Pesos y razones del matching | `src/modules/matching/domain/matching.config.ts`, `recommend.ts`; doc `docs/08-MATCHING.md` |
| Preguntas del onboarding | `src/modules/profiles/onboarding.config.ts`, `onboarding.completion.ts`; web `src/components/onboarding/` |
| Correos de reserva | `src/modules/bookings/infrastructure/mail-notifications.adapter.ts` |
| Correo de restablecer contraseña / verificación / SMTP | `src/modules/auth/mailer.service.ts`, `SMTP_URL`/`SMTP_FROM` en `src/config/env.ts` |
| Verificación de correo y cuáles rutas la exigen | `@RequireVerifiedEmail` (`src/shared/http/account-policy.decorators.ts`), `account-policy.guard.ts`, `EMAIL_VERIFICATION_TTL_HOURS` |
| 2FA (TOTP, códigos de recuperación, roles obligados) | `src/modules/auth/{mfa.service,mfa.controller,mfa.repository,totp,secret-box}.ts`; roles obligados en `MFA_REQUIRED_ROLES`; `@AllowWithoutMfa` en rutas |
| Pagos y proveedor | `src/modules/payments/` (`PaymentGateway`, adaptadores); ver `docs/PAYMENTS.md`; web `src/components/payments/`, `src/lib/api/payments.ts` |
| Roles y permisos de un endpoint | `@Roles(...)` en el controller; `src/modules/auth/roles.guard.ts`, `src/shared/http/roles.decorator.ts` |
| Sesión, cookie, CORS, CSRF | `src/app.setup.ts`, `src/shared/config/web-origins.ts`, `WEB_ORIGIN` |
| Límites de peticiones (throttle) | `@Throttle` en cada controller; configuración base en `src/modules/auth/auth.module.ts` |
| Estados del perfil de mentora | `src/modules/profiles/domain/mentor-status.ts`, `profiles.service.ts` |
| Textos y pantallas de la web | `../frontend-steam-society/src/components/*` y `src/app/*`; llamadas a la API en `src/lib/api/*.ts`; redirecciones por rol en `src/lib/auth/roles.ts` |
| Esquema de datos / constraints | `prisma/schema.prisma`, `prisma/migrations/`; ver `docs/03-DATA-MODEL.md` |
