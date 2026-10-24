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
- `WEB_ORIGIN`: orígenes del frontend separados por coma. Se usa para CORS con
  credenciales y para la protección CSRF.
- `APP_URL`, `SMTP_URL`, `SMTP_FROM`: enlace de recuperación y correo saliente.
  En local, Mailpit expone SMTP en `127.0.0.1:1025` y la bandeja en
  `http://127.0.0.1:8025`.
- `ADMIN_EMAIL`, `ADMIN_PASSWORD`: solo para `pnpm db:seed`. El registro público
  nunca crea administradores.

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

| Método | Ruta | Autenticación | Descripción |
|---|---|---|---|
| GET | `/health` | Pública | Estado de la API y de la base |
| POST | `/v1/auth/register` | Pública | Registro `mentee` o `mentor` |
| POST | `/v1/auth/login` | Pública | Crea la sesión |
| POST | `/v1/auth/logout` | Sesión | Destruye la sesión |
| POST | `/v1/auth/password/forgot` | Pública | Solicita enlace de recuperación |
| POST | `/v1/auth/password/reset` | Pública | Consume el token y cambia la contraseña |
| GET | `/v1/me` | Sesión | Devuelve la usuaria autenticada |

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
  `@nestjs/throttler`.

### Recuperación de contraseña

El endpoint `forgot` responde siempre `202` para no revelar si el correo existe.
El token es aleatorio de 32 bytes, se guarda solo su hash SHA-256, caduca en una
hora y es de un solo uso. Al cambiarla se revocan todas las sesiones de esa
usuaria. En local, abre `http://127.0.0.1:8025` para ver el correo de Mailpit.

## Base de datos (Prisma 7)

El esquema vive en `prisma/schema.prisma` y la configuración del CLI en
`prisma.config.ts`. Las tablas de autenticación son `user`, `auth_session` y
`password_reset_token`; `session` queda reservado para las sesiones de mentoría
de la etapa 1.5.

Comandos disponibles:

```bash
pnpm db:migrate    # Crear o aplicar migraciones en desarrollo
pnpm db:generate   # Regenerar el cliente tras cambiar el esquema
pnpm db:validate   # Validar el esquema y la configuración
pnpm db:seed       # Crear/actualizar el admin desde ADMIN_EMAIL y ADMIN_PASSWORD
pnpm db:studio     # Abrir Prisma Studio
```

`src/generated/prisma/` no se versiona: se recrea con `pnpm db:generate`.
Ejecuta ese comando después de un `git clone` o de cambiar
`prisma/schema.prisma`, antes de compilar o arrancar la API.

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

Los e2e truncan las tablas de autenticación antes de cada prueba. No apuntes
`steam_society_test` a una base con datos reales.

Comprobaciones de la definición de terminado:

```bash
pnpm build
pnpm lint
pnpm test
pnpm test:e2e
```

## Seguridad

- Nunca se registran contraseñas, tokens ni datos personales en logs.
- Los errores de login no distinguen entre correo inexistente y contraseña
  incorrecta.
- El registro público solo acepta `mentee` y `mentor`; el admin se crea con el
  seed.
- Este proyecto maneja autenticación, reservas y pagos: es zona roja. Nada va a
  producción sin revisión de un desarrollador senior.
