# Build from the repo root: docker build -f packages/sdk-node/examples/dashboard-demo/Dockerfile packages/sdk-node
FROM oven/bun:1 AS builder
WORKDIR /src
COPY . .
RUN bun install --frozen-lockfile && bun run build

FROM node:22-slim
WORKDIR /app
COPY --from=builder /src/dist ./dist
COPY --from=builder /src/examples/dashboard-demo/index.mjs ./examples/dashboard-demo/index.mjs
EXPOSE 8081
ENTRYPOINT ["node", "examples/dashboard-demo/index.mjs"]
