# Índice de documentación (para humanos y agentes)

Steam Society: plataforma de mentorías STEAM para mujeres. Este repo es el backend (NestJS 12). Los documentos son la fuente de verdad: si el código los contradice, se pregunta antes de cambiar nada.

| Documento | Qué contiene | Léelo cuando… |
|---|---|---|
| `PROGRESS.md` | Estado vivo: etapa actual, hecho, pendiente, decisiones recientes | SIEMPRE, al empezar y al terminar |
| `DEMO.md` | Guion de demo de 5 minutos y cuentas ficticias | Al preparar o ejecutar una demo |
| `PAYMENTS.md` | Módulo de pagos desacoplado: diagramas, invariantes, cómo conectar un proveedor real o quitarlo | Antes de tocar pagos o elegir pasarela |
| `FLOWS.md` | Mapa visual: sistema, módulos, capas, recorridos, estados, dónde tocar qué | Antes de una tarea en un área que no conoces |
| `GOLDEN-PRINCIPLES.md` | 14 reglas concretas nacidas de errores reales | Antes de implementar o revisar |
| `HARNESS.md` | Arnés de agentes: gate, reglas en código, roles, delegación, limpieza | Al planificar o delegar tareas |
| `exec-plans/` | Plantilla, planes activos y completados, deuda técnica | Al planificar o retomar una tarea |
| `harness/` | Roles de agentes, tareas recurrentes y bitácora de fallas | Al delegar o al mejorar el arnés |
| `SKILLS.md` | Registro y política de skills: fuente, hash, fecha, banderas y permiso | Revisas o actualizas una skill |
| `01-PRODUCT.md` | Roles, reglas de negocio R-xx, flujos, alcance por hito, glosario | Implementas cualquier funcionalidad |
| `02-ARCHITECTURE.md` | Monolito modular, contextos, hexagonal selectiva, carpetas, reglas entre módulos | Creas un módulo o dudas dónde va el código |
| `03-DATA-MODEL.md` | Diagramas ER, diccionario de tablas, restricciones, invariantes, migraciones por hito | Tocas el esquema o consultas la base |
| `04-STATE-MACHINES.md` | Estados y transiciones (reserva, sesión, perfil de mentora, pago) | Implementas reservas, aprobaciones o pagos |
| `05-ROADMAP.md` | Etapas del Hito 1 con criterios de aceptación, hitos 2 a 4, riesgos y spikes, bosquejo de API | Empiezas una etapa |
| `06-CONVENTIONS.md` | Estilo, nombres, API REST, errores, tests, git, seguridad | Escribes o revisas código |
| `07-DECISIONS.md` | ADRs aceptados y decisiones PENDIENTES (no las tomes tú) | Te topas con una elección técnica |
| `08-MATCHING.md` | Especificación del recomendador explicable | Etapa 1.6 |
| `discovery/00-README.md` | Paquete de descubrimiento y diseño para producción (01–08): hardcodes, configuración/roles, readiness, release, infraestructura gratuita, NFR, admin v2 y roadmap v3 | Planificas el paso a producción real; no reemplaza los documentos 01–08 |

## Convenciones de los documentos
- Marcas de confianza: **[verificado]** (visto en documentación oficial), **[inferido]** (razonado, sin verificar), **[a confirmar]** (requiere comprobación o experto).
- `[PLACEHOLDER]` marca un valor provisorio que el equipo de producto debe confirmar.
- Idioma: documentos y UI en español; identificadores de código, tablas y commits en inglés.
