# Skills: registro y política

Última revisión: 2026-10-25.

## Política

- Solo se instala una skill después de una revisión de solo lectura de `SKILL.md`, `scripts/` y `references/`.
- No se usa `npx skills add` ni ningún CLI de instalación. Se copia únicamente la carpeta revisada a `.agents/skills/<id>/`, usando el `name` real del frontmatter como ID.
- No se ejecutan scripts de una skill durante la revisión ni después de instalarla.
- No hay auto-actualización. Cada actualización se revisa de nuevo antes de copiarla y se actualiza este registro con el nuevo hash.
- Las skills son apoyo para el agente; no sustituyen `AGENTS.md`, los documentos del proyecto ni las decisiones del desarrollador.
- Los permisos viven en `opencode.json` como lista ordenada de V2: gana la última regla que coincida. La regla general de skills es `ask`; las excepciones se declaran después.
- No se copian skills del repo web en el backend ni viceversa.

## Instaladas

| Skill (ID real) | Fuente | Commit | Fecha | Para qué sirve | Banderas revisadas | Permiso |
|---|---|---|---|---|---|---|
| `prisma-client-api` | https://github.com/prisma/skills | `ba3f9d73200bbb62e49733ab93a961fd138a2c18` | 2026-10-25 | Referencia de Prisma Client 7: consultas, filtros, relaciones, transacciones, raw queries y métodos del cliente. | Sin `allowed-tools`, sin comandos `!`, sin shell/red/instalaciones, sin scripts. Los ejemplos usan `PrismaPg`/`adapter`; `process.on('beforeExit')` es de Node, no `$on('beforeExit')` de Prisma. | `allow` |
| `supabase-postgres-best-practices` | https://github.com/supabase/agent-skills | `c9be0e931b7930f7d02126d04774d904c381e7d7` | 2026-10-25 | Buenas prácticas de PostgreSQL: índices, esquema, constraints, RLS, locks, pooling y diagnóstico de consultas. | Sin `allowed-tools`, sin comandos `!`, sin red/instalaciones, sin scripts. Solo SQL y enlaces de documentación; `_contributing.md` menciona `pnpm test` como guía para contribuir al repo de la skill, no como instrucción de uso. Menciona funciones de Supabase (RLS, `pg_cron`, `pgvector`); es referencia, no una instrucción de adopción. | `ask` (la regla general `skill * ask` cubre el ID real; se conserva la regla explícita `postgres-best-practices` como alias solicitado) |

## No instaladas

| Skill | Fuente | Commit | Fecha | Para qué sirve | Banderas revisadas | Permiso |
|---|---|---|---|---|---|---|
| `prisma-cli` | https://github.com/prisma/skills | `ba3f9d73200bbb62e49733ab93a961fd138a2c18` | 2026-10-25 | Referencia de la CLI de Prisma ORM 7: `init`, `generate`, `migrate`, `db`, `dev`, `studio` y `mcp`. | `prisma init` intenta instalar automáticamente `prisma/skills`; varias referencias usan `npx prisma ...` y `bunx`; incluye comandos destructivos (`migrate reset`, `db push --force-reset`, `--accept-data-loss`) aunque con checkpoint de consentimiento. Sin `allowed-tools`, sin comandos `!` y sin scripts ejecutables. | No instalada; pendiente de decisión del desarrollador |

## Notas

- El clon fue superficial (`git clone --depth 1`) y se conserva en `/tmp/prisma-skills` y `/tmp/supabase-agent-skills` para auditoría; no se versiona.
- No se copió `prisma-cli` por la instalación automática de skills y el uso de `npx`/`bunx`, que chocan con la política de no auto-actualización y con el uso de `pnpm` del proyecto.
- No se copió ninguna skill de `vercel-labs/agent-skills`: corresponde al repo web.
