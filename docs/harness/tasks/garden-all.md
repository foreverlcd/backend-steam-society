# Jardinería de documentación: barrido completo

- **Repo:** backend (y `../frontend-steam-society/AGENTS.md`)
- **Rol:** doc-gardener (solo lectura)

## Objetivo
Encontrar afirmaciones de la documentación que ya no coinciden con el código.

## Alcance
- `README.md`, `AGENTS.md`, `docs/00-INDEX.md` … `docs/08-MATCHING.md`, `docs/PAYMENTS.md`, `docs/FLOWS.md`, `docs/DEMO.md`.
- `../frontend-steam-society/AGENTS.md`: la sección "Endpoints ya usados" contra los controllers del backend.
- Ignora `docs/discovery/`, que es histórico, y todo lo que ya esté listado en `docs/exec-plans/tech-debt-tracker.md`.

## Entrega
El formato del rol. Máximo 30 líneas, priorizando lo que confundiría a un agente que va a programar.
