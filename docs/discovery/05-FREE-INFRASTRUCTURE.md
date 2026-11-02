# 05 · Alojamiento y servicios 100 % gratuitos

**Restricciones duras:** sin costo recurrente, sin uso no comercial, sin servicios que se duermen para la API (rompen la tarea `@Interval` y los futuros webhooks de pago), sin pausas por inactividad y con PostgreSQL 18 compatible (`uuidv7()` + `btree_gist`). Las comisiones de pasarela se tratan aparte (Hito 2). **Sobre la tarjeta:** se buscó una opción sin tarjeta; no existe una VM siempre encendida con recursos suficientes que la ofrezca. Oracle exige tarjeta **solo para verificar identidad y no cobra**; si el requisito "sin tarjeta" es absoluto, no hay arquitectura viable y habría que aceptar una limitación (Render se duerme) o un coste mínimo. Esa decisión se eleva en 08.

**Fecha de verificación:** 2026-11-01. Los límites de planes gratuitos cambian sin aviso; revalidar antes de contratar.

## 1. Decisión ejecutiva

- **Cómputo:** una VM Oracle Cloud Always Free (Ampere A1, 2 OCPU / 12 GB, 200 GB) con Docker Compose para API + web + reverse proxy. Es la única opción verificada que es siempre gratuita, siempre encendida y con recursos suficientes. **Requiere tarjeta solo para verificación de identidad**, no para cobro.
- **Base de datos:** Neon Free (PostgreSQL 18, São Paulo) como primera opción; PostgreSQL 18 autoalojado en la misma VM como segunda. Aiven Free queda como tercera por no elegir región y poder apagarse.
- **Correo:** Brevo Free (300/día, sin tarjeta). Mailtrap Free como respaldo de desarrollo/staging.
- **Backups:** Oracle Object Storage (20 GB) + `pg_dump`; Neon incluye PITR de 6 h.
- **DNS/CDN/WAF:** Cloudflare Free.
- **CI:** GitHub Actions Free (2.000 min/mes en privado).
- **Observabilidad:** Sentry Developer (1 usuario, 5k errores/mes) + UptimeRobot Free (5 min) + Grafana Cloud Free (50 GB logs, 14 días).
- **Descartados:** Vercel Hobby (no comercial), Render Free (se duerme y su Postgres expira), Cloudflare Workers para SSR (10 ms CPU), AWS/GCP/Azure (tarjeta/trial), Supabase Free (pausa 7 días, sin backups, PG18 sin confirmar).

## 2. Tabla verificada por categoría

### 2.1 Cómputo para API y web

| Opción | Límites y condiciones | ¿Comercial? | ¿Siempre encendido? | Región / latencia | Riesgo | Veredicto |
|---|---|---|---|---|---|---|
| **Oracle Cloud Always Free (A1)** | 1.500 OCPU-h y 9.000 GB-h/mes = 2 OCPU + 12 GB; 200 GB block; 10 TB egress/mes; 20 GB Object Storage; 50.000 requests/mes. `[verificado en documentación oficial: https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm, 2026-11-01]` | Sí; sin cláusula no comercial | Sí, salvo reclamo por ociosidad | Santiago, Bogotá, São Paulo; no hay Lima | Tarjeta de verificación de identidad, no cobro `[verificado en documentación oficial: https://www.oracle.com/cloud/free/faq/, 2026-11-01]`; reclamo si <20 % CPU/red/memoria 7 días; capacidad A1 variable | **1.ª opción** |
| Render Free Web Service | 750 h/mes; spin-down tras 15 min; arranque ~1 min; Postgres free expira 30 días. `[verificado en documentación oficial: https://render.com/docs/free, 2026-11-01]` | No recomendado para producción | No | Oregon/Ohio/Frankfurt/Singapur | Duerme la API, rompe tareas y webhooks | **Descartado** |
| Cloudflare Workers Free | 100.000 req/día; 10 ms CPU; 128 MB; 5 cron triggers. `[verificado en documentación oficial: https://developers.cloudflare.com/workers/platform/limits/, 2026-11-01]` | Sin prohibición explícita | Sí (serverless) | Global | 10 ms CPU no alcanza para Next.js SSR ni para Prisma | **Descartado para API/web; útil para edge** |
| Vercel Hobby | "non-commercial, personal use only" `[verificado en documentación oficial: https://vercel.com/docs/plans/hobby, 2026-11-01]` | **No** | Sí | Global | Prohibido para un producto comercial | **Descartado** |
| AWS / GCP / Azure free | Trial de 6 meses o créditos; tarjeta obligatoria | Sí | No siempre | Varias | Coste al vencer; tarjeta | **Descartado** |
| Railway / Koyeb / Fly | Railway: $1/mes tras prueba de 30 días; Koyeb: 5 h/mes; Fly: sin free tier permanente. `[verificado en documentación oficial: https://railway.com/pricing, https://www.koyeb.com/pricing, https://fly.io/docs/about/pricing/, 2026-11-01]` | — | No | — | Coste recurrente o cuota insuficiente | **Descartado** |

**Conclusión:** la API debe vivir en la VM de Oracle; la web puede vivir en la misma VM (Next.js standalone) o, si se vuelve estática, en Cloudflare Pages. Hoy la web usa SSR y caché de Next.js 16, así que la VM es la opción realista.

### 2.2 PostgreSQL gestionado

| Opción | Límites | PG18 | Backups | Región | Inactividad | Veredicto |
|---|---|---|---|---|---|---|
| **Neon Free** | 100 CU-horas/mes por proyecto; 1 GB; hasta 2 CU (8 GB RAM); 100 proyectos; sin tarjeta. `[verificado en documentación oficial: https://neon.com/pricing, 2026-11-01]` | Sí: "Neon supports Postgres 14, 15, 16, 17, and 18" `[verificado en documentación oficial: https://neon.com/docs/reference/compatibility, 2026-11-01]` | PITR hasta 6 h o 1 GB de cambios; 1 snapshot `[verificado en documentación oficial: https://neon.com/pricing, 2026-11-01]` | São Paulo (`aws-sa-east-1`) `[verificado en documentación oficial: https://neon.com/docs/introduction/regions, 2026-11-01]` | Compute a cero tras 5 min; despierta al primer query | **1.ª opción** |
| **Aiven Free** | 1 VM, 1 CPU, 1 GB RAM, 1 GB storage; sin elección de nube/región; sin pooling; `max_connections=20`. `[verificado en documentación oficial: https://aiven.io/pricing, 2026-11-01]` | Sí; PG18 desde 2025-09-25 `[verificado en documentación oficial: https://aiven.io/docs/platform/reference/eol-for-major-versions, 2026-11-01]` | Backup único para DR; sin PITR en Free | La asigna Aiven | Puede apagarse por inactividad | **2.ª opción** |
| Supabase Free | 500 MB DB, 500 MB RAM, 5 GB egress; pausa tras 1 semana sin actividad; 2 proyectos; sin backups diarios. `[verificado en documentación oficial: https://supabase.com/pricing, 2026-11-01]` | No confirmado `[a confirmar]` | Sin backups automáticos en Free | Varias; São Paulo disponible | Pausa a los 7 días | **Condicional** |
| Render Postgres Free | Expira 30 días después de crearse; "Do not use them for production applications" `[verificado en documentación oficial: https://render.com/docs/free, 2026-11-01]` | — | — | — | Expira | **Descartado** |

**Conclusión:** Neon es la única opción gratuita verificada con PG18, PITR de 6 h, región São Paulo y sin tarjeta. Su límite de 1 GB y 100 CU-horas es suficiente para un piloto; el scale-to-zero añade latencia al primer query tras 5 min de inactividad. La disponibilidad de `btree_gist`, `pg_trgm` y `uuidv7()` en Neon debe comprobarse al crear el proyecto. `[a confirmar]`

### 2.3 PostgreSQL autoalojado

| Opción | Límites | PG18 | Backups | Veredicto |
|---|---|---|---|---|
| **PostgreSQL 18 en la VM Oracle** | Comparte 2 OCPU/12 GB/200 GB; sin coste extra | Sí, imagen oficial `postgres:18.6` | `pg_dump` diario + WAL-G/pgBackRest a Object Storage; PITR propio | **2.ª arquitectura** |
| Docker local / laptop | No es producción | — | — | Solo desarrollo |

**Riesgo:** se pierde la gestión de backups, upgrades y alta disponibilidad. Requiere disciplina operativa y simulacros de restauración.

### 2.4 Correo transaccional

| Opción | Límites | ¿Sin tarjeta? | Veredicto |
|---|---|---|---|
| **Brevo Free** | 300 correos/día; "Free forever, no credit card needed" `[verificado en documentación oficial: https://www.brevo.com/pricing/, 2026-11-01]` | Sí | **1.ª opción** |
| **Mailtrap Free** | 4.000 correos/mes; 150/día; 1 usuario; 1 dominio; 3 días de logs `[verificado en documentación oficial: https://mailtrap.io/pricing/, 2026-11-01]` | Sí | **2.ª opción / staging** |
| Resend Free | 3.000/mes; 100/día; 3 dominios; 30 días de retención `[verificado en documentación oficial: https://resend.com/pricing, 2026-11-01]` | [a confirmar] | Alternativa |
| Mailpit local | Solo desarrollo | — | Desarrollo |

**Conclusión:** Brevo cubre 300 correos/día, suficiente para un piloto de decenas de usuarias. Configurar SPF, DKIM y DMARC; calentar el dominio; rebotes y supresión.

### 2.5 Almacenamiento de objetos y backups

| Opción | Límites | ¿Sin tarjeta? | Veredicto |
|---|---|---|---|
| **Oracle Object Storage** | 20 GB combinados; 50.000 requests/mes `[verificado en documentación oficial: https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm, 2026-11-01]` | Requiere cuenta Oracle (tarjeta de verificación) | **1.ª opción** |
| Cloudflare R2 | 10 GB-mes; 1M Class A; 10M Class B; egress gratis `[verificado en documentación oficial: https://developers.cloudflare.com/r2/pricing/, 2026-11-01]` | Requiere checkout de suscripción `[a confirmar]` | **Condicional** |
| Backblaze B2 | No se encontró asignación gratuita vigente en la página de precios consultada | — | **Descartado** |
| Supabase Storage | 1 GB en Free | Sí | Solo para Hito 3 (fotos) |

**Conclusión:** Oracle Object Storage para dumps y archivos del Hito 3; R2 solo si se confirma que no exige tarjeta. Guardar backups cifrados y probar restauración.

### 2.6 CI, DNS, CDN, WAF y anti-bots

| Servicio | Opción gratuita | Límites | Veredicto |
|---|---|---|---|
| CI/CD | **GitHub Actions Free** | 2.000 min/mes en privado; 500 MB Packages `[verificado en documentación oficial: https://github.com/pricing, 2026-11-01]` | **1.ª opción** |
| DNS | **Cloudflare Free** | DNS rápido, DNSSEC, CDN, SSL universal, DDoS ilimitado, Free Managed Ruleset `[verificado en documentación oficial: https://www.cloudflare.com/plans/, 2026-11-01]` | **1.ª opción** |
| CDN/WAF | **Cloudflare Free** | WAF + reglas gestionadas gratuitas; Bot Fight Mode | **1.ª opción** |
| Anti-bots | Cloudflare Bot Fight Mode | Disponible en Free; sin scores granulares (Enterprise) `[verificado en documentación oficial: https://developers.cloudflare.com/bots/concepts/bot-score/, 2026-11-01]` | **1.ª opción** |
| DNS alternativo | Oracle DNS / registrar | Sin CDN ni WAF | Solo respaldo |

**Nota:** Cloudflare Free se describe para proyectos "personal or hobby projects that aren't business-critical". No se encontró una cláusula que prohíba el uso comercial, pero el soporte no es empresarial. `[verificado en documentación oficial: https://www.cloudflare.com/plans/, 2026-11-01]` Es un riesgo aceptable para el piloto; si el producto crece, el disparador es Cloudflare Pro ($20/mes).

### 2.7 Monitoreo y errores

| Servicio | Límites | Veredicto |
|---|---|---|
| **Sentry Developer** | 1 usuario; 5k errores/mes; 50 replays; 1 uptime monitor `[verificado en documentación oficial: https://sentry.io/pricing/, 2026-11-01]` | **1.ª opción** |
| **UptimeRobot Free** | 50 monitores; intervalo 5 min; status page básica `[verificado en documentación oficial: https://uptimerobot.com/pricing/, 2026-11-01]` | **1.ª opción** |
| **Grafana Cloud Free** | 50 GB logs/mes; 14 días retención; sin tarjeta `[verificado en documentación oficial: https://grafana.com/pricing/, 2026-11-01]` | **1.ª opción** |
| Healthchecks Free | 20 jobs; alertas por correo | Alternativa para cron |
| Better Stack Free | Logs y uptime limitados | Alternativa |

### 2.8 Secretos

| Opción | Límites | Veredicto |
|---|---|---|
| **Entorno del host + GitHub repo secrets (staging)** | Gratis; sin separación por entorno en GitHub Free privado | **1.ª opción** |
| Infisical Free | 5 identidades; proyectos ilimitados; 2FA `[verificado en documentación oficial: https://infisical.com/pricing, 2026-11-01]` | **2.ª opción** |
| Vault autoalojado | Complejidad operativa alta | No para el piloto |

**Regla:** secretos de producción solo en el host; GitHub solo staging. El agente no lee `.env`.

### 2.9 Créditos para startups

| Programa | Qué ofrece | Elegibilidad | Uso en este plan |
|---|---|---|---|
| AWS Activate | Créditos y soporte | Aceleradoras/incubadoras; [a confirmar] | No es baseline; requiere tarjeta |
| Google for Startups Cloud | Créditos | Programa aprobado; [a confirmar] | No es baseline |
| Microsoft for Startups | Créditos Azure | Programa aprobado; [a confirmar] | No es baseline |
| Cloudflare Startup Plan | Créditos/servicios | Startup elegible; [a confirmar] | Opcional |
| DigitalOcean Hatch | Créditos | Startup elegible; [a confirmar] | Opcional |

**Conclusión:** los créditos no cumplen el requisito "sin tarjeta ni costo recurrente" como base. Se pueden usar para una migración futura, no para el piloto.

## 3. Dos arquitecturas completas de costo cero

### Arquitectura A · VM + PostgreSQL gestionado (recomendada para el piloto)

```text
Internet
  └─ Cloudflare (DNS, CDN, WAF, TLS)
      └─ Oracle A1 VM (2 OCPU / 12 GB / 200 GB)
          ├─ Caddy (TLS, noindex staging, Basic Auth staging)
          ├─ API NestJS (Docker, :3000)
          ├─ Web Next.js 16 standalone (Docker, :3001)
          └─ backup agent (pg_dump semanal → Oracle Object Storage)
      └─ Neon Free PostgreSQL 18 (São Paulo, PITR 6 h)
```

- **Coste:** $0/mes; Oracle pide tarjeta solo para verificar identidad; Neon no pide tarjeta. `[verificado en documentación oficial: https://www.oracle.com/cloud/free/faq/, 2026-11-01]`
- **Ventajas:** base gestionada con PITR, menos operación, PostgreSQL 18 completo, región cercana a Perú, CI gratis, correo suficiente.
- **Riesgos:** Oracle puede reclamar la VM si está ociosa 7 días (mitigar con monitoreo y carga sintética); Neon se duerme a los 5 min (primer query lento); 1 GB/100 CU-horas; una sola VM; dos proveedores (latencia y fallo parcial).
- **Disparadores de mejora:** DB >1 GB o >100 CU-horas/mes; PITR >6 h; p95 >300 ms por cold start; necesidad de HA; >300 correos/día; >20 GB de backups; Oracle reclama la VM; equipo de >1 desarrollador.

### Arquitectura B · VM autosuficiente

```text
Internet
  └─ Cloudflare (DNS, CDN, WAF, TLS)
      └─ Oracle A1 VM (2 OCPU / 12 GB / 200 GB)
          ├─ Caddy
          ├─ API NestJS
          ├─ Web Next.js 16
          ├─ PostgreSQL 18 (Docker, volumen persistente)
          └─ pgBackRest/WAL-G → Oracle Object Storage (20 GB)
```

- **Coste:** $0/mes; todo en una VM; sin dependencia de Neon/Aiven.
- **Ventajas:** control total de PostgreSQL 18 y extensiones; sin cold start de DB; un solo proveedor; backups y PITR propios; ideal si Neon no alcanza.
- **Riesgos:** un solo punto de fallo; backups/upgrades/seguridad de la DB son responsabilidad propia; Oracle puede reclamar la VM; RPO/RTO dependen del simulacro; 200 GB compartidos.
- **Disparadores de mejora:** necesidad de HA o backups gestionados; DB >50 GB; tiempo de operación >4 h/mes; auditoría/ compliance; caída >1 h inaceptable; migrar a Neon/Aiven o a un proveedor pagado.

## 4. Plan de salida y portabilidad

- **Contenedores:** API y web en Docker; imágenes reproducibles; variables por entorno; sin dependencias del host.
- **Base:** PostgreSQL estándar; `pg_dump`/`pg_restore` probados; extensiones `btree_gist`, `pg_trgm`, `uuidv7` disponibles en Neon/Aiven/autoalojado.
- **Almacenamiento:** S3-compatible (Oracle/R2); URLs firmadas; sin lock-in de SDK.
- **Correo:** SMTP genérico; cambiar de Brevo a Mailtrap/Resend sin tocar código.
- **DNS:** Cloudflare; exportar zona; TTL bajo antes de migrar.
- **CI:** workflows estándar; migrar a GitLab/Forgejo si cambia el plan.
- **Datos:** exportación mensual cifrada; retención y borrado documentados.

## 5. Lo que se descarta y por qué

| Servicio | Motivo de descarte |
|---|---|
| Vercel Hobby | Prohíbe uso comercial |
| Render Free (API/Postgres) | Se duerme; Postgres expira; no producción |
| Cloudflare Workers (API/SSR) | 10 ms CPU; no soporta Prisma/Next SSR con holgura |
| AWS/GCP/Azure free | Tarjeta y trial; coste al vencer |
| Railway/Koyeb/Fly | Railway $1/mes tras prueba; Koyeb 5 h/mes; Fly sin free tier permanente |
| Supabase Free | Pausa 7 días; sin backups; PG18 sin confirmar |
| Backblaze B2 | Sin asignación gratuita vigente verificada |
| R2 | Checkout de suscripción (tarjeta) |
| GitHub Free privado para protección de rama | No incluida; se compensa con proceso |

## 6. Evidencia de cierre

- 9 categorías cubiertas; 1.ª y 2.ª opción por categoría; 9 servicios descartados con motivo.
- Dos arquitecturas con riesgos y disparadores.
- Fecha de consulta: 2026-11-01. Revalidar límites antes de crear cuentas.
