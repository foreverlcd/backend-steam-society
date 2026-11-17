# Alinear 02-ARCHITECTURE y 04-STATE-MACHINES con el código

- **Repo:** backend
- **Dificultad:** media (solo docs) → implementa `sonnet`
- **Decisión del dueño (2026-11-17):** el documento se ajusta al código, no al revés.

## Objetivo
Que `docs/02-ARCHITECTURE.md` y `docs/04-STATE-MACHINES.md` describan exactamente lo que hay hoy en `src/`.

## Contexto mínimo
- `docs/FLOWS.md` (ya verificado contra el código) y `docs/exec-plans/tech-debt-tracker.md` (filas "Docs").
- `scripts/check-boundaries.mjs` (objeto `ALLOWED`: grafo real de dependencias).
- `src/modules/*/*.module.ts`, `find src -type d -not -path '*/generated*'`, `src/modules/bookings/domain/booking-status.ts`.

## Archivos a tocar
- `docs/02-ARCHITECTURE.md`
- `docs/04-STATE-MACHINES.md`
- `docs/exec-plans/tech-debt-tracker.md` (borra las 2 filas "Docs" resueltas)

## Pasos
1. En 02, la tabla "Contextos (módulos)": usa los módulos reales: `auth` (antes `identity`), `profiles` (incluye los endpoints `/admin/mentors`), `scheduling`, `bookings`, `catalog`, `matching`, `payments`, y `health` como técnico. El correo hoy es `MailerService` dentro de `auth` y `MailNotificationsAdapter` (puerto `NotificationsPort`) en `bookings`. Deja `messaging`, `media` y `trust` como **futuros** (Hito 3) en una tabla aparte.
2. En 02, "Estructura de carpetas": refleja el árbol real (p. ej. `shared/` tiene `clock`, `config`, `http`, `prisma` y `time`; no hay `errors/`, `money/` ni `pagination/`). Marca `auth` y `profiles` como módulos planos.
3. En 02, "Reglas entre módulos" punto 3: copia el grafo de `ALLOWED` en `scripts/check-boundaries.mjs` (incluye `auth` como dependencia de casi todos por decoradores y tipos). En el punto 6, sustituye "[a confirmar herramienta]" por: se vigila con `scripts/check-boundaries.mjs`, que corre dentro de `pnpm lint`.
4. En 04, la fila `confirmed` → `cancelar`: la **mentora** solo cancela desde `confirmed`; la mentee desde `requested`, `awaiting_payment` o `confirmed`. Gratuita: hasta `starts_at`. De pago: hasta `ends_at` (la política completa sigue en DA-05). Revisa cada fila de la tabla contra `booking-status.ts` y corrige actor, guarda y efecto donde difiera.
5. No toques otras secciones ni otros documentos.

## Criterio de terminado
- [ ] Ningún módulo del doc deja de existir en `src/`, y ningún módulo de `src/` falta en el doc.
- [ ] La tabla de 04 coincide con `booking-status.ts`.
- [ ] `scripts/gate.sh` en verde.

## Bitácora
| Fecha | Quién | Qué pasó |
|---|---|---|
