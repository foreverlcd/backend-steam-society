# 07 · Decisiones

Regla para el agente: las decisiones **ACEPTADAS** se respetan sin reabrirlas. Las **PENDIENTES** NO se toman: se investiga con documentación oficial, se proponen 2 o 3 opciones con pros y contras y se espera la decisión del desarrollador. Cada decisión pendiente resuelta se mueve a ACEPTADAS con fecha.

## ACEPTADAS (ADRs)
Formato: decisión · por qué · alternativas descartadas · consecuencias.

**ADR-001 · Dos aplicaciones en dos repositorios (API y web).**
Por qué: preferencia del desarrollador y separación clara. Descartado: monorepo (válido y más cómodo para compartir tipos). Consecuencia: el contrato entre repos es OpenAPI; CORS y cookies con dos orígenes.

**ADR-002 · TypeScript de punta a punta.**
Por qué: un solo lenguaje para un único desarrollador junior. Descartado: Python/Django, Go, Java/Spring Boot (un lenguaje extra no compensa). Python queda para un servicio de IA aparte, solo si hace falta (etapas posteriores).

**ADR-003 · Next.js (interfaz) + NestJS (API).**
Por qué: Next.js no ofrece WebSockets nativos en Route Handlers [verificado], y se necesitan tareas en segundo plano y módulos aislados. Descartado: Next.js como único backend; NestJS vs Fastify: se eligió NestJS por mercado y estructura.

**ADR-004 · Monolito modular.**
Por qué: un solo desarrollador; despliegue y depuración simples; límites claros por contexto. Descartado: microservicios (costo operativo), monolito sin módulos.

**ADR-005 · Hexagonal selectiva.**
Por qué: aplicar puertos y adaptadores solo donde hay proveedores intercambiables o lógica pura (scheduling, payments). Descartado: capas en todo (pagos acoplados al proveedor) y hexagonal en todo (sobreingeniería).

**ADR-006 · PostgreSQL + Prisma 7, con SQL a mano para lo que Prisma no expresa.**
Por qué: transacciones y restricciones potentes para reservas y ledger; el desarrollador conoce Prisma. Descartado: Drizzle, TypeORM, MongoDB.

**ADR-007 · Modelo oferta → sesión → reserva.**
Por qué: varias ofertas por mentora (gratuitas y de pago); la sesión es una sala con horario y la reserva es un asiento, lo que habilita sesiones grupales sin rehacer el modelo. Descartado: precio en el perfil; reserva con fecha directa.

**ADR-008 · Tiempo: UTC + zona IANA.**
Por qué: evitar errores de horario de verano y de zona. Descartado: hora local sin zona.

**ADR-009 · Dinero: entero en unidad mínima + moneda.**
Descartado: decimales y floats.

**ADR-010 · Ledger propio de doble entrada, con el proveedor de pagos detrás de un puerto.**
Por qué: transparencia total para el admin y cambiar de proveedor sin reescribir (el proveedor en Perú es incierto). Descartado: saldo único mutable; delegar todo al proveedor.

**ADR-011 · Contrato REST + OpenAPI.**
Descartado: GraphQL; tRPC (incómodo con dos repositorios).

**ADR-012 · pnpm como gestor de paquetes, sobre Node.**
Por qué: despensa estricta y buen soporte. Descartado: npm; Bun como runtime (riesgo con decoradores de Nest); Bun solo como gestor sería viable.

**ADR-013 · Un rol por cuenta; la mentora aprueba cada solicitud; varias ofertas por mentora; el admin no se crea por registro.** (Decisiones de producto del 2026-10-24.)

**ADR-014 · Flujo de trabajo con agente.** El agente implementa en ramas, sin `push`; el desarrollador revisa cada diff y hace el merge; zonas rojas con tests de invariantes y revisión senior antes de producción.

**ADR-015 · UUID v7 generado por PostgreSQL (`uuidv7()`).** (2026-10-24) Por qué: ordenado por tiempo, mejor localidad de índice, y el id existe también en inserciones hechas fuera de Prisma. Descartado: `uuid()` de Prisma (se genera en el cliente, no en SQL manual) y uuid v4 (aleatorio). Consecuencia: `@default(dbgenerated("uuidv7()")) @db.Uuid` en todas las tablas nuevas; requiere PostgreSQL 18.

**ADR-016 · Autenticación con sesiones de servidor: `express-session` + `connect-pg-simple` + Argon2id, sin Passport.** (2026-10-24; resuelve P-01) Por qué: el MVP tiene un frontend Next.js y una API NestJS en orígenes distintos; una cookie de sesión `HttpOnly` evita guardar tokens en el navegador y permite revocar sesiones desde el servidor. `connect-pg-simple` reutiliza PostgreSQL (sin Redis) y Argon2id es el algoritmo recomendado por OWASP. Se descartó Passport por ser una capa innecesaria para un solo esquema de sesión; se descartaron JWT en `localStorage` (XSS y revocación difícil) y sesiones en memoria (no sobreviven reinicios ni escalan). Consecuencias: cookie `__Host-sid` con `Secure`, `HttpOnly`, `SameSite=Lax` y 7 días en producción; en desarrollo local sobre HTTP se usa `sid` con `SESSION_COOKIE_SECURE=false`. La tabla se llama `auth_session` para no chocar con `session` (mentoría, 1.5). La sesión se regenera al entrar y se destruye al salir; el reset de contraseña revoca todas las sesiones del usuario.

**ADR-017 · Validación con Zod 4 y `StandardSchemaValidationPipe` de NestJS 12.** (2026-10-24; resuelve P-02) Por qué: NestJS 12 acepta esquemas Standard Schema en `@Body({ schema })`, Zod es mantenido y ya se usa para validar el entorno; evita decoradores y `class-validator`. Descartado: `class-validator` + `class-transformer` (más dependencias y DTOs con decoradores). Consecuencia: los esquemas viven en `auth.schemas.ts` y el pipe global traduce los errores a `400`.

**ADR-018 · Onboarding versionado como configuración y perfil editable siempre.** (2026-10-24; etapa 1.3) Por qué: las preguntas de producto cambian y el onboarding debe evolucionar sin reescribir tablas; la mentora debe poder corregir su perfil sin perder el estado de aprobación. Consecuencia: `ONBOARDING_VERSION = 1` y las preguntas viven en `src/modules/profiles/onboarding.config.ts`; las respuestas se guardan por pregunta en `onboarding_response` y las señales de matching se proyectan a columnas y relaciones tipadas. Editar el perfil no cambia `status`; el admin conserva `suspend` como control. Los rangos de experiencia se guardan como respuesta y `years_experience` toma el límite inferior para el matching. Los seeds de áreas e idiomas son provisionales hasta que producto entregue las listas definitivas.

**ADR-019 · Completitud calculada, edad derivada y etapa exacta.** (2026-10-24; hardening de 1.3) Por qué: el frontend no debe duplicar las reglas de obligatoriedad, la edad no debe guardarse dos veces y `education_level` no representa bien la etapa de carrera. Consecuencia: `completion` se calcula desde la config y se expone en `GET|PUT /v1/me/onboarding`; `POST /v1/me/profile/submit` exige completitud; `age` sale del onboarding y se deriva de `birth_date`; `career_stage` guarda la etapa exacta y `education_level` queda como proyección gruesa. Un test de contrato compara los códigos de la config con las claves del schema Zod para evitar drift.

**ADR-020 · `temporal-polyfill` 1.0.6 para fechas y zonas IANA.** (2026-10-26; resuelve P-07) Por qué: Node 24.22.1 no expone `Temporal` (ni con `--experimental-temporal`), ICU 78.3 y tz 2026e; el cálculo de slots necesita convertir horas locales a instantes UTC y detectar gaps/overlaps de DST. Se aisló en `src/shared/time/` y en el dominio de scheduling. Descartado: `luxon`/`date-fns-tz` (más peso y API mutable), `Temporal` nativo (no disponible), aritmética manual con `Date` (errores de DST). Consecuencia: `disambiguation: 'compatible'`; si la hora local no existe en un gap se omite el slot, y en un overlap se usa el offset anterior sin duplicar la hora repetida. Rango máximo de slots: 90 días.

**ADR-021 · Plazo de respuesta de solicitudes: 48 h configurables; comisión en el Hito 2.** (2026-10-30; resuelve parcialmente P-10) Por qué: R-06 fijaba un plazo de 48 h [PLACEHOLDER] y producto necesita ajustarlo sin desplegar; la comisión depende del proveedor de pagos y de la forma jurídica, que son decisiones del Hito 2. Decisión: al crear la solicitud, `expires_at = requested_at + BOOKING_REQUEST_TTL_HOURS` (entero positivo, 48 por defecto); la variable está en `.env.example` y el README. Descartado: plazo fijo en código (rígido), plazo por oferta (complejidad sin necesidad en el MVP), solicitudes sin vencimiento (bloquean el asiento). Consecuencia: 1.5 añadirá la variable al esquema de entorno y la validará al arrancar; el vencimiento se evalúa al consultar y con la tarea periódica (ADR-023). La comisión sigue pendiente para el Hito 2.

**ADR-022 · Notificaciones después de la transacción, sin eventos ni outbox en el Hito 1.** (2026-10-30; resuelve P-11) Por qué: el MVP no necesita un bus de eventos; el estado de la reserva es la fuente de verdad y el correo es un efecto best-effort. Decisión: el caso de uso confirma la transacción y después llama a `NotificationsPort`; si el correo falla, se registra el error (sin datos sensibles) y la reserva NO se revierte. No hay emisor de eventos de dominio ni outbox en el Hito 1; el outbox se decide en el Hito 2. Descartado: outbox ahora (infraestructura y complejidad prematura), eventos en proceso (acoplamiento oculto y orden incierto), correo dentro de la transacción (un fallo de SMTP revertiría la reserva y alargaría el lock). Consecuencia: puede perderse un correo si el proceso muere después del commit; queda en logs y se revisa en el Hito 2. `NotificationsPort` permite cambiar el adaptador sin tocar el dominio.

**ADR-023 · Vencimiento al consultar + tarea periódica con `@nestjs/schedule`; actualización idempotente.** (2026-10-30; resuelve P-12) Por qué: consultar no puede depender de que la tarea haya corrido, y la tarea necesita liberar asientos y notificar de forma proactiva. Verificado: `@nestjs/schedule@12.0.2` declara peers `@nestjs/core` y `@nestjs/common` `^11.0.0 || ^12.0.0`, así que es compatible con NestJS 12 [verificado: `registry.npmjs.org/@nestjs/schedule/latest`, 2026-10-30]. Decisión: el vencimiento se evalúa en la lectura/acción sobre la reserva y además corre una tarea en proceso; el `UPDATE` es idempotente (`WHERE status IN ('requested','awaiting_payment') AND expires_at <= now()`), de modo que ejecutarla dos veces no cambia nada. Descartado: solo tarea periódica (lecturas obsoletas si falla), solo lectura (no libera asientos ni notifica a tiempo), `pg_cron`/scheduler externo (más infraestructura para una instancia), BullMQ/Redis (fuera del stack). Consecuencia: en varias instancias la tarea puede correr en paralelo; la idempotencia y un lock de asesoría/`SKIP LOCKED` lo harán seguro. El intervalo se define en 1.5.

## PENDIENTES
| ID | Decisión | Cuándo | Notas |
|---|---|---|---|
| P-03 | Proveedor de pagos y de pagos salientes en Perú | Antes del Hito 2 | Spike de sandbox; requisitos KYC e impuestos con contador [a confirmar] |
| P-04 | Video: qué se compra, qué se autoaloja, qué se construye | Antes del Hito 4 | Spike entre dos redes |
| P-05 | Correo: SMTP local para desarrollo (ej. Mailpit) y proveedor transaccional | 1.2 | Mailpit local ya configurado en `docker-compose.yml`; la API usa `SMTP_URL` genérico. El proveedor transaccional sigue pendiente: preferir código abierto o plan gratuito real; verificar límites |
| P-06 | Almacenamiento de archivos compatible con S3 | Antes del Hito 3 | Verificar licencias y límites vigentes |
| P-09 | Cancelación y reembolso | Antes del Hito 2 | Equipo de producto; condiciona la máquina de estados y el ledger (= DA-05) |
| P-10 | Comisión de la plataforma (el plazo de respuesta quedó en ADR-021) | Hito 2 | Equipo de producto |

## Aplazadas por el proyecto (no son técnicas)
| ID | Tema | Cuándo |
|---|---|---|
| DA-01 | Edad y menores (se guarda la fecha de nacimiento desde el registro) | Antes del primer piloto con personas externas [a confirmar con un abogado] |
| DA-02 | Cursos en vivo y grabados | Después del MVP |
| DA-03 | Moneda y forma jurídica frente al proveedor de pagos | Antes del Hito 2 |
| DA-04 | Aviso de privacidad y consentimiento; derechos sobre datos personales | Antes del primer piloto [a confirmar con un abogado] |
| DA-05 | Política de cancelación y reembolso | Antes del Hito 2 |
