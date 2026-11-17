# UX quick win: textos claros y sin jerga

- **Repo:** web (`../frontend-steam-society`)
- **Dificultad:** baja → implementa `haiku`, revisa `codex`
- **Rama:** feat/harness (prueba piloto del arnés)

## Objetivo
Que una estudiante entienda en 5 segundos qué ofrece la app y nunca vea jerga técnica. Solo textos y un estado vacío con acción; sin cambios de diseño ni de API.

## Contexto mínimo
- `AGENTS.md` (sección UI: español, tono, accesibilidad)
- Los archivos de abajo. Nada más.

## Archivos a tocar
- `src/app/page.tsx`
- `src/components/dashboard/recommendations-section.tsx`
- `src/components/dashboard/bookings-view.tsx`
- `src/components/dashboard/availability-view.tsx`
- `src/components/onboarding/onboarding-complete.tsx`
- `src/components/dashboard/dashboard-view.tsx`
- `src/app/(app)/onboarding/page.tsx`
- Tests existentes que fallen por estos textos (búscalos con grep).

## Pasos
1. `src/app/page.tsx`:
   - Cambia el `<h1>` por: `Conversa gratis 1 a 1 con una profesional STEAM.`
   - Cambia el párrafo de abajo por: `Elige una mentora de ciencia, tecnología, ingeniería, arte o matemáticas, reserva un horario y recibe el enlace de la videollamada. Así de simple.`
2. `recommendations-section.tsx`:
   - Reemplaza la etiqueta `{Math.round(score)} pts` por un texto según el puntaje: `score >= 80` → `Muy buena coincidencia`; `score >= 60` → `Buena coincidencia`; en otro caso → `Coincidencia`. Hazlo en una función pura `matchLabel(score: number): string` exportada desde el mismo archivo, con test unitario en un archivo nuevo `recommendations-section.test.ts` junto al componente.
   - Si la oferta más barata tiene `priceMinor === 0`, muestra `Sesión gratuita` en lugar de `Desde Gratis`. Si no, deja `Desde <precio>`.
3. `bookings-view.tsx`:
   - Estado vacío: si `role === "mentee"` muestra `Aún no tienes reservas.` y un enlace `Explorar mentoras` a `/mentors` (usa `Link` de `next/link` y `buttonClassName` como en `src/app/page.tsx`). Si es mentora: `Aún no tienes solicitudes. Revisa que tus ofertas y tu disponibilidad estén completas.` con un enlace `Ir a disponibilidad` a `/dashboard/availability`.
   - Oculta la opción de filtro `awaiting_payment` ("Por pagar") cuando `paymentsEnabled` es `false`.
4. `availability-view.tsx`: cambia `Formato IANA, por ejemplo America/Lima.` por `Por ejemplo America/Lima (hora de Perú).`
5. Cambia el texto visible "Onboarding" por "Tus intereses" en: título de `src/app/(app)/onboarding/page.tsx`, `onboarding-complete.tsx` (`Onboarding completo` → `Tus intereses están listos`) y los textos visibles de `dashboard-view.tsx` (`title="Onboarding"` y `Onboarding guiado, paso a paso.` → `Cuéntanos tus intereses, paso a paso.`). NO renombres componentes, tipos ni archivos.

## Criterio de terminado
- [ ] Ningún texto visible contiene: `pts`, `IANA`, `Onboarding`, `Desde Gratis`.
- [ ] Test unitario de `matchLabel` (los 3 rangos y los bordes 80 y 60).
- [ ] `scripts/gate.sh` del web en verde.

## Fuera de alcance
- Cambiar estilos, layouts, el admin (`admin-view.tsx`), el registro, o la API.
- Fotos de mentoras, menú móvil, calendario (son otros planes).

## Bitácora
| Fecha | Quién | Qué pasó |
|---|---|---|
| 2026-11-17 | haiku (implementador) | Ronda 1 DONE, gate verde. Avisó que el criterio "sin Onboarding" no se podía cumplir con la lista de archivos del plan (error del planificador). |
| 2026-11-17 | opencode deepseek-v4.1-flash-free (revisor) | CAMBIOS: 1 ALTA, 2 MEDIA y 5 BAJA. El planificador acepta 6 (ronda 2) y descarta la de tests de BookingsView (va a deuda técnica) y la del h1 (se resuelve quitando "gratis"). |

| 2026-11-17 | haiku (implementador) | Ronda 2 DONE, gate verde; avisó 2 textos fuera de su lista. |
| 2026-11-17 | opus (planificador) | Corrigió esos 2 textos, gate verde y `ui-shots` revisado (escritorio y móvil). Integrado. |

## Ronda 2 (correcciones de la revisión)

Archivos adicionales permitidos: `src/components/onboarding/onboarding-card.tsx`, `src/components/onboarding/onboarding-view.tsx`, `src/components/onboarding/onboarding-progress.tsx`, `src/components/onboarding/onboarding-view.test.tsx`, `src/lib/catalog/format.ts`, `src/lib/catalog/format.test.ts`.

1. **Sin "onboarding" visible.** Reemplaza cada texto visible (incluidos `aria-label` y mensajes de carga o error) que diga "onboarding" u "Onboarding" en `onboarding-card.tsx`, `onboarding-view.tsx`, `onboarding-progress.tsx`, `recommendations-section.tsx` y `dashboard-view.tsx`. Usa "tus intereses" o "el cuestionario de intereses" según la frase. Ejemplos: `Finalizar onboarding` → `Finalizar cuestionario`, `Completa tu onboarding` → `Completa tus intereses`, `Ir al onboarding` → `Completar mis intereses`, eyebrow `Onboarding` → `Tus intereses`. Actualiza los asertos de `onboarding-view.test.tsx`. NO cambies nombres de componentes, tipos, rutas (`/onboarding`) ni archivos.
2. **Mueve `matchLabel` y `priceLabel`** a `src/lib/catalog/format.ts` (exportadas). Borra `recommendations-section.test.ts` y pon sus tests en `format.test.ts`, agregando tests de `priceLabel`: gratis por `isFree: true`, gratis por `priceMinor === 0` y de pago (`Desde S/ …`, con el formato que devuelve `formatPrice`).
3. **`priceLabel`** considera gratuita la oferta si `isFree || priceMinor === 0`.
4. **Badge** de coincidencia en `recommendations-section.tsx`: agrega `className="shrink-0 whitespace-nowrap"`.
5. **`src/app/page.tsx` h1:** `Conversa 1 a 1 con una profesional STEAM.` (sin "gratis": hay ofertas de pago).
6. **`bookings-view.tsx`:** `paymentsEnabled` pasa a `boolean | null` (null = cargando). No renderices la fila de filtros de estado hasta que no sea `null`; si la carga de config falla, trátalo como `false`.

Criterio: todo lo de la ronda 1, `grep -rni "onboarding" src/components --include=*.tsx` sin coincidencias en textos visibles (los identificadores no cuentan) y `scripts/gate.sh` en verde.
