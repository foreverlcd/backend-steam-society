# 05 · Hoja de ruta y criterios de aceptación

Estimaciones [inferidas], para un solo desarrollador; se recalibran con el ritmo real. En modo acelerado se sigue la etapa completa sin pedir confirmación del plan; solo se para en las condiciones de 'Detente y pregunta' o al cerrar la etapa.

**Estado 2026-10-30:** modo acelerado y política git autónoma activos. `main` local ya incluye accelerated-mode, 1.3 admin detail y 1.4 ofertas/disponibilidad (merges locales; push pendiente). Frontend: `feat/1.3-admin-panel` y `feat/1.4-scheduling-client` siguen pendientes de merge. Backend tras 1.4: 115 unitarios y 36 e2e reportados. Siguiente: gates del merge, push y etapa 1.5.

## Hito 1: flujo de punta a punta con mentoría gratuita (~2,5 a 3,5 meses)

### 1.1a: Prisma, área, health, CORS, README (cerrada)
**Contrato:**
- Modelo `area` (`id` uuid, `name` único, `parent` opcional autorrelación, `createdAt` timestamptz, `@@map("area")`); migración creada en `prisma/migrations/` y aplicada.
- `GET /health`: 200 `{status:'ok', db:'up'}` si la base responde (`SELECT 1` con `$queryRaw`); 503 `{status:'error', db:'down'}` si falla (`ServiceUnavailableException` con objeto como cuerpo). Vive en `src/health/`; `HealthModule` importa `PrismaModule`; el service recibe `PrismaService` por inyección.
- Tests Vitest con `PrismaService` falso: base arriba y base caída. El spec del controller prueba que delega en el service; no duplica los asertos del service. Todos los imports relativos con `.js`.
- CORS: `app.enableCors` con orígenes desde `WEB_ORIGIN` (lista separada por comas); ejemplo en `.env.example`; verificación con una petición `OPTIONS` (preflight) con curl, salida mostrada.
- README: cómo levantar desde cero (docker compose, `.env`, `pnpm install`, `pnpm db:generate`, `pnpm db:migrate`, `pnpm start:dev`, curl a `/health`), variables, aviso de que `src/generated/` no se versiona y de que la API falla rápido si la base está caída al arrancar.
**Aceptación:** build, lint y test verdes; `\dt` muestra `area` y `_prisma_migrations`; curl con la base encendida → 200; con la base detenida (app ya levantada) → 503; preflight responde las cabeceras CORS esperadas.

### 1.1b: Web mínima y ADRs (cerrada)
Repo web (Next.js) en sesión aparte con su propio `AGENTS.md`. Una página que lee `/health` desde `localhost:3001` sin error de CORS. ADRs 001 a 012 ya redactados en `07-DECISIONS.md`: el desarrollador los lee y los ajusta. Frontend fusionado en `15cf79a` (PR #1).

### 1.2: Identidad (ZONA ROJA)
**Antes de codificar:** el agente investiga y propone opciones para **P-01 autenticación** y **P-02 validación**; decide el desarrollador. Mailpit (SMTP local) para correos de desarrollo [verificar, P-05].
**Alcance:** registro (rol mentee o mentor, fecha de nacimiento), login, logout, recuperar contraseña por correo, guardas por rol, rutas protegidas, `GET /v1/me`; seed de admin con credenciales desde variables de entorno (nunca en el repo); limitación de intentos (rate limit).
**Aceptación:** tests de integración del flujo completo; contraseñas con hash adecuado y nunca en logs; cookies `httpOnly`, `secure` y `sameSite` apropiados al esquema con dos orígenes; no se puede crear un admin por registro público; enumeración de usuarios mitigada (misma respuesta exista o no el correo). Lista "puntos para revisar con lupa" entregada.

### 1.3: Perfiles, onboarding y aprobación (cerrada)
Backend base fusionado en `main` `ac6eee7`; frontend 1.3b fusionado en `15cf79a`. El detalle admin se añadió después en `feat/1.3-admin-detail` y `feat/1.3-admin-panel`. Pendiente: revisión senior, merge, push y prueba de contrato frontend-API.
Seeds provisorios de áreas STEAM e idiomas (el equipo entregará las listas definitivas) · perfiles de mentora y mentee · onboarding versionado como configuración (`ONBOARDING_VERSION = 1`) · estado de la mentora (`04-STATE-MACHINES.md`) y aprobación por admin con `audit_log`.
**API:** `GET|PUT /v1/me/profile`, `POST /v1/me/profile/submit`, `GET|PUT /v1/me/onboarding`; admin `GET /v1/admin/mentors?status=`, `GET /v1/admin/mentors/:id`, `POST /v1/admin/mentors/:id/approve|reject|suspend|reactivate`.
**Detalle admin:** `{ mentor, onboarding }`; `mentor` incluye perfil, `minNoticeHours`, `maxAdvanceDays`, áreas, idiomas y estado; `onboarding` incluye `version`, `steps`, `answers`, `completion` y `options`, reutilizando la configuración versionada. `403` si no es admin, `404 MENTOR_PROFILE_NOT_FOUND` si no existe, `400` si el UUID es inválido.
**Aceptación:** una mentora no `approved` no es visible por ninguna ruta pública; cada aprobación o rechazo deja registro de auditoría; validación estricta de entradas; `submit` rechaza un onboarding incompleto y `GET|PUT /v1/me/onboarding` expone `completion`; el admin puede revisar el onboarding completo antes de decidir.

### 1.4: Ofertas y disponibilidad (fusionada en main)
CRUD de ofertas (varias por mentora; archivar en vez de borrar) · reglas de disponibilidad con zona IANA · cálculo de slots (`GET /v1/mentors/:id/slots`) respetando antelación mínima y máxima, sesiones existentes y duración de la oferta. P-07 resuelta con `temporal-polyfill` 1.0.6 (ADR-020).

**Contrato:**
- `GET|POST /v1/me/offerings`, `PATCH /v1/me/offerings/:id`, `POST /v1/me/offerings/:id/archive`. Solo mentoras; crear/editar exige `mentor_profile.status = approved` y `user.status = active`; archivar es lógico y funciona también si la mentora dejó de estar aprobada.
- Oferta: `{ id, mentorId, title, description, type: 'one_to_one', durationMinutes, capacity: 1, isFree, priceMinor, currency, active, archivedAt, createdAt, updatedAt }`. `durationMinutes` entre 15 y 240; gratuita ⇒ `priceMinor = 0`; de pago ⇒ `priceMinor > 0`; moneda ISO 4217 con `PEN` por defecto.
- `GET|PUT /v1/me/availability`: `{ timezone, rules: [{ id, weekday, startTime, endTime, timezone, validFrom, validTo }] }`. `PUT` reemplaza todas las reglas; `weekday` 1–7, horas `HH:mm`, `endTime > startTime`, zona IANA (si se omite se usa `user.timezone`), `validTo >= validFrom`.
- `GET /v1/mentors/:id/slots?offeringId&from&to` (público): `{ mentorId, offeringId, durationMinutes, slots: [{ startsAt, endsAt, timezone, localStart, localEnd }] }`. `startsAt`/`endsAt` son ISO UTC; `localStart`/`localEnd` usan la zona de la regla. Rango máximo 90 días; se respetan `min_notice_hours`/`max_advance_days`; se excluyen slots ocupados por sesiones (puerto falso en 1.4, adaptador real en 1.5). La mentora debe estar `approved`, la usuaria `active` y la oferta activa/no archivada.
- Errores `{ statusCode, code, message }`: `MENTOR_ONLY`, `MENTOR_PROFILE_NOT_FOUND`, `MENTOR_NOT_APPROVED`, `OFFERING_NOT_FOUND`, `OFFERING_ARCHIVED`, `INVALID_OFFERING_PRICE`, `INVALID_CURRENCY`, `INVALID_TIMEZONE`, `INVALID_AVAILABILITY_RANGE`, `INVALID_SLOT_RANGE`, `SLOT_RANGE_TOO_LARGE`, `INVALID_AVAILABILITY_RULE`.

**Aceptación:** build/lint/test/e2e verdes; tests de propiedades (ningún slot se solapa con una sesión; todo slot cae dentro de las reglas); casos con zonas con horario de verano (America/New_York, Europe/Madrid) y cambios de hora; CHECKs de oferta y disponibilidad probados en PostgreSQL; frontend: cliente/tipos/pruebas de 1.4 en `feat/1.4-scheduling-client` (36 tests verdes), sin UI; pruebas de contrato con `fetch` mock, no e2e contra la API real.

### 1.5: Reservas (ZONA ROJA, hexagonal)
Solicitar, aceptar, rechazar, cancelar, vencer, completar y no-show, según `04-STATE-MACHINES.md`; migración con SQL a mano (exclusión y CHECK); notificaciones por correo después del commit (ADR-022); vencimiento al consultar + tarea con `@nestjs/schedule` (ADR-023); plazo de respuesta `BOOKING_REQUEST_TTL_HOURS` (ADR-021); enlace de sesión externo.
**Aceptación:** tabla exhaustiva de transiciones; test de concurrencia (dos solicitudes al mismo horario: una gana); vencimiento correcto aunque no corra la tarea; mentee sin solapes (R-12); ninguna reserva gratuita crea pago (R-07).

### 1.6: Catálogo y recomendaciones
Búsqueda y filtros (texto completo y trigramas de PostgreSQL) con paginación por cursor · recomendaciones con razón según `08-MATCHING.md` · script de evaluación con personas sintéticas.
**Aceptación:** filtros duros nunca devuelven mentoras no aprobadas o sin disponibilidad; cada razón corresponde a un componente con puntos > 0 (test); precision@3 sobre las personas sintéticas reportada.

### 1.7: Demo y endurecimiento
Datos de demostración (seed) · guion de demo de 5 minutos · README de extremo a extremo · prueba de carga simple con k6 sobre catálogo y slots [meta a definir] · escaneo básico con OWASP ZAP [a confirmar].
**Aceptación:** tres personas del equipo completan la demo sin ayuda.

## Hito 2: dinero en sandbox
**Prerrequisitos (decisiones del desarrollador, no del agente):** proveedor (P-03), moneda y forma jurídica (DA-03), política de cancelación y reembolso (DA-05), comisión.
**Spike primero:** un pago de sandbox con división de comisión, webhook y reembolso completos en el proveedor candidato (con `curl`), antes de integrar.
**Alcance:** puerto `PaymentGateway`; `payment`, `refund`, `payout`, `webhook_event`; ledger de doble entrada con invariantes; idempotencia; conciliación; vista de transparencia del admin. Estado del arte de proveedores en Perú: [verificado el 2026-10] Stripe no lista Perú para abrir cuenta; Mercado Pago documenta split de pagos en otros países sin confirmar Perú. Revalidar antes de decidir.

## Hito 3: confianza y tiempo real
Fotos (validar tipo y tamaño, quitar EXIF, redimensionar, almacenamiento tipo S3, URLs firmadas, borrado a petición) · chat con WebSockets · reseñas · reportar y bloquear · recordatorios · modelo de amenazas y checklist de seguridad.

## Hito 4: video propio 1:1 (condicional)
Spike previo: llamada 1:1 entre dos redes distintas (wifi y datos móviles) con servicios de relevo; decidir qué se compra, qué se autoaloja y qué se construye.

## Riesgos y cómo se validan
| Riesgo | Validación |
|---|---|
| R1 Dinero en Perú | Spike de sandbox y revisión de un contador antes de dinero real |
| R2 Video en redes reales | Spike entre dos redes; fallback a enlace externo |
| R3 Oferta insuficiente de mentoras y matching sin datos | Validación del equipo: emparejar a mano 10 mentees y comparar con el motor |
| R4 Privacidad, seguridad y protección de usuarias | Pruebas de archivos maliciosos, ZAP, revisión senior; DA-01 y DA-04 antes del primer piloto |
| R5 Disponibilidad y zonas horarias | Tests de propiedades y de concurrencia (etapas 1.4 y 1.5) |

## Bosquejo de API (borrador; cada etapa propone su OpenAPI)
- Auth: `POST /v1/auth/register|login|logout`, `POST /v1/auth/password/forgot|reset`, `GET /v1/me`.
- Perfiles: `GET|PUT /v1/me/profile`, `PUT /v1/me/onboarding`, `GET|PUT /v1/me/availability`.
- Admin: `GET /v1/admin/mentors?status=…`, `POST /v1/admin/mentors/:id/approve|reject`.
- Ofertas: `GET|POST /v1/me/offerings`, `PATCH /v1/me/offerings/:id`, `POST /v1/me/offerings/:id/archive`.
- Catálogo: `GET /v1/mentors` (búsqueda, filtros, cursor), `GET /v1/mentors/:id`, `GET /v1/mentors/:id/slots?offeringId&from&to`, `GET /v1/me/recommendations`.
- Reservas: `POST /v1/bookings`, `GET /v1/me/bookings`, `POST /v1/bookings/:id/accept|decline|cancel|complete|no-show`.
- Técnico: `GET /health` (sin prefijo).
