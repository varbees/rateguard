# syntax=docker/dockerfile:1.7

FROM oven/bun:1.2.5-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN apk add --no-cache ca-certificates libc6-compat

FROM base AS deps
COPY apps/dashboard/package.json apps/dashboard/bun.lock ./apps/dashboard/
WORKDIR /app/apps/dashboard
RUN bun install --frozen-lockfile

FROM base AS builder
ARG NEXT_PUBLIC_API_URL=http://localhost:8008
ARG NEXT_PUBLIC_WS_URL=ws://localhost:8008
ARG RATEGUARD_INTERNAL_API_URL=http://gateway:8008
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_WS_URL=${NEXT_PUBLIC_WS_URL}
ENV RATEGUARD_INTERNAL_API_URL=${RATEGUARD_INTERNAL_API_URL}
COPY --from=deps /app/apps/dashboard/node_modules ./apps/dashboard/node_modules
COPY apps/dashboard/ ./apps/dashboard/
WORKDIR /app/apps/dashboard
# Clear TypeScript build cache to ensure fresh type-checking.
# Next.js's build-time type checker is stricter than `tsc --noEmit` and
# can cache stale type info from previous builds, causing false positives.
RUN rm -rf tsconfig.tsbuildinfo .next/cache
RUN bun run build

FROM base AS runner
ARG NEXT_PUBLIC_API_URL=http://localhost:8008
ARG NEXT_PUBLIC_WS_URL=ws://localhost:8008
ARG RATEGUARD_INTERNAL_API_URL=http://gateway:8008
ARG DASHBOARD_PORT=3001
ENV NODE_ENV=production
ENV PORT=${DASHBOARD_PORT}
ENV HOSTNAME=0.0.0.0
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_WS_URL=${NEXT_PUBLIC_WS_URL}
ENV RATEGUARD_INTERNAL_API_URL=${RATEGUARD_INTERNAL_API_URL}

RUN addgroup -S nextjs -g 1001 && adduser -S nextjs -u 1001 -G nextjs

WORKDIR /app/apps/dashboard
COPY --from=builder --chown=nextjs:nextjs /app/apps/dashboard/public ./public
COPY --from=builder --chown=nextjs:nextjs /app/apps/dashboard/.next/standalone ./
COPY --from=builder --chown=nextjs:nextjs /app/apps/dashboard/.next/static ./.next/static

USER nextjs
EXPOSE 3001

CMD ["node", "server.js"]
