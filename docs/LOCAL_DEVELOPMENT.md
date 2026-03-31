# Local Development

This document explains the recommended local setup for the interview edition of Agent Company.

---

## Recommended Environment

- Node `22.x`
- pnpm `10.x`
- Docker Desktop

The repository currently declares:

- `.nvmrc` -> `22`
- `package.json#engines.node` -> `>=20 <24`
- `package.json#engines.pnpm` -> `>=10 <11`

Node `24.x` may still work for some commands, but it produces an engine warning and is not the preferred demo environment.

---

## Services Used Locally

The default local stack uses:

- PostgreSQL
- Redis
- MinIO

Recommended ports:

| Service | Port |
| --- | --- |
| Web | `3001` |
| PostgreSQL | `5432` |
| Redis | `6379` |
| MinIO API | `9000` |
| MinIO Console | `9001` |

The interview build standardizes on `3001` for the web app so local runs and E2E runs are easier to reason about.

---

## Environment Variables

Create a local `.env` first:

```powershell
Copy-Item .env.example .env
```

Important values to confirm:

```env
APP_URL="http://127.0.0.1:3001"
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/agentcompany?schema=public"
REDIS_URL="redis://127.0.0.1:6379"
AUTH_SECRET="change-me-in-production"
STORAGE_DRIVER="local"
S3_ENDPOINT="http://127.0.0.1:9000"
S3_BUCKET="agentcompany"
WORKER_CONCURRENCY="5"
TASK_MAX_RETRIES="2"
```

Provider variables are only needed when you want real managed-provider execution:

```env
OPENAI_API_KEY="sk-..."
OPENAI_MODEL="gpt-5-mini"
ANTHROPIC_API_KEY="sk-ant-..."
ANTHROPIC_MODEL="claude-sonnet-4-6"
```

If local PostgreSQL `5432` is already occupied, move Docker PostgreSQL to `15432` and update `DATABASE_URL` to match.

---

## Standard Local Boot Flow

### 1. Start infrastructure

```powershell
docker compose up -d
```

### 2. Install dependencies

```powershell
pnpm install
```

### 3. Prepare the database

```powershell
pnpm db:push
```

### 4. Install Playwright browsers

```powershell
pnpm test:e2e:install
```

### 5. Start the web app

```powershell
pnpm dev --port 3001
```

### 6. Start the worker

Open a second terminal:

```powershell
pnpm worker
```

Open the app at `http://127.0.0.1:3001`.

---

## Common Commands

```powershell
pnpm install
pnpm dev --port 3001
pnpm worker
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
pnpm db:migrate:dev
pnpm db:migrate:deploy
pnpm db:push
```

Managed provider smoke tests:

```powershell
pnpm smoke:providers
pnpm smoke:providers -- --provider openai
pnpm smoke:providers -- --provider anthropic --keep-data
```

---

## What To Verify Before A Demo

Manual checks:

- The landing page opens and defaults to English
- Registration and login work
- You can create a company
- You can create a project
- You can create or edit a workflow
- The worker is online and task state changes appear in the UI
- Project SSE state reaches `SSE Live`
- Task detail exposes prompt, tool calls, tokens, and cost
- The evaluation panel shows aggregated metrics

Automated checks:

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```

---

## E2E Notes

The E2E suite uses:

- `playwright.config.ts`
- `scripts/run-playwright.cjs`
- `scripts/start-e2e-stack.cjs`

The current setup standardizes on a local Playwright-managed Chromium installation and a single script that boots both `web` and `worker` for tests.

Before running `pnpm test:e2e`, make sure you have completed all of the following:

- copied `.env.example` to `.env`
- started local infrastructure with `docker compose up -d`
- applied the schema with `pnpm db:push`

That means:

- local verification and E2E follow the same app shape
- browser setup is explicit
- demo risk is lower because the startup path is predictable

As of `2026-03-31`, `pnpm test:e2e` passes in `E:\77work\workwork\git_agentcompany`.

---

## Related Docs

- `README.md`
- `docs/REVIEWER_GUIDE.md`
- `docs/INTERVIEW_PLAYBOOK.md`
- `docs/ARCHITECTURE.md`
- `docs/DEPLOYMENT.md`
- `docs/API_OVERVIEW.md`
