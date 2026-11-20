# Cortar el stream de la llamada cuando se revoca la sesión

- **Repo:** backend
- **Dificultad:** alta (planificador; zona roja: llamadas y sesiones)
- **Rama:** fix/call-session-revoke

## Objetivo
Un `GET /bookings/:id/call/events` abierto seguía recibiendo señales hasta `closesAt` aunque la sesión se cerrara (cierre remoto, cambio o reset de contraseña, activar 2FA). Revisión de seguridad 2026-11-20, posible #2. Ahora el stream comprueba la sesión en cada ping (25 s) y se cierra si ya no existe o es de otra persona.

## Contexto mínimo
- `src/modules/bookings/presentation/calls.controller.ts`, `application/calls.service.ts`
- `src/modules/auth/session.repository.ts` (`revokeAll` borra filas de `auth_session`)

## Archivos a tocar
- `calls.controller.ts`, `calls.service.ts`, `calls.service.spec.ts` (nuevo), `docs/FLOWS.md`, `docs/PROGRESS.md`

## Pasos
1. El controlador arma `sessionAlive()` con `request.sessionStore.get(request.sessionID)`: viva si existe y su `userId` es el del usuario. Un error del store cuenta como viva (un corte de BD no debe tirar llamadas).
2. `CallsService.join(user, id, sessionAlive)` la consulta en cada ping y completa el stream si devuelve `false`.

## Criterio de terminado
- [x] Con la sesión borrada, el stream se cierra en el siguiente ping (test unitario con timers falsos).
- [x] Sin cambios para sesiones vivas ni para errores del store.
- [x] `scripts/gate.sh full` en verde. Docs: FLOWS, PROGRESS.

## Fuera de alcance
- Avisar al otro participante (ya recibe `peer-left` al cerrarse el stream).

## Bitácora
| Fecha | Quién | Qué pasó |
|---|---|---|
| 2026-11-20 | Planificador | Plan creado a partir de la revisión de seguridad |
| 2026-11-20 | Planificador | Implementado; gate full en verde |
| 2026-11-20 | codex (revisor) | Sin hallazgos de código; pidió mover el plan a completed/ |
