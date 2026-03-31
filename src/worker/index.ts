import { Worker } from "bullmq";
import { AgentStatus } from "@prisma/client";
import { getAgentAdapter } from "@/lib/adapters";
import { isManagedAgentProvider } from "@/lib/agent-providers";
import { decryptSecret } from "@/lib/security";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { WORKFLOW_JOB_NAME, WORKFLOW_QUEUE_NAME } from "@/lib/constants";
import { getBullConnection } from "@/lib/redis";
import { markDispatchFailure, emitAgentStatusToProjects } from "@/lib/workflow/engine";

const env = getEnv();

async function processTask(taskRunId: string) {
  const taskRun = await prisma.taskRun.findUnique({
    where: { id: taskRunId },
    include: {
      project: true,
      workflowNode: true,
      assignedAgentInstance: true
    }
  });

  if (!taskRun || !taskRun.assignedAgentInstance) {
    return;
  }

  const adapter = getAgentAdapter(taskRun.assignedAgentInstance.provider);
  const secret = taskRun.assignedAgentInstance.secretRef
    ? decryptSecret(taskRun.assignedAgentInstance.secretRef)
    : null;

  await adapter.dispatchTask({
    agentInstance: taskRun.assignedAgentInstance,
    taskRun,
    workflowNode: taskRun.workflowNode,
    project: taskRun.project,
    secret
  });
}

async function sweepOfflineAgents() {
  const cutoff = new Date(Date.now() - env.HEARTBEAT_TTL_SECONDS * 1_000);
  const staleAgents = await prisma.agentInstance.findMany({
    where: {
      status: AgentStatus.ONLINE,
      lastHeartbeatAt: {
        lt: cutoff
      }
    }
  });
  const externalStaleAgents = staleAgents.filter(
    (agent) => !isManagedAgentProvider(agent.provider)
  );

  if (externalStaleAgents.length === 0) {
    return;
  }

  await prisma.agentInstance.updateMany({
    where: {
      id: {
        in: externalStaleAgents.map((agent) => agent.id)
      }
    },
    data: {
      status: AgentStatus.OFFLINE
    }
  });

  await Promise.all(
    externalStaleAgents.map((agent) => emitAgentStatusToProjects(agent.id, AgentStatus.OFFLINE))
  );
}

const worker = new Worker(
  WORKFLOW_QUEUE_NAME,
  async (job) => {
    if (job.name !== WORKFLOW_JOB_NAME) {
      return;
    }

    await processTask(job.data.taskRunId);
  },
  {
    connection: getBullConnection(),
    concurrency: env.WORKER_CONCURRENCY
  }
);

worker.on("failed", async (job, error) => {
  if (!job) {
    return;
  }

  const attempts = job.opts.attempts ?? 1;
  if (job.attemptsMade >= attempts) {
    await markDispatchFailure(job.data.taskRunId, error.message);
  }
});

const heartbeatTimer = setInterval(() => {
  void sweepOfflineAgents();
}, Math.max(env.HEARTBEAT_INTERVAL_SECONDS, 10) * 1_000);

async function shutdown() {
  clearInterval(heartbeatTimer);
  await worker.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown();
});

process.on("SIGTERM", () => {
  void shutdown();
});

console.log("Agent Company worker started");
