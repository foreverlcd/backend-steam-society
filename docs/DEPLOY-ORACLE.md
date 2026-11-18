# Despliegue en una VM de Oracle Cloud (Always Free)

Guía paso a paso para poner Steam Society en producción en **una sola VM gratuita** de Oracle Cloud. Está escrita para alguien que lo hace por primera vez: copia y pega los comandos en orden.

Marcas: **[verificado]** probado o visto en documentación oficial; **[inferido]** razonado, sin probar en Oracle; **[a confirmar]** hay que comprobarlo al hacerlo.

## 0. Qué vamos a levantar

Todo corre con Docker Compose en la misma VM (archivo `deploy/docker-compose.prod.yml`):

```
Internet ──► Caddy (80/443, HTTPS automático)
               ├─ app.example.org ──► web (Next.js, puerto interno 3001)
               └─ api.example.org ──► api (NestJS, puerto interno 3000) ──► postgres (interno)
Internet ──► coturn (3478 UDP/TCP, 5349 TCP, relay 49160-49200 UDP)   ← videollamadas
migrate: corre `prisma migrate deploy` una vez y termina; la API arranca después.
backup:  herramienta para `scripts/db-backup.sh` (no queda corriendo).
```

Reglas que no se negocian:

- **La API corre en UNA sola instancia.** La señalización de las videollamadas vive en la memoria del proceso (ADR-028). No agregues réplicas.
- La base **no** se publica a Internet: solo la ven los contenedores.
- Nada de secretos en el repo: van en `deploy/.env.prod` (ignorado por git, permisos `600`).
- Todo es gratis: Oracle Always Free, Let's Encrypt, Brevo Free, coturn propio.

> ⚠ Antes de abrir el piloto lee la sección 14: hay un cambio pendiente en la API (`trust proxy`) sin el cual el inicio de sesión no funcionaría detrás de Caddy.

Archivos del paquete:

| Archivo | Para qué |
|---|---|
| `deploy/docker-compose.prod.yml` | Servicios: postgres, migrate, api, web, caddy, coturn y backup |
| `deploy/Caddyfile` | HTTPS y proxy; `flush_interval -1` en la API para que el SSE de llamadas no se retrase |
| `deploy/turnserver.conf` | Configuración base de coturn, sin secretos |
| `deploy/.env.prod.example` | Todas las variables con valores de ejemplo |
| `deploy/backup.sh` | Backup diario + copia fuera de la VM (para cron) |

## 1. Crear la VM

En la consola de Oracle Cloud: **Compute → Instances → Create instance**.

- **Imagen:** Canonical Ubuntu 24.04 (la variante **aarch64**, para Ampere).
- **Shape:** `VM.Standard.A1.Flex` (Ampere A1, ARM) con **2 OCPU y 12 GB** de memoria. El cupo gratis total es 4 OCPU y 24 GB por cuenta; 2/12 deja margen para otra VM.
- **Disco de arranque:** 100 GB (el cupo gratis es 200 GB en total).
- **Red:** una VCN con subred **pública** y "Assign a public IPv4 address" activado.
- **SSH:** sube tu clave pública. El usuario será `ubuntu`.
- **Región:** la más cercana a Perú con cupo A1 (Santiago, Bogotá o São Paulo). Si sale "Out of capacity", reintenta más tarde u otra zona de disponibilidad.

Anota dos direcciones (las pide `.env.prod`):

- **IP pública** (`TURN_PUBLIC_IP`): en la página de la instancia.
- **IP privada** (`TURN_PRIVATE_IP`): en la misma página (Primary VNIC), o en la VM con `hostname -I` (la primera, tipo `10.0.0.x`).

> Oracle puede reclamar una VM Always Free que pasa 7 días casi ociosa (CPU, red y memoria muy bajas). Con usuarias reales no suele pasar; vigílalo en las primeras semanas. [verificado en la FAQ de Oracle, ver `docs/discovery/05-FREE-INFRASTRUCTURE.md`]

Entra a la VM:

```bash
ssh ubuntu@IP_PUBLICA
sudo apt-get update && sudo apt-get -y upgrade
sudo timedatectl set-timezone America/Lima
```

## 2. Abrir puertos (dos lugares: Oracle y la VM)

Oracle tiene **dos** firewalls y hay que abrir los puertos en **los dos**. El error más común: abrir la Security List y olvidar el de Ubuntu (las imágenes de Oracle traen reglas `iptables` que rechazan todo salvo SSH, aunque la consola diga que está abierto).

| Puerto | Protocolo | Para qué |
|---|---|---|
| 22 | TCP | SSH (ya viene abierto; idealmente solo desde tu IP) |
| 80 | TCP | HTTP: Let's Encrypt y redirección a HTTPS |
| 443 | TCP y UDP | HTTPS (UDP = HTTP/3) |
| 3478 | UDP y TCP | TURN/STUN (coturn) |
| 5349 | TCP | TURN sobre TLS (redes que solo dejan pasar "HTTPS") |
| 49160-49200 | UDP | Rango de relay de coturn |

### 2.1 Security List de Oracle

Consola: **Networking → Virtual Cloud Networks → tu VCN → Security Lists → Default Security List → Add Ingress Rules**. Una regla por fila, con *Source CIDR* `0.0.0.0/0`:

- TCP, destination port `80`
- TCP, destination port `443`
- UDP, destination port `443`
- UDP, destination port `3478`
- TCP, destination port `3478`
- TCP, destination port `5349`
- UDP, destination port range `49160-49200`

### 2.2 iptables dentro de Ubuntu

Hazlo **antes** de instalar Docker (así el archivo guardado no mezcla las reglas que Docker crea solo).

Mira las reglas actuales y busca la línea `REJECT` de la cadena INPUT:

```bash
sudo iptables -L INPUT -n --line-numbers
```

Normalmente es la 6 (después de la de SSH). Inserta las nuevas **antes** de esa línea (cambia `6` si en tu VM es otra):

```bash
sudo iptables -I INPUT 6 -p tcp --dport 80   -m state --state NEW -j ACCEPT
sudo iptables -I INPUT 6 -p tcp --dport 443  -m state --state NEW -j ACCEPT
sudo iptables -I INPUT 6 -p udp --dport 443  -j ACCEPT
sudo iptables -I INPUT 6 -p udp --dport 3478 -j ACCEPT
sudo iptables -I INPUT 6 -p tcp --dport 3478 -m state --state NEW -j ACCEPT
sudo iptables -I INPUT 6 -p tcp --dport 5349 -m state --state NEW -j ACCEPT
sudo iptables -I INPUT 6 -p udp --dport 49160:49200 -j ACCEPT
sudo netfilter-persistent save     # las guarda en /etc/iptables/rules.v4
sudo iptables -L INPUT -n --line-numbers   # el REJECT debe quedar al final
```

- No actives `ufw`: choca con estas reglas.
- Caddy (80/443) pasa por las reglas de Docker; coturn usa la red del host, así que **depende** de estas reglas INPUT.

## 3. Instalar Docker

Repositorio oficial de Docker para Ubuntu (funciona en ARM) [verificado: docs.docker.com/engine/install/ubuntu]:

```bash
sudo apt-get install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker ubuntu
exit   # vuelve a entrar por SSH para que el grupo docker se aplique
```

Comprueba: `docker run --rm hello-world` y `docker compose version`.

## 4. Clonar los dos repos, uno al lado del otro

```bash
mkdir -p ~/steam && cd ~/steam
git clone <URL-del-repo-backend>  backend-steam-society
git clone <URL-del-repo-frontend> frontend-steam-society
```

Si los repos son privados, usa una **deploy key** de solo lectura por repo (GitHub → Settings → Deploy keys) en vez de tu cuenta personal.

El compose espera la web en `../../frontend-steam-society` relativo a `deploy/`. Si la clonas en otro lado, cambia `WEB_CONTEXT` en `.env.prod`.

## 5. Llenar las variables

```bash
cd ~/steam/backend-steam-society
cp deploy/.env.prod.example deploy/.env.prod
chmod 600 deploy/.env.prod
nano deploy/.env.prod
```

Genera los secretos así (uno por variable; no reutilices):

```bash
openssl rand -hex 24      # POSTGRES_PASSWORD (solo letras y números: va dentro de una URL)
openssl rand -base64 48   # SESSION_SECRET
openssl rand -base64 32   # MFA_ENCRYPTION_KEY
openssl rand -hex 32      # CALL_TURN_SHARED_SECRET
```

Qué poner en cada bloque:

- **Dominios:** `APP_DOMAIN`, `API_DOMAIN`, `TURN_DOMAIN` y `ACME_EMAIL` (correo para avisos de Let's Encrypt). La API toma `WEB_ORIGIN` y `APP_URL` de `APP_DOMAIN`; la web se construye con `NEXT_PUBLIC_API_URL=https://API_DOMAIN/v1`.
- **PostgreSQL:** `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`. `DATABASE_URL` se arma sola apuntando al contenedor. **Alternativa Neon** (PostgreSQL 18 gestionado, gratis): descomenta `DATABASE_URL` con la URL de Neon (`?sslmode=require&schema=public`); el contenedor `postgres` sigue existiendo pero la API no lo usa (puedes dejarlo).
- **Correo:** `SMTP_URL` y `SMTP_FROM` de Brevo (sección 8).
- **TURN:** `CALL_TURN_SHARED_SECRET`, `CALL_TURN_URLS`, `TURN_PUBLIC_IP`, `TURN_PRIVATE_IP`.
- **Backups:** `BACKUP_HOST_DIR`, `BACKUP_KEEP`, `BACKUP_RCLONE_REMOTE` (sección 9).

Importante:

- Guarda `MFA_ENCRYPTION_KEY` también en un gestor de contraseñas. Si se pierde, nadie puede volver a usar su 2FA (ver `docs/RUNBOOK.md` §8).
- Si la clave SMTP tiene caracteres como `@ : / ?`, codifícalos en la URL (`@` = `%40`).
- Este archivo lo lee `docker compose --env-file`, que sí entiende comillas. (El problema de comillas del RUNBOOK §3 es solo de `docker run --env-file`).

## 6. DNS

En tu proveedor de DNS crea tres registros **A** hacia la IP pública de la VM:

| Nombre | Tipo | Valor |
|---|---|---|
| `app` | A | IP pública |
| `api` | A | IP pública |
| `turn` | A | IP pública |

- Si usas Cloudflare, déjalos en **"DNS only" (nube gris)**. TURN no funciona a través del proxy de Cloudflare, y para el piloto es más simple que los tres vayan directo.
- Comprueba antes de seguir: `dig +short app.example.org` debe devolver tu IP (puede tardar minutos).
- Los registros de correo (SPF, DKIM, DMARC) están en la sección 8.

## 7. Levantar todo

Para no escribir el comando largo, crea un alias (agrégalo también a `~/.bashrc`):

```bash
alias dc='docker compose --env-file deploy/.env.prod -f deploy/docker-compose.prod.yml'
cd ~/steam/backend-steam-society
dc config --quiet && echo "config ok"   # valida el archivo sin arrancar nada
dc up -d --build
```

La primera vez construye las imágenes en la propia VM (ARM). Puede tardar 10-20 minutos [inferido]. Luego:

```bash
dc ps                                   # todo "running"/"healthy"; migrate "exited (0)"
dc logs migrate                         # debe terminar en "All migrations have been successfully applied."
curl -s https://api.example.org/health  # {"status":"ok","db":"up"}
```

Abre `https://app.example.org` en el navegador.

### 7.1 coturn y su certificado

coturn usa el certificado que Caddy obtiene para `TURN_DOMAIN`. En el primer arranque quizá Caddy aún no lo tenga; coturn arranca igual, solo con 3478 (sin TLS en 5349) y lo dice en el log. Cuando Caddy ya lo tenga:

```bash
dc logs caddy | grep -i "certificate obtained"
dc restart coturn
dc logs coturn | head   # debe decir "coturn: TLS on 5349 with ..."
```

Caddy renueva el certificado solo, pero coturn lo lee al arrancar. Por eso hay un reinicio semanal de coturn en el cron (sección 9.1).

### 7.2 Crear el admin inicial (una vez)

```bash
read -r -p "Correo del admin: " ADMIN_EMAIL; read -r -s -p "Contraseña (12+): " ADMIN_PASSWORD; echo
dc run --rm -e ADMIN_EMAIL="$ADMIN_EMAIL" -e ADMIN_PASSWORD="$ADMIN_PASSWORD" migrate pnpm exec prisma db seed
unset ADMIN_PASSWORD
```

El admin debe activar la 2FA en su primer ingreso (ADR-024).

### 7.3 TURN en la API: adaptador pendiente

coturn ya queda listo con el esquema "TURN REST" (`use-auth-secret` + `static-auth-secret`). Pero **la API todavía no entrega credenciales de este coturn** (adaptador de la API pendiente). Las variables que usará están en `.env.prod` y el compose ya se las pasa a la API:

- `CALL_TURN_SHARED_SECRET`: el mismo secreto que usa coturn.
- `CALL_TURN_URLS`: lista separada por comas, por ejemplo `turn:turn.example.org:3478?transport=udp,turn:turn.example.org:3478?transport=tcp,turns:turn.example.org:5349?transport=tcp`.

Mientras tanto la API usa STUN (`CALL_STUN_URLS`) y, si se configura, el TURN de Cloudflare Realtime (`CALL_TURN_KEY_ID` y `CALL_TURN_API_TOKEN`), que ya está soportado.

Prueba manual de coturn (sin la API): genera una credencial temporal y pruébala en la página "Trickle ICE" de WebRTC (`https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/`):

```bash
read -r -s -p "CALL_TURN_SHARED_SECRET: " S; echo
U="$(( $(date +%s) + 3600 )):prueba"
echo "usuario:    $U"
echo "contraseña: $(printf '%s' "$U" | openssl dgst -sha1 -hmac "$S" -binary | base64)"
unset S
```

En la página agrega `turn:turn.example.org:3478` con ese usuario y contraseña y pulsa "Gather candidates". Si aparece una fila de tipo **relay**, coturn funciona.

## 8. Correo con Brevo (SPF, DKIM, DMARC)

1. Crea la cuenta gratis en Brevo (300 correos/día).
2. **SMTP & API → SMTP:** copia el *login* SMTP y crea una *SMTP key*. Arma:
   `SMTP_URL=smtp://LOGIN:SMTP_KEY@smtp-relay.brevo.com:587` (codifica `@` como `%40` dentro del login).
3. **Senders, Domains → Domains → Add a domain:** escribe tu dominio. Brevo te muestra los registros exactos que debes crear en tu DNS. Cópialos **tal cual** te los da Brevo (los nombres cambian con el tiempo) [a confirmar al hacerlo]:
   - un TXT de verificación (`brevo-code:...`);
   - DKIM (uno o dos registros en `..._domainkey`);
   - SPF: un TXT en la raíz con `include:spf.brevo.com`. Si ya tienes un SPF, **agrega** el include al mismo registro; nunca tengas dos registros SPF.
   - DMARC: un TXT en `_dmarc`. Empieza suave y endurécelo cuando veas que todo pasa:
     `v=DMARC1; p=none; rua=mailto:dmarc@example.org`
4. Pulsa "Authenticate" en Brevo hasta que todo salga en verde.
5. Agrega el remitente (`no-reply@tudominio`) y úsalo en `SMTP_FROM`.
6. Prueba: regístrate en la app con tu correo; debe llegar el de verificación. Si no llega: `dc logs api | grep -i mail`.

La API guarda los correos en una cola (`email_outbox`) y reintenta si Brevo falla (ADR-027).

## 9. Backups diarios (y copia fuera de la VM)

`deploy/backup.sh` corre `scripts/db-backup.sh` dentro de un contenedor de PostgreSQL 18 conectado a la base. Deja los `.dump` en `BACKUP_HOST_DIR` (por defecto `/var/backups/steam`), guarda los últimos `BACKUP_KEEP` y, si `BACKUP_RCLONE_REMOTE` tiene valor, los copia fuera de la VM con `rclone`. Un backup que vive solo en la VM no sirve si se pierde la VM.

Pruébalo a mano una vez:

```bash
cd ~/steam/backend-steam-society
sudo deploy/backup.sh
sudo ls -lh /var/backups/steam
```

### 9.1 Segunda ubicación: Oracle Object Storage (20 GB gratis)

1. Consola: **Storage → Buckets → Create bucket** (privado), por ejemplo `steam-backups`.
2. **Perfil → My profile → Customer secret keys → Generate secret key.** Guarda el *access key* y el *secret*.
3. Busca tu *namespace* (Tenancy details) y tu región (ej. `sa-santiago-1`).
4. En la VM:
   ```bash
   sudo apt-get install -y rclone
   sudo rclone config
   ```
   Crea un remoto llamado `oci` de tipo **s3**, proveedor *Other*, con tus claves y el endpoint `https://NAMESPACE.compat.objectstorage.REGION.oraclecloud.com` [a confirmar: rclone también trae un backend nativo `oracleobjectstorage`; cualquiera sirve]. Comprueba con `sudo rclone lsd oci:`.
5. En `.env.prod`: `BACKUP_RCLONE_REMOTE=oci:steam-backups`.
6. En el bucket crea una regla de ciclo de vida que borre objetos de más de 30 días (no pasarse de 20 GB).
7. Opcional: un remoto `crypt` de rclone encima de `oci` para cifrar los dumps antes de subirlos.

De vez en cuando baja un dump a tu computadora (`scp`) como tercera copia.

### 9.2 Cron

`sudo crontab -e` y agrega (ajusta la ruta si tu usuario no es `ubuntu`):

```cron
# Backup diario 03:00 (hora de la VM)
0 3 * * * /home/ubuntu/steam/backend-steam-society/deploy/backup.sh >> /var/log/steam-backup.log 2>&1
# coturn relee el certificado renovado por Caddy (lunes 04:30)
30 4 * * 1 cd /home/ubuntu/steam/backend-steam-society && docker compose --env-file deploy/.env.prod -f deploy/docker-compose.prod.yml restart coturn >> /var/log/steam-coturn.log 2>&1
```

Revisa `/var/log/steam-backup.log` al día siguiente.

## 10. Simulacro de restauración (antes del piloto y cada trimestre)

Restaura un backup en una base **temporal** del mismo PostgreSQL y compara conteos. Usa el usuario de `POSTGRES_USER` (aquí `steam`):

```bash
cd ~/steam/backend-steam-society
sudo ls /var/backups/steam                          # elige un archivo .dump
dc exec postgres createdb -U steam steam_society_restore_check
dc run --rm --entrypoint bash backup scripts/db-restore.sh \
  /backups/AAAAMMDDTHHMMSSZ.dump "postgresql://steam@postgres:5432/steam_society_restore_check"
for db in steam_society steam_society_restore_check; do
  dc exec postgres psql -U steam -d "$db" -tAc \
    'SELECT (SELECT count(*) FROM "user"), (SELECT count(*) FROM booking), (SELECT count(*) FROM _prisma_migrations)'
done
dc exec postgres dropdb -U steam steam_society_restore_check
```

Los números deben coincidir (salvo lo que cambió después del backup). Anota fecha, archivo y resultado en tu bitácora. Detalles y más tablas: `docs/RUNBOOK.md` §7.

**Desastre real** (restaurar producción): `dc stop api web`, restaura el dump sobre la base de producción con el mismo comando cambiando el nombre de la base, y luego `dc up -d` (migrate aplica lo que falte). Para restaurar en una VM nueva: sigue esta guía hasta la sección 7, copia el dump a `/var/backups/steam` (desde Object Storage con `rclone copy`) y restaura antes de abrir el tráfico.

## 11. Actualizar a una versión nueva

```bash
cd ~/steam/frontend-steam-society && git pull
cd ~/steam/backend-steam-society  && git pull
sudo deploy/backup.sh          # backup justo antes de migrar
dc up -d --build               # reconstruye, corre migrate y reemplaza api/web
dc ps && dc logs migrate | tail -3
curl -s https://api.example.org/health
docker image prune -f          # borra imágenes viejas (libera disco)
```

- Hay un corte de unos segundos mientras se reemplaza la API (una sola instancia).
- Si cambiaste un dominio, la web necesita reconstruirse (la URL de la API queda dentro del JS): `dc build web && dc up -d web`.
- Volver atrás: `git checkout <commit-anterior>` en el repo afectado y `dc up -d --build`. Las migraciones **no** se deshacen solas; si la versión nueva migró la base, restaura el backup de antes (sección 10).

## 12. Logs

```bash
dc logs -f api                 # seguir en vivo (Ctrl+C para salir)
dc logs --since 1h web
dc logs caddy | tail -50
dc logs coturn | tail -50
dc ps                          # estado y healthchecks
docker stats --no-stream       # memoria y CPU por contenedor
```

Los logs rotan solos (5 archivos de 10 MB por servicio).

## 13. Problemas comunes

| Síntoma | Qué revisar |
|---|---|
| El sitio no carga (timeout) | Security List **y** iptables (sección 2). Prueba `curl -I http://IP_PUBLICA` desde tu computadora. |
| Caddy no obtiene certificado | El DNS aún no apunta a la VM, el puerto 80 está cerrado o Cloudflare está en modo proxy. `dc logs caddy`. Let's Encrypt limita los reintentos: arregla la causa antes de reiniciar muchas veces. |
| `api` se reinicia una y otra vez | `dc logs api`: `Invalid environment variables:` dice qué variable falla (p. ej. `MFA_ENCRYPTION_KEY` que no son 32 bytes o `SMTP_URL` mal codificada). |
| `migrate` termina con error | `dc logs migrate`. La base no está lista o las credenciales no coinciden. Nunca uses `migrate dev` ni `migrate reset` en producción. |
| Inicio de sesión que "no se guarda" | Primero, el bloqueante `trust proxy` de la sección 14. Después, que la web se abra por `https://APP_DOMAIN` exacto (`WEB_ORIGIN`), sin `www` ni HTTP. |
| La web llama a otra URL de API | `NEXT_PUBLIC_API_URL` se fija al construir: `dc build --no-cache web && dc up -d web`. |
| La videollamada se queda "conectando" | En redes estrictas falta TURN (adaptador de la API pendiente, sección 7.3). Revisa `dc logs coturn`, el rango UDP 49160-49200 en ambos firewalls y la prueba Trickle ICE. |
| Llega la llamada tarde o el estado no cambia | El proxy no debe almacenar el SSE: ya está `flush_interval -1` en el `Caddyfile`. No agregues `encode` al bloque de la API. |
| No llegan correos | `SMTP_URL` (codificación, puerto 587), cuenta Brevo activada y dominio autenticado. `dc logs api \| grep -i mail`. |
| Se llenó el disco | `df -h`, `docker system df`, `docker image prune -f`; revisa `BACKUP_KEEP`. |
| La VM se quedó sin memoria al construir | Agrega swap de 4 GB (`fallocate -l 4G /swapfile`, `mkswap`, `swapon`) y reintenta. |

## 14. Limitaciones conocidas (pendientes)

- ⚠ **BLOQUEANTE: la API no confía en el proxy (`trust proxy`).** Caddy termina el HTTPS y habla con la API por HTTP interno. `express-session` con `cookie.secure: true` (producción) **no envía la cookie de sesión** si la petición no le parece segura, y sin `trust proxy` (ni `proxy: true` en la sesión) no lee `X-Forwarded-Proto`. Efecto esperado: el login responde bien pero la sesión no queda guardada. Además, los límites de peticiones (`@nestjs/throttler`) verían la IP de Caddy para todas las usuarias. Arreglo (en la API, fuera de este paquete): confiar solo en el proxy local, p. ej. `app.set('trust proxy', 1)` o la opción equivalente, con un test. [inferido de `src/app.setup.ts` y de la documentación de express-session; no probado detrás de Caddy]
- **TURN propio:** coturn está listo, falta el adaptador de la API que genere credenciales con `CALL_TURN_SHARED_SECRET` (sección 7.3).
- **Una sola VM:** si la VM cae, cae todo. Los backups fuera de la VM son la red de seguridad.
- **coturn y renovación de certificado:** se resuelve con el reinicio semanal del cron.
- Los límites de los planes gratuitos cambian sin aviso; revalídalos antes del piloto (`docs/discovery/05-FREE-INFRASTRUCTURE.md`).
