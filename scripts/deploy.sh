#!/bin/bash
set -euo pipefail

echo "=========================================="
echo "Agent Company Deployment Script"
echo "=========================================="

APP_NAME="agentcompany"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$APP_DIR/.env.production"
COMPOSE_FILE="$APP_DIR/docker-compose.prod.yml"
PORT="${PORT:-3000}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
  echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

if [ ! -f "$ENV_FILE" ]; then
  log_warn ".env.production not found. Creating from .env.example..."
  if [ -f "$APP_DIR/.env.example" ]; then
    cp "$APP_DIR/.env.example" "$ENV_FILE"
    log_info "Please edit .env.production with your production values before running this script again."
    exit 1
  fi

  log_error ".env.example not found. Please create .env.production manually."
  exit 1
fi

set -a
. "$ENV_FILE"
set +a

REQUIRED_VARS=("DATABASE_URL" "REDIS_URL" "AUTH_SECRET" "APP_URL" "ENCRYPTION_KEY")
for var in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!var:-}" ]; then
    log_error "Required environment variable $var is not set in .env.production"
    exit 1
  fi
done

log_info "Starting deployment for $APP_NAME..."

if ! command -v docker &> /dev/null; then
  log_error "Docker is not installed. Please install Docker first."
  exit 1
fi

if ! docker compose version &> /dev/null; then
  log_error "Docker Compose is not installed. Please install Docker Compose first."
  exit 1
fi

log_info "Building Docker image..."
docker build -t "$APP_NAME:latest" "$APP_DIR"

log_info "Running database migrations..."
docker run --rm \
  --env-file "$ENV_FILE" \
  "$APP_NAME:latest" \
  prisma migrate deploy

log_info "Starting containers..."
docker compose \
  --env-file "$ENV_FILE" \
  -f "$COMPOSE_FILE" \
  up -d --remove-orphans

log_info "Waiting for application to be ready..."
MAX_RETRIES=30
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  if curl -s -f "http://localhost:$PORT/api/health" > /dev/null 2>&1; then
    log_info "Application is ready!"
    break
  fi

  RETRY_COUNT=$((RETRY_COUNT + 1))
  echo -n "."
  sleep 2
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
  echo ""
  log_error "Application failed to start within timeout"
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" logs
  exit 1
fi

echo ""
log_info "Deployment complete!"
echo ""
echo "=========================================="
echo "Application URLs:"
echo "  - Main App: http://localhost:$PORT"
echo "  - Health Check: http://localhost:$PORT/api/health"
echo "  - Extended Health: http://localhost:$PORT/api/health/extended"
echo "=========================================="
echo ""
echo "Useful commands:"
echo "  - View logs: docker compose --env-file $ENV_FILE -f $COMPOSE_FILE logs -f"
echo "  - Stop: docker compose --env-file $ENV_FILE -f $COMPOSE_FILE down"
echo "  - Restart: docker compose --env-file $ENV_FILE -f $COMPOSE_FILE restart"
echo ""
