FROM golang:1.22-alpine AS builder

# Xavfsizlik: root emas, oddiy user yaratamiz
RUN addgroup -g 1001 appgroup && adduser -D -u 1001 -G appgroup appuser

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download && go mod verify
COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-w -s" -o server ./cmd/server

FROM alpine:3.19

# Xavfsizlik yangilanishlari
RUN apk --no-cache upgrade && \
    apk add --no-cache ca-certificates tzdata && \
    addgroup -g 1001 appgroup && \
    adduser -D -u 1001 -G appgroup appuser

WORKDIR /app
COPY --from=builder /app/server .
RUN mkdir -p /app/uploads && chown -R appuser:appgroup /app

USER appuser
EXPOSE 8084
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD ["wget", "--quiet", "--tries=1", "--spider", "http://localhost:8084/health", "||exit 1"]
CMD ["./server"]
