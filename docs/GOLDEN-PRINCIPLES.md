# Principios de oro

Reglas concretas y verificables que todo cambio debe respetar, humano o agente. Cada una nació de un error real de este proyecto. Si una regla se puede comprobar con código, debe terminar en `scripts/check-boundaries.mjs`, el lint o un test (columna "Se verifica con").

Cuando un revisor encuentre el mismo error dos veces, se agrega aquí y se registra en `docs/harness/LOG.md`.

| # | Regla | Por qué (origen) | Se verifica con |
|---|---|---|---|
| 1 | **El dinero va en enteros de unidad mínima** (`amountMinor`, céntimos) más `currency` ISO. Nunca `float`. Las comisiones se redondean con `splitFee` y la base garantiza `fee + net = amount`. | Errores de redondeo en comisión | CHECK en `payment`, test de `splitFee` |
| 2 | **El tiempo se inyecta.** Los servicios usan el puerto `Clock`, nunca `new Date()` ni `Date.now()` directo. En la base todo es `timestamptz` en UTC. Las zonas horarias se convierten solo en el borde. | Tests frágiles y expiraciones calculadas con la hora equivocada | revisión, tests con `NOW` fijo |
| 3 | **Se valida en el borde** con Zod (body, query, params y webhooks). Dentro del dominio los datos ya son confiables. Los enlaces de sesión aceptan solo `https`. | `meetingUrl` aceptaba `javascript:` | schemas `*.schemas.ts`, e2e |
| 4 | **Un estado solo cambia mediante su máquina de estados** (`domain/*-status.ts`) y con un UPDATE condicional sobre el estado de origen (y `expires_at > now` cuando aplica). Así dos peticiones simultáneas no pueden ganar las dos. | Carrera en aceptar o confirmar una reserva expirada | `applyTransition`, tests de invariantes |
| 5 | **Las invariantes críticas viven en la base**: CHECK, UNIQUE y exclusión (sin solapes). El código traduce el error (p. ej. `23P01`, también dentro de `driverAdapterError`) a un error de negocio. | Doble reserva del mismo horario | migraciones SQL, e2e |
| 6 | **Un módulo no conoce el interior de otro.** Si A necesita algo de B, A declara un puerto en `application/ports/` y B lo implementa (ejemplo: `payments → BookingPaymentPort`). `domain/` es TypeScript puro. | Acoplar pagos a reservas | `scripts/check-boundaries.mjs` (lint) |
| 7 | **Todo lo que llega desde fuera es idempotente.** Los webhooks se deduplican por `(provider, eventId)`, los cobros llevan `idempotency_key` y el doble clic reutiliza el checkout abierto. | Webhooks repetidos por el proveedor | UNIQUE, e2e de pagos |
| 8 | **La autorización sale de la sesión, nunca del body.** Cada consulta de datos privados filtra por el usuario de la sesión, y los ids del body no prueban propiedad. | Riesgo de leer reservas ajenas | e2e de permisos |
| 9 | **Cada endpoint público o costoso tiene throttle**, por usuario si hay sesión y por IP si no. | Ráfagas y raspado del catálogo | `@Throttle`, e2e |
| 10 | **Sin secretos ni datos reales.** Nada de `.env` en git ni en logs. Los datos demo se crean por la API (`pnpm db:seed:demo`) con dominios `.local`. | Política del proyecto | `scripts/gate.sh` (secret scan) |
| 11 | **Web: solo `src/lib/api` habla con la red.** Los mensajes de error salen de `code` mediante `src/lib/api/errors.ts`. No se llama a `setState` dentro de `useEffect` para inicializar (usa un inicializador perezoso). | Errores de lint de React 19 y fetch disperso | `scripts/check-boundaries.mjs` (web), eslint |
| 12 | **Los documentos son la fuente de verdad.** Si el código cambia una regla, el documento cambia en el mismo commit y `docs/PROGRESS.md` lo refleja. Si se contradicen y no sabes cuál vale, detente y pregunta. | Documentación desfasada (8 discrepancias en pagos) | rol `doc-gardener` |
| 13 | **No se inventan APIs.** Antes de usar una librería, verifica la versión en `package.json` y su documentación local (`node_modules/<pkg>`, `node_modules/next/dist/docs/`). | Next 16, Prisma 7 y Nest 12 son posteriores al conocimiento de los modelos | revisión |
| 14 | **El gate es la definición mínima de terminado**: `scripts/gate.sh` en verde, y `full` (con e2e) antes de integrar en el backend. Nunca se desactiva un test o una regla para pasar. | Política del proyecto | `scripts/gate.sh` |
