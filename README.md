# Agent Company: Interview Edition

Agent Company is a workflow-driven multi-agent system built to show more than "an LLM behind a UI".

It is designed as interview material for a reviewer who wants to answer one question quickly:

"Can this candidate build a real agent product with orchestration, observability, and reliable demos?"

This repository is structured to make that question easier to answer quickly.

At a glance, this project includes:

- real managed provider execution with `OpenAI` and `Anthropic`
- workflow DAG orchestration with persisted task and workflow state
- tool calling with project-aware context retrieval
- prompt, token, log, artifact, and estimated cost visibility
- evaluation metrics and dashboard aggregation
- local and E2E setup designed to make demos repeatable

This repository is intentionally packaged for reviewers. The product surface is real, but the README, docs, and landing copy are shaped to make candidate signal obvious fast.

---

## Why This Is Stronger Than a Generic AI Demo

Many AI portfolio projects stop at "send prompt, render answer".

This one is built around the harder parts that usually matter more in interviews:

- stateful workflow execution instead of one-shot chat
- provider abstraction instead of hard-coding one vendor path
- task-level observability instead of opaque model calls
- project-level evaluation instead of only raw logs
- a runnable local and E2E path instead of "works on my machine"

That combination is the core reason this works well as interview material.

---

## What Reviewers Should Notice

### 1. Orchestration, not just prompting

The system models:

- companies
- projects
- workflow DAGs
- workflow runs
- task runs
- connected agents
- live event streams

This makes it possible to inspect how an agent workflow behaves over time, not only whether one prompt produces a plausible answer.

### 2. Real provider-backed execution

Managed providers run inside the worker:

- `openai`
- `anthropic`

Each execution can record:

- prompt
- instructions
- tool calls
- token usage
- estimated cost
- logs
- artifacts

### 3. Evaluation and observability built into the product

The dashboard and APIs expose:

- success rate
- retry rate
- average latency
- queue delay
- total prompt tokens
- total output tokens
- tool call count
- estimated cost
- per-provider summaries

### 4. Demo reliability as an engineering concern

The repository also includes the unglamorous but important work interviewers usually care about:

- stable Node / pnpm / Next / Playwright alignment
- a unified E2E startup path for `web + worker`
- smoke tooling for managed providers
- reviewer-oriented docs and runbooks

---

## 5-Minute Reviewer Path

If you only spend a few minutes in the repo, use this order:

1. Open the dashboard and inspect the top-level project flow
2. Connect a managed provider (`openai` or `anthropic`)
3. Create or open a workflow and inspect node-level prompts
4. Run a workflow
5. Open task details to inspect prompt, tool calls, token usage, and cost
6. Open the evaluation panel to inspect aggregated metrics

This path shows product thinking, backend orchestration, LLM integration quality, and operational maturity in one pass.

Useful docs:

- [Reviewer guide](docs/REVIEWER_GUIDE.md)
- [Interview playbook](docs/INTERVIEW_PLAYBOOK.md)
- [Local development](docs/LOCAL_DEVELOPMENT.md)

---

## Technical Highlights

### Managed provider adapters

- `src/lib/adapters/openai.ts`
- `src/lib/adapters/anthropic.ts`
- `src/lib/agent-providers.ts`
- `src/lib/adapters/index.ts`

### Workflow engine

- `src/lib/workflow/engine.ts`
- `src/lib/workflow/graph.ts`

### Dashboard aggregation

- `src/lib/dashboard.ts`
- `src/lib/evaluation.ts`
- `src/app/api/projects/[id]/evaluation/route.ts`

### Task detail observability

- `src/app/api/task-runs/[id]/route.ts`
- `src/components/live-command-dashboard-panels.tsx`

### Demo / smoke tooling

- `scripts/start-e2e-stack.cjs`
- `scripts/smoke-managed-providers.ts`
- `playwright.config.ts`

---

## Validation Status

The standard local verification path was re-run for this interview edition using the stack described below:

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm build`
- `pnpm db:push`
- `pnpm test:e2e`

For the E2E run, the local services were started with Docker Compose first and the Prisma schema was pushed before Playwright booted `web + worker`.

---

## Quick Start

### Recommended environment

- Node `22.x` via `.nvmrc` for the lowest-friction demo path
- Node `24.x` is also accepted by `package.json#engines`
- pnpm `10.x`
- Docker Desktop

### Setup

```powershell
Copy-Item .env.example .env
docker compose up -d
pnpm install
pnpm db:push
pnpm test:e2e:install
```

`pnpm test:e2e` expects a local `.env` with at least `DATABASE_URL` and `REDIS_URL`. If you skip the copy step above, the E2E startup script now fails fast with a clear message instead of hanging on health checks.

Reviewer-friendly first run:

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```

### Start the app

Terminal 1:

```powershell
pnpm dev --port 3001
```

Terminal 2:

```powershell
pnpm worker
```

App URL:

- `http://127.0.0.1:3001`

---

## Managed Provider Smoke Commands

Run OpenAI only:

```powershell
pnpm smoke:providers -- --provider openai
```

Run Anthropic only:

```powershell
pnpm smoke:providers -- --provider anthropic
```

Auto-discover whichever provider keys are configured:

```powershell
pnpm smoke:providers
```

Keep the generated demo data for dashboard review:

```powershell
pnpm smoke:providers -- --provider openai --keep-data
```
