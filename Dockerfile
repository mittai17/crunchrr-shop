# Crunchrr API — single-stage container (runtime is tsx by design; only the
# web app has an emit build). Works as-is on Fly.io, Railway, Render, or any
# Docker/VPS host. Secrets are injected at runtime — never baked in.
FROM node:22-alpine

# pnpm is pinned via "packageManager" in the root package.json.
RUN corepack enable

WORKDIR /repo

# Manifests first for layer-cached installs. All three manifests must be
# present for the frozen lockfile to match; the filtered install trims
# web-only dependencies out of the image.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @crunchrr/api...

# Sources — @crunchrr/shared ships raw .ts (imported directly by tsx).
COPY packages/shared packages/shared
COPY apps/api apps/api

ENV NODE_ENV=production
ENV API_HOST=0.0.0.0
ENV API_PORT=4001
EXPOSE 4001

# Graceful shutdown: SIGTERM hits the process group and server.ts closes
# the Fastify instance cleanly.
CMD ["pnpm", "--filter", "@crunchrr/api", "start"]
