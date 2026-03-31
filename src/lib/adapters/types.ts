import { AgentInstance, Project, TaskRun, WorkflowNode } from "@prisma/client";

export type DispatchTaskContext = {
  agentInstance: AgentInstance;
  taskRun: TaskRun;
  workflowNode: WorkflowNode;
  project: Project;
  secret: string | null;
};

export interface AgentAdapter {
  provider: string;
  dispatchTask(context: DispatchTaskContext): Promise<void>;
}
