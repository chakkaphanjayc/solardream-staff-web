# syntax=docker/dockerfile:1.7
FROM node:24-alpine AS base

ENV NEXT_TELEMETRY_DISABLED=1 \
    NPM_CONFIG_UPDATE_NOTIFIER=false

RUN apk add --no-cache libc6-compat

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm ci --ignore-scripts --no-audit --no-fund

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_SITE_URL=https://solar-dream.org
ARG NEXT_PUBLIC_ADMIN_URL=https://admin.solar-dream.org
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_SERVER_ACTIONS_ENCRYPTION_KEY
ARG NEXT_DEPLOYMENT_ID
ENV SOLARDREAM_APP_SURFACE=staff \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_ADMIN_URL=$NEXT_PUBLIC_ADMIN_URL \
    NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=$NEXT_SERVER_ACTIONS_ENCRYPTION_KEY \
    NEXT_DEPLOYMENT_ID=$NEXT_DEPLOYMENT_ID

RUN npm run validate:production-env
RUN npm run build

FROM base AS runner
WORKDIR /app

ARG PORT=3200
ENV NODE_ENV=production \
    PORT=$PORT \
    HOSTNAME=0.0.0.0 \
    SOLARDREAM_APP_SURFACE=staff \
    NODE_OPTIONS=--max-old-space-size=1536 \
    NEXT_PUBLIC_SITE_URL=https://solar-dream.org \
    NEXT_PUBLIC_ADMIN_URL=https://admin.solar-dream.org

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
RUN mkdir -p .next/cache \
    && chown -R nextjs:nodejs .next

USER nextjs
EXPOSE 3200
STOPSIGNAL SIGTERM

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
    CMD-SHELL wget -q -O /dev/null --timeout=4 "http://127.0.0.1:${PORT}/api/health/live" || exit 1

CMD ["node", "server.js"]
