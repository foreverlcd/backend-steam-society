# Deudas pequeñas del web: tests de reservas y texto del admin

- **Repo:** web (`../frontend-steam-society`)
- **Dificultad:** baja → implementa `haiku`, revisa `opencode`
- **Rama:** feat/ux-quick-wins

## Objetivo
Cubrir con tests el comportamiento nuevo de `BookingsView` y quitar la jerga "Onboarding" del panel de admin.

## Contexto mínimo
- `AGENTS.md` (sección Tests)
- `src/components/dashboard/bookings-view.tsx`
- Un test de componente existente como patrón: `src/components/onboarding/onboarding-view.test.tsx` (cómo mockea la API y el contexto de auth)
- `src/components/admin/admin-view.tsx`

## Archivos a tocar
- `src/components/dashboard/bookings-view.test.tsx` (nuevo)
- `src/components/admin/admin-view.tsx` (solo textos)

## Pasos
1. Crea `bookings-view.test.tsx` con 3 tests, mockeando `@/lib/api/bookings` y `@/lib/api/payments` con `vi.mock` como en el patrón:
   - mentorada sin reservas → muestra `Aún no tienes reservas.` y un enlace `Explorar mentoras` a `/mentors`;
   - mentora sin reservas → muestra `Aún no tienes solicitudes.` y un enlace a `/dashboard/availability`;
   - pagos deshabilitados (`enabled: false`) → no existe el filtro `Por pagar`; habilitados → sí existe.
2. En `admin-view.tsx` cambia los textos visibles `Onboarding` por `Cuestionario de intereses` (líneas ~334 y ~723). No cambies identificadores.

## Criterio de terminado
- [ ] 3 tests nuevos verdes.
- [ ] `grep -n ">Onboarding<\|\"Onboarding\"" src/components/admin/admin-view.tsx` sin resultados.
- [ ] `scripts/gate.sh` del web en verde.

## Fuera de alcance
- Cambiar el comportamiento de `BookingsView` o del admin.

## Bitácora
| Fecha | Quién | Qué pasó |
|---|---|---|
