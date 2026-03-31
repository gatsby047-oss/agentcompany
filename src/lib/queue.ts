import { Queue } from "bullmq";
import { getBullConnection } from "@/lib/redis";
import { WORKFLOW_JOB_NAME, WORKFLOW_QUEUE_NAME } from "@/lib/constants";

export type DispatchTaskJobData = {
  taskRunId: string;
};

declare global {
  var __agentcompanyWorkflowQueue: Queue | undefined;
}

export function getWorkflowQueue() {
  if (!global.__agentcompanyWorkflowQueue) {
    global.__agentcompanyWorkflowQueue = new Queue(WORKFLOW_QUEUE_NAME, {
      connection: getBullConnection()
    });
  }

  return global.__agentcompanyWorkflowQueue as Queue<DispatchTaskJobData>;
}

export function getQueue() {
  return getWorkflowQueue();
}

export async function enqueueTaskRun(taskRunId: string, delay = 0) {
  return getWorkflowQueue().add(
    WORKFLOW_JOB_NAME,
    { taskRunId },
    {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 5_000
      },
      delay,
      removeOnComplete: 1_000,
      removeOnFail: 1_000
    }
  );
}
