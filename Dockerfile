# syntax=docker/dockerfile:1.7

ARG NODE_IMAGE=node:24.22.1-bookworm-slim

FROM ${NODE_IMAGE} AS build
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM ${NODE_IMAGE} AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0
ENV FREEAPI_DB_PATH=/app/data/llmapi.db

COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN mkdir -p /app/data /app/backups \
  && chown -R node:node /app/data /app/backups

ARG LLMAPI_COMMIT_SHA
ENV LLMAPI_COMMIT_SHA=${LLMAPI_COMMIT_SHA}

USER root
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3001) + '/livez').then((res) => { if (!res.ok) process.exit(1); }).catch(() => process.exit(1));"

CMD ["node", "dist/index.js"]
