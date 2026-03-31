# Interview Playbook

This playbook is designed for interviewers and for a live demo setting. It assumes you want to show the engineering value of the project quickly, without hiding the real product surface area.

## What This Repo Proves

This project is stronger than a basic LLM demo because it combines five things in one working system:

1. Real provider integration
   - Managed `openai` and `anthropic` adapters run inside the worker.
   - Each run records prompt, tool calls, token usage, and estimated cost.
2. Stateful workflow execution
   - Companies, projects, workflows, task runs, and live events are modeled explicitly.
   - Workflow execution is driven by DAG structure instead of a single chat request.
3. Built-in observability
   - Reviewers can inspect task detail and see prompt, output, logs, artifacts, tool calls, and usage.
4. Offline evaluation
   - The project aggregates success rate, retry rate, latency, queue delay, and cost.
5. Demo reliability
   - Local startup, Playwright, and version expectations were aligned to reduce live-demo risk.

## Recommended Demo Story

Use this story when you want an interviewer to understand your value in about five minutes.

1. Start on the dashboard
   - Explain that this is an orchestration cockpit, not a chat wrapper.
   - Point out that the first screen tells reviewers what to inspect.
2. Connect a managed provider
   - Use `openai` or `anthropic`.
   - Explain that the provider runs in the worker, not only in the browser.
3. Open a workflow
   - Show one node prompt and how the node defines an executable unit of work.
4. Run the workflow
   - Emphasize status transitions, retries, recent tasks, and live SSE updates.
5. Open task detail
   - Show prompt, tool calls, token usage, estimated cost, logs, and output.
6. End in the evaluation panel
   - Show success rate, latency, retry rate, queue delay, and per-provider cost.

This sequence tells a clean engineering story: product modeling, backend orchestration, LLM integration, observability, and operational thinking.

## Fast Setup For A Live Demo

### Recommended environment

- Node `22.x`
- pnpm `10.x`
- Docker Desktop

### Prepare the environment

```powershell
Copy-Item .env.example .env
docker compose up -d
pnpm install
pnpm db:push
pnpm test:e2e:install
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

Open:

- App: `http://127.0.0.1:3001`
- Health: `http://127.0.0.1:3001/api/health`

## Provider Smoke Commands

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

Keep generated demo data so the dashboard has something to inspect:

```powershell
pnpm smoke:providers -- --provider openai --keep-data
```

## Suggested Talking Points

### 30-second summary

"This is a multi-agent workflow system rather than a thin LLM UI. It runs real providers in a worker, records prompt, tool use, token usage, and cost at the task level, and then aggregates those signals into project-level evaluation metrics. I also hardened the local and E2E setup so the demo path is reliable instead of lucky."

### Why the provider runs in the worker

- Centralized auth and secret handling
- Unified retries and lifecycle control
- Consistent logging and usage capture
- A real execution path that can be tested and measured

### Why offline evaluation matters

A serious agent system is not only about whether the model replied. It is also about whether tasks succeed, how often retries happen, how long runs take, and how much they cost. This repo makes those tradeoffs visible.

### Why tool calling matters here

Tool calls allow the model to fetch project snapshot data, recent events, and task context while it is executing a workflow node. That is closer to real agent behavior than a single isolated prompt.

### Why demo hardening matters

In interviews, a strong feature can still fail to land if local startup is flaky. This version of the repo includes version alignment, a single E2E startup path, and browser setup steps so the project is easier to demonstrate with confidence.

## Backup Plan If Live Provider Calls Fail

If network conditions or API keys make a live provider demo risky, keep the interview useful by showing:

1. A saved workflow definition and one node prompt
2. An existing task detail record with prompt, tool calls, tokens, and cost
3. The evaluation panel with aggregated metrics

That still proves system design, observability, and evaluation maturity even if you avoid a fresh external call in the moment.

## Pre-Interview Validation

Run this before the interview:

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm db:push
pnpm test:e2e
```

The commands above were re-run successfully on the standard local stack for this interview edition.
