# 06 · Convenciones

## Código
- TypeScript estricto. Prohibido `any` sin comentario que lo justifique. Preferir tipos explícitos en fronteras (DTOs, puertos).
- ESM: imports relativos con `.js`. Sin imports circulares entre módulos.
- Nombres: archivos `kebab-case.ts`; clases `PascalCase`; funciones y variables `camelCase`; constantes `UPPER_SNAKE_CASE`; tablas y columnas `snake_case` (ver `03-DATA-MODEL.md`).
- Identificadores, comentarios técnicos y commits en inglés. Textos para usuarias y documentos en español.
- Funciones pequeñas y con un solo propósito. Lógica de negocio en servicios o dominio, nunca en controllers. Sin lógica en los DTOs más allá de la validación.
- Comentarios para el porqué, no para el qué. Sin código muerto ni TODOs silenciosos (lo pendiente va a `PROGRESS.md`).
- Formato y lint: `pnpm lint` (oxlint) debe estar limpio. Respetar el formateador configurado en el repo.

## Módulos NestJS
Checklist para crear uno: carpeta en `src/modules/<contexto>/` · `*.module.ts` que importa solo lo que usa (incluido `PrismaModule` si accede a datos) · exporta únicamente el servicio público · estilo según `02-ARCHITECTURE.md` · tests junto al código (`*.spec.ts`) · registrar en `AppModule` · actualizar `PROGRESS.md`.

## API REST
- Prefijo `/v1` (excepto `/health`). Recursos en plural, verbos HTTP correctos, códigos de estado correctos (201 al crear, 204 sin cuerpo, 400 validación, 401 sin sesión, 403 sin permiso, 404, 409 conflicto, 422 si aplica, 503 dependencia caída).
- Fechas en ISO 8601 UTC con `Z`. IDs uuid. Paginación por cursor: `?limit=&cursor=` y respuesta con `nextCursor`.
- Formato de error uniforme [propuesta; confirmar en 1.2]: `{ "statusCode": 409, "code": "BOOKING_SLOT_TAKEN", "message": "…", "details": [] }`. `code` estable para el frontend. Nunca devolver trazas ni mensajes internos.
- Los errores de dominio son clases propias; un filtro global de excepciones los traduce a HTTP. El dominio no conoce HTTP.
- Documentar con OpenAPI (`@nestjs/swagger`): verificar compatibilidad con NestJS 12 antes de instalar. El contrato OpenAPI es lo que consume el repo web (tipos generados).
- Validación de entradas: **PENDIENTE P-02** (class-validator o esquemas Standard Schema/Zod soportados por Nest 12). Hasta decidir, no escribir DTOs nuevos con validación.

## Base de datos y Prisma
- Todo cambio de esquema pasa por migración con nombre descriptivo. Jamás editar una migración aplicada.
- Operaciones que deben ser atómicas van en transacción. Reglas de concurrencia (bloqueo `FOR UPDATE`) documentadas en el código y probadas.
- Nada de SQL concatenado con entradas del usuario. Consultas crudas solo con parámetros (plantillas etiquetadas de Prisma).
- El dominio de los módulos hexagonales no importa tipos de Prisma.
- Hora: usar siempre el puerto `Clock` en lógica de negocio (nunca `new Date()` directo), para poder probar con tiempo fijo.

## Tests (Vitest)
- Pirámide: muchos unitarios de dominio, algunos de integración con PostgreSQL real (base `steam_society_test`, aislada de la de desarrollo), pocos de extremo a extremo para flujos críticos.
- Un test prueba una cosa y su nombre dice qué comportamiento verifica. No testear el literal que acabas de escribir; testear el contrato.
- El controller se prueba delegando en el service; el service, con dobles de sus dependencias. No duplicar asertos entre capas.
- Reglas de negocio: test primero. Zonas rojas: tests de invariantes obligatorios (concurrencia, transiciones, dinero).
- Dobles: `vi.fn()` y `{ provide: X, useValue: falso }` en `Test.createTestingModule`. Si Nest no resuelve una dependencia en el test, probar `@Inject(Clase)` explícito [a confirmar con la documentación de Nest 12].

## Git
- Ramas `feat/<etapa>-<tema>`, `fix/<tema>`, `chore/<tema>`, `docs/<tema>`. Nunca commitear en `main`. El agente no hace `push`.
- Commits pequeños y atómicos, Conventional Commits en inglés: `feat(db): add area model`, `test(health): cover db down`, `docs: update progress`.
- Antes de pedir revisión: `pnpm build && pnpm lint && pnpm test` en verde y `git diff main...HEAD` leído por el propio agente.
- `src/generated/`, `.env`, `dist/` y `node_modules/` no se versionan.

## Seguridad y privacidad
- Secretos solo en `.env` (fuera de git). `.env.example` sin secretos reales. Nunca registrar contraseñas, tokens ni datos personales en logs.
- Autenticación y autorización: denegar por defecto; toda ruta protegida declara su rol; verificar pertenencia del recurso (una usuaria solo accede a lo suyo).
- Respuestas de auth que no revelan si un correo existe. Limitar intentos. Hash de contraseñas con algoritmo moderno y parámetros recomendados [a confirmar con la documentación oficial al implementar].
- Entradas validadas siempre; salidas sin campos internos (hash, tokens, `deleted_at`).
- CORS con lista explícita de orígenes (`WEB_ORIGIN`); nunca `*` con credenciales.
- Datos personales: mínimos necesarios. La fecha de nacimiento se guarda pero la lógica de menores está aplazada (DA-01). Aviso de privacidad y consentimiento: DA-04 [a confirmar con un abogado] antes del primer piloto.
- Dependencias: justificar cada una; revisar mantenimiento y licencia. Versiones fijas en el lockfile. Aprobar scripts de instalación de pnpm solo para paquetes necesarios (`pnpm-workspace.yaml`).

## Configuración
Variables validadas al arrancar (fallar rápido y con mensaje claro si falta una). Lista actual: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `DATABASE_URL`, `WEB_ORIGIN` (+ `PORT` opcional). Toda variable nueva va a `.env.example` y al README.
