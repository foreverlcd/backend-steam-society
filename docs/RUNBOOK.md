# Runbook de operación (F1)

Guía para desplegar y mantener la API. Es genérica: sirve con cualquier PostgreSQL por `DATABASE_URL`. El proveedor de hosting y de base de datos aún no está decidido (ADR-026 §7); lo que dependa de eso lleva `[verificar]`.

## 1. Requisitos
- Docker (para construir y correr la imagen).
- Un PostgreSQL 18 accesible desde la API `[verificar versión mínima en el proveedor elegido]`.
- Cliente de PostgreSQL (`pg_dump`, `pg_restore`, `psql`) en la máquina que hace los backups.
- Un servidor SMTP gratuito para correos (ADR-026 §8) `[verificar proveedor y límites]`.
- Un proxy con HTTPS delante de la API (cookies `Secure`). Ver el ejemplo de Caddy al final.

## 2. Variables de entorno
Fuente: `src/config/env.ts`. Nunca subas valores al repo ni los pegues en logs.

Obligatorias en producción:
- `NODE_ENV=production`
- `DATABASE_URL`
- `SESSION_SECRET` (mínimo 32 caracteres; `openssl rand -base64 48`)
- `SESSION_COOKIE_SECURE=true`
- `MFA_ENCRYPTION_KEY` (32 bytes en base64; sin ella la API no arranca en producción)
- `WEB_ORIGIN` (origen exacto del frontend; lista separada por comas)
- `APP_URL` (URL pública del frontend, para los enlaces de los correos)
- `SMTP_URL` y `SMTP_FROM` (sin `SMTP_URL` no se envían correos)

Opcionales (con valor por defecto): `PORT` (3000), `BOOKING_REQUEST_TTL_HOURS` (48), `EMAIL_VERIFICATION_TTL_HOURS` (48), `PAYMENTS_PROVIDER` (`disabled`), `PAYMENTS_FEE_BPS` (1500). Solo para sembrar el admin: `ADMIN_EMAIL` y `ADMIN_PASSWORD` (mínimo 12).

Prohibidas en producción: `PAYMENTS_PROVIDER=fake` y `THROTTLE_DISABLED=true` (la API no arranca).

## 3. Construir y correr la imagen
```bash
docker build -t steam-society-api .                      # imagen runtime (por defecto)
docker build --target migrate -t steam-society-migrate . # imagen para migraciones y seed

docker run -d --name steam-api -p 3000:3000 --env-file /ruta/segura/api.env steam-society-api
curl -i http://127.0.0.1:3000/health   # 200 {"status":"ok","db":"up"}
```
La imagen corre como usuario no root y trae un `HEALTHCHECK` contra `/health`. Mantén el archivo de variables fuera del repo y con permisos `600`.

⚠ **`--env-file` de Docker no quita comillas**: `SMTP_URL="smtp://…"` llega con las comillas y la API se niega a arrancar (`Invalid URL`). En el archivo de producción escribe los valores **sin comillas** (el `.env` de desarrollo sí las admite porque lo lee dotenv). Probado el 2026-11-17.

## 4. Migraciones
Las migraciones NO se aplican al arrancar. Son un paso previo, antes de cada despliegue que cambie `prisma/migrations/`:
```bash
docker run --rm --env-file /ruta/segura/api.env steam-society-migrate
# equivale a: pnpm exec prisma migrate deploy
```
Nunca uses `migrate dev` ni `migrate reset` contra producción. Haz un backup (sección 6) justo antes de migrar.

## 5. Sembrar el admin inicial
Una sola vez, con `ADMIN_EMAIL` y `ADMIN_PASSWORD` en el archivo de variables:
```bash
docker run --rm --env-file /ruta/segura/api.env steam-society-migrate pnpm exec prisma db seed
```
El admin nace con el correo verificado y debe activar la 2FA en el primer ingreso (ADR-024). Después quita `ADMIN_PASSWORD` del archivo.

## 6. Backups
Script: `scripts/db-backup.sh` (formato custom de `pg_dump`). Guarda en `backups/` (o `BACKUP_DIR`) y conserva los últimos `BACKUP_KEEP` (14 por defecto). No imprime la URL.
```bash
DATABASE_URL='postgresql://...' BACKUP_DIR=/var/backups/steam bash scripts/db-backup.sh
```
Cron diario sugerido (03:00), con la URL en un archivo `600` que el cron lee:
```cron
0 3 * * * . /ruta/segura/backup.env && cd /ruta/al/repo && BACKUP_DIR=/var/backups/steam bash scripts/db-backup.sh >> /var/log/steam-backup.log 2>&1
```
Sin `pg_dump` instalado en la máquina, corre el script dentro de la imagen oficial de PostgreSQL (misma versión mayor que la base):
```bash
docker run --rm --network host -v "$PWD:/w" -w /w -u "$(id -u)" -e DATABASE_URL postgres:18.6-alpine3.24 bash scripts/db-backup.sh
```
Copia los dumps fuera del servidor (otro proveedor o disco) `[verificar: almacenamiento gratuito disponible]`. Un backup que vive solo en la misma máquina no sirve ante una pérdida del servidor. Algunos proveedores gratuitos de BD ya hacen sus propios backups `[verificar]`; no los des por hechos.

## 7. Simulacro de restauración (hacer antes del piloto y cada trimestre)
Objetivo: comprobar que un backup realmente se puede restaurar.
1. Toma un backup (sección 6) y anota la ruta del `.dump`.
2. Crea una base temporal vacía en un PostgreSQL de pruebas (no la de producción):
   ```bash
   # La clave va en PGPASSWORD (o ~/.pgpass), nunca escrita en la URL del historial.
   psql "postgresql://USUARIO@HOST:PUERTO/postgres" -c "CREATE DATABASE steam_society_restore_check"
   ```
3. Restaura:
   ```bash
   bash scripts/db-restore.sh backups/AAAAMMDDTHHMMSSZ.dump \
     "postgresql://USUARIO@HOST:PUERTO/steam_society_restore_check"
   ```
   El script se niega si la URL destino contiene `prod`, salvo que añadas `--yes-really`.
4. Compara conteos entre origen y restaurada:
   ```sql
   SELECT 'user' t, count(*) FROM "user"
   UNION ALL SELECT 'mentor_profile', count(*) FROM mentor_profile
   UNION ALL SELECT 'session', count(*) FROM session
   UNION ALL SELECT 'booking', count(*) FROM booking
   UNION ALL SELECT 'audit_log', count(*) FROM audit_log
   UNION ALL SELECT 'migraciones', count(*) FROM _prisma_migrations;
   ```
   Los números deben coincidir (salvo cambios entre el backup y la consulta).
5. Borra la base temporal: `DROP DATABASE steam_society_restore_check;`
6. Anota fecha, archivo y resultado en `docs/harness/LOG.md` o en tu bitácora.

Restaurar en producción real (desastre): detén la API, restaura con `--yes-really` sobre una base vacía, corre las migraciones pendientes y arranca la API.

## 8. Rotación de secretos
- **`SESSION_SECRET`**: cámbialo, reinicia la API. Efecto: express-session firma la cookie con este secreto, así que las cookies existentes dejan de valer y todas las usuarias deben entrar de nuevo. No afecta datos.
- **`MFA_ENCRYPTION_KEY`**: ⚠ cifra los secretos TOTP. Si la pierdes o la cambias sin migrar, no se pueden descifrar y hay que reinscribir la 2FA de todas las cuentas (el admin incluido; la recuperación es manual en la base). No hay rotación automática hoy: respáldala en un lugar seguro aparte de la base. Cambiarla exige reinscribir la 2FA.
- Credenciales de SMTP y de la base: rota en el proveedor, actualiza el archivo de variables y reinicia.
- Si sospechas filtración de un secreto, rótalo primero y averigua después.

## 9. La API no arranca: qué revisar
1. `docker logs steam-api`. Los errores de entorno dicen `Invalid environment variables:` con la variable exacta. Si dice `Invalid URL` o `Invalid email` con un valor que parece bien, revisa que no tenga comillas (ver §3).
2. Producción exige `MFA_ENCRYPTION_KEY` válida (32 bytes en base64) y prohíbe `fake` y `THROTTLE_DISABLED=true`.
3. La API falla rápido si la base no responde: revisa `DATABASE_URL`, firewall y que el PostgreSQL esté arriba (`psql` con la misma URL).
4. Faltan migraciones: corre el paso de la sección 4.
5. `/health` responde 503 `db: down` con la API viva: la base se cayó o cambió de credenciales.
6. Cookies que no se guardan: confirma HTTPS en el proxy, `SESSION_COOKIE_SECURE=true` y que `WEB_ORIGIN` sea exactamente el origen del frontend.

## 10. Ejemplo de proxy (Caddy) — referencia, no probado
Paquete completo de producción (compose, Caddyfile, coturn, backups; validado en local, no en Oracle): `deploy/` y [DEPLOY-ORACLE.md](DEPLOY-ORACLE.md).
```caddyfile
# api.ejemplo.com { reverse_proxy 127.0.0.1:3000 }
```
Caddy obtiene el certificado TLS solo `[verificar: dominio y DNS dependen del proveedor]`. Si la API queda detrás de un proxy, comprueba cómo se toma la IP del cliente para los límites de peticiones `[verificar]`.

## 11. CI
`.github/workflows/ci.yml` corre `scripts/gate.sh full` contra un PostgreSQL de servicio y construye ambas imágenes sin publicarlas. Usa solo valores falsos `test-only-*`; no necesita secretos del repositorio.
