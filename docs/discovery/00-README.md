# Descubrimiento y diseño para producción · Steam Society

**Fecha de auditoría:** 2026-11-01. **Rama:** `docs/discovery` (desde `develop`). **Alcance:** solo lectura y diseño; no se modificó código fuente, esquema ni tests.

Este paquete traduce el estado real de los repositorios backend (NestJS 12 + Prisma 7 + PostgreSQL 18) y web (Next.js 16.4) en un plan verificable para un piloto real y, después, para dinero real. No inicia ninguna etapa de desarrollo.

## Documentos

| Documento | Contenido | Decisión que habilita |
|---|---|---|
| `01-HARDCODES.md` | Inventario de valores embebidos, frontera estructura/valores y migración por etapas | Aprobar qué se gobierna desde admin y qué permanece en código |
| `02-CONFIG-ROLES.md` | Registro de ajustes, roles privilegiados, salvaguardas y matching versionado | Aprobar el modelo de configuración y permisos |
| `03-PRODUCTION-READINESS.md` | Checklist de producción con severidad y evidencia; auditoría backend | Aprobar bloqueantes y orden de cierre |
| `04-ENVIRONMENTS-RELEASE.md` | Ramas, CI/CD, migraciones, secretos, rollback y política del agente | Configurar GitHub y el pipeline |
| `05-FREE-INFRASTRUCTURE.md` | Proveedores gratuitos verificados y dos arquitecturas de costo cero | Elegir arquitectura y plan de salida |
| `06-NFR-CAPACITY.md` | Objetivos numéricos, capacidad, puntos calientes y pruebas de carga | Aprobar SLO y límites del piloto |
| `07-ADMIN-V2.md` | Especificación del admin v2, métricas, editores y accesibilidad | Priorizar el panel |
| `08-ROADMAP-V3.md` | Hallazgos no cubiertos, etapas, dependencias y preguntas abiertas | Aprobar el roadmap y responder preguntas |

## Método y evidencia

Cada afirmación lleva una de estas marcas:

- `[verificado con comando]`: ejecutado en este repositorio (git, tests, `ls`, `curl` local).
- `[leído en el código]`: archivo y línea del repositorio.
- `[verificado en documentación oficial: URL, 2026-11-01]`: `webfetch` a una página oficial; las citas literales tienen ≤15 palabras.
- `[supuesto]`: razonamiento sin verificación; debe validarse antes de convertirlo en compromiso.

Los límites de terceros cambian. Toda cifra de un proveedor debe revalidarse el día de la contratación; aquí se documenta la fecha de consulta.

## Repositorios y estado de partida

- Backend: `foreverlcd/backend-steam-society` (privado), `main` = `40de1ef`, 11 migraciones, 228 tests unitarios y 55 e2e verdes al cierre de 1.6. `[verificado con comando]`
- Web: `foreverlcd/frontend-steam-society` (privado), `main` = `f834ce8`, 65 tests, build y lint verdes. `[verificado con comando]`
- No hay nada desplegado, ni CI, ni Dockerfile de producción, ni OpenAPI generado. `[leído en el código]`
- `develop` y `docs/discovery` se crearon desde `40de1ef`; el paquete quedó publicado en `origin/docs/discovery` y `origin/develop`. El repo web aún no tiene `develop`. `[verificado con comando]`

## Regla de lectura

Los documentos `docs/01`–`docs/08` siguen siendo la fuente de verdad del producto y del esquema. Este paquete **no los reemplaza**: identifica brechas, propone diseño y marca lo que requiere decisión del desarrollador. Las decisiones pendientes de `docs/07-DECISIONS.md` no se tomaron por cuenta del agente.
