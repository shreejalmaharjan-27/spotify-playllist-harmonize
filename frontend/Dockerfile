# Multi-stage Next.js build -> small standalone runtime.
FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# --ignore-scripts: skip native build scripts (sharp, unrs-resolver) we don't
# need (we use plain <img>, not next/image), and which otherwise make pnpm 11
# exit non-zero on ERR_PNPM_IGNORED_BUILDS.
RUN pnpm install --frozen-lockfile --ignore-scripts

FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
# NEXT_PUBLIC_* is inlined at build time; the browser calls the API directly.
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
