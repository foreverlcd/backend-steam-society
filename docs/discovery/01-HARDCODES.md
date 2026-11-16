# 01 · Inventario de hardcodes y frontera estructura/valores

**Método.** Revisión estática de `src/`, `prisma/`, `test/` y del repo web; sin ejecutar la app. Se listan valores que hoy cambian comportamiento de negocio, textos visibles, taxonomías, metadatos, configuración de despliegue y secretos. Las conversiones de unidades (`60_000`, `24 * 60 * 60 * 1000`) se consideran técnicas salvo que su resultado sea un plazo de negocio; en ese caso se lista el plazo, no la aritmética.

**Conclusión corta:** el código está bien modularizado, pero **la capa de configuración de negocio no existe**. Hay 90 filas inventariadas, de las cuales ~70 son valores ajustables embebidos, 10 listas de referencia completas en TypeScript, ~30 textos de correo/error y 0 feature flags. Sin esa capa, cambiar el plazo de una reserva, un peso de matching o un texto exige un despliegue. La frontera propuesta no pretende convertir el producto en un motor de reglas: deja en código la estructura y los invariantes, y lleva a datos los valores y las listas.

## 1. Inventario

### 1.1 Identidad, sesión y seguridad

| # | Valor actual | Ubicación | Destino propuesto | Límite sano / nota |
|---|---|---|---|---|
| 1 | Sesión: 7 días, `rolling: true` | `src/app.setup.ts:12,46,52` | Ajuste `auth.session_ttl` | 15 min–30 días; sesión absoluta separada (1 h–90 días) |
| 2 | Limpieza de sesiones cada 900 s | `src/app.setup.ts:33` | Técnica | Depende del TTL; no editable por negocio |
| 3 | `sameSite: 'lax'`, `path: '/'`, `httpOnly` | `src/app.setup.ts:48-51` | Estructura | No editable; cambio exige revisión de seguridad |
| 4 | Cookies `__Host-sid` / `sid` | `src/shared/http/session-cookie.ts:1-2` | Estructura | Nombres ligados a `Secure`; no configurables |
| 5 | Prefijo global `v1`; `/health` excluido | `src/app.setup.ts:57` | Estructura | Versionado de API, no ajuste de negocio |
| 6 | Reset de contraseña: 1 hora | `src/modules/auth/auth.service.ts:24` | Ajuste `auth.reset_ttl` | 15 min–24 h |
| 7 | Argon2id: 19 MiB, 2 iteraciones, 1 lane | `src/modules/auth/password-hasher.service.ts:6-8` | Técnica versionada | Cambiarlo exige rehash; no es un ajuste de producto |
| 8 | Hash dummy anti-enumeración | `src/modules/auth/password-hasher.service.ts:13-14` | Técnica | Constante de seguridad |
| 9 | Contraseña: mínimo 12, máximo 128; email ≤254 | `src/modules/auth/auth.schemas.ts:3-4` | Ajuste `auth.password_policy` | Mínimo 8–64; máximo 64–256; nunca bajar de 8 |
| 10 | Login/registro: 5 intentos/minuto | `src/modules/auth/auth.controller.ts:47,76` | Ajuste `security.rate_auth` | 1–100/min por IP+email |
| 11 | Recuperación: 10/minuto | `src/modules/auth/auth.controller.ts:94` | Ajuste `security.rate_recovery` | 1–50/min |
| 12 | Límite global: 100/minuto | `src/modules/auth/auth.module.ts:20-21` | Ajuste `security.rate_global` | 10–10.000/min; requiere almacén compartido |
| 13 | Tracker `ip:email` | `src/modules/auth/auth.module.ts:22-32` | Estructura | La clave es una decisión de seguridad |
| 14 | Secreto de sesión ≥32 caracteres | `src/config/env.ts:5` | Secreto | Solo entorno; nunca BD |
| 15 | `SESSION_COOKIE_SECURE` | `src/config/env.ts:6` | Entorno | `true` obligatorio en producción |
| 16 | `ADMIN_PASSWORD` ≥12; seed exige ≥12 | `src/config/env.ts:17`, `prisma/seed.ts:14` | Secreto de arranque | Solo bootstrap; después se rota y se elimina del entorno |
| 17 | `SMTP_FROM` por defecto `no-reply@steamsociety.local` | `src/config/env.ts:12-15` | Ajuste + secreto del proveedor | El remitente es dato; la credencial es secreto |
| 18 | `APP_URL` por defecto `http://localhost:3001` | `src/config/env.ts:10` | Entorno por despliegue | No editable desde admin |
| 19 | Puerto 3000 | `src/config/env.ts:8`, `src/main.ts:9` | Entorno | Plataforma |
| 20 | `WEB_ORIGIN` (CORS/CSRF) | `src/config/env.ts:7` | Entorno por despliegue | Lista de orígenes; no BD |
| 21 | Sin verificación de correo; registro nace `active` | `src/modules/auth/auth.service.ts:56-65`, `prisma/schema.prisma:47` | Falta funcionalidad | Bloqueante de producción; ver 03 |
| 22 | Sin 2FA ni roles privilegiados separados | `prisma/schema.prisma:25-30` | Falta funcionalidad | Bloqueante para admin/superadmin |

### 1.2 Reservas, disponibilidad y ofertas

| # | Valor actual | Ubicación | Destino propuesto | Límite sano / nota |
|---|---|---|---|---|
| 23 | TTL de solicitud: 48 h (env) | `src/config/env.ts:11` | Ajuste `booking.request_ttl` | 1 h–14 días; ya existe la variable, falta el registro y el editor |
| 24 | Tarea de vencimiento cada 60 s | `src/modules/bookings/infrastructure/bookings-expiration.task.ts:5` | Técnica | 10 s–10 min; no es plazo de negocio |
| 25 | Antelación mínima: 24 h | `prisma/schema.prisma:186` | Ajuste por mentora + default global | 0 h–14 días |
| 26 | Anticipación máxima: 60 días | `prisma/schema.prisma:187` | Ajuste por mentora + default global | 1–365 días |
| 27 | Rango máximo de slots: 90 días | `src/modules/scheduling/domain/slot-generator.ts:9` | Ajuste `scheduling.slot_range_days` | 1–365 días; protege CPU |
| 28 | Duración de oferta: 15–240 min | `src/modules/scheduling/presentation/scheduling.schemas.ts:14` | Ajuste `offering.duration_range` | 5–480 min |
| 29 | Título ≤160; descripción ≤2000 | `src/modules/scheduling/presentation/scheduling.schemas.ts:12-13` | Ajuste de validación | 1–200 / 0–10.000 caracteres |
| 30 | Precio máximo: 2.147.483.647 unidades mínimas | `src/modules/scheduling/presentation/scheduling.schemas.ts:16` | Técnica (límite de `int`) | Si se supera, migrar a `bigint` |
| 31 | Moneda por defecto `PEN`; regex ISO 4217 | `src/modules/scheduling/application/offerings.service.ts:28-29` | Ajuste por mercado + tabla de monedas | PEN inicial; multi-moneda en Hito 2+ |
| 32 | Capacidad 1 (MVP) | `prisma/schema.prisma:317` | Estructura del MVP | Grupales requieren cambio de esquema |
| 33 | Zona horaria por defecto `America/Lima` | `prisma/schema.prisma:51` | Ajuste por mercado + preferencia de usuaria | IANA válida; fallback UTC |
| 34 | Locale por defecto `es` | `prisma/schema.prisma:52` | Ajuste por mercado + preferencia | `es`, `en`, `qu` iniciales |
| 35 | Mensaje de reserva ≤2000; motivo ≤500 | `src/modules/bookings/presentation/bookings.schemas.ts:21,15` | Ajuste de validación | 1–5.000 / 1–1.000 |
| 36 | URL de reunión ≤2048 | `src/modules/bookings/presentation/bookings.schemas.ts:39` | Ajuste de validación | 1–4.096 |
| 37 | Listado de reservas: 20 por página, máximo 50 | `src/modules/bookings/presentation/bookings.schemas.ts:30` | Ajuste `api.page_size` | 1–100 |
| 38 | Reglas de disponibilidad: máximo 50 | `src/modules/scheduling/presentation/scheduling.schemas.ts:62` | Ajuste `scheduling.max_rules` | 1–200 |
| 39 | Día de semana 1–7; hora `HH:mm` | `src/modules/scheduling/presentation/scheduling.schemas.ts:51-53` | Estructura | Contrato de API, no valor de negocio |

### 1.3 Matching

| # | Valor actual | Ubicación | Destino propuesto | Límite sano / nota |
|---|---|---|---|---|
| 40 | Pesos: áreas 35, disponibilidad 20, idioma 15, nivel 15, precio 10, confiabilidad 5 | `src/modules/matching/domain/matching.config.ts:8-15` | Perfil de matching versionado | Cada peso 0–100; suma 100; cambios con puerta de evaluación |
| 41 | Horizonte: 14 días | `src/modules/matching/domain/matching.config.ts:16` | Perfil de matching | 1–90 días |
| 42 | Horas objetivo de disponibilidad: 6 | `src/modules/matching/domain/matching.config.ts:17` | Perfil de matching | 1–40 h |
| 43 | Confiabilidad neutral: 0,5 | `src/modules/matching/domain/matching.config.ts:18` | Perfil de matching | 0–1 |
| 44 | Límite por defecto 3; máximo 10 | `src/modules/matching/domain/matching.config.ts:19-20` | Perfil de matching | 1–50 |
| 45 | Distancia máxima de experiencia: 7 años | `src/modules/matching/domain/matching.config.ts:21` | Perfil de matching | 1–30 |
| 46 | Años objetivo por etapa: 3/3/6/10 | `src/modules/matching/domain/recommend.ts:18-23` | Perfil de matching | 0–40; editable con evaluación |
| 47 | Años objetivo por nivel: 3/6/10 | `src/modules/matching/domain/recommend.ts:25-29` | Perfil de matching | 0–40 |
| 48 | Peso de coincidencia de área: 1,0 exacta / 0,5 padre | `src/modules/matching/domain/recommend.ts:137,144` | Perfil de matching | 0–1 |
| 49 | Neutros: disponibilidad 0,5; nivel 0,5; precio 0,5 | `src/modules/matching/domain/recommend.ts:183,258,319` | Perfil de matching | 0–1 |
| 50 | Razón: solo los 2 componentes con más puntos | `src/modules/matching/domain/recommend.ts:366` | Ajuste `matching.reason_components` | 1–4 |
| 51 | Textos de razón ("Comparte tu interés…", "Tiene horarios…", etc.) | `src/modules/matching/domain/recommend.ts:161,170,185,203,205,226,235,260,278,295,297,311,313,323-325,335,373` | Catálogo i18n | Textos con variables; no concatenar en código |
| 52 | Umbral trigrama 0,2; peso de bio 0,5 | `src/modules/profiles/profiles.repository.ts:392-394,405-413` | Ajuste `catalog.search` | Umbral 0,05–0,8; pesos 0–10 |
| 53 | Ranking: `ts_rank_cd` + similitud; cursor `rank,userId` | `src/modules/profiles/profiles.repository.ts:390-394,458-476` | Estructura + ajuste de pesos | El cursor es contrato; los pesos son datos |
| 54 | Catálogo: 20 por página, máximo 50 | `src/modules/profiles/profiles.schemas.ts:164` | Ajuste `api.page_size` | 1–100 |
| 55 | Admin: 20 por página, máximo 100 | `src/modules/profiles/profiles.schemas.ts:131` | Ajuste `api.admin_page_size` | 1–200 |

### 1.4 Taxonomías, onboarding y textos

| # | Valor actual | Ubicación | Destino propuesto | Límite sano / nota |
|---|---|---|---|---|
| 56 | Versión de onboarding: 1 | `src/modules/profiles/onboarding.config.ts:1` | Estructura versionada | Nueva versión al cambiar preguntas |
| 57 | Países: PE, CO, MX, BR + etiquetas | `src/modules/profiles/onboarding.config.ts:3-9` | Tabla de referencia + i18n | Inicial: PE; expansión por mercado |
| 58 | Roles profesionales + etiquetas | `src/modules/profiles/onboarding.config.ts:11-20` | Tabla de referencia + i18n | 1–20 opciones |
| 59 | Rangos de experiencia + etiquetas | `src/modules/profiles/onboarding.config.ts:22-27` | Tabla de referencia + i18n | 1–20 |
| 60 | Tipos de apoyo + etiquetas (8) | `src/modules/profiles/onboarding.config.ts:29-48` | Tabla de referencia + i18n | 1–50 |
| 61 | Industrias + etiquetas (10) | `src/modules/profiles/onboarding.config.ts:50-73` | Tabla de referencia + i18n | 1–50 |
| 62 | Niveles de mentoría + etiquetas | `src/modules/profiles/onboarding.config.ts:75-84` | Tabla de referencia + i18n | 1–20 |
| 63 | Etapas de mentee + etiquetas | `src/modules/profiles/onboarding.config.ts:86-97` | Tabla de referencia + i18n | 1–20 |
| 64 | Preferencias horarias + etiquetas | `src/modules/profiles/onboarding.config.ts:99-110` | Tabla de referencia + i18n | 1–20 |
| 65 | Objetivos principales + etiquetas | `src/modules/profiles/onboarding.config.ts:112-128` | Tabla de referencia + i18n | 1–30 |
| 66 | Niveles actuales + etiquetas | `src/modules/profiles/onboarding.config.ts:130-135` | Tabla de referencia + i18n | 1–20 |
| 67 | Pasos, títulos, preguntas, ayudas y obligatoriedad | `src/modules/profiles/onboarding.config.ts:174-395` | Configuración versionada en BD + i18n | Estructura del wizard versionada; textos traducibles |
| 68 | Máximos de selección: 5, 5, 3, 2, 3, 3, 3, 2 | `src/modules/profiles/onboarding.config.ts:229,237,245,285,334,349,357,390` | Ajuste por pregunta | 1–20; nunca mayor que el catálogo |
| 69 | Idiomas seed: es, en, qu | `prisma/seed-data.ts:4-6` | Tabla de referencia + i18n | Lista definitiva pendiente |
| 70 | Áreas STEM seed (Ciencia, Tecnología, Ingeniería, Matemáticas + subáreas) | `prisma/seed-data.ts:12-75` | Tabla de referencia + i18n | Lista definitiva pendiente; ya es tabla |
| 71 | Correo de reset: asunto y cuerpo | `src/modules/auth/mailer.service.ts:25-30` | Plantilla + i18n | Variables `appUrl`, `ttl`; no texto en código |
| 72 | Correos de reserva: 4 asuntos y cuerpos | `src/modules/bookings/infrastructure/mail-notifications.adapter.ts:19-79` | Plantillas + i18n | 4 eventos (accepted, declined, cancelled, expired); versionar plantillas |
| 73 | Formato de fecha `es-PE`; fallback UTC | `src/modules/bookings/infrastructure/mail-notifications.adapter.ts:88,97` | Ajuste por mercado/locale | Formato por locale; UTC solo fallback |
| 74 | Mensajes de error de dominio (booking, offering, auth, perfil) | `src/modules/bookings/application/bookings.errors.ts:1-140` y módulos equivalentes | Código estable + catálogo i18n | El `code` queda en código; el `message` sale de i18n |
| 75 | Metadatos web: título, plantilla, descripción, `applicationName` | `src/app/layout.tsx:6-14` (web) | Ajuste de plataforma + i18n | Título 1–60; descripción 50–160 |
| 76 | `lang="es"`, `colorScheme`, `themeColor` | `src/app/layout.tsx:16-23` (web) | Ajuste + i18n | `lang` por locale; tema visual |
| 77 | Etiquetas de rol y estado; rutas home | `src/lib/auth/roles.ts:3-20` (web) | i18n + configuración de navegación | No duplicar enums del backend |
| 78 | URL de API por defecto `http://localhost:3000/v1` | `src/lib/api/client.ts:1` (web) | Entorno | `NEXT_PUBLIC_API_URL`; falla si falta en producción |
| 79 | `cache: "no-store"`, `credentials: "include"` | `src/lib/api/client.ts:109-110` (web) | Estructura | No editable; decisión de sesión |
| 80 | Mensajes de error de red/fallback | `src/lib/api/client.ts:68,77` (web) | i18n | Catálogo de errores |
| 81 | `cacheComponents`, `partialPrefetching` | `next.config.ts:5-6` (web) | Estructura | Build de Next.js 16 |
| 82 | Imágenes Docker: `postgres:18.6-alpine3.24`, `mailpit:v1.27`; puerto 5433 | `docker-compose.yml:2-20` | Entorno | Solo desarrollo; producción usa imágenes fijadas por digest |

### 1.5 Configuración, secretos y flags

| # | Valor actual | Ubicación | Destino propuesto | Límite sano / nota |
|---|---|---|---|---|
| 83 | `DATABASE_URL` | `src/config/env.ts:4` | Secreto/entorno | Nunca BD; rotación con ventana |
| 84 | `SMTP_URL` (incluye credenciales) | `src/config/env.ts:9` | Secreto/entorno | Proveedor P-05 pendiente |
| 85 | `ADMIN_EMAIL` | `src/config/env.ts:16` | Secreto de bootstrap | Se elimina tras crear el primer superadmin |
| 86 | Sin feature flags | — | Tabla `feature_flag` | Arranque: 0 flags; no inventar catálogo |
| 87 | Sin tabla de ajustes ni historial | — | `setting`, `setting_version`, `setting_scope` | Ver 02 |
| 88 | Sin tabla de plantillas ni traducciones | — | `message_template`, `translation` | Ver 02 |
| 89 | Sin perfiles de matching versionados | — | `matching_profile`, `matching_profile_version` | Ver 02 |
| 90 | Sin catálogo de proveedores | — | `provider_config` (sin secretos) | Correo, pagos, almacenamiento |

## 2. Frontera propuesta: estructura en código / valores en datos

### 2.1 Permanece en código (estructura)

- Entidades, columnas, claves, relaciones y migraciones.
- Enums de estado y transiciones válidas (`requested → confirmed`, etc.), junto con sus guardas e invariantes.
- Algoritmos: cálculo de slots, solape, puntaje, cursor, orden y paginación.
- Contratos de API: rutas, métodos, códigos HTTP y códigos de error estables (`BOOKING_EXPIRED`).
- Seguridad: Argon2id, cookies, CSRF, CORS, validación de tipos, límites duros de memoria/CPU.
- Conversiones técnicas (`ms`, `UTC`, tamaños de página como máximo absoluto).
- Estructura del onboarding (qué preguntas existen y su tipo), versionada; no sus textos ni sus opciones.

**Regla:** si cambiarlo puede romper una invariante, un contrato o la seguridad, es estructura y requiere revisión + despliegue. Si solo cambia una política, un número, un texto o una lista, es valor.

### 2.2 Va a datos (valores)

- Todos los plazos, ventanas, límites, pesos, umbrales, tamaños de lista y comisiones.
- Países, monedas, zonas horarias, locales y mercados activos.
- Taxonomías completas (áreas, idiomas, industrias, tipos de apoyo, etapas, objetivos).
- Textos de UI, correos, errores, metadatos SEO y documentos legales.
- Configuración de proveedores no secreta (remitente, región, bucket, modo sandbox/producción).
- Feature flags y perfiles de matching.
- Precios, comisiones, políticas de cancelación y reembolso (Hito 2).

### 2.3 Secretos (nunca en BD ni en admin)

`DATABASE_URL`, `SESSION_SECRET`, credenciales SMTP, claves de pasarela, claves de almacenamiento, tokens de CI y `ADMIN_PASSWORD` de bootstrap. La BD solo guarda **referencias** (`secret_ref`) y metadatos de rotación. El admin muestra "configurado / no configurado", nunca el valor.

### 2.4 Límites sanos transversales

| Grupo | Rango duro | Regla de aprobación |
|---|---|---|
| Sesión y tokens | 15 min–90 días | Cambios >7 días: revisión de seguridad |
| Reservas | TTL 1 h–14 días; antelación 0 h–14 días; ventana 1–365 días | >30 días: revisión de producto |
| Ofertas | 5–480 min; precio 0–100.000.000 unidades mínimas | Cambio de moneda: aprobación de finanzas |
| Matching | Pesos 0–100 con suma 100; horizonte 1–90 días | Cualquier cambio: puerta de evaluación + sombra |
| Búsqueda | Umbral 0,05–0,8; página 1–100 | >50: revisión de rendimiento |
| Rate limit | 1–10.000 req/min | <5 en auth: revisión de seguridad |
| Comisión (Hito 2) | 0–30 % | >10 %: aprobación de dos personas + legal |

## 3. Plan de migración por etapas

| Etapa | Contenido | Tamaño | Depende de | Criterio de cierre |
|---|---|---|---|---|
| H1 · Registro de ajustes | Tablas `setting`, `setting_version`, `setting_scope`; seeds con defaults; cargador con validación Zod; la app falla al arrancar si falta un ajuste requerido; endpoint de lectura interno | M (2–3 días) | Nada | Tests de arranque, precedencia y rollback; ningún valor de negocio leído de constante |
| H2 · Admin de ajustes | Editor por rol, rango seguro, vigencia, doble aprobación, historial, rollback, export/import staging→producción | M (4–6 días) | H1, roles de 02 | E2E de cambio aprobado, rechazado y revertido |
| H3 · Taxonomías e i18n | Tablas `taxonomy`, `taxonomy_item`, `translation`, `message_template`; API pública de opciones; web consume textos y listas | L (5–8 días) | H1 | Cero textos de negocio en TS; tests de locale y de listas vacías |
| H4 · Matching versionado | `matching_profile` + versiones; modo sombra; A/B determinista; kill switch; registro de impresiones; métricas de cobertura | L (8–12 días) | H1, H2 | Evaluación precision@k y equidad; rollback probado |
| H5 · Flags y proveedores | `feature_flag`, `provider_config`, `secret_ref`; editor y auditoría | M (3–5 días) | H2 | Flag on/off sin despliegue; secreto nunca visible |
| H6 · Textos y correos | Migrar errores, correos, SEO y legales a plantillas versionadas | S–M (2–4 días) | H3 | Prueba de correo real en staging; revisión de textos |

**Total estimado:** 4–6 semanas de un solo desarrollador, sin contar el Hito 2 de pagos. [supuesto]

**Riesgos:** (a) convertir el admin en un lenguaje de programación encubierto; se evita con esquemas cerrados y rangos; (b) cachear ajustes y no invalidar entre instancias; se resuelve con versión de configuración y TTL corto; (c) cambios de matching sin datos; se evita con sombra y puerta de evaluación; (d) secretos filtrados en export/import; el export excluye `secret_ref` por diseño.

## 4. Hallazgos que no son hardcodes pero afectan la migración

- **No hay verificación de correo** y el registro queda `active`: un valor de política (¿verificar antes de reservar?) hoy está implícito en el código. Debe ser un ajuste + una regla de estado. `[leído en el código]`
- **No hay superadmin ni cuentas privilegiadas separadas**: el enum solo tiene `mentee|mentor|admin`. Ver 02. `[leído en el código]`
- **No hay CI ni Dockerfile**: los valores de despliegue no están versionados. Ver 04. `[leído en el código]`
- **El frontend duplica enums y etiquetas** (`roles.ts`): al mover taxonomías a datos, el web debe consumir la API, no copiar listas. `[leído en el código]`
- **Los correos se formatean con `es-PE` fijo** aunque la usuaria tenga otro locale; hoy el locale existe en `user` pero no se usa. `[leído en el código]`

## 5. Evidencia de cierre

- Inventario: 90 filas agrupadas; 10 listas de referencia completas; 4 plantillas de correo de reserva + 1 de reset; 0 feature flags; 3 secretos de aplicación + 1 de bootstrap. `[leído en el código]`
- Repositorios privados, sin nada desplegado. `[verificado con comando]`
- Fecha de auditoría: 2026-11-01. Cualquier límite externo se revalida antes de contratar.
