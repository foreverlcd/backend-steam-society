# 06 · Requisitos no funcionales, capacidad y pruebas de carga

**Fecha:** 2026-11-01. **Alcance:** backend NestJS 12 + PostgreSQL 18 y web Next.js 16.4, sin desplegar. **Regla:** los números de esta sección son objetivos propuestos y supuestos de planificación, no compromisos medidos. Se recalibran con la primera prueba de carga y con datos reales del piloto.

## 1. Objetivos de servicio (SLO)

| Dimensión | Piloto cerrado | Beta pública / dinero real | Cómo se mide |
|---|---|---|---|
| Disponibilidad mensual | **99,0 %** (≤7 h 12 min/mes) | **99,5 %** (≤3 h 36 min/mes) | Monitor externo cada 5 min + logs de 5xx |
| Disponibilidad objetivo a 12 meses | — | 99,9 % solo con HA pagada; fuera del plan gratuito | — |
| p95 API lectura | ≤400 ms | ≤300 ms | Histograma por ruta |
| p95 API escritura | ≤700 ms | ≤500 ms | Histograma por ruta |
| p95 búsqueda de catálogo | ≤500 ms | ≤400 ms | `GET /v1/mentors` |
| p95 slots (90 días) | ≤800 ms | ≤600 ms | `GET /v1/mentors/:id/slots` |
| p95 recomendaciones | ≤1.500 ms | ≤1.000 ms | `GET /v1/me/recommendations` |
| Tasa de error 5xx | <0,5 % | <0,1 % | `http_requests_total` |
| RPO | ≤24 h | ≤15 min (Hito 2) | Último backup/PITR verificado |
| RTO | ≤4 h | ≤1 h | Simulacro de restauración |
| LCP web p75 | ≤2,5 s en 4G | ≤2,0 s | RUM + Lighthouse |
| INP web p75 | ≤200 ms | ≤200 ms | RUM |
| CLS web p75 | ≤0,1 | ≤0,1 | RUM |

**Exclusiones del cálculo de disponibilidad:** mantenimiento anunciado con ≥48 h, fallos del proveedor de DNS/CDN fuera de control, y cold start de Neon posterior a 5 min de inactividad (se mide aparte). El cold start es real: Neon lleva el cómputo a cero y el primer query despierta la base. `[verificado en documentación oficial: https://neon.com/pricing, 2026-11-01]` — cita: "Scale to zero after 5 min".

**Por qué 99,0 % y no 99,9 %:** una sola VM Oracle, una sola instancia de API y una base gratuita no permiten HA real. Prometer 99,9 % sería deshonesto. 99,0 % es alcanzable con reinicios planificados y una base gestionada; 99,5 % exige segunda instancia y base con failover, que no caben en el plan gratuito.

## 2. Supuestos de capacidad

| Variable | Piloto (meses 1–3) | 12 meses | Base del supuesto |
|---|---:|---:|---|
| Usuarias registradas | 150 | 2.000 | Crecimiento orgánico, 1 solo dev, sin marketing pagado `[supuesto]` |
| Mentoras activas | 40 | 250 | Ratio 1:4 a 1:8 frente a mentoradas `[supuesto]` |
| DAU | 30 | 300 | 20 % del registro activo `[supuesto]` |
| Pico de concurrencia | 20 | 100 | 3–5× la media `[supuesto]` |
| Peticiones API/día | ~1.700 | ~33.000 | 50–100 req/DAU `[supuesto]` |
| Pico de req/s | 10 | 50 | Ráfagas de catálogo y reservas `[supuesto]` |
| Reservas/mes | 300 | 3.000 | 2–10 por mentora activa `[supuesto]` |
| Correos/mes | ~900 | ~9.000 | 3 por reserva + recuperaciones `[supuesto]` |
| Almacenamiento DB | <50 MB | ~800 MB–1,1 GB | Ver §3.2 `[supuesto]` |
| Backups | <1 GB | ~6 GB (30 d) | `pg_dump` comprimido `[supuesto]` |

**Nota:** los supuestos son deliberadamente conservadores para el piloto y agresivos a 12 meses. Si el piloto crece más rápido, los disparadores de §7 se activan antes.

## 3. Estimación de capacidad

### 3.1 Cómputo

| Recurso | Piloto | 12 meses | Veredicto |
|---|---|---|---|
| Oracle A1 (2 OCPU / 12 GB) | API ~300 MB, web ~300 MB, Caddy ~30 MB, SO ~1 GB; CPU <20 % medio | API+web ~1 GB; CPU 30–60 % medio, picos >90 % en matching/slots | **Cabe el piloto; a 12 meses el margen es estrecho** |
| Neon Free (100 CU-h/mes/proyecto) | 6 h/día × 30 = 180 h a 0,25 CU = **45 CU-h** | 12 h/día × 30 = 360 h; a 0,25 CU = 90 CU-h, a 0,5 CU = **180 CU-h** | **Piloto sí; 12 meses probablemente no** |
| Oracle Object Storage (20 GB) | <1 GB | ~6 GB de dumps + adjuntos | Cabe, con retención corta |
| GitHub Actions (2.000 min/mes) | ~20 PR × 15 min = 300 min | ~100 PR × 15 min = 1.500 min | Cabe; vigilar e2e y matriz |
| Brevo Free (300/día) | ~30/día | ~300/día | **Al límite a 12 meses; se rompe con un pico** |

**Lectura:** el recurso que primero se agota no es la VM, es **Neon** (CU-horas y 1 GB) y **Brevo** (300/día). La VM aguanta el piloto y se queda corta en CPU cuando coinciden varias recomendaciones o generaciones de slots de 90 días.

### 3.2 Almacenamiento

| Tabla/concepto | Filas a 12 meses | Bytes/fila | Total |
|---|---:|---:|---:|
| `user` + perfiles | 2.000 | ~30 KB | ~60 MB |
| `onboarding_response` | 40.000 | ~0,5 KB | ~20 MB |
| `offering` | 600 | ~2 KB | ~1,2 MB |
| `availability_rule` | 2.100 | ~0,3 KB | ~0,6 MB |
| `session` | 36.000 | ~1 KB | ~36 MB |
| `booking` | 36.000 | ~2 KB | ~72 MB |
| `audit_log` | 200.000 | ~1 KB | ~200 MB |
| `auth_session` | 300 activas | ~2 KB | ~0,6 MB |
| Índices, TOAST, bloat | — | 2–3× | ~400 MB |
| **Total estimado** | | | **~800 MB–1,1 GB** |

**Conclusión:** el 1 GB de Neon se alcanza alrededor del mes 9–12 sin purga. Hacen falta: retención de `audit_log` (2 años para finanzas, 12 meses para el resto), purga de sesiones y reservas vencidas, archivado de `onboarding_response` histórico y compresión de JSON. Con eso se gana 6–12 meses. `[supuesto]`

### 3.3 Conexiones

- Prisma usa `PrismaPg` sin `max` explícito; el tamaño efectivo del pool lo define el driver/proveedor y hoy no está fijado. `[leído en el código: src/shared/prisma/prisma.service.ts:16-19]`
- Neon Free y Aiven Free tienen límites de conexiones distintos; Aiven Free declara `max_connections=20`. `[verificado en documentación oficial: https://aiven.io/pricing, 2026-11-01]`
- **Regla:** `connection_limit=5–10` por instancia, usar el endpoint pooled de Neon si está disponible, y una sola instancia de API en el piloto. Con dos instancias, bajar a 5 cada una.

## 4. Puntos calientes

| # | Punto | Por qué duele | Evidencia | Mitigación |
|---|---|---|---|---|
| H-01 | Recomendaciones | Carga **todas** las mentoras aprobadas, con ofertas, reglas y ocupación; calcula slots para cada una en 14 días | `listMatchingMentorCandidates()` sin `take` (`profiles.repository.ts:523-532`); `recommendations.service.ts:78-118` | Filtro SQL previo por idioma/área, caché por mentee 5 min, precalcular disponibilidad por día, límite de candidatas |
| H-02 | Slots de 90 días | Itera días y bloques por regla; Temporal + DST por slot | `slot-generator.ts:159-240`; `MAX_SLOT_RANGE_DAYS=90` (`:9`) | Cache por `mentor+offering+día`; reducir rango por defecto a 30 días; precalcular al guardar reglas |
| H-03 | Búsqueda | `ts_rank_cd` + 5 `similarity()` por fila; ordena todo el conjunto | `profiles.repository.ts:390-415,463-477` | Índices GIN existentes; límite de página; medir con 2.000 mentoras; evitar `q` vacío |
| H-04 | Argon2id | 19 MiB × 2 iteraciones por login; ráfaga de logins satura 2 OCPU | `password-hasher.service.ts:5-8` | Rate limit 5/min; no bajar parámetros; medir 20 logins concurrentes |
| H-05 | Creación de reserva | Locks por mentee/mentora + exclusión GiST; contención si muchas reservas al mismo minuto | `bookings.service.ts`; migración `session_no_overlap` | Índice parcial `booking(status, expires_at)`; reintentos acotados; medir |
| H-06 | Vencimiento | `@Interval(60 s)` recorre reservas `requested` vencidas | `bookings-expiration.task.ts:5-23` | Índice parcial por `expires_at`; advisory lock si hay >1 instancia |
| H-07 | Cold start Neon | Primer query tras 5 min de inactividad paga arranque | Neon Free scale-to-zero | Ping cada 4 min en horario de atención; aceptar cold start fuera de horario |
| H-08 | Next.js SSR | Render + cache en la misma VM; build compite por CPU | `next.config.ts` con `cacheComponents: true` | Cache de páginas públicas, build en ventana de mantenimiento, límite de memoria |

## 5. Plan de pruebas de carga con k6

**Herramienta:** k6 Open Source, autoalojado y gratuito; no se usa Grafana Cloud k6 para no depender de una cuota. `[verificado en documentación oficial: https://k6.io/open-source/, 2026-11-01]` — cita: "Open-source load testing tool".

**Ubicación propuesta:** `load/` en el repo backend (no se crea en esta etapa). Los scripts se versionan y se ejecutan solo contra staging, nunca contra producción.

### 5.1 Escenarios

| Escenario | Carga | Duración | Objetivo |
|---|---|---|---|
| `smoke` | 1 VU | 1 min | Validar script y datos |
| `baseline-pilot` | 20 VUs | 10 min | Confirmar SLO del piloto |
| `load-12m` | 100 VUs | 20 min | Proyección a 12 meses |
| `stress` | rampa 0→200 VUs | 15 min | Encontrar el punto de quiebre |
| `soak` | 10 VUs | 2 h | Fugas de memoria y conexiones |
| `spike` | 0→100 VUs en 30 s | 5 min | Ráfagas de catálogo/reservas |

### 5.2 Mezcla de tráfico

| Flujo | Peso | Endpoint |
|---|---:|---|
| Catálogo | 50 % | `GET /v1/mentors` con y sin `q` |
| Detalle | 20 % | `GET /v1/mentors/:id` |
| Slots | 10 % | `GET /v1/mentors/:id/slots?from&to` |
| Recomendaciones | 5 % | `GET /v1/me/recommendations` (sesión de mentee) |
| Reserva | 5 % | `POST /v1/bookings` (idempotente por datos de prueba) |
| Login/me | 10 % | `POST /v1/auth/login`, `GET /v1/me` |

### 5.3 Umbrales

```js
thresholds: {
  http_req_failed: ['rate<0.01'],
  checks: ['rate>0.99'],
  'http_req_duration{flow:catalog}': ['p(95)<500'],
  'http_req_duration{flow:detail}': ['p(95)<500'],
  'http_req_duration{flow:slots}': ['p(95)<800'],
  'http_req_duration{flow:recommendations}': ['p(95)<1500'],
  'http_req_duration{flow:booking}': ['p(95)<700'],
  'http_req_duration': ['p(99)<2000'],
}
```

### 5.4 Datos y entorno

- Staging con **300 mentoras y 2.000 usuarias sintéticas** (no datos reales), generadas por seed idempotente.
- Cada VU usa una cuenta distinta; las reservas se crean sobre slots libres y se cancelan al final.
- Medir en paralelo: CPU/RAM de la VM, conexiones y CU-h de Neon, p95/p99, 5xx, longitud de cola de correo.
- Ejecutar fuera del horario de backup y con `K6_CLOUD` desactivado.
- **No** ejecutar `stress` contra producción ni contra la única base de staging si hay una demo en curso.

### 5.5 Criterio de aceptación

- `baseline-pilot` pasa todos los umbrales con 20 VUs.
- `load-12m` pasa con 100 VUs o se documenta el primer recurso que se rompe y su mitigación.
- `soak` no muestra crecimiento >10 % de memoria ni conexiones filtradas.
- `stress` identifica el punto de quiebre y el comportamiento (degradación vs caída).

## 6. Caché y precálculo

| Capa | Qué se cachea | TTL | Invalidación |
|---|---|---|---|
| HTTP público | Catálogo, detalle, config pública, taxonomías | 60 s + `ETag` | `revalidateTag` al aprobar/editar mentora u oferta |
| Next.js | Páginas públicas con `use cache` + `cacheLife` | Minutos/horas | Tags por entidad; `revalidateTag` en mutaciones |
| Memoria API | Ajustes, taxonomías, perfiles públicos | 60 s | Versión global `config_version` |
| Disponibilidad | Slots por mentora+oferta+día | 60 s | Al guardar reglas, crear/cancelar reserva |
| Recomendaciones | Lista por mentee | 5 min | Al cambiar perfil, reserva o disponibilidad |
| Búsqueda | Top 100 consultas sin sesión | 60 s | TTL; no cachear personalizado |
| Sesiones | Postgres (`auth_session`) | 7 días rodantes | Logout, cambio de contraseña, revocación |

**Next.js 16:** `cacheComponents: true` ya está activo. `use cache` con `cacheLife` y `cacheTag` es la vía nativa; la caché por defecto vive en el sistema de archivos local. `[verificado en documentación oficial: https://nextjs.org/docs/app/guides/self-hosting, 2026-11-01]` — cita: "stored on the local filesystem". Con una sola instancia y volumen persistente es suficiente; con dos instancias haría falta un cache handler compartido.

**Precálculo de disponibilidad:** al guardar reglas o al crear/cancelar una reserva, calcular y guardar los próximos 30 días por mentora y oferta. El endpoint de slots lee de esa tabla; el cálculo completo queda como fallback. Esto convierte H-02 de O(días × reglas × bloques) por request a una lectura indexada.

**Precálculo de recomendaciones:** job nocturno para las 100 mentees más activas; el resto se calcula on-demand con caché de 5 min. No se precalcula para todas: el costo de CPU y la baja frecuencia no lo justifican.

## 7. Qué cabe en la arquitectura gratuita y dónde se rompe

| Recurso | Cabe hasta | Se rompe cuando | Disparador de pago/migración |
|---|---|---|---|
| Oracle A1 CPU | ~50 concurrentes en catálogo; ~5 recomendaciones simultáneas | >100 concurrentes o picos sostenidos de matching | 2.ª VM o instancia pagada; mover DB |
| Oracle RAM | API+web+Postgres <4 GB | Build + runtime + DB >8 GB | Separar DB o subir de plan |
| Neon CU-h | ~180 h/mes a 0,25 CU | >400 h activas o >0,28 CU medio | Neon Launch o Postgres autoalojado |
| Neon storage | ~800 MB con purga | >1 GB | Archivar auditoría, mover a autoalojado |
| Brevo | ~30–100 correos/día | >300/día o rebotes | Brevo Starter/Mailtrap/Resend pagado |
| Oracle Object Storage | ~6 GB de backups | >20 GB | R2/Backblaze pagado o retención menor |
| GitHub Actions | ~100 PR/mes | >2.000 min/mes | Optimizar CI o plan pago |
| UptimeRobot | 50 monitores/5 min | Más monitores o 1 min | Plan pago o monitor propio |
| Sentry | 5.000 errores/mes | >5.000 o >1 usuario | Plan Team |
| Cloudflare Free | Tráfico del piloto | Necesidad de WAF avanzado/SLA | Cloudflare Pro |

**Regla de decisión:** no se paga nada hasta que el piloto cerrado tenga 100 usuarias activas o se acerque a un límite durante 2 semanas seguidas. El primer pago probable es **Neon** (si la DB crece) o **Brevo** (si el correo se convierte en cuello de botella); la VM se queda gratis hasta que la CPU sea el límite.

## 8. Capacidad del piloto: veredicto

- **Cómputo:** sí. 2 OCPU / 12 GB sobran para 150 usuarias y 300 reservas/mes.
- **Base:** sí, con 45 CU-h/mes y <50 MB.
- **Correo:** sí, ~30/día.
- **Backups:** sí, <1 GB.
- **Observabilidad:** sí, con Sentry/UptimeRobot/Grafana free.
- **Riesgo principal:** una sola VM y una sola base; cualquier caída es total. Se acepta en piloto cerrado con RTO 4 h y backups probados.
- **Riesgo oculto:** el reclamo de instancias ociosas de Oracle si la CPU/red/memoria se mantiene <20 % durante 7 días. `[verificado en documentación oficial: https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm, 2026-11-01]` — cita: "Idle Always Free compute instances may be reclaimed". Mitigación: monitorización + carga sintética periódica + backups fuera de la VM.

## 9. Requisitos del web (Next.js 16)

### 9.1 Rendimiento y presupuesto

| Métrica | Objetivo | Cómo se verifica |
|---|---|---|
| LCP p75 | ≤2,5 s (4G) | Lighthouse CI + RUM |
| INP p75 | ≤200 ms | RUM |
| CLS p75 | ≤0,1 | Lighthouse CI |
| JS inicial | ≤200 KB gzip | `next build` + análisis de bundle |
| Imágenes | AVIF/WebP, dimensiones explícitas | `next/image` |
| Fuentes | `next/font`, `display: swap`, subset latino | Build |
| TTFB | ≤800 ms | RUM |

**Estado actual:** no hay presupuesto de rendimiento ni medición; el build pasa pero no se analiza el bundle. `[leído en el código: frontend/package.json, next.config.ts]`

### 9.2 Internacionalización (i18n)

- **Estrategia:** rutas por locale (`/es/...`, `/en/...`) para SEO y `hreflang`; el locale se negocia por `Accept-Language` y preferencia de la usuaria. `lang` del `<html>` debe coincidir con el locale, no ser fijo `"es"`. `[leído en el código: frontend/src/app/layout.tsx:23]`
- **Textos de UI:** catálogo de mensajes versionado (`es`, `en`; `qu` evaluado para fase 2). No se concatenan textos en componentes.
- **Datos de referencia:** países, áreas, idiomas, etapas, objetivos y etiquetas vienen de `GET /v1/taxonomies` y `GET /v1/config/public`; el web no duplica listas. `[leído en el código: frontend/src/lib/auth/roles.ts:3-20]` hoy duplica etiquetas de rol.
- **Fechas, números y moneda:** `Intl.DateTimeFormat`/`Intl.NumberFormat` con locale y zona de la usuaria; nunca `es-PE` fijo. `[leído en el código: backend/src/modules/bookings/infrastructure/mail-notifications.adapter.ts:88,97]`
- **Contenido traducido:** el admin edita traducciones por locale y muestra % de completitud; si falta una traducción, se usa el locale por defecto y se registra la carencia, no se inventa texto.
- **Dependencia:** `next-intl` es la opción estándar para App Router, pero **requiere aprobación** por ser dependencia nueva. Alternativa sin dependencia: diccionarios TS + `Intl` y un `proxy.ts` para negociar locale. `[verificado en documentación oficial: https://next-intl.dev/docs/getting-started, 2026-11-01]`
- **Pruebas:** test de que ninguna pantalla pública tiene texto hardcodeado; test de locale desconocido → fallback; test de `hreflang` y canonical.

### 9.3 Accesibilidad

- **Objetivo:** WCAG 2.2 AA en flujos públicos y admin.
- Teclado completo, foco visible, orden lógico, `skip link`, landmarks, labels asociados, errores anunciados, contraste ≥4,5:1, objetivo táctil ≥24 px, `prefers-reduced-motion`, zoom 200 % sin pérdida.
- **Estado actual:** 51 atributos `aria-*`/`role` en componentes; no hay tests automatizados de accesibilidad ni auditoría manual. `[leído en el código: frontend/src]`
- **Herramientas:** `axe-core` en tests (dependencia de desarrollo, requiere aprobación) + checklist manual + lector de pantalla (NVDA/VoiceOver).
- **Criterio de cierre:** cero violaciones críticas/serias en axe en las 10 pantallas principales; revisión manual documentada.

### 9.4 Analítica de producto sin datos personales

- **Opción recomendada:** Umami autoalojado en la misma VM, MIT, sin cookies y con los datos en la propia base. `[verificado en documentación oficial: https://github.com/umami-software/umami, 2026-11-01]` — cita: "No cookies, no surveillance, self-hosted".
- **Alternativa:** Cloudflare Web Analytics, gratis en todos los planes y orientado a privacidad; es tercero y muestrea tras 7 días. `[verificado en documentación oficial: https://developers.cloudflare.com/web-analytics/, 2026-11-01]` — cita: "without compromising user privacy".
- **Eventos de producto:** embudo servidor-side en la base propia (`signup`, `onboarding_complete`, `catalog_view`, `mentor_view`, `booking_request`, `booking_accept`, `booking_complete`, `cancel`, `no_show`) con `user_hash` seudónimo, timestamp, locale, rol y área; **nunca** nombre, correo, teléfono, mensaje libre, IP completa ni token.
- **Consentimiento:** si se usan cookies o un tercero, banner previo con rechazo real; Umami sin cookies no lo exige, pero se documenta en la política de privacidad. DNT respetado.
- **Retención:** 90 días para eventos crudos; agregados anonimizados 2 años.
- **Prohibido:** píxeles de redes sociales, Google Analytics, session replay con PII, fingerprinting.

### 9.5 Errores y estados

- `error.tsx` y `not-found.tsx` existen en la raíz. `[leído en el código: frontend/src/app/error.tsx, not-found.tsx]`
- Añadir `global-error.tsx`, límites por ruta y un `ErrorBoundary` con: mensaje por `code` de la API, `request-id` copiable, botón de reintento y enlace a soporte.
- Los errores de red no deben mostrar stack traces; en producción, el detalle va a Sentry con `beforeSend` que borra PII.
- Estados de carga: skeletons; estados vacíos con CTA; 401 → refresh; 403 → pantalla de permiso; 429 → reintento con backoff; 5xx → fallback.
- Formularios: validación en cliente + servidor; el `code` de la API manda; no duplicar reglas de negocio.

### 9.6 Build y despliegue (resumen; detalle en 04 §8)

- `output: 'standalone'` para producir `.next/standalone` y ejecutar `node server.js` sin `node_modules`. `[verificado en documentación oficial: https://nextjs.org/docs/app/api-reference/config/next-config-js/output, 2026-11-01]` — cita: "deployed on its own without installing node_modules".
- Variables: `NEXT_PUBLIC_API_URL` se incrusta en build; si se promueve la misma imagen entre staging y producción, usar configuración runtime o reconstruir por entorno. **Recomendación:** mismo origen (`app.dominio.com/api` → API) para evitar CORS y cookies de terceros.
- Caché: volumen persistente para `.next/cache`; una instancia; `use cache` + tags; invalidar al aprobar mentoras/ofertas.
- Imágenes: `next/image` funciona autoalojado con `next start`; `remotePatterns` para el bucket del Hito 3. `[verificado en documentación oficial: https://nextjs.org/docs/app/guides/self-hosting, 2026-11-01]` — cita: "works self-hosted with zero configuration".
- CSP: nonce por request en `proxy.ts`, `strict-dynamic`, `frame-ancestors 'none'`, `object-src 'none'`; empezar en `Report-Only` y pasar a enforce tras una semana sin violaciones. `[verificado en documentación oficial: https://nextjs.org/docs/app/guides/content-security-policy, 2026-11-01]`
- SEO: metadata por página, canonical, `sitemap.ts`, `robots.ts`, JSON-LD de organización y mentora; `noindex` en dashboard/admin y en staging.
- Staging: `X-Robots-Tag: noindex, nofollow`, `robots.txt` con `Disallow: /`, Basic Auth en Caddy y `APP_ENV=staging`.

## 10. Evidencia de cierre

- SLO y supuestos: definidos arriba; no medidos todavía. `[supuesto]`
- Puntos calientes: verificados en código (`recommendations.service.ts`, `slot-generator.ts`, `profiles.repository.ts`, `password-hasher.service.ts`). `[leído en el código]`
- Límites gratuitos: Neon, Aiven, Brevo, Oracle, GitHub, Sentry, UptimeRobot, Grafana, k6 y Cloudflare verificados con fecha 2026-11-01.
- Plan k6: 6 escenarios, 6 umbrales, datos sintéticos y criterio de aceptación.
- Web: i18n, accesibilidad, analítica, errores, build y CSP cubiertos; el detalle de despliegue está en 04 §8.
