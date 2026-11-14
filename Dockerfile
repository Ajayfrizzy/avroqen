FROM node:24.22.1-bookworm-slim@sha256:be8204d4bd327363357f532187b752ff62759c31bedf98e9e18fc08c9cbd605c AS base
RUN npm install --global pnpm@9.15.9
WORKDIR /app
RUN chown node:node /app
COPY --chown=node:node . .
USER node
RUN pnpm install --frozen-lockfile --ignore-scripts
ENV NEXT_TELEMETRY_DISABLED=1
FROM base AS api
CMD ["pnpm", "--filter", "@avroqen/api", "start"]
FROM base AS web
ARG API_INTERNAL_URL=http://api:3001
ENV API_INTERNAL_URL=${API_INTERNAL_URL}
RUN pnpm --filter @avroqen/web build
CMD ["pnpm", "--filter", "@avroqen/web", "start"]
