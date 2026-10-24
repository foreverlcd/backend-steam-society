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

## PENDIENTES
| ID | Decisión | Cuándo | Notas |
|---|---|---|---|
| P-01 | Autenticación: biblioteca, sesiones o tokens, almacenamiento de credenciales, hash | Antes de 1.2 | Comparar opciones actuales con Nest 12 (verificar mantenimiento de cada una). Dos orígenes → cookies y CORS con credenciales. Zona roja |
| P-02 | Validación: class-validator o esquemas Standard Schema (Zod, etc.) soportados por Nest 12 | Antes de 1.2 | Nest 12 añade soporte de Standard Schema [verificado en notas de versión]; comparar con la documentación oficial |
| P-03 | Proveedor de pagos y de pagos salientes en Perú | Antes del Hito 2 | Spike de sandbox; requisitos KYC e impuestos con contador [a confirmar] |
| P-04 | Video: qué se compra, qué se autoaloja, qué se construye | Antes del Hito 4 | Spike entre dos redes |
| P-05 | Correo: SMTP local para desarrollo (ej. Mailpit) y proveedor transaccional | 1.2 | Preferir código abierto o plan gratuito real; verificar límites |
| P-06 | Almacenamiento de archivos compatible con S3 | Antes del Hito 3 | Verificar licencias y límites vigentes |
| P-07 | Librería de fechas con soporte IANA (o API nativa si Node 24 la ofrece) | 1.4 | Verificar estado actual |
| P-08 | UUID v4 vs v7 | 1.1a o 1.3 | Verificar soporte `uuid(7)` en Prisma 7 |
| P-09 | Cancelación y reembolso | Antes del Hito 2 | Equipo de producto; condiciona la máquina de estados y el ledger (= DA-05) |
| P-10 | Comisión de la plataforma y plazo de respuesta de solicitudes | Antes del Hito 2 y de la 1.5 | Equipo de producto |
| P-11 | Mecanismo de eventos internos de dominio (y outbox) | Primer caso real (1.5) | |
| P-12 | Herramienta de tareas periódicas | 1.5 | Preferir lo que use solo PostgreSQL |

## Aplazadas por el proyecto (no son técnicas)
| ID | Tema | Cuándo |
|---|---|---|
| DA-01 | Edad y menores (se guarda la fecha de nacimiento desde el registro) | Antes del primer piloto con personas externas [a confirmar con un abogado] |
| DA-02 | Cursos en vivo y grabados | Después del MVP |
| DA-03 | Moneda y forma jurídica frente al proveedor de pagos | Antes del Hito 2 |
| DA-04 | Aviso de privacidad y consentimiento; derechos sobre datos personales | Antes del primer piloto [a confirmar con un abogado] |
| DA-05 | Política de cancelación y reembolso | Antes del Hito 2 |
