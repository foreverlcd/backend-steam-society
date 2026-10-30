# Steam Society: API (NestJS 12)

Plataforma de mentorías para acercar mujeres a carreras STEAM (Perú primero, luego Latinoamérica). Este repo es SOLO el backend; el frontend (Next.js) vive en otro repo.
Responde siempre en español. Código, identificadores y mensajes de commit van en inglés.

## Al empezar y al terminar CADA sesión
1. Lee `docs/PROGRESS.md`: estado actual, qué sigue, decisiones recientes.
2. Lee `docs/00-INDEX.md` y carga SOLO los documentos que la tarea necesite (lista abajo; no los cargues todos).
3. Al terminar: actualiza `docs/PROGRESS.md` (hecho, pendiente, decisiones, siguiente paso). Si cambió el esquema o una regla, actualiza también el documento correspondiente. Una tarea no está terminada si PROGRESS.md no lo refleja.

## Documentos (cárgalos bajo demanda con Read)
- Producto y reglas de negocio (R-01…): @docs/01-PRODUCT.md
- Arquitectura y estructura de carpetas: @docs/02-ARCHITECTURE.md
- Modelo de datos (ER, tablas, restricciones, invariantes): @docs/03-DATA-MODEL.md
- Máquinas de estado: @docs/04-STATE-MACHINES.md
- Hoja de ruta, etapas y criterios de aceptación: @docs/05-ROADMAP.md
- Convenciones de código, API, tests y seguridad: @docs/06-CONVENTIONS.md
- Decisiones (ADRs) y decisiones PENDIENTES: @docs/07-DECISIONS.md
- Especificación del matching: @docs/08-MATCHING.md

Los documentos son la fuente de verdad. Si el código y un documento se contradicen, o si el documento parece incorrecto o incompleto: DETENTE y pregunta. No lo cambies en silencio.

## Stack (cerrado; no propongas alternativas)
TypeScript, Node 24 LTS, pnpm, NestJS 12 (ESM, Vitest, oxlint), PostgreSQL 18 con Prisma 7 (adaptador PrismaPg), Docker Compose. Versiones reales: `package.json`.
- ESM: los imports relativos llevan `.js` (ej. `./app.module.js`).
- Tests con Vitest (`vi.fn()`, no `jest.fn()`).
- Prisma 7: generador `prisma-client`, salida en `src/generated/prisma` (no se versiona), el `datasource` NO lleva `url` (vive en `prisma.config.ts`), el cliente exige adaptador, no existe `$on('beforeExit')`. Fechas: `@db.Timestamptz(3)`.
- La API corre en el puerto 3000; el frontend en 3001 (`WEB_ORIGIN`).

## Modo de trabajo: ACELERADO
El desarrollador es el único dev y revisa por ETAPA, no por tarea.
- Sigue docs/05-ROADMAP.md etapa por etapa. Encadena las tareas de la etapa SIN pedir confirmación del plan. Solo te detienes en las condiciones de 'Detente y pregunta' o al cerrar la etapa.
- Una rama por etapa o tema. NUNCA commitees en main, NUNCA push, NUNCA reescribas historia: el desarrollador hace el merge.
- Calidad obligatoria (no se acelera): build, lint y test, y e2e cuando haya API y base de datos, en verde antes de cerrar. Test primero en reglas de negocio. Tests de invariantes en zonas rojas.
- Ya NO se exigen explicaciones didácticas, ejemplos cotidianos ni la lista 'qué debería poder explicar'.
- Al cerrar cada etapa, UN informe de máx. 25 líneas: qué se hizo, evidencia (comandos y resultados), decisiones tomadas dentro de lo permitido, riesgos, 'puntos para revisar con lupa' (obligatorio en zonas rojas), pasos de verificación manual y estado de PROGRESS.md.
- Las decisiones PENDIENTES de docs/07-DECISIONS.md siguen sin tomarse por tu cuenta.

## Detente y pregunta antes de
- Instalar una dependencia (justifícala: necesidad real, mantenimiento, licencia, tamaño).
- Operaciones destructivas: borrar o editar migraciones ya aplicadas, `docker compose down -v`, `rm -rf`, resetear la base.
- Cambiar el esquema de datos de forma distinta a `docs/03-DATA-MODEL.md`.
- Tocar algo fuera del alcance de la tarea.

## Veracidad
Tu conocimiento llega a mayo de 2025 y este proyecto usa versiones posteriores (NestJS 12, Prisma 7, Vitest, oxlint). Antes de escribir código con una librería, verifica la versión en `package.json` y la documentación oficial con webfetch. No inventes APIs, opciones ni comandos; si dudas, dilo. Cuando algo sea inferido y no verificado, márcalo.

## Seguridad
- Nunca leas, imprimas ni edites `.env`. Usa `.env.example`. Ningún secreto en el repo, en logs ni en commits.
- Nada de datos reales de usuarias.
- Lo que Prisma no expresa (exclusiones, CHECK, columnas generadas) va en migraciones SQL creadas con `--create-only`. Una migración ya aplicada no se edita: se crea otra.

## Definición de terminado (toda etapa)
`pnpm build`, `pnpm lint` y `pnpm test` en verde; migraciones aplicadas y probadas; tests nuevos para lo nuevo; documentos y PROGRESS.md actualizados; README al día si cambió cómo se levanta el proyecto; sin TODOs silenciosos (si queda algo, va a PROGRESS.md).
