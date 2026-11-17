# Production image for the API. Generic: any PostgreSQL via DATABASE_URL.
# Targets: `runtime` (default, last stage) runs the API; `migrate` also has the
# dev tooling needed for `prisma migrate deploy` and the admin seed.

# ---- base: Node + pnpm pinned
FROM node:24.22.1-alpine AS base
# openssl: required by Prisma's schema engine on Alpine.
RUN apk add --no-cache openssl \
  && npm install -g pnpm@12.21.0
WORKDIR /app

# ---- build: install everything, generate Prisma client, compile
FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm db:generate && pnpm build

# ---- prod-deps: production node_modules only
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

# ---- migrate: full tooling to run migrations and seeds as a one-off command
FROM build AS migrate
ENV NODE_ENV=production
USER node
CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]

# ---- runtime: smallest image that serves the API
FROM base AS runtime
ENV NODE_ENV=production \
    PORT=3000
COPY --from=prod-deps /app/node_modules ./node_modules
# Prisma client is generated into src/generated and compiled into dist/.
COPY --from=build /app/dist ./dist
COPY package.json ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main"]
