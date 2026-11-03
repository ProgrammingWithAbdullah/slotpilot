# One image serves everything: the API, Socket.IO and the built React app (single origin).
ARG NODE_IMAGE=node:22-alpine

# ---- build: install all deps, compile shared + api + web ----
FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund
COPY tsconfig.base.json ./
COPY packages packages
COPY apps apps
COPY db db
RUN npm run build

# ---- runtime: production deps only + compiled output ----
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    PORT=10000 \
    WEB_DIST_DIR=/app/apps/web/dist \
    DB_DIR=/app/db
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev --no-audit --no-fund \
    && npm cache clean --force
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/web/dist apps/web/dist
COPY db db
USER node
EXPOSE 10000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:${PORT}/health || exit 1
# Migrate, seed a brand-new database once, then start the server.
CMD ["npm", "start", "-w", "@slotpilot/api"]
