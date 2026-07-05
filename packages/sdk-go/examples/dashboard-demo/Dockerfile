# Build from the repo root: docker build -f packages/sdk-go/examples/dashboard-demo/Dockerfile packages/sdk-go
FROM golang:1.24-bookworm AS builder
WORKDIR /src
COPY . .
RUN CGO_ENABLED=0 go build -o /dashboard-demo ./examples/dashboard-demo

FROM gcr.io/distroless/static-debian12
COPY --from=builder /dashboard-demo /dashboard-demo
EXPOSE 8080
ENTRYPOINT ["/dashboard-demo"]
