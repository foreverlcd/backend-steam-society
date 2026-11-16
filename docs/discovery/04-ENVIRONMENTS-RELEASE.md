# 04 · Entornos, release y compatibilidad PostgreSQL 18

**Objetivo.** Pasar de "funciona en mi máquina" a un flujo reproducible: `develop` = staging, `main` = producción, migraciones promovidas con evidencia, secretos separados y rollback probado. Sin coste recurrente y sin que el agente pueda tocar producción.

## 1. Modelo de ramas y PR

| Rama | Entorno | Quién escribe | Despliegue |
|---|---|---|---|
| `feat/*`, `fix/*`, `docs/*`, `chore/*` | — | Agente/desarrollador | No |
| `develop` | Staging | Merge de PR | Automático tras gates (o manual) |
| `main` | Producción | Solo el desarrollador | Manual, con aprobación y backup |

**Flujo obligatorio:**

1. Rama corta desde `develop` (o `main` para hotfix), commits pequeños y mensaje en inglés.
2. PR a `develop`; CI corre build, lint, unitarios, e2e y build web.
3. Merge `--no-ff`; tag local `backup/pre-merge-<rama>` antes del merge (política actual).
4. Staging se despliega desde `develop`; smoke tests y prueba manual.
5. Promoción a producción: PR `develop → main`, revisión del diff y de migraciones, aprobación explícita del desarrollador, backup, deploy manual.
6. Hotfix: rama desde `main`, PR a `main` y luego merge a `develop` para no divergir.

**Regla de oro:** `main` nunca recibe commits directos; el agente nunca hace merge ni push a `main` (ver §6).

## 2. CI/CD con GitHub Actions

### 2.1 Restricciones reales del plan gratuito

GitHub Free incluye 2.000 minutos de CI/CD al mes y 500 MB de Packages. `[verificado en documentación oficial: https://github.com/pricing, 2026-11-01]` — cita: "2,000 CI/CD minutes/month 500MB of Packages storage".

En repos **privados** con GitHub Free **no** hay branch protection, rulesets ni environments con revisión obligatoria. `[verificado en documentación oficial: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches, 2026-11-01]` — cita: "Protected branches are available in public repositories with GitHub Free". Y para environments: "only available for public repositories". `[verificado en documentación oficial: https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment, 2026-11-01]`

**Consecuencia:** no se puede confiar en un bloqueo técnico del merge ni en secretos por entorno de GitHub. Se compensa con:

- Workflow obligatorio en PR y revisión humana; el desarrollador no mergea si el check está rojo.
- Hook local `pre-push` que rechaza `main` (defensa en profundidad, no infalible).
- Secretos de producción **solo en el host de producción**, nunca en GitHub.
- Despliegue de producción manual por el desarrollador; el agente no tiene credenciales.
- Si en el futuro se acepta GitHub Pro/Team (coste), activar rulesets y environments; no forma parte de la base gratuita.

### 2.2 Workflow de CI (backend)

```yaml
name: ci-backend
on:
  pull_request:
  push:
    branches: [develop]
permissions:
  contents: read
concurrency:
  group: ci-backend-${{ github.ref }}
  cancel-in-progress: true
jobs:
  gates:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:18.6-alpine3.24
        env:
          POSTGRES_USER: steam
          POSTGRES_PASSWORD: test
          POSTGRES_DB: steam_society_test
        ports: ["5433:5432"]
        options: >-
          --health-cmd "pg_isready -U steam -d steam_society_test"
          --health-interval 5s --health-timeout 3s --health-retries 10
      mailpit:
        image: axllent/mailpit:v1.27
        ports: ["1025:1025", "8025:8025"]
    env:
      DATABASE_URL: postgresql://steam:test@127.0.0.1:5433/steam_society_test?schema=public
      SESSION_SECRET: test-only-secret-at-least-32-characters
      SESSION_COOKIE_SECURE: "false"
      WEB_ORIGIN: http://localhost:3001
      APP_URL: http://localhost:3001
      SMTP_URL: smtp://127.0.0.1:1025
      SMTP_FROM: Steam Society <no-reply@test.local>
      ADMIN_EMAIL: admin@test.local
      ADMIN_PASSWORD: test-admin-password
      BOOKING_REQUEST_TTL_HOURS: "48"
    steps:
      - uses: actions/checkout@<SHA> # v4; fijar por SHA
        with: { persist-credentials: false }
      - uses: pnpm/action-setup@<SHA> # v4
        with: { version: 12.15.0 }
      - uses: actions/setup-node@<SHA> # v4
        with: { node-version: 24, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm db:generate
      - run: pnpm exec prisma migrate deploy
      - run: pnpm db:seed
      - run: pnpm build
      - run: pnpm lint
      - run: pnpm test
      - run: pnpm test:e2e
```

**Política de actions fijadas por SHA:** cada `uses` debe apuntar a un commit de 40 caracteres, no a `@v4`. Para resolverlo:

```bash
gh api repos/actions/checkout/git/ref/tags/v4 --jq .object.sha
# repetir para pnpm/action-setup, actions/setup-node, actions/upload-artifact
```

El SHA se revisa al actualizar la action; Dependabot puede proponer el cambio, pero el merge lo aprueba el desarrollador.

### 2.3 Workflow de CI (web)

```yaml
name: ci-web
on:
  pull_request:
  push:
    branches: [develop]
permissions:
  contents: read
jobs:
  gates:
    runs-on: ubuntu-latest
    env:
      NEXT_PUBLIC_API_URL: http://localhost:3000/v1
    steps:
      - uses: actions/checkout@<SHA>
      - uses: pnpm/action-setup@<SHA>
        with: { version: 12.15.0 }
      - uses: actions/setup-node@<SHA>
        with: { node-version: 24, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm test
      - run: pnpm build
```

### 2.4 Despliegue

- **Staging:** workflow `deploy-staging` en `push: develop`, con un secreto `STAGING_SSH_KEY` y `STAGING_HOST`; hace `git fetch`, `docker compose build`, `docker compose up -d`, `prisma migrate deploy`, smoke test. Si falla, no toca producción.
- **Producción:** **no automatizado** en el plan gratuito. El desarrollador ejecuta un script `deploy/prod.sh` en el host, tras backup y aprobación. El script es idempotente, hace `git fetch`, build, `migrate deploy`, `up -d`, smoke test y deja el commit desplegado en `/srv/steam-society/REVISION`.
- **Sin registry propio:** se construye en el host para evitar límites de GHCR/Packages. Si se usa registry, vigilar los 500 MB de Packages.
- **Concurrencia:** un solo deploy a la vez; lock en el host.

## 3. Migraciones

### 3.1 Reglas

1. `prisma migrate dev` solo en local; nunca en staging ni producción.
2. Staging y producción usan `prisma migrate deploy`.
3. Toda migración se prueba en una copia restaurada de producción (o en staging con datos representativos) antes de producción.
4. **Expand/contract:** primero añadir columnas/tablas/índices compatibles; desplegar código que escribe en ambos o tolera `NULL`; backfill por lotes; después hacer obligatorio y eliminar lo viejo en una migración posterior. Nunca renombrar o borrar en el mismo deploy que cambia el código.
5. Las migraciones aplicadas no se editan; se crea una nueva.
6. SQL manual (`btree_gist`, CHECK, columnas generadas) va con `--create-only` y revisión.
7. Antes de producción: backup + `prisma migrate status` + estimación de locks (`pg_locks`, `pg_stat_activity`).
8. Rollback de esquema: solo con una migración nueva hacia adelante; para datos, PITR. No hay `down` automático.

### 3.2 Secuencia de promoción

```text
local: migrate dev → tests → PR
staging: migrate deploy → smoke → validación manual
producción: backup → migrate deploy → smoke → observar 30 min
```

### 3.3 Riesgos

- `CREATE INDEX` sin `CONCURRENTLY` bloquea escrituras; para tablas grandes, migración manual con `CONCURRENTLY` fuera de transacción.
- `ALTER TABLE ... SET NOT NULL` requiere scan; usar CHECK NOT VALID + VALIDATE + SET NOT NULL.
- La migración de búsqueda crea `pg_trgm` y una columna generada; verificar que el proveedor permita extensiones.
- Si el deploy falla a mitad, el código anterior debe seguir funcionando (expand/contract).

## 4. Secretos y datos por entorno

| Secreto | Local | Staging | Producción |
|---|---|---|---|
| `DATABASE_URL` | `.env` | Secreto del host staging | Solo host prod, root |
| `SESSION_SECRET` | `.env` | Distinto | Distinto, ≥48 bytes |
| `SMTP_URL` | Mailpit | Proveedor staging | Proveedor prod |
| `ADMIN_EMAIL/PASSWORD` | `.env` | Solo bootstrap | Solo bootstrap; se elimina después |
| Claves de pasarela | — | Sandbox | Producción, solo host |

- GitHub repo secrets solo para staging; **nunca** secretos de producción en GitHub.
- `.env` fuera del repo; `.env.example` sin valores reales.
- Rotación: sesión cada 90 días o incidente; SMTP cada 180; pasarela según proveedor.
- El agente tiene `deny` de lectura/edición de `.env`; no se cambia.

**Datos demo:** solo en staging. El seed de producción debe crear únicamente referencia (áreas, idiomas, países, ajustes) y el admin/superadmin de bootstrap; nunca `demo.mentora@`/`demo.mentee@`. Se añadirá un flag `APP_ENV=production` que bloquee el seed demo; hoy no existe. `[leído en el código: prisma/seed-data.ts, prisma/seed.ts]`

**noindex en staging:** se añadirá cabecera `X-Robots-Tag: noindex, nofollow, noarchive`, `robots.txt` con `Disallow: /`, y `<meta name="robots" content="noindex">` en el layout cuando `APP_ENV !== production`. Proteger staging con Basic Auth en el reverse proxy (Cloudflare Access free es una alternativa, pero añade dependencia).

## 5. Rollback y smoke tests

### 5.1 Rollback

| Escenario | Acción | Tiempo objetivo |
|---|---|---|
| Bug de código sin migración | Redeploy del commit anterior (`REVISION`) | <5 min |
| Migración expand compatible | Redeploy anterior; dejar esquema expandido | <10 min |
| Migración destructiva | Restaurar PITR/backup; forward-fix | <4 h |
| Feature nueva defectuosa | Kill switch / flag off | <1 min |
| Base corrupta | PITR al último punto sano | RPO ≤24 h piloto / ≤15 min pago |

### 5.2 Smoke tests postdespliegue

**Staging (con datos demo):**

```bash
curl -fsS https://staging.api.example/health
curl -fsS https://staging.api.example/v1/mentors?limit=1
curl -fsS -c /tmp/cookies -H 'Content-Type: application/json' \
  -d '{"email":"demo.mentee@steam.test","password":"..."}' \
  https://staging.api.example/v1/auth/login
# crear reserva, aceptar, cancelar; verificar correo en Mailtrap/Brevo
```

**Producción (solo lectura):** `/health`, catálogo, login con cuenta sintética de monitoreo (sin crear datos), comprobación de `REVISION`. Las escrituras se prueban en staging, no en producción.

### 5.3 Aprobación manual

- Checklist firmado en el PR de promoción: gates verdes, migraciones revisadas, backup hecho, smoke staging OK, ventana horaria, rollback definido.
- El desarrollador es la única persona que ejecuta producción.
- El agente no recibe credenciales de producción ni acceso SSH.

## 6. Política del agente

### 6.1 Reglas para `opencode.json`

Además de los `deny` actuales (`git push --force`, `reset`, `clean`, `rebase`, `rm`, `sudo`, `docker compose down`), se propone:

```json
{ "action": "shell", "resource": "git push origin main", "effect": "deny" },
{ "action": "shell", "resource": "git push * main", "effect": "deny" },
{ "action": "shell", "resource": "git push origin :main", "effect": "deny" },
{ "action": "shell", "resource": "git push * --tags*", "effect": "deny" },
{ "action": "shell", "resource": "gh workflow run deploy-prod*", "effect": "deny" },
{ "action": "shell", "resource": "gh release *", "effect": "deny" },
{ "action": "shell", "resource": "ssh *prod*", "effect": "deny" },
{ "action": "shell", "resource": "scp *prod*", "effect": "deny" },
{ "action": "shell", "resource": "pnpm deploy", "effect": "deny" },
{ "action": "shell", "resource": "pnpm exec prisma migrate deploy", "effect": "ask" },
{ "action": "shell", "resource": "docker compose -f *prod*", "effect": "deny" },
{ "action": "shell", "resource": "psql *prod*", "effect": "deny" }
```

Cambios clave: **quitar** el `allow` global de `git push *` y de `prisma migrate deploy`; permitir solo `git push origin feat/*`, `docs/*`, `chore/*`, `fix/*` y `develop`. El agente puede publicar su rama y `develop`, nunca `main`.

### 6.2 Protección de rama que configurará el desarrollador

Si la cuenta tiene GitHub Pro/Team:

- `main`: require PR, 1 approval, status checks `ci-backend`/`ci-web`, linear history, no force, no deletion, require conversation resolution, include administrators.
- `develop`: require PR y status checks; no force.
- Tag protection `backup/*` y `v*`.

Si sigue en Free privado (lo verificado hoy): no existe protección nativa. Alternativa mínima:

1. Hook local `.git/hooks/pre-push` que rechaza `refs/heads/main` (cada clon lo instala con `scripts/install-hooks.sh`).
2. CI en PR + disciplina de revisión.
3. `main` solo se toca desde la cuenta del desarrollador; el agente no tiene credenciales.
4. Revisar el plan trimestralmente; si se paga GitHub Pro, activar rulesets.

## 7. Compatibilidad con PostgreSQL 18

### 7.1 Lo que exige el esquema

- `uuidv7()` nativo en `@default(dbgenerated("uuidv7()"))`. `[leído en el código: prisma/schema.prisma:11]`
- `btree_gist` para la exclusión `session_no_overlap` (igualdad de `mentor_id` + solape de `tstzrange`). `[leído en el código: migración 20261030234248_add_sessions_and_bookings]`
- `pg_trgm`, `tsvector` generado con configuración `spanish`, índices GIN. `[leído en el código: migración 20261031002413_add_catalog_search]`
- Zonas IANA y `timestamptz(3)`.

### 7.2 Proveedores verificados

| Opción | PostgreSQL 18 | `uuidv7()` | `btree_gist` | Veredicto |
|---|---|---|---|---|
| PostgreSQL 18 autoalojado (Oracle VM) | Sí, imagen oficial | Sí, nativo | Sí, extensión incluida | **Compatible** |
| Neon Free | Sí; "Neon supports Postgres 14, 15, 16, 17, and 18" `[verificado en documentación oficial: https://neon.com/docs/reference/compatibility, 2026-11-01]` | Sí, nativo; `pg_uuidv7` disponible | Sí, 1.8 en PG18 `[verificado en documentación oficial: https://neon.com/docs/extensions/pg-extensions, 2026-11-01]` | **Compatible** |
| Aiven Free | Sí; PG18 desde 2025-09-25 `[verificado en documentación oficial: https://aiven.io/docs/platform/reference/eol-for-major-versions, 2026-11-01]` | Sí, nativo | Sí, listado `[verificado en documentación oficial: https://aiven.io/docs/products/postgresql/reference/list-of-extensions, 2026-11-01]` | **Compatible**, sin elección de región |
| Supabase Free | PG18 no confirmado en la documentación consultada `[a confirmar]` | Depende de la versión | Sí, listado `[verificado en documentación oficial: https://supabase.com/docs/guides/database/extensions, 2026-11-01]` | **Condicional** |
| Render Free Postgres | — | — | — | **Descartado**: expira a los 30 días y no es para producción |

### 7.3 Plan de compatibilidad si falla `uuidv7()` o `btree_gist`

**Si falta `uuidv7()`:**

1. Preferido: instalar `pg_uuidv7` (Neon lo ofrece) o generar UUIDv7 en la aplicación con una función probada (dependencia nueva requiere aprobación).
2. Fallback: `gen_random_uuid()` (v4). Se pierde localidad de índice; aceptable en piloto, no ideal para tablas grandes.
3. No usar `uuid()` de Prisma: se genera en cliente y rompe inserciones SQL manuales (ADR-015).

**Si falta `btree_gist`:**

1. Preferido: cambiar de proveedor (Neon/Aiven/autoalojado lo tienen).
2. Fallback: `pg_advisory_xact_lock(mentor)` + transacción `SERIALIZABLE` + índice único parcial por `(mentor_id, starts_at)`; no cubre solapes parciales, así que se valida en aplicación. Riesgo: carrera entre instancias y peor rendimiento; requiere test de concurrencia.
3. No degradar la exclusión sin un test que demuestre que dos reservas solapadas no pueden ganar.

**Riesgos de compatibilidad:** extensiones no disponibles, `search_path`, colación `spanish`, privilegios para `CREATE EXTENSION`, diferencias de `timestamptz` y `TIME(0)`. Se validan con un job de CI contra la versión exacta del proveedor y un smoke de migraciones desde cero.

## 8. Web: build y despliegue de Next.js 16

### 8.1 Build reproducible

- Añadir `output: 'standalone'` a `next.config.ts`. Genera `.next/standalone` y un `server.js` mínimo que se ejecuta sin `node_modules`. `[verificado en documentación oficial: https://nextjs.org/docs/app/api-reference/config/next-config-js/output, 2026-11-01]` — cita: "deployed on its own without installing node_modules".
- Docker multi-stage: `deps` (pnpm install --frozen-lockfile), `build` (`pnpm build`), `runner` (Node 24 alpine, usuario no root, copiar `.next/standalone`, `.next/static` y `public`).
- Ejecutar `node server.js` con `PORT=3001` y `HOSTNAME=0.0.0.0`; health check interno a `/` y a `/mentors`.
- El build de Next.js en la VM de 2 OCPU consume CPU y 2–4 GB de RAM durante 2–5 min. Se hace en ventana de mantenimiento o en CI, nunca durante un pico. `[supuesto]`

### 8.2 Variables y same-site

| Variable | Cuándo se lee | Nota |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Build | Se incrusta en el bundle; no es secreta |
| `API_INTERNAL_URL` | Runtime (servidor) | Proxy same-origin si se usa BFF |
| `NEXT_PUBLIC_ANALYTICS_URL` | Build | Umami propio |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | Runtime/build | Público por diseño; no es secreto crítico |

**Recomendación fuerte:** publicar web y API bajo el **mismo dominio registrable** (`app.ejemplo.com` y `api.ejemplo.com`, o `app.ejemplo.com/api` con proxy en Caddy). La cookie de sesión es `SameSite=Lax`; si web y API están en sitios distintos, la cookie no viaja y la autenticación se rompe. `[leído en el código: backend/src/app.setup.ts:47-52]`

Si se promueve la **misma imagen** de staging a producción, `NEXT_PUBLIC_API_URL` no puede cambiar en runtime: o se reconstruye por entorno, o el navegador llama a un path same-origin (`/api`) que el proxy enruta al backend correcto. La segunda opción es la recomendada.

### 8.3 Caché

- `cacheComponents: true` ya está activo. Usar `use cache` + `cacheLife` + `cacheTag` en páginas públicas (catálogo, detalle, config).
- Volumen persistente para `.next/cache`; sin él, cada reinicio pierde la caché. `[verificado en documentación oficial: https://nextjs.org/docs/app/guides/self-hosting, 2026-11-01]` — cita: "stored on the local filesystem".
- Una sola instancia en el piloto. Con dos, hace falta un cache handler compartido (Redis/S3), que no está en el plan gratuito.
- Cloudflare delante: cachear solo estáticos (`/_next/static`, imágenes, fuentes); **nunca** HTML autenticado ni respuestas con `Set-Cookie`.
- Invalidar por tag al aprobar una mentora, editar una oferta o cambiar una taxonomía; no esperar al TTL.

### 8.4 Imágenes

- `next/image` funciona autoalojado con `next start` sin configuración extra. `[verificado en documentación oficial: https://nextjs.org/docs/app/guides/self-hosting, 2026-11-01]` — cita: "works self-hosted with zero configuration".
- Para el Hito 3 (fotos de perfil), configurar `images.remotePatterns` con el bucket exacto; no abrir `remotePatterns` a `**`.
- Definir `width`/`height` o `fill` con contenedor; formatos AVIF/WebP; `sizes` correcto; `placeholder="blur"` cuando haya imagen local.
- En Linux glibc, la optimización de imágenes puede consumir memoria; limitar el tamaño de subida y el número de transformaciones. `[verificado en documentación oficial: https://nextjs.org/docs/app/guides/self-hosting, 2026-11-01]`
- Mientras no haya uploads, no se habilita el optimizador para dominios externos.

### 8.5 CSP, headers y SEO

- CSP con nonce por request en `proxy.ts` (Next.js 16), `script-src 'self' 'nonce-...' 'strict-dynamic'`, `style-src 'self' 'nonce-...'`, `img-src 'self' blob: data:`, `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`. `[verificado en documentación oficial: https://nextjs.org/docs/app/guides/content-security-policy, 2026-11-01]`
- Empezar en `Content-Security-Policy-Report-Only` durante una semana; revisar violaciones; pasar a enforce.
- HSTS `max-age=31536000; includeSubDomains` cuando el dominio esté estable; `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` mínima.
- SEO: `metadata` por página, `canonical`, `sitemap.ts`, `robots.ts`, JSON-LD (`Organization`, `Person` para mentoras públicas), Open Graph con imagen estable.
- `noindex` en `/dashboard/*`, `/admin/*`, auth y staging; en producción, solo catálogo y perfiles públicos son indexables.
- Staging: `X-Robots-Tag: noindex, nofollow, noarchive`, `robots.txt` con `Disallow: /` y Basic Auth en Caddy.

### 8.6 Observabilidad y analítica del web

- Sentry browser con `beforeSend` que elimina correo, nombre, tokens y `meetingUrl`; `tracesSampleRate` bajo (0,05–0,1) para no agotar la cuota.
- Umami autoalojado en la misma VM, primer dominio `analytics.ejemplo.com`; script servido same-site; CSP lo permite explícitamente. Sin cookies, sin PII.
- Si se usa Cloudflare Web Analytics, añadir su beacon a la CSP y documentar que es un tercero; muestrea tras 7 días.
- No cargar píxeles de redes sociales ni session replay con PII.

### 8.7 Flujo de despliegue

```text
PR a develop → CI web (lint, test, build) → merge
push a develop → deploy staging (build + up + smoke)
PR develop → main → aprobación manual → backup → deploy prod → smoke solo lectura
```

- Rollback: conservar las 2 últimas imágenes/commits; `docker compose up -d` con el tag anterior; el `REVISION` del host indica qué está desplegado.
- Smoke web: `/` 200, `/mentors` 200 con datos, `/login` 200, CSP presente, cookie `Secure` en producción, `robots.txt` correcto, `sitemap.xml` 200.
- Un deploy de web no debe ejecutar migraciones; esas van en el deploy de API.

## 9. Checklist de release

- [ ] CI backend: build, lint, unitarios, e2e verdes.
- [ ] CI web: lint, tests, build verdes.
- [ ] Migraciones revisadas y probadas en staging; `migrate status` limpio.
- [ ] Backup de producción verificado (fecha, tamaño, restore de prueba).
- [ ] Variables y secretos del entorno correctos; sin secretos en el diff.
- [ ] `APP_ENV=production`; demo seed bloqueado; noindex solo en staging.
- [ ] Smoke staging OK; smoke producción de solo lectura OK.
- [ ] Rollback definido y probado; flag/kill switch disponible.
- [ ] `REVISION` y `PROGRESS.md` actualizados.
