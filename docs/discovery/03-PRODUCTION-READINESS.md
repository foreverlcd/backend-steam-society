# 03 · Auditoría de preparación a producción

**Fecha:** 2026-11-01. **Alcance:** backend y web actuales, sin desplegar. **Criterio:** un ítem es "Hecho" solo si existe en código y tiene evidencia; "Parcial" si existe pero no cubre el caso real; "Falta" si no existe. Severidad: **Bloqueante** impide un piloto con personas reales; **Alta** debe cerrarse antes de abrir al público; **Media** puede convivir con el piloto controlado.

## 1. Resumen

| Área | Hecho | Parcial | Falta | N/A | Bloqueantes |
|---|---:|---:|---:|---:|---:|
| Seguridad | 7 | 6 | 4 | 2 | 2 |
| Confiabilidad | 3 | 8 | 3 | 0 | 2 |
| Observabilidad | 1 | 1 | 6 | 0 | 0 |
| Rendimiento | 3 | 4 | 3 | 0 | 0 |
| Datos y legal | 0 | 2 | 12 | 2 | 8 (D-04 duplica R-04) |
| Web (Next.js 16) | 0 | 7 | 6 | 1 | 0 |

**Lectura:** el núcleo transaccional (reservas, matching, sesiones, validación) está por encima de lo habitual para un MVP. Lo que falta es la capa de **operación real**: identidad verificada, privilegios, backups, observabilidad, cumplimiento y configuración. Nada de eso se resuelve con más features de producto.

## 2. Seguridad

| ID | Ítem | Estado | Sev. | Evidencia | Acción / tamaño |
|---|---|---|---|---|---|
| S-01 | 2FA para roles privilegiados | Falta | Bloqueante | No hay TOTP/WebAuthn ni campo `mfa`; solo `passwordHash` (`prisma/schema.prisma:43-65`) | TOTP + recovery codes + enrolamiento obligatorio; M |
| S-02 | Rate limit compartido | Parcial | Alta | `ThrottlerModule` sin storage; memoria por proceso (`src/modules/auth/auth.module.ts:18-34`) | Una instancia en piloto; luego storage Postgres/Redis; S–M |
| S-03 | Verificación de correo | Falta | Bloqueante | Registro crea `status=active` y `emailVerifiedAt=null` (`auth.service.ts:56-65`, `schema.prisma:47,53`) | Token + correo + estado `pending_verification`; M |
| S-04 | CSP y HSTS explícitos | Parcial | Alta | Solo `app.useSecurityHeaders()` con defaults (`app.setup.ts:16`) | CSP para API y web, HSTS 1 año, `frame-ancestors`; S |
| S-05 | Cookies de sesión | Hecho | — | `httpOnly`, `secure`, `sameSite=lax`, `__Host-sid` (`app.setup.ts:48-51`, `session-cookie.ts:1-2`) | Mantener; probar same-site en producción; S |
| S-06 | Gestión de secretos | Parcial | Alta | Secretos en `.env`; `.env.example` versionado; sin rotación (`env.ts:4-17`) | Gestor de secretos + rotación + auditoría; M |
| S-07 | Cifrado de datos personales/financieros | Parcial | Alta | TLS en tránsito por proveedor; sin cifrado de campo; datos financieros aún no existen | Cifrado de campo para datos sensibles + KMS; M–L |
| S-08 | Cadena de suministro y escaneos | Falta | Alta | Sin CI, sin CodeQL/Snyk, sin `pnpm audit` automatizado; lockfile sí existe | CI con audit, Dependabot, SAST; M |
| S-09 | CSRF | Hecho | — | `app.enableCsrfProtection({ trustedOrigins })` (`app.setup.ts:27`) | Probar con frontend real; S |
| S-10 | Hash y enumeración | Hecho | — | Argon2id + hash dummy (`password-hasher.service.ts:5-14`) | Mantener; revisar parámetros anual; S |
| S-11 | Autorización y ownership | Hecho | — | Guards globales + `RolesGuard`; reservas verifican participante (`bookings.service.ts`) | Revisión senior pendiente; S |
| S-12 | Validación de entrada | Hecho | — | Zod + `StandardSchemaValidationPipe` (`app.setup.ts:58`) | Mantener; probar casos límite; S |
| S-13 | Bootstrap de admin | Parcial | Alta | Seed con `ADMIN_EMAIL/PASSWORD`; sin 2FA ni cuentas separadas (`prisma/seed.ts:8-46`) | Crear superadmin con 2FA y retirar credenciales; S–M |
| S-14 | Auditoría de acciones | Parcial | Alta | `audit_log` existe y se escribe en aprobaciones; sin visor ni request-id (`schema.prisma:279-290`) | Visor + request-id + eventos críticos; M |
| S-15 | IP real detrás de proxy | Falta | Alta | No hay `trust proxy` (`grep` sin resultados) | Configurar proxy y `trust proxy`; S |
| S-16 | Dependencias fijadas | Hecho | — | `pnpm-lock.yaml` y versiones en `package.json` | Añadir pin por SHA en Actions; S |
| S-17 | CORS/CSRF allowlist | Hecho | — | `WEB_ORIGIN` parseado y aplicado (`app.setup.ts:19-27`) | Probar staging y producción; S |
| S-18 | Uploads de archivos | N/A | — | Hito 3 | Diseñar validación, EXIF, antivirus, URLs firmadas; L |
| S-19 | PCI/pasarela | N/A | — | Hito 2 | Usar checkout alojado; no almacenar tarjetas; L |

## 3. Confiabilidad

| ID | Ítem | Estado | Sev. | Evidencia | Acción / tamaño |
|---|---|---|---|---|---|
| R-01 | Tareas programadas durables | Parcial | Alta | `@Interval(60_000)` en proceso (`bookings-expiration.task.ts:5-13`); sin cola ni líder | Una instancia; advisory lock; luego cola durable; S–M |
| R-02 | Reintentos y timeouts | Parcial | Alta | SMTP sin retry ni timeout explícito; sin outbox (`mailer.service.ts:34-45`) | Timeout + retry + outbox; M |
| R-03 | Idempotencia | Parcial | Alta | Transiciones con `WHERE status`; sin `Idempotency-Key` de API | Añadir clave para pagos y acciones críticas; M |
| R-04 | Backups y RPO | Falta | Bloqueante | No hay entorno de producción ni política de backups | Backup diario + PITR; RPO ≤24 h (piloto), ≤15 min (pago); M |
| R-05 | Restauración probada | Falta | Bloqueante | Nunca se restauró un backup de producción | Simulacro trimestral; RTO ≤4 h; S |
| R-06 | Migraciones sin downtime | Parcial | Alta | 11 migraciones; sin expand/contract documentado | Política expand/contract + ensayo en staging; M |
| R-07 | Health/readiness | Parcial | Media | `/health` solo consulta `SELECT 1` (`health.service.ts:14-23`) | Separar liveness/readiness; incluir config y migraciones; S |
| R-08 | Apagado ordenado | Parcial | Media | `enableShutdownHooks()` (`main.ts:8`); sin drenaje | Drenaje y timeout; S |
| R-09 | Alta disponibilidad | Falta | Alta | Un proceso, una base; sin réplica | Piloto: aceptar; producción: réplica/segunda instancia; L |
| R-10 | Pool de conexiones | Parcial | Media | `PrismaPg` sin `max` explícito (`prisma.service.ts:16-19`) | Configurar pool según instancia; S |
| R-11 | Tiempo y zonas | Hecho | — | UTC + `Timestamptz(3)` + IANA (`schema.prisma:51`, migraciones) | Mantener; probar DST; S |
| R-12 | Entrega de correo | Parcial | Alta | Best-effort, sin outbox; fallo solo se loguea (`auth.service.ts:144-150`) | Outbox + rebote + supresión; M |
| R-13 | Vencimiento si cae el proceso | Hecho | — | Se evalúa al consultar y con tarea idempotente (`bookings.service.ts:225,366`) | Mantener; probar caída; S |
| R-14 | Integridad en base | Hecho | — | Exclusión `session_no_overlap`, CHECKs, único parcial | Mantener; revisión senior; S |

## 4. Observabilidad

| ID | Ítem | Estado | Sev. | Evidencia | Acción / tamaño |
|---|---|---|---|---|---|
| O-01 | Logs estructurados + request-id | Falta | Alta | `Logger` de Nest en texto; sin `requestId` (`grep` sin resultados) | JSON + `request-id` + usuario seudónimo; M |
| O-02 | Seguimiento de errores | Falta | Alta | Sin Sentry ni equivalente | Sentry free + release/commit; S |
| O-03 | Métricas | Falta | Alta | Sin Prometheus/OpenTelemetry | Métricas RED + negocio; M |
| O-04 | Alertas y uptime | Falta | Alta | Sin monitor externo | UptimeRobot/Better Stack + alertas a correo; S |
| O-05 | Runbook | Falta | Alta | No hay procedimientos de incidente | Runbook de 1 página por incidente; S |
| O-06 | Visor de auditoría | Falta | Media | `audit_log` sin UI | Pantalla en admin v2; M |
| O-07 | Health público | Hecho | — | `/health` fuera de `/v1` (`app.setup.ts:57`) | Mantener; no exponer detalles; S |
| O-08 | Redacción de logs | Parcial | Alta | Se loguean nombres/códigos, no cuerpos; sin política formal | Lista de campos prohibidos + test; S |

## 5. Rendimiento

| ID | Ítem | Estado | Sev. | Evidencia | Acción / tamaño |
|---|---|---|---|---|---|
| P-01 | Recomendaciones | Parcial | Media | Carga todas las candidatas y luego filtra/puntúa (`recommendations.service.ts:78-118`) | Medir con 500 mentoras; cache/precálculo; M |
| P-02 | Slots | Parcial | Media | Itera días y bloques de la duración de la oferta, hasta 90 días (`slot-generator.ts:159-240`) | Medir; precalcular por día; M |
| P-03 | Índices | Parcial | Alta | `booking` sin índice en `expires_at`; `session` sí en `mentorId,startsAt` (`schema.prisma:345,372-373`) | Índice parcial `status='requested'`; S |
| P-04 | Pool | Parcial | Media | Sin `max` explícito | Ajustar a conexiones del proveedor; S |
| P-05 | Caché | Falta | Media | Sin caché de catálogo/config | Cache TTL + ETag; M |
| P-06 | Rate limit del catálogo | Falta | Alta | `GET /v1/mentors` público sin throttle propio | Throttle por IP + cache; S |
| P-07 | Paginación | Hecho | — | Cursor en catálogo, reservas y admin | Mantener; probar saltos; S |
| P-08 | Búsqueda | Hecho | — | GIN + trigramas (`migración add_catalog_search`) | Medir con datos reales; S |
| P-09 | N+1 de ofertas | Hecho | — | `listActiveOfferingsForMentors` en lote (`catalog.service.ts:44-47`) | Mantener; S |
| P-10 | Prueba de carga | Falta | Alta | Solo script de evaluación de matching, no k6 | k6 catálogo/slots/reservas; M |

## 6. Datos, traducciones y legal

| ID | Ítem | Estado | Sev. | Evidencia | Acción / tamaño |
|---|---|---|---|---|---|
| D-01 | Retención de datos | Falta | Bloqueante | No hay política ni job de purga | Definir plazos por tabla + purga; M |
| D-02 | Derechos ARCO | Falta | Bloqueante | Solo `deletedAt`; sin exportación ni acceso | Exportar/eliminar/anonimizar; M |
| D-03 | Borrado/anonimización | Parcial | Alta | Soft delete de `user`; sin cascada definida | Política + job + auditoría; M |
| D-04 | Backups | Falta | Bloqueante | Ver R-04 | Ver R-04 |
| D-05 | Residencia de datos | Falta | Alta | Proveedor aún no elegido | Elegir región y documentarlo; S |
| D-06 | Consentimiento | Falta | Bloqueante | No hay registro de consentimiento | Tabla + versión de política; M |
| D-07 | Traducciones de referencia | Falta | Alta | Taxonomías y etiquetas solo en español; `user.locale` sin uso | Tablas i18n + API; L |
| D-08 | Menores | Falta | Bloqueante | Se guarda `birth_date` sin lógica de edad (`schema.prisma:50`) | DA-01 + control de edad/consentimiento; M |
| D-09 | Retención de auditoría | Parcial | Alta | `audit_log` sin política | 2 años para finanzas; M |
| D-10 | Aislamiento de datos demo | Falta | Alta | No hay entornos separados; seeds demo en dev | Staging separado + flag; S |
| L-01 | Términos y privacidad | Falta | Bloqueante | No existen documentos legales | Redactar + versionar + aceptación; M [a confirmar con abogado] |
| L-02 | Libro de Reclamaciones | Falta | Bloqueante | No existe | Implementar según normativa peruana; S–M [a confirmar con abogado] |
| L-03 | Protección de menores | Falta | Bloqueante | DA-01 pendiente | Política + verificación; M [a confirmar con abogado] |
| L-04 | Consumidor y pagos | N/A | — | Hito 2 | Revisar con contador/abogado; L |
| L-05 | Autoridad de datos | Falta | Alta | Sin registro ni evaluación | Evaluar obligación; S [a confirmar] |
| L-06 | Facturación/impuestos | N/A | — | Hito 2 | Definir con contador; M [a confirmar] |

## 7. Auditoría específica del backend

### 7.1 Tarea `@Interval` en proceso

- **Qué hace:** cada 60 s llama a `bookings.expireDue()`, que actualiza reservas `requested` vencidas y envía correos. `[leído en el código]` (`bookings-expiration.task.ts:5-23`)
- **Riesgo:** corre en cada instancia; no hay leader election. El `UPDATE` es idempotente, así que dos instancias no corrompen, pero pueden duplicar notificaciones. Si el proceso está caído, el vencimiento se evalúa igual al consultar. `[leído en el código]`
- **Decisión:** una instancia en el piloto; advisory lock de PostgreSQL antes de escalar; cola durable (pg-boss/pgmq) cuando existan pagos o webhooks. Tamaño: S para el lock, M para la cola.

### 7.2 Rate limit en memoria

- **Qué hace:** `ThrottlerModule.forRoot` sin `storage`; el almacén por defecto es memoria del proceso. `[leído en el código]`
- **Riesgo:** se reinicia con el proceso y no se comparte entre instancias; un atacante con varias réplicas multiplica el límite. Además `req.ip` sin `trust proxy` agrupa a todas las usuarias bajo la IP del proxy. `[leído en el código]`
- **Decisión:** piloto de una instancia + `trust proxy`; al escalar, storage compartido (Postgres o Redis). No añadir Redis solo por esto si la instancia es única. Tamaño: S–M.

### 7.3 Almacén de sesiones

- **Qué hace:** `connect-pg-simple` sobre `auth_session`; poda cada 900 s; TTL 7 días con `rolling`. `[leído en el código]`
- **Riesgo:** no hay timeout absoluto; una sesión robada puede renovarse indefinidamente. No hay 2FA ni lista de sesiones activas. `[leído en el código]`
- **Decisión:** añadir `absoluteExpiresAt` y revocación por usuaria; 2FA para privilegiados. Tamaño: M.

### 7.4 Jobs y correo

- **Qué hace:** no hay cola; el correo se envía después del commit y un fallo solo se loguea. `[leído en el código]`
- **Riesgo:** se pierden correos si el proceso muere o el SMTP falla; no hay reintento, rebote ni supresión. Para pagos, un webhook perdido es dinero. `[leído en el código]`
- **Decisión:** outbox en la misma transacción + worker con reintentos; en el Hito 2 es bloqueante. Tamaño: M.

### 7.5 Logs y errores

- **Qué hace:** `Logger` de Nest en texto; no hay `request-id`, JSON ni filtro global; los errores de dominio tienen `{statusCode, code, message}`. `[leído en el código]`
- **Riesgo:** no se puede correlacionar una queja con una petición; los logs de Nest pueden incluir stack traces; no hay métricas de tasa de error. `[leído en el código]`
- **Decisión:** middleware de `request-id`, logger JSON, filtro global que no filtre stacks en producción, Sentry y métricas RED. Tamaño: M.

### 7.6 Configuración

- **Qué hace:** `ConfigModule` valida 11 variables de entorno; no hay ajustes de negocio en BD. `[leído en el código]`
- **Riesgo:** cada cambio de política exige despliegue; no hay auditoría de cambios ni promoción staging→producción. `[leído en el código]`
- **Decisión:** documentos 01 y 02. Tamaño: L.

### 7.7 Auditoría específica del web (Next.js 16.4)

| ID | Ítem | Estado | Sev. | Evidencia | Acción / tamaño |
|---|---|---|---|---|---|
| W-01 | i18n y rutas por locale | Falta | Alta (LATAM); no bloquea piloto en español | `lang="es"` fijo y metadatos en español (`layout.tsx:6-23`); sin `next-intl` ni rutas `/[locale]` | Rutas por locale, catálogo de mensajes, `hreflang`; L |
| W-02 | Configuración y taxonomías desde la API | Parcial | Alta | Onboarding consume `GET /me/onboarding`, pero roles/estados se duplican (`lib/auth/roles.ts:3-20`) y los filtros de área/idioma exigen sesión | `GET /config/public` y `/taxonomies`; eliminar listas duplicadas; M |
| W-03 | Build y despliegue reproducible | Parcial | Alta | `next build` funciona; no hay `output: 'standalone'`, Dockerfile ni CI web | Standalone + Docker multi-stage + CI; M |
| W-04 | Caché y revalidación | Parcial | Media | `cacheComponents: true` y `partialPrefetching: true` (`next.config.ts:5-6`), sin tags ni volumen persistente | `use cache` + tags + volumen; S–M |
| W-05 | Imágenes | N/A | Media (Hito 3) | No se usa `next/image` ni hay uploads | `remotePatterns`, tamaños, AVIF/WebP; S |
| W-06 | CSP y headers | Falta | Alta | No hay `proxy.ts`/middleware ni CSP; solo headers del backend | Nonce + CSP report-only → enforce; S |
| W-07 | SEO | Parcial | Alta | Solo metadata raíz (`layout.tsx:6-14`); sin `sitemap.ts`, `robots.ts`, canonical ni JSON-LD | SEO por página y perfiles públicos; S–M |
| W-08 | noindex en staging | Falta | Alta | No hay `APP_ENV` ni cabecera `X-Robots-Tag` | Header + robots + Basic Auth; S |
| W-09 | Errores y correlación | Parcial | Media | `error.tsx` y `not-found.tsx` existen; sin `global-error`, `request-id` ni reintento uniforme | Error boundaries + código + `request-id`; S |
| W-10 | Accesibilidad | Parcial | Alta | 51 atributos `aria-*`/`role`; sin axe ni auditoría manual | axe + checklist + lector de pantalla; S–M |
| W-11 | Analítica de producto | Falta | Media | Sin Umami/Cloudflare ni eventos; `package.json` no tiene dependencias de analítica | Umami propio + eventos seudónimos; M |
| W-12 | Privacidad de analítica | Falta | Alta | No hay política de eventos, consentimiento ni retención | Taxonomía sin PII + retención 90 días; S |
| W-13 | Contrato real frontend-API | Falta | Alta | Tests con `fetch`/mocks, no contra API real; tipos duplicados | OpenAPI + pruebas de contrato; M |
| W-14 | Sesión expirada y multi-pestaña | Parcial | Media | El cliente refresca en 401 (`lib/api/client.ts`); sin evento global ni revocación visible | Manejo global + aviso; S |

**Lectura:** el web es funcional para una demo en español, pero no está listo para usuarias reales sin CSP, SEO/noindex, accesibilidad auditada, build reproducible y contrato real con la API. i18n es requisito de expansión, no del piloto en Perú.

## 8. Qué limita hoy el salto a producción

**Bloqueantes, en orden de cierre:**

1. **Infraestructura y backups** (R-04, R-05): sin entorno, sin backup probado, sin RPO/RTO. Tamaño M.
2. **Identidad real** (S-01, S-03; S-13 es alta, no bloqueante): correo verificado, 2FA y cuentas privilegiadas separadas. Tamaño M.
3. **Legal y datos personales** (D-01, D-02, D-06, D-08, L-01, L-02, L-03): privacidad, ARCO, consentimiento, menores y Libro de Reclamaciones. Tamaño M–L, con revisión externa.
4. **Observabilidad mínima** (O-01 a O-05): sin logs correlacionables, errores, métricas ni alertas no se puede operar. Tamaño M.
5. **CI/CD y migraciones** (S-08, R-06): sin pipeline no hay promoción segura ni rollback. Tamaño M (ver 04).
6. **Configuración gobernable** (7.6): sin ella, cada ajuste es un despliegue y no hay auditoría. Tamaño L (ver 01/02).
7. **Rate limit e IP real** (S-02, S-15): una instancia y proxy bien configurados bastan para el piloto. Tamaño S.
8. **Prueba de carga y índices** (P-01 a P-06, P-10): medir antes de abrir; no optimizar a ciegas. Tamaño M.

**Lo que NO es bloqueante para un piloto cerrado:** alta disponibilidad, cola durable, caché distribuida, multi-región, A/B de matching, visor de auditoría completo. Sí lo es para dinero real o para apertura pública.
