# API image (multi-arch: builds natively on the Oracle ARM VM). Build from the repository root:
#   docker build -f deploy/api.Dockerfile -t accountability-api .

FROM node:22-alpine AS build
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
# The schema is needed by the postinstall `prisma generate`.
COPY apps/api/prisma apps/api/prisma
COPY apps/api/prisma.config.ts apps/api/
RUN npm ci --workspace @accountability/api --include-workspace-root=false --no-audit --no-fund \
 RUN npm ci --workspace @accountability/api --include-workspace-root=false --no-audit --no-fundRUN npm ci --workspace @accountability/api --include-workspace-root=false --no-audit --no-fund mkdir -p apps/api/node_modules
COPY apps/api apps/api
RUN npm run build -w apps/api \
 # Download the schema engine now so `prisma migrate deploy` works offline at runtime.
 && cd apps/api && npx prisma --version >/dev/null

FROM node:22-alpine
RUN apk add --no-cache openssl tini
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=node:node /app/apps/api/prisma ./apps/api/prisma
COPY --from=build --chown=node:node /app/apps/api/prisma.config.ts ./apps/api/prisma.config.ts
COPY --from=build --chown=node:node /app/apps/api/node_modules ./apps/api/node_modules
COPY --chown=node:node deploy/start.sh /app/start.sh
RUN mkdir -p /data/storage && chown node:node /data/storage && chmod +x /app/start.sh
USER node
WORKDIR /app/apps/api
EXPOSE 4000
# Listens on API_PORT, else PORT (set by hosts such as Render), else 4000.
ENV NODE_OPTIONS=--max-old-space-size=384
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 CMD sh -c 'wget -qO- "http://127.0.0.1:${API_PORT:-${PORT:-4000}}/health" >/dev/null || exit 1'
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["/app/start.sh"]
