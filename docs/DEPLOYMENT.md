# Deployment Guide

## Prerequisites

- Node.js 18+ (for local development)
- PostgreSQL 15+
- Redis 7+
- Docker & Docker Compose (for containerized deployment)
- (Optional) S3-compatible storage (MinIO, AWS S3)

## Quick Start (Docker Compose)

### 1. Clone and Configure

```bash
# Clone the repository
git clone <repository-url>
cd agentcompany

# Copy environment file
cp .env.example .env.production

# Edit production environment variables
# See Environment Variables section below
```

### 2. Deploy with Docker Compose

```bash
# Build and start web + worker + dependencies
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build

# View logs
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f

# Stop services
docker compose --env-file .env.production -f docker-compose.prod.yml down
```

### 3. Verify Deployment

```bash
# Health check
curl http://localhost:3000/api/health

# Extended health (includes DB and Redis)
curl http://localhost:3000/api/health/extended
```

## Environment Variables

Copy `.env.example` to `.env.production` and configure the following:

When using `docker-compose.prod.yml`, make sure container-to-container URLs use service names such as `db` and `redis` instead of `127.0.0.1`.

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Yes | - |
| `REDIS_URL` | Redis connection string | Yes | - |
| `APP_URL` | Public-facing application URL | Yes | - |
| `AUTH_SECRET` | Authentication secret (32+ chars) | Yes | - |
| `AGENT_CALLBACK_SECRET` | Secret for agent callbacks | No | - |
| `ENCRYPTION_KEY` | 32-character encryption key | Yes | - |
| `STORAGE_DRIVER` | Storage driver: `local` or `s3` | No | `local` |
| `S3_ENDPOINT` | S3/MinIO endpoint URL | No | - |
| `S3_REGION` | S3 region | No | `auto` |
| `S3_BUCKET` | S3 bucket name | No | - |
| `S3_ACCESS_KEY` | S3 access key | No | - |
| `S3_SECRET_KEY` | S3 secret key | No | - |
| `HEARTBEAT_INTERVAL_SECONDS` | Agent heartbeat interval | No | `20` |
| `HEARTBEAT_TTL_SECONDS` | Agent heartbeat TTL | No | `40` |
| `WORKER_CONCURRENCY` | Worker concurrency | No | `5` |
| `TASK_MAX_RETRIES` | Max task retries | No | `2` |

### Generating Secrets

```bash
# Generate AUTH_SECRET
openssl rand -base64 32

# Generate ENCRYPTION_KEY
openssl rand -hex 16
```

## Manual Deployment (Non-Docker)

### 1. Install Dependencies

```bash
# Install pnpm if not installed
npm install -g pnpm

# Install dependencies
pnpm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your configuration
```

### 3. Run Database Migrations

```bash
# Development
pnpm db:migrate:dev

# Production
pnpm db:migrate:deploy
```

### 4. Build and Start

```bash
# Build the application
pnpm build

# Start production server
pnpm start

# In a second terminal, start the worker
pnpm worker
```

## Using the Deploy Script

### Linux/Mac

```bash
# Make the script executable
chmod +x scripts/deploy.sh

# Run the deployment
./scripts/deploy.sh
```

### Windows

```cmd
scripts\deploy.bat
```

The deploy script will:
1. Validate environment variables
2. Build the Docker image
3. Run database migrations
4. Start web + worker containers
5. Wait for the application to be ready
6. Display deployment status

## Production Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Load Balancer (Optional)                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Docker Compose Network                    │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐    │
│  │   Web/API    │   │   Worker     │   │   MinIO      │    │
│  │   (Next.js)  │   │   (BullMQ)  │   │   (Storage) │    │
│  └──────────────┘   └──────────────┘   └──────────────┘    │
│         │                  │                                 │
│         └──────────────────┼─────────────────────────────┐  │
│                            │                              │  │
│                      ┌─────▼─────┐                  ┌────▼──┐│
│                      │  Redis     │                  │PostgreS││
│                      │ (Queue +   │                  │  DB   ││
│                      │  Pub/Sub)  │                  └────▲──┘│
│                      └───────────┘                       │  │
└───────────────────────────────────────────────────────────┘  │
                              │                                │
                              ▼                                │
┌─────────────────────────────────────────────────────────────┐
│                   External Services                         │
│  ┌──────────────┐   ┌──────────────┐                       │
│  │  OpenClaw    │   │  Other       │                       │
│  │  Agents      │   │  Agents      │                       │
│  └──────────────┘   └──────────────┘                       │
└─────────────────────────────────────────────────────────────┘
```

## Health Check

After deployment, verify the application is running:

```bash
# Basic health check
curl http://localhost:3000/api/health
# Response: { "data": { "ok": true, "db": true, "redis": true } }

# Extended health (includes DB and Redis)
curl http://localhost:3000/api/health/extended
# Response: { "status": "healthy|degraded", "services": { ... } }
```

## Scaling Considerations

### Vertical Scaling

For small to medium deployments:
- Use a single server with multiple CPU cores
- Allocate 4GB+ RAM for the application
- Use SSD for database storage

### Horizontal Scaling

For larger deployments:
- Run multiple Web instances behind a load balancer
- Use Redis Cluster for high availability
- Consider PostgreSQL read replicas
- Use external S3-compatible storage

### Monitoring Recommendations

- Set up Prometheus metrics collection
- Configure alerts for:
  - High CPU/memory usage
  - Database connection failures
  - Redis queue backup
  - Worker process failures

## Troubleshooting

### Database Connection Issues

```bash
# Check PostgreSQL logs
docker-compose -f docker-compose.prod.yml logs db

# Verify connection
docker exec -it agentcompany-db-1 psql -U agentcompany -c "SELECT 1"
```

### Redis Connection Issues

```bash
# Check Redis logs
docker-compose -f docker-compose.prod.yml logs redis

# Verify connection
docker exec -it agentcompany-redis-1 redis-cli ping
```

### Session Issues

```bash
# Verify AUTH_SECRET is set
grep AUTH_SECRET .env.production

# Regenerate if needed
openssl rand -base64 32
```

### Worker Issues

```bash
# Check worker logs
docker-compose -f docker-compose.prod.yml logs worker

# Restart worker
docker-compose -f docker-compose.prod.yml restart worker
```

### View All Logs

```bash
# All services
docker-compose -f docker-compose.prod.yml logs -f

# Specific service
docker-compose -f docker-compose.prod.yml logs -f app
```

## Backup and Recovery

### Database Backup

```bash
# Create backup
docker exec -it agentcompany-db-1 pg_dump -U agentcompany agentcompany > backup.sql

# Restore backup
docker exec -i agentcompany-db-1 psql -U agentcompany agentcompany < backup.sql
```

### Volume Backup

```bash
# Backup volumes
docker run --rm -v agentcompany_postgres_data:/data -v $(pwd):/backup alpine tar czf /backup/postgres_backup.tar.gz /data
