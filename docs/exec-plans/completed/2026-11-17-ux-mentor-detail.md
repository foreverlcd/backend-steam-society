# UX quick win: ficha de mentora (reservar sin perderse)

- **Repo:** web (`../frontend-steam-society`)
- **Dificultad:** media → implementa `sonnet`, revisa `codex`
- **Rama:** feat/ux-quick-wins

## Objetivo
En la ficha de una mentora (`/mentors/[id]`), una visitante sabe desde el principio que necesita una cuenta para reservar, ve pocos días de horarios (no 13 días de botones iguales) y lee las fechas en español natural. Los botones de horario tienen tamaño táctil.

## Contexto mínimo
- `AGENTS.md` (UI, accesibilidad)
- `src/components/catalog/mentor-detail-view.tsx` (sección "Elige un horario", líneas ~389-520)
- `src/lib/catalog/format.ts` y `format.test.ts`

## Archivos a tocar
- `src/components/catalog/mentor-detail-view.tsx`
- `src/lib/catalog/format.ts`, `src/lib/catalog/format.test.ts`
- Tests existentes de la ficha si fallan (`grep -rl MentorDetailView src`)

## Pasos
1. **Aviso arriba.** Cuando no hay sesión (`!user`), muestra justo debajo del encabezado "Elige un horario" (antes de la lista de horarios) un bloque `Alert tone="info"` con el texto `Para reservar necesitas una cuenta de mentorada. Es gratis.` y dos enlaces: `Crear cuenta` → `/register` (botón primario, `buttonClassName({ size: "sm" })`) e `Iniciar sesión` → `/login` (variante `secondary`). Elimina el bloque `!user` de abajo (el de "Inicia sesión como mentorada…") para no repetirlo.
2. **Menos días.** Muestra solo los primeros 5 grupos de días (`groups`). Si hay más, un botón `Ver más días` (variant secondary) agrega 5 más cada vez. Reinicia a 5 cuando cambian la oferta o las fechas.
3. **Rango de fechas plegado.** Mueve los dos inputs "Desde"/"Hasta" dentro de un `<details>` con `<summary>` `Cambiar fechas`, debajo del encabezado. Mantén su lógica actual intacta.
4. **Fechas en español.** Crea `formatDayHeading(day: string): string` en `format.ts` que, dado `AAAA-MM-DD`, devuelva p. ej. `Martes 18 de noviembre` (solo la primera letra en mayúscula; usa `Intl.DateTimeFormat("es-PE", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })` sobre `${day}T12:00:00Z`; si la fecha es inválida devuelve `day`). Úsala en lugar de `formatLocalDay` (bórrala si queda sin uso) y quita la clase CSS `capitalize` del `<h3>`. Tests: fecha normal, primera letra mayúscula y el resto igual, fecha inválida.
5. **Tamaño táctil.** Los botones de horario tienen al menos 44 px de alto (`min-h-11`) y `px-4`; el texto puede pasar a `text-sm`.

## Criterio de terminado
- [ ] Sin sesión, el aviso con `Crear cuenta` / `Iniciar sesión` aparece antes de los horarios y no hay otro aviso de login más abajo.
- [ ] Máximo 5 días visibles al cargar; `Ver más días` funciona y desaparece cuando ya no hay más.
- [ ] Los encabezados de día dicen `Martes 18 de noviembre` (no `Martes 18 De Noviembre`).
- [ ] Tests de `formatDayHeading`.
- [ ] `scripts/gate.sh` del web en verde.

## Fuera de alcance
- Cambiar la API, el flujo de reserva para mentoradas con sesión, el resto de la ficha, o agregar fotos.

## Bitácora
| Fecha | Quién | Qué pasó |
|---|---|---|

## Cierre

Completado y fusionado en el web (`main`, commit `397603d`).
