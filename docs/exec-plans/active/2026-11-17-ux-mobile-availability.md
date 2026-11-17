# UX quick win: móvil y disponibilidad de la mentora

- **Repo:** web (`../frontend-steam-society`)
- **Dificultad:** media → implementa `sonnet`, revisa `agy`
- **Rama:** feat/ux-quick-wins

## Objetivo
La mentora configura su disponibilidad sin jerga ni trabajo repetitivo, y en el celular cualquier usuaria puede navegar (hoy, por debajo de `sm`, el menú desaparece).

## Contexto mínimo
- `AGENTS.md` (UI, accesibilidad, mobile-first)
- Los archivos de abajo.

## Archivos a tocar
- `src/components/layout/app-header.tsx`
- `src/components/dashboard/availability-view.tsx`
- `src/components/catalog/catalog-view.tsx` (solo tamaños de chips y filtros)
- Tests existentes que fallen (`grep -rl` por el nombre del componente)

## Pasos
1. **Menú móvil (`app-header.tsx`).** El `<nav>` actual es `hidden sm:flex`. Agrega, solo para pantallas pequeñas (`sm:hidden`), una segunda fila debajo de la barra superior con los MISMOS enlaces que muestra el `<nav>` según el rol (reutiliza la lista; no la dupliques a mano: extrae un arreglo o componente `NavLinks`). Desplazable en horizontal (`overflow-x-auto`), cada enlace con al menos 44 px de alto (`min-h-11`), con `aria-label="Navegación principal"` y el enlace activo marcado igual que en escritorio (`aria-current="page"` si ya existe esa lógica; si no existe, no la inventes).
2. **Zona horaria (`availability-view.tsx`).**
   - Si la API no devuelve zona (o devuelve vacío), usa la del navegador: `Intl.DateTimeFormat().resolvedOptions().timeZone`, y si no existe, `America/Lima`.
   - Muestra la zona como texto (`Tu zona horaria: America/Lima`) con un botón `Cambiar` que revela el input actual. Quita cualquier mención a "IANA".
3. **Horario sugerido.** Si la mentora no tiene reglas, muestra un botón `Usar horario sugerido (lun a vie, 18:00 a 21:00)` que crea 5 reglas (weekday 1 a 5, `18:00`–`21:00`, zona actual) en el formulario, sin guardar. La mentora luego pulsa el botón de guardar existente.
4. **Tamaños táctiles.** Los chips y botones de filtros de `catalog-view.tsx` y los botones de agregar/quitar regla en disponibilidad miden al menos 44 px de alto (`min-h-11`). No cambies colores ni la disposición.

## Criterio de terminado
- [ ] Con viewport 390 px, una mentora ve y puede tocar Inicio, Ofertas, Disponibilidad, Reservas y Perfil; una mentorada, sus enlaces.
- [ ] Disponibilidad sin reglas: aparece `Usar horario sugerido…` y llena 5 filas.
- [ ] La zona se ve como texto con `Cambiar`; no aparece "IANA".
- [ ] `scripts/gate.sh` del web en verde.

## Fuera de alcance
- Cambiar la API, el contrato de disponibilidad o el diseño de escritorio del header.

## Bitácora
| Fecha | Quién | Qué pasó |
|---|---|---|
