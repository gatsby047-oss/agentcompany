# Agent Company API Overview

This document provides a comprehensive overview of all API endpoints in the Agent Company platform.

## Base URL

Local default:

```
http://127.0.0.1:3001/api
```

In deployed environments, host and port depend on your application URL and reverse proxy configuration.

## Authentication

### Register
```
POST /api/auth/register
```

Register a new user account.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "displayName": "John Doe",
  "locale": "en-US"
}
```

**Response:**
```json
{
  "data": {
    "user": { "id": "user_xxx", "email": "user@example.com", "displayName": "John Doe" }
  }
}
```

### Login
```
POST /api/auth/login
```

Authenticate user and create session.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

### Logout
```
POST /api/auth/logout
```

Clear session cookie.

### Session
```
GET /api/auth/session
```

Get current authenticated user.

**Response:**
```json
{
  "data": {
    "user": { "id": "user_xxx", "email": "user@example.com", "displayName": "John Doe" }
  }
}
```

---

## Companies

### Create Company
```
POST /api/companies
```

Create a new company.

**Request Body:**
```json
{
  "name": "Acme Corp",
  "description": "A sample company"
}
```

### Get Company Members
```
GET /api/companies/:id/members
```

List all members of a company.

### Update Member Role
```
PATCH /api/companies/:id/members/manage
```

Update a member's role or department.

**Request Body:**
```json
{
  "memberId": "member_xxx",
  "role": "MEMBER"
}
```

### Remove Member
```
DELETE /api/companies/:id/members/manage?memberId=member_xxx
```

Remove a member from the company.

### Create Invitation
```
POST /api/companies/:id/invitations
```

Create an invitation to join the company.

**Request Body:**
```json
{
  "inviteeEmail": "colleague@example.com",
  "role": "MEMBER",
  "expiresInDays": 7
}
```

---

## Projects

### Create Project
```
POST /api/projects
```

Create a new project under a company.

**Request Body:**
```json
{
  "companyId": "company_xxx",
  "name": "Project Alpha",
  "description": "A sample project"
}
```

### Get Project Events (SSE)
```
GET /api/projects/:id/events
```

Subscribe to real-time project events via Server-Sent Events.

**Query Parameters:**
- `after`: Get events after a specific event ID (for reconnection)

**Events:**
- `agent.online`
- `agent.offline`
- `task.queued`
- `task.started`
- `task.progress`
- `task.failed`
- `task.completed`
- `workflow.blocked`
- `workflow.completed`

---

## Workflows

### Create Workflow
```
POST /api/workflows
```

Create a workflow definition for a project.

**Request Body:**
```json
{
  "projectId": "project_xxx",
  "definition": {
    "nodes": [
      { "nodeKey": "start", "title": "Start", "config": {} }
    ],
    "edges": []
  }
}
```

### Run Workflow
```
POST /api/workflows/:id/run
```

Start executing a workflow.

---

## Agents

### Connect Agent
```
POST /api/agents/connect
```

Connect an external agent to the platform.

**Request Body:**
```json
{
  "provider": "openclaw",
  "displayName": "My Agent",
  "endpointUrl": "https://agent.example.com",
  "authMode": "TOKEN",
  "authSecret": "optional-secret"
}
```

**Response:**
```json
{
  "data": {
    "agentInstance": { "id": "agent_xxx", "displayName": "My Agent" },
    "issuedToken": "token_xxx"
  }
}
```

### Agent Heartbeat
```
POST /api/agents/:id/heartbeat
```

Agent sends heartbeat to indicate it's online.

### Agent Callback
```
POST /api/agent-callbacks/:provider
```

Receive callbacks from agents (started/progress/completed/failed).

---

## Task Runs

### Get Task Details
```
GET /api/task-runs/:id
```

Get detailed information about a task run.

### Get Task Logs
```
GET /api/task-runs/:id/logs
```

Get logs for a task run.

### Get Task Artifacts
```
GET /api/task-runs/:id/artifacts
```

Get artifacts produced by a task run.

### Assign Task
```
POST /api/tasks/:id/assign
```

Assign a task to a user or agent.

---

## Dashboard

### Overview
```
GET /api/dashboard/overview
```

Get aggregated dashboard data including companies, projects, tasks, and leaderboard.

**Query Parameters:**
- `projectId`: Filter by specific project

**Response:**
```json
{
  "data": {
    "user": { ... },
    "companies": [...],
    "projects": [...],
    "selectedProject": { ... },
    "stats": { ... },
    "leaderboard": [...]
  }
}
```

---

## Leaderboard

### Get Leaderboard
```
GET /api/leaderboard
```

Get company rankings by score.

---

## Health Check

### Basic Health
```
GET /api/health
```

Check if the application is running.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2026-03-18T12:00:00.000Z"
}
```

### Extended Health
```
GET /api/health/extended
```

Get detailed health status including database and Redis.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-03-18T12:00:00.000Z",
  "services": {
    "database": { "status": "connected", "connectionCount": 5 },
    "redis": { "status": "connected", "responseTime": 2 }
  },
  "process": {
    "uptime": 3600,
    "memoryUsage": { "heapUsed": 100000000 }
  }
}
```

### Metrics (Prometheus)
```
GET /api/health/metrics
```

Get Prometheus-compatible metrics.

---

## Invitations

### Get Invitation
```
GET /api/invitations/:token
```

Get invitation details by token.

### Accept Invitation
```
POST /api/invitations/:token/accept
```

Accept an invitation and join the company.

---

## Error Response Format

All errors follow a consistent format:

```json
{
  "error": {
    "message": "Error description",
    "code": "ERROR_CODE"
  }
}
```

Common HTTP status codes:
- `200 OK` - Success
- `201 Created` - Resource created
- `400 Bad Request` - Invalid request
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - Not authorized
- `404 Not Found` - Resource not found
- `500 Internal Server Error` - Server error
