import {
  AgentStatus,
  MembershipMemberType,
  PointSubjectType,
  Prisma,
  ProjectStatus,
  MembershipStatus,
  TaskRunStatus,
  WorkflowNodeStatus,
  WorkflowRunStatus,
  WorkflowStatus
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { createProjectEvent, emitProjectEvent, publishProjectEvent } from "@/lib/events";
import { badRequest, conflict, notFound } from "@/lib/http";
import { enqueueTaskRun } from "@/lib/queue";
import { putJsonObject } from "@/lib/storage";
import {
  WorkflowDefinitionInput,
  calculateProgress,
  getReadyChildNodeKeys,
  validateWorkflowDefinition
} from "@/lib/workflow/graph";

function toJsonInput(
  value: Prisma.JsonValue | undefined
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return Prisma.JsonNull;
  }

  return value as Prisma.InputJsonValue;
}

function assignmentFromMembership(
  membership:
    | {
        userId: string | null;
        agentInstanceId: string | null;
      }
    | null
) {
  return {
    assignedUserId: membership?.userId ?? null,
    assignedAgentInstanceId: membership?.agentInstanceId ?? null
  };
}

async function resolveImplicitAgentAssignment(
  projectId: string,
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  const project = await client.project.findUnique({
    where: { id: projectId },
    select: {
      companyId: true
    }
  });

  if (!project) {
    return {
      assignedUserId: null,
      assignedAgentInstanceId: null
    };
  }

  const activeAgents = await client.membership.findMany({
    where: {
      companyId: project.companyId,
      memberType: MembershipMemberType.AGENT,
      status: MembershipStatus.ACTIVE,
      agentInstance: {
        status: AgentStatus.ONLINE
      }
    },
    select: {
      userId: true,
      agentInstanceId: true
    }
  });

  if (activeAgents.length !== 1) {
    return {
      assignedUserId: null,
      assignedAgentInstanceId: null
    };
  }

  return assignmentFromMembership(activeAgents[0]);
}

export type TaskCallbackStatus = "started" | "progress" | "completed" | "failed";

const activeTaskStatuses = [TaskRunStatus.QUEUED, TaskRunStatus.RUNNING] as const;
const terminalTaskStatuses = [
  TaskRunStatus.BLOCKED,
  TaskRunStatus.COMPLETED,
  TaskRunStatus.FAILED
] as const;
const activeTaskStatusSet = new Set<TaskRunStatus>(activeTaskStatuses);
const terminalTaskStatusSet = new Set<TaskRunStatus>(terminalTaskStatuses);

export function canProcessTaskCallback(
  taskStatus: TaskRunStatus,
  callbackStatus: TaskCallbackStatus
) {
  if (terminalTaskStatusSet.has(taskStatus)) {
    return false;
  }

  if (callbackStatus === "started" || callbackStatus === "progress") {
    return activeTaskStatusSet.has(taskStatus);
  }

  return activeTaskStatusSet.has(taskStatus);
}

function getWorkflowTargetMembershipIds(definition: WorkflowDefinitionInput) {
  return [...new Set(definition.nodes.flatMap((node) => (node.targetMembershipId ? [node.targetMembershipId] : [])))];
}

async function validateWorkflowTargetMemberships(
  projectId: string,
  definition: WorkflowDefinitionInput,
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  const targetMembershipIds = getWorkflowTargetMembershipIds(definition);

  if (targetMembershipIds.length === 0) {
    return;
  }

  const project = await client.project.findUnique({
    where: { id: projectId },
    select: {
      companyId: true
    }
  });

  if (!project) {
    throw notFound("Project not found");
  }

  const memberships = await client.membership.findMany({
    where: {
      id: {
        in: targetMembershipIds
      }
    },
    select: {
      id: true,
      companyId: true,
      status: true
    }
  });

  const membershipById = new Map(memberships.map((membership) => [membership.id, membership]));

  for (const membershipId of targetMembershipIds) {
    const membership = membershipById.get(membershipId);

    if (!membership) {
      throw badRequest(`Invalid target membership: ${membershipId}`);
    }

    if (membership.companyId !== project.companyId) {
      throw badRequest("Workflow node assignees must belong to the same company as the project");
    }

    if (membership.status !== MembershipStatus.ACTIVE) {
      throw badRequest("Workflow node assignees must be active company members");
    }
  }
}

async function calculateProjectProgress(
  projectId: string,
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  const nodes = await client.workflowNode.findMany({
    where: {
      workflow: {
        projectId
      }
    },
    select: {
      progressPercent: true
    }
  });

  const progressPercent = calculateProgress(nodes.map((node) => node.progressPercent));

  await client.project.update({
    where: { id: projectId },
    data: { progressPercent }
  });

  return progressPercent;
}

async function awardPoints(
  projectId: string,
  taskRunId: string,
  assignedUserId: string | null,
  companyId: string,
  client: Prisma.TransactionClient
) {
  await client.pointLedger.create({
    data: {
      subjectType: PointSubjectType.COMPANY,
      subjectId: companyId,
      delta: 10,
      reason: "task_completed",
      refType: "task_run",
      refId: taskRunId
    }
  });

  await client.company.update({
    where: { id: companyId },
    data: {
      score: {
        increment: 10
      }
    }
  });

  if (assignedUserId) {
    await client.pointLedger.create({
      data: {
        subjectType: PointSubjectType.USER,
        subjectId: assignedUserId,
        delta: 5,
        reason: "task_completed",
        refType: "task_run",
        refId: taskRunId
      }
    });
  }

  const [companyScore, userScore] = await Promise.all([
    client.pointLedger.aggregate({
      where: {
        subjectType: PointSubjectType.COMPANY,
        subjectId: companyId
      },
      _sum: { delta: true }
    }),
    assignedUserId
      ? client.pointLedger.aggregate({
          where: {
            subjectType: PointSubjectType.USER,
            subjectId: assignedUserId
          },
          _sum: { delta: true }
        })
      : Promise.resolve(null)
  ]);

  await client.leaderboardSnapshot.create({
    data: {
      scope: "company",
      subjectType: PointSubjectType.COMPANY,
      subjectId: companyId,
      score: companyScore._sum.delta ?? 0,
      rank: 0
    }
  });

  if (assignedUserId && userScore) {
    await client.leaderboardSnapshot.create({
      data: {
        scope: "user",
        subjectType: PointSubjectType.USER,
        subjectId: assignedUserId,
        score: userScore._sum.delta ?? 0,
        rank: 0
      }
    });
  }

  await calculateProjectProgress(projectId, client);
}

export async function upsertWorkflowDefinition(input: {
  workflowId?: string;
  projectId: string;
  definition: WorkflowDefinitionInput;
}) {
  const definition = validateWorkflowDefinition(input.definition);
  const existingWorkflow = input.workflowId
    ? await prisma.workflow.findUnique({
        where: { id: input.workflowId },
        include: {
          runs: true
        }
      })
    : null;

  if (input.workflowId && !existingWorkflow) {
    throw notFound("Workflow not found");
  }

  if (existingWorkflow && existingWorkflow.runs.length > 0) {
    throw conflict("Workflow already has run history; create a new workflow version instead");
  }

  return prisma.$transaction(async (tx) => {
    await validateWorkflowTargetMemberships(
      existingWorkflow?.projectId ?? input.projectId,
      definition,
      tx
    );

    const workflow =
      existingWorkflow === null
        ? await tx.workflow.create({
            data: {
              projectId: input.projectId,
              definitionJson: definition,
              status: WorkflowStatus.READY
            }
          })
        : await tx.workflow.update({
            where: { id: existingWorkflow.id },
            data: {
              version: {
                increment: 1
              },
              definitionJson: definition,
              status: WorkflowStatus.READY
            }
          });

    await tx.workflowEdge.deleteMany({
      where: { workflowId: workflow.id }
    });

    await tx.workflowNode.deleteMany({
      where: { workflowId: workflow.id }
    });

    const nodes = await Promise.all(
      definition.nodes.map((node) =>
        tx.workflowNode.create({
          data: {
            workflowId: workflow.id,
            nodeKey: node.nodeKey,
            title: node.title,
            targetMembershipId: node.targetMembershipId ?? null,
            configJson: node.config ?? {}
          }
        })
      )
    );

    const nodeIdByKey = new Map(nodes.map((node) => [node.nodeKey, node.id]));

    if (definition.edges.length > 0) {
      await tx.workflowEdge.createMany({
        data: definition.edges.map((edge) => ({
          workflowId: workflow.id,
          fromNodeId: nodeIdByKey.get(edge.fromNodeKey)!,
          toNodeId: nodeIdByKey.get(edge.toNodeKey)!
        }))
      });
    }

    return tx.workflow.findUniqueOrThrow({
      where: { id: workflow.id },
      include: {
        nodes: true,
        edges: true
      }
    });
  });
}

export async function runWorkflow(workflowId: string) {
  const workflow = await prisma.workflow.findUnique({
    where: { id: workflowId },
    include: {
      project: true,
      nodes: {
        include: {
          targetMembership: true
        }
      },
      runs: {
        where: {
          status: {
            in: [WorkflowRunStatus.QUEUED, WorkflowRunStatus.RUNNING, WorkflowRunStatus.BLOCKED]
          }
        }
      }
    }
  });

  if (!workflow) {
    throw notFound("Workflow not found");
  }

  if (workflow.runs.length > 0) {
    throw conflict("Workflow already has an active run");
  }

  const definition = validateWorkflowDefinition(workflow.definitionJson as WorkflowDefinitionInput);
  const rootNodes = definition.nodes.filter(
    (node) => !definition.edges.some((edge) => edge.toNodeKey === node.nodeKey)
  );

  if (rootNodes.length === 0) {
    throw badRequest("Workflow has no runnable root nodes");
  }

  const nodeByKey = new Map(workflow.nodes.map((node) => [node.nodeKey, node]));
  const publishableEvents: Awaited<ReturnType<typeof createProjectEvent>>[] = [];

  const result = await prisma.$transaction(async (tx) => {
    const implicitAssignment = await resolveImplicitAgentAssignment(workflow.projectId, tx);

    await tx.project.update({
      where: { id: workflow.projectId },
      data: {
        status: ProjectStatus.RUNNING,
        startedAt: workflow.project.startedAt ?? new Date(),
        completedAt: null,
        progressPercent: 0
      }
    });

    await tx.workflow.update({
      where: { id: workflow.id },
      data: {
        status: WorkflowStatus.RUNNING
      }
    });

    await tx.workflowNode.updateMany({
      where: { workflowId: workflow.id },
      data: {
        status: WorkflowNodeStatus.PENDING,
        progressPercent: 0,
        startedAt: null,
        completedAt: null,
        lastError: null
      }
    });

    const workflowRun = await tx.workflowRun.create({
      data: {
        workflowId: workflow.id,
        projectId: workflow.projectId,
        status: WorkflowRunStatus.RUNNING,
        startedAt: new Date()
      }
    });

    const taskRuns = [];

    for (const rootNode of rootNodes) {
      const targetNode = nodeByKey.get(rootNode.nodeKey);
      if (!targetNode) {
        continue;
      }

      await tx.workflowNode.update({
        where: { id: targetNode.id },
        data: {
          status: WorkflowNodeStatus.QUEUED
        }
      });

      const taskRun = await tx.taskRun.create({
        data: {
          projectId: workflow.projectId,
          workflowRunId: workflowRun.id,
          workflowNodeId: targetNode.id,
          runNo: 1,
          status: TaskRunStatus.QUEUED,
          inputJson: targetNode.configJson ?? {},
          ...(targetNode.targetMembership
            ? assignmentFromMembership(targetNode.targetMembership)
            : implicitAssignment)
        }
      });

      const event = await createProjectEvent(
        {
          projectId: workflow.projectId,
          taskRunId: taskRun.id,
          eventType: "task.queued",
          payload: {
            taskRunId: taskRun.id,
            workflowNodeId: targetNode.id,
            nodeKey: targetNode.nodeKey,
            title: targetNode.title,
            runNo: taskRun.runNo
          }
        },
        tx
      );

      publishableEvents.push(event);
      taskRuns.push(taskRun);
    }

    return {
      workflowRun,
      taskRuns
    };
  });

  for (const event of publishableEvents) {
    publishProjectEvent(event);
  }

  await Promise.all(
    result.taskRuns
      .filter((taskRun) => taskRun.assignedAgentInstanceId)
      .map((taskRun) => enqueueTaskRun(taskRun.id))
  );

  return result;
}

async function queueReadyChildren(input: {
  client: Prisma.TransactionClient;
  workflowId: string;
  workflowRunId: string;
  projectId: string;
  completedNodeKey: string;
}) {
  const workflow = await input.client.workflow.findUniqueOrThrow({
    where: { id: input.workflowId },
    include: {
      nodes: {
        include: {
          targetMembership: true
        }
      }
    }
  });

  const definition = validateWorkflowDefinition(workflow.definitionJson as WorkflowDefinitionInput);
  const implicitAssignment = await resolveImplicitAgentAssignment(input.projectId, input.client);
  const completedNodes = workflow.nodes.filter((node) => node.status === WorkflowNodeStatus.COMPLETED);
  const readyChildKeys = getReadyChildNodeKeys(
    completedNodes.map((node) => node.nodeKey),
    definition,
    input.completedNodeKey
  );

  const createdTaskRuns = [];
  const createdEvents: Awaited<ReturnType<typeof createProjectEvent>>[] = [];

  for (const childKey of readyChildKeys) {
    const childNode = workflow.nodes.find((node) => node.nodeKey === childKey);

    if (!childNode || childNode.status !== WorkflowNodeStatus.PENDING) {
      continue;
    }

    await input.client.workflowNode.update({
      where: { id: childNode.id },
      data: {
        status: WorkflowNodeStatus.QUEUED
      }
    });

    const previousRunsCount = await input.client.taskRun.count({
      where: {
        workflowNodeId: childNode.id
      }
    });

    const taskRun = await input.client.taskRun.create({
      data: {
        projectId: input.projectId,
        workflowRunId: input.workflowRunId,
        workflowNodeId: childNode.id,
        runNo: previousRunsCount + 1,
        status: TaskRunStatus.QUEUED,
        inputJson: childNode.configJson ?? {},
        ...(childNode.targetMembership
          ? assignmentFromMembership(childNode.targetMembership)
          : implicitAssignment)
      }
    });

    const event = await createProjectEvent(
      {
        projectId: input.projectId,
        taskRunId: taskRun.id,
        eventType: "task.queued",
        payload: {
          taskRunId: taskRun.id,
          workflowNodeId: childNode.id,
          nodeKey: childNode.nodeKey,
          title: childNode.title,
          runNo: taskRun.runNo
        }
      },
      input.client
    );

    createdTaskRuns.push(taskRun);
    createdEvents.push(event);
  }

  return { createdTaskRuns, createdEvents };
}

async function completeWorkflowIfFinished(
  client: Prisma.TransactionClient,
  workflowId: string,
  workflowRunId: string,
  projectId: string
) {
  const remainingNodes = await client.workflowNode.count({
    where: {
      workflowId,
      status: {
        not: WorkflowNodeStatus.COMPLETED
      }
    }
  });

  if (remainingNodes > 0) {
    return null;
  }

  await Promise.all([
    client.workflow.update({
      where: { id: workflowId },
      data: {
        status: WorkflowStatus.COMPLETED
      }
    }),
    client.workflowRun.update({
      where: { id: workflowRunId },
      data: {
        status: WorkflowRunStatus.COMPLETED,
        completedAt: new Date()
      }
    }),
    client.project.update({
      where: { id: projectId },
      data: {
        status: ProjectStatus.COMPLETED,
        progressPercent: 100,
        completedAt: new Date()
      }
    })
  ]);

  return createProjectEvent(
    {
      projectId,
      eventType: "workflow.completed",
      payload: {
        workflowId,
        workflowRunId
      }
    },
    client
  );
}

export async function handleTaskCallback(input: {
  taskRunId: string;
  agentInstanceId: string;
  provider: string;
  status: TaskCallbackStatus;
  progressPercent?: number;
  output?: Prisma.JsonValue;
  artifacts?: Prisma.JsonValue;
  logs?: Prisma.JsonValue;
  error?: string;
}) {
  const taskRun = await prisma.taskRun.findUnique({
    where: { id: input.taskRunId },
    include: {
      project: {
        include: {
          company: true
        }
      },
      workflowRun: true,
      workflowNode: {
        include: {
          workflow: true
        }
      },
      assignedAgentInstance: true
    }
  });

  if (!taskRun) {
    throw notFound("Task run not found");
  }

  if (taskRun.assignedAgentInstanceId !== input.agentInstanceId) {
    throw badRequest("Task run is not assigned to this agent");
  }

  if (taskRun.assignedAgentInstance?.provider !== input.provider) {
    throw badRequest("Provider mismatch");
  }

  if (!canProcessTaskCallback(taskRun.status, input.status)) {
    return;
  }

  let logObjectKey: string | undefined;
  let artifactManifestJson: Prisma.JsonValue | undefined;

  if (input.logs !== undefined) {
    logObjectKey = await putJsonObject(
      `logs/${taskRun.projectId}/${taskRun.id}-${Date.now()}.json`,
      input.logs
    );
  }

  if (input.artifacts !== undefined) {
    const artifactKey = await putJsonObject(
      `artifacts/${taskRun.projectId}/${taskRun.id}-${Date.now()}.json`,
      input.artifacts
    );

    artifactManifestJson = {
      storageKey: artifactKey
    };
  }

  const publishableEvents: Awaited<ReturnType<typeof createProjectEvent>>[] = [];
  const queuedTaskRunIds: string[] = [];

  await prisma.$transaction(async (tx) => {
    if (input.status === "started" || input.status === "progress") {
      const eventType = input.status === "started" ? "task.started" : "task.progress";
      const progressPercent =
        input.status === "started"
          ? Math.max(input.progressPercent ?? 0, 1)
          : input.progressPercent ?? taskRun.progressPercent;

      const [taskRunUpdateResult] = await Promise.all([
        tx.taskRun.updateMany({
          where: {
            id: taskRun.id,
            status: {
              in: [...activeTaskStatuses]
            }
          },
          data: {
            status: TaskRunStatus.RUNNING,
            progressPercent,
            startedAt: taskRun.startedAt ?? new Date()
          }
        }),
        tx.workflowNode.updateMany({
          where: {
            id: taskRun.workflowNodeId,
            status: {
              in: [
                WorkflowNodeStatus.PENDING,
                WorkflowNodeStatus.QUEUED,
                WorkflowNodeStatus.RUNNING
              ]
            }
          },
          data: {
            status: WorkflowNodeStatus.RUNNING,
            progressPercent,
            startedAt: taskRun.workflowNode.startedAt ?? new Date()
          }
        })
      ]);

      if (taskRunUpdateResult.count === 0) {
        return;
      }

      const event = await createProjectEvent(
        {
          projectId: taskRun.projectId,
          taskRunId: taskRun.id,
          eventType,
          payload: {
            taskRunId: taskRun.id,
            workflowNodeId: taskRun.workflowNodeId,
            progressPercent
          }
        },
        tx
      );

      publishableEvents.push(event);
      await calculateProjectProgress(taskRun.projectId, tx);
      return;
    }

    if (input.status === "failed") {
      const retryThreshold = getEnv().TASK_MAX_RETRIES + 1;
      const willRetry = taskRun.runNo < retryThreshold;

      const [taskRunUpdateResult] = await Promise.all([
        tx.taskRun.updateMany({
          where: {
            id: taskRun.id,
            status: {
              in: [...activeTaskStatuses]
            }
          },
          data: {
            status: TaskRunStatus.FAILED,
            progressPercent: input.progressPercent ?? taskRun.progressPercent,
            completedAt: new Date(),
            outputJson: toJsonInput(input.output ?? taskRun.outputJson ?? undefined),
            logObjectKey: logObjectKey ?? taskRun.logObjectKey,
            artifactManifestJson: toJsonInput(
              artifactManifestJson ?? taskRun.artifactManifestJson ?? undefined
            )
          }
        }),
        tx.workflowNode.updateMany({
          where: {
            id: taskRun.workflowNodeId,
            status: {
              in: [
                WorkflowNodeStatus.PENDING,
                WorkflowNodeStatus.QUEUED,
                WorkflowNodeStatus.RUNNING
              ]
            }
          },
          data: {
            status: willRetry ? WorkflowNodeStatus.QUEUED : WorkflowNodeStatus.FAILED,
            lastError: input.error ?? "Task failed",
            progressPercent: input.progressPercent ?? taskRun.workflowNode.progressPercent
          }
        })
      ]);

      if (taskRunUpdateResult.count === 0) {
        return;
      }

      const failedEvent = await createProjectEvent(
        {
          projectId: taskRun.projectId,
          taskRunId: taskRun.id,
          eventType: "task.failed",
          payload: {
            taskRunId: taskRun.id,
            workflowNodeId: taskRun.workflowNodeId,
            error: input.error ?? "Task failed",
            willRetry
          }
        },
        tx
      );

      publishableEvents.push(failedEvent);

      if (willRetry) {
        const nextTaskRun = await tx.taskRun.create({
          data: {
            projectId: taskRun.projectId,
            workflowRunId: taskRun.workflowRunId,
            workflowNodeId: taskRun.workflowNodeId,
            runNo: taskRun.runNo + 1,
            status: TaskRunStatus.QUEUED,
            inputJson: toJsonInput(taskRun.inputJson ?? undefined),
            assignedAgentInstanceId: taskRun.assignedAgentInstanceId,
            assignedUserId: taskRun.assignedUserId
          }
        });

        queuedTaskRunIds.push(nextTaskRun.id);

        const queuedEvent = await createProjectEvent(
          {
            projectId: taskRun.projectId,
            taskRunId: nextTaskRun.id,
            eventType: "task.queued",
            payload: {
              taskRunId: nextTaskRun.id,
              workflowNodeId: taskRun.workflowNodeId,
              runNo: nextTaskRun.runNo
            }
          },
          tx
        );

        publishableEvents.push(queuedEvent);
      } else {
        await Promise.all([
          tx.workflow.update({
            where: { id: taskRun.workflowNode.workflowId },
            data: {
              status: WorkflowStatus.BLOCKED
            }
          }),
          tx.workflowRun.update({
            where: { id: taskRun.workflowRunId },
            data: {
              status: WorkflowRunStatus.BLOCKED
            }
          }),
          tx.project.update({
            where: { id: taskRun.projectId },
            data: {
              status: ProjectStatus.BLOCKED
            }
          })
        ]);

        const blockedEvent = await createProjectEvent(
          {
            projectId: taskRun.projectId,
            eventType: "workflow.blocked",
            payload: {
              workflowId: taskRun.workflowNode.workflowId,
              workflowRunId: taskRun.workflowRunId,
              taskRunId: taskRun.id,
              error: input.error ?? "Task failed"
            }
          },
          tx
        );

        publishableEvents.push(blockedEvent);
      }

      await calculateProjectProgress(taskRun.projectId, tx);
      return;
    }

    const [taskRunUpdateResult] = await Promise.all([
      tx.taskRun.updateMany({
        where: {
          id: taskRun.id,
          status: {
            in: [...activeTaskStatuses]
          }
        },
        data: {
          status: TaskRunStatus.COMPLETED,
          progressPercent: 100,
          completedAt: new Date(),
          outputJson: toJsonInput(input.output ?? taskRun.outputJson ?? undefined),
          logObjectKey: logObjectKey ?? taskRun.logObjectKey,
          artifactManifestJson: toJsonInput(
            artifactManifestJson ?? taskRun.artifactManifestJson ?? undefined
          )
        }
      }),
      tx.workflowNode.updateMany({
        where: {
          id: taskRun.workflowNodeId,
          status: {
            in: [
              WorkflowNodeStatus.PENDING,
              WorkflowNodeStatus.QUEUED,
              WorkflowNodeStatus.RUNNING
            ]
          }
        },
        data: {
          status: WorkflowNodeStatus.COMPLETED,
          progressPercent: 100,
          completedAt: new Date(),
          lastError: null
        }
      })
    ]);

    if (taskRunUpdateResult.count === 0) {
      return;
    }

    const completedEvent = await createProjectEvent(
      {
        projectId: taskRun.projectId,
        taskRunId: taskRun.id,
        eventType: "task.completed",
        payload: {
          taskRunId: taskRun.id,
          workflowNodeId: taskRun.workflowNodeId,
          output: input.output ?? null
        }
      },
      tx
    );

    publishableEvents.push(completedEvent);

    await awardPoints(
      taskRun.projectId,
      taskRun.id,
      taskRun.assignedUserId ?? taskRun.assignedAgentInstance?.ownerUserId ?? null,
      taskRun.project.companyId,
      tx
    );

    const { createdTaskRuns, createdEvents } = await queueReadyChildren({
      client: tx,
      workflowId: taskRun.workflowNode.workflowId,
      workflowRunId: taskRun.workflowRunId,
      projectId: taskRun.projectId,
      completedNodeKey: taskRun.workflowNode.nodeKey
    });

    queuedTaskRunIds.push(...createdTaskRuns.map((queuedTaskRun) => queuedTaskRun.id));
    publishableEvents.push(...createdEvents);

    const workflowCompletedEvent = await completeWorkflowIfFinished(
      tx,
      taskRun.workflowNode.workflowId,
      taskRun.workflowRunId,
      taskRun.projectId
    );

    if (workflowCompletedEvent) {
      publishableEvents.push(workflowCompletedEvent);
    } else {
      await calculateProjectProgress(taskRun.projectId, tx);
    }
  });

  for (const event of publishableEvents) {
    publishProjectEvent(event);
  }

  await Promise.all(
    queuedTaskRunIds
      .map((taskRunId) => prisma.taskRun.findUnique({ where: { id: taskRunId } }))
      .map(async (taskPromise) => {
        const nextTask = await taskPromise;
        if (nextTask?.assignedAgentInstanceId) {
          await enqueueTaskRun(nextTask.id);
        }
      })
  );
}

export async function markDispatchFailure(taskRunId: string, errorMessage: string) {
  const taskRun = await prisma.taskRun.findUnique({
    where: { id: taskRunId },
    include: {
      workflowNode: true
    }
  });

  if (!taskRun) {
    return;
  }

  await prisma.$transaction(async (tx) => {
    await Promise.all([
      tx.taskRun.update({
        where: { id: taskRunId },
        data: {
          status: TaskRunStatus.FAILED,
          completedAt: new Date()
        }
      }),
      tx.workflowNode.update({
        where: { id: taskRun.workflowNodeId },
        data: {
          status: WorkflowNodeStatus.FAILED,
          lastError: errorMessage
        }
      }),
      tx.workflow.update({
        where: { id: taskRun.workflowNode.workflowId },
        data: {
          status: WorkflowStatus.BLOCKED
        }
      }),
      tx.workflowRun.update({
        where: { id: taskRun.workflowRunId },
        data: {
          status: WorkflowRunStatus.BLOCKED
        }
      }),
      tx.project.update({
        where: { id: taskRun.projectId },
        data: {
          status: ProjectStatus.BLOCKED
        }
      })
    ]);

    await calculateProjectProgress(taskRun.projectId, tx);
  });

  await emitProjectEvent({
    projectId: taskRun.projectId,
    taskRunId,
    eventType: "workflow.blocked",
    payload: {
      taskRunId,
      error: errorMessage
    }
  });
}

export async function assignTaskRun(taskRunId: string, membershipId: string) {
  const membership = await prisma.membership.findUnique({
    where: { id: membershipId }
  });

  if (!membership) {
    throw notFound("Membership not found");
  }

  const taskRun = await prisma.taskRun.findUnique({
    where: { id: taskRunId },
    include: {
      workflowNode: true
    }
  });

  if (!taskRun) {
    throw notFound("Task run not found");
  }

  const updatedTaskRun = await prisma.$transaction(async (tx) => {
    await tx.workflowNode.update({
      where: { id: taskRun.workflowNodeId },
      data: {
        targetMembershipId: membership.id
      }
    });

    return tx.taskRun.update({
      where: { id: taskRunId },
      data: {
        assignedAgentInstanceId:
          membership.memberType === MembershipMemberType.AGENT ? membership.agentInstanceId : null,
        assignedUserId: membership.memberType === MembershipMemberType.HUMAN ? membership.userId : null
      }
    });
  });

  if (
    updatedTaskRun.status === TaskRunStatus.QUEUED &&
    updatedTaskRun.assignedAgentInstanceId &&
    updatedTaskRun.assignedAgentInstanceId !== taskRun.assignedAgentInstanceId
  ) {
    await enqueueTaskRun(updatedTaskRun.id, 250);
  }

  return updatedTaskRun;
}

export async function emitAgentStatusToProjects(agentInstanceId: string, status: AgentStatus) {
  const memberships = await prisma.membership.findMany({
    where: {
      agentInstanceId
    },
    select: {
      companyId: true
    }
  });

  if (memberships.length === 0) {
    return;
  }

  const companyIds = memberships.map((membership) => membership.companyId);
  const projects = await prisma.project.findMany({
    where: {
      companyId: {
        in: companyIds
      }
    },
    select: {
      id: true
    }
  });

  await Promise.all(
    projects.map((project) =>
      emitProjectEvent({
        projectId: project.id,
        eventType: status === AgentStatus.ONLINE ? "agent.online" : "agent.offline",
        payload: {
          agentInstanceId,
          status
        }
      })
    )
  );
}
