# Multi-stage build for the RateGuard dashboard (Next.js standalone output).
# Build from the repo root: docker build -f packages/dashboard/Dockerfile .

FROM node:22-slim AS builder
WORKDIR /app
COPY packages/dashboard/package.json ./
RUN npm install
COPY packages/dashboard/ ./
RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3001
ENV PORT=3001
# Next.js standalone mode otherwise tries to resolve the container's own
# hostname via getaddrinfo, which fails on Docker networks without name
# resolution for arbitrary container IDs — bind to all interfaces instead.
ENV HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
