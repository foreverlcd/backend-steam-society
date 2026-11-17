# F1 web: imagen Docker y CI

- **Repo:** web
- **Dificultad:** media (sonnet)
- **Rama:** feat/f1-foundation

## Objetivo
Imagen de producción del web y CI en GitHub Actions que corre el gate del web, sin cuentas externas.

## Contexto mínimo
- AGENTS.md, package.json, next.config.ts, scripts/gate.sh, .env.example
- ../backend-steam-society/docs/HARNESS.md

## Archivos a tocar
- `next.config.ts` (añadir `output: "standalone"` sin quitar nada)
- `Dockerfile`, `.dockerignore` (nuevos)
- `.github/workflows/ci.yml` (nuevo)
- `README.md` (sección corta "Despliegue")

## Pasos
1. `output: "standalone"` en `next.config.ts`.
2. `Dockerfile` multi-stage con `node:24-alpine` (versión menor exacta), pnpm vía corepack, `pnpm install --frozen-lockfile`, `pnpm build`; runtime copia `.next/standalone`, `.next/static` y `public` si existe; usuario no root; `EXPOSE 3001`; `ENV PORT=3001 HOSTNAME=0.0.0.0`; `CMD ["node","server.js"]`. `NEXT_PUBLIC_API_URL` se inyecta en build con `ARG` (es pública, va en el bundle): documéntalo.
3. `.dockerignore`: `.env*` (salvo `.env.example`), `node_modules`, `.next`, `.git`, `.harness`, `.shots`, `.claude`.
4. `ci.yml`: push y pull_request; Node 24; pnpm con caché; `pnpm install --frozen-lockfile`; `bash scripts/gate.sh`; job aparte `docker build` (sin push). Permisos `contents: read`.
5. Verifica: `docker build --build-arg NEXT_PUBLIC_API_URL=http://localhost:3000/v1 .` y que el contenedor responde 200 en `/login` (puerto distinto de 3001 si está ocupado). NUNCA leas `.env.local`.

## Criterio de terminado
- [ ] `docker build` OK y `/login` responde 200 desde el contenedor.
- [ ] `scripts/gate.sh` en verde.
- [ ] README con la sección de despliegue.

## Fuera de alcance
- Dependencias nuevas, publicar imágenes, cuentas externas.

## Bitácora
| Fecha | Quién | Qué pasó |
|---|---|---|
| 2026-11-17 | sonnet (implementador) | Dockerfile standalone, CI y README. |
| 2026-11-17 | opencode deepseek (revisor) | MEDIA: CI con clon superficial → el escaneo de secretos no revisaba nada (también afectaba al backend). BAJA: `.dockerignore` incompleto; CI sin prueba de humo de la imagen. Todo aplicado. |
| 2026-11-17 | planificador | Imagen 299 MB, no root, `/login` y estáticos 200. pnpm fijado; `pnpm/action-setup` sin versión porque `packageManager` ya la declara. |
