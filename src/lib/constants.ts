export const SESSION_COOKIE_NAME = "agentcompany_session";
export const WORKFLOW_QUEUE_NAME = "workflow-dispatch";
export const WORKFLOW_JOB_NAME = "dispatch-task-run";

export const PROJECT_EVENT_TYPES = [
  "agent.online",
  "agent.offline",
  "task.queued",
  "task.started",
  "task.progress",
  "task.failed",
  "task.completed",
  "workflow.blocked",
  "workflow.completed"
] as const;
