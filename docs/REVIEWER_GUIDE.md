# Reviewer Guide

This guide is written for interviewers and reviewers who want to understand the candidate value of this repository quickly.

---

## Project Summary

Agent Company is a workflow-driven multi-agent system with:

- a Next.js dashboard
- API routes for auth, companies, projects, workflows, tasks, and events
- a worker process for task dispatch and execution
- managed LLM providers (`OpenAI`, `Anthropic`)
- evaluation and observability built into the product

The strongest signal here is not UI polish. The strongest signal is the combination of orchestration, provider integration, observability, evaluation, and demo reliability.

---

## What To Evaluate

### Provider abstraction

Look at how managed providers are modeled and plugged into one execution path:

- `src/lib/agent-providers.ts`
- `src/lib/adapters/index.ts`
- `src/lib/adapters/openai.ts`
- `src/lib/adapters/anthropic.ts`

What this shows:

- the candidate can design for multiple vendors
- the candidate understands provider-specific API differences
- the candidate can normalize outputs into one product-facing shape

### Workflow execution

Look at:

- `src/lib/workflow/graph.ts`
- `src/lib/workflow/engine.ts`

What this shows:

- DAG validation
- task queuing
- assignment behavior
- retries
- task and workflow status transitions

### Observability and cost tracking

Look at:

- `src/app/api/task-runs/[id]/route.ts`
- `src/components/live-command-dashboard-panels.tsx`

What this shows:

- prompt visibility
- tool call visibility
- token usage tracking
- estimated cost tracking
- reviewer-friendly inspection of a single run

### Evaluation layer

Look at:

- `src/lib/evaluation.ts`
- `src/lib/dashboard.ts`
- `src/app/api/projects/[id]/evaluation/route.ts`

What this shows:

- aggregation beyond logs
- system-level thinking
- ability to measure whether an agent workflow is effective, stable, and affordable

### Reliability work

Look at:

- `playwright.config.ts`
- `scripts/start-e2e-stack.cjs`
- `scripts/smoke-managed-providers.ts`
- `.npmrc`
- `.nvmrc`

What this shows:

- practical demo hardening
- version alignment
- local reproducibility
- reviewer empathy

---

## Suggested Demo Flow

1. Open the dashboard
2. Connect a managed provider
3. Create or inspect a workflow node prompt
4. Run a workflow
5. Open task details
6. Show prompt, tool calls, token usage, and estimated cost
7. Show offline evaluation metrics

This sequence gives a clear picture of:

- product understanding
- backend orchestration
- LLM integration quality
- operational maturity

---

## Useful Commands

Start the stack:

```powershell
docker compose up -d
pnpm install
pnpm db:push
pnpm dev --port 3001
pnpm worker
```

Run the verification suite:

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```

Run a managed provider smoke check:

```powershell
pnpm smoke:providers -- --provider openai
```

Keep smoke-generated demo data:

```powershell
pnpm smoke:providers -- --provider openai --keep-data
```

---

## Questions This Repo Helps Answer

- Can the candidate build more than a thin wrapper over a model API?
- Can the candidate structure stateful agent workflows?
- Can the candidate make model calls observable and reviewable?
- Can the candidate reason about evaluation, retries, and cost?
- Can the candidate stabilize a demo environment instead of relying on luck?

If the answer to those is what you want to assess, this repository is a good artifact for that discussion.
