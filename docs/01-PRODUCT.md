# 01 · Producto y reglas de negocio

## Visión
Steam Society conecta a mujeres con mentoras en carreras STEAM. Mercado inicial: Perú; luego Latinoamérica. Es un MVP para concursos de startups y portafolio, con intención de desplegarse después con usuarias y dinero reales. Un solo desarrollador.

## Roles (una cuenta = un solo rol)
| Rol | Cómo se obtiene | Puede |
|---|---|---|
| `mentee` | Registro público | Hacer onboarding, ver recomendadas y catálogo, solicitar sesiones, cancelar, calificar (Hito 3) |
| `mentor` | Registro público | Completar perfil, crear ofertas, definir disponibilidad, aprobar o rechazar solicitudes |
| `admin` | Creada por el equipo (seed o manual); NUNCA por registro público | Aprobar mentoras, ver reservas y (Hito 2) el flujo de dinero |

Una mentora que quiera recibir mentoría necesita otra cuenta con otro correo (decisión de producto).

## Reglas de negocio
- **R-01** Un usuario tiene un solo rol: `mentee`, `mentor` o `admin`.
- **R-02** Una mentora aparece en el catálogo y las recomendaciones solo si su perfil está `approved` (lo aprueba un admin).
- **R-03** Una mentora tiene una o varias ofertas. Cada oferta es gratuita o de pago, con duración propia. Precio en entero de unidad mínima + moneda ISO 4217.
- **R-04** La disponibilidad pertenece a la mentora, no a la oferta. La duración de la oferta define el tamaño del bloque dentro de ese horario.
- **R-05** La mentee elige a su mentora. El sistema recomienda, nunca asigna.
- **R-06** Cada solicitud de sesión la aprueba la mentora. Si no responde en el plazo, la solicitud vence. Plazo: 48 h [PLACEHOLDER].
- **R-07** Las sesiones gratuitas nunca crean pagos ni asientos en el ledger.
- **R-08** Pagos y comisiones: Hito 2. La política de cancelación y reembolso es una decisión pendiente (DA-05).
- **R-09** La fecha de nacimiento se guarda en el registro. Aún NO hay lógica de menores (DA-01).
- **R-10** En el MVP las sesiones son 1:1. El modelo admite grupales, pero la API no las expone todavía.
- **R-11** Antelación mínima para reservar: 24 h [PLACEHOLDER]. Anticipación máxima: 60 días [PLACEHOLDER].
- **R-12** Una mentee no puede tener dos reservas activas que se solapen.
- **R-13** Toda recomendación muestra una razón derivada de los componentes reales del puntaje, nunca redactada libremente por un LLM.
- **R-14** Las fechas se guardan en UTC; cada usuario tiene una zona IANA (por defecto `America/Lima`).
- **R-15** Una mentora no puede tener dos sesiones activas solapadas.

## Flujo principal (Hito 1)
1. Registro (elige mentee o mentor, incluye fecha de nacimiento) → verificación de correo (por decidir en 1.2) → login.
2. Onboarding por rol (preguntas, áreas, idiomas, disponibilidad).
3. Mentora: completa perfil → admin aprueba → crea ofertas y disponibilidad.
4. Mentee: ve recomendadas (con razón) o explora el catálogo con búsqueda y filtros → elige oferta y horario → solicita.
5. Mentora acepta o rechaza → confirmada → la sesión usa un enlace de videollamada externo → se marca completada.

## Alcance por hito
| Hito | Contenido |
|---|---|
| 1 | Identidad, perfiles, onboarding, aprobación de mentoras, ofertas y disponibilidad, reserva 1:1 gratuita con aprobación, catálogo y recomendaciones con razón, notificaciones por correo básicas |
| 2 | Pagos en sandbox: cobro, comisión, pago a la mentora, reembolso, ledger de doble entrada, vista de transparencia del admin |
| 3 | Fotos de perfil (pipeline seguro), chat (WebSockets), reseñas, reportar y bloquear, recordatorios |
| 4 | Video propio 1:1 (condicional al spike) |
| Después | Sesiones grupales, cursos en vivo y grabados, sincronización de calendarios (.ics primero), paquetes, multi-moneda, CV y embeddings |

## Fuera de alcance del MVP
Cursos, grabación de sesiones, suscripciones y paquetes, app móvil nativa, multi-país, dinero real, lógica de menores, análisis de CV.

## Glosario
- **Mentora (`mentor`) / Mentee**: quien ofrece / quien recibe la mentoría.
- **Oferta (`offering`)**: lo que la mentora publica (título, duración, gratuita o precio).
- **Sesión (`session`)**: una sala con horario concreto, dueña de un bloque de tiempo de la mentora. Tiene capacidad (1 en el MVP).
- **Reserva (`booking`)**: el asiento de una mentee en una sesión, con su ciclo de estados.
- **Regla de disponibilidad (`availability_rule`)**: horario semanal recurrente en hora local + zona IANA.
- **Slot**: horario concreto reservable, calculado (no guardado) a partir de reglas menos sesiones existentes.
- **Ledger**: libro de doble entrada, inmutable, del dinero (Hito 2).
- **Matching**: filtros duros + puntaje ponderado y explicable (`08-MATCHING.md`).
