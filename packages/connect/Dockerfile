# connect's go.mod replaces the SDK via a relative "../sdk-go" path, so the
# build context must include both directories — use "packages/" (or the repo
# root), not "packages/connect" alone:
#   docker build -f packages/connect/Dockerfile packages
FROM golang:1.24-bookworm AS builder
WORKDIR /src
COPY sdk-go ./sdk-go
COPY connect ./connect
WORKDIR /src/connect
RUN CGO_ENABLED=0 go build -o /rateguard-connect .

FROM gcr.io/distroless/static-debian12
COPY --from=builder /rateguard-connect /rateguard-connect
ENTRYPOINT ["/rateguard-connect"]
