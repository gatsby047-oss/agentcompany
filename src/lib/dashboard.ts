import {
  AgentStatus,
  MembershipMemberType,
  MembershipRole,
  MembershipStatus,
  Prisma
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { buildProjectEvaluationSummary } from "@/lib/evaluation";
import { serializeProjectEvent } from "@/lib/events";
import type {
  DashboardAgentSummary,
  DashboardCompanySummary,
  DashboardLeaderboardEntry,
  DashboardOverview,
  DashboardProjectDetail,
  DashboardProjectSummary,
  DashboardStats,
  DashboardTaskSummary,
  DashboardUser,
  DashboardWorkflowDefinitionEdge,
  DashboardWorkflowDefinitionNode,
  DashboardWorkflowNodeSummary,
  DashboardWorkflowSummary
} from "@/types/dashboard";

const accessibleRoles = [MembershipRole.ADMIN, MembershipRole.MEMBER];

const emptyStats: DashboardStats = {
  companyCount: 0,
  projectCount: 0,
  runningProjectCount: 0,
  blockedProjectCount: 0,
  onlineAgentCount: 0,
  totalAgentCount: 0,
  queuedTaskCount: 0,
  runningTaskCount: 0,
  completedTaskCount: 0
};

type DashboardContextUser = {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  locale: string;
  createdAt: Date;
};

function toIso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function serializeDashboardUser(user: DashboardContextUser): DashboardUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    locale: user.locale,
    createdAt: user.createdAt.toISOString()
  };
}

function createStatusCounter<T extends string>() {
  return new Map<string, Partial<Record<T, number>>>();
}

function toRecord(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getStatusCount<T extends string>(
  counts: Map<string, Partial<Record<T, number>>>,
  key: string,
  status: T
) {
  return counts.get(key)?.[status] ?? 0;
}

type WorkflowDefinitionShape = {
  nodes?: Array<{
    nodeKey: string;
    title?: string;
    targetMembershipId?: string | null;
  }>;
  edges?: Array<{
    fromNodeKey: string;
    toNodeKey: string;
  }>;
};

function getWorkflowDefinitionNodes(
  definitionJson: Prisma.JsonValue | null | undefined,
  workflowNodes: DashboardWorkflowNodeSummary[]
): DashboardWorkflowDefinitionNode[] {
  const definition = (definitionJson ?? {}) as WorkflowDefinitionShape;
  if (definition.nodes?.length) {
    return definition.nodes.map((node) => {
      const fallbackNode = workflowNodes.find((item) => item.nodeKey === node.nodeKey);
      return {
        nodeKey: node.nodeKey,
        title: node.title ?? fallbackNode?.title ?? node.nodeKey,
        targetMembershipId: node.targetMembershipId ?? null
      };
    });
  }

  return workflowNodes.map((node) => ({
    nodeKey: node.nodeKey,
    title: node.title,
    targetMembershipId: null
  }));
}

function getWorkflowDefinitionEdges(
  definitionJson: Prisma.JsonValue | null | undefined
): DashboardWorkflowDefinitionEdge[] {
  const definition = (definitionJson ?? {}) as WorkflowDefinitionShape;
  return (definition.edges ?? []).map((edge) => ({
    fromNodeKey: edge.fromNodeKey,
    toNodeKey: edge.toNodeKey
  }));
}

function buildNodeOrder(definitionJson: Prisma.JsonValue | null | undefined) {
  const definition = (definitionJson ?? {}) as WorkflowDefinitionShape;
  return new Map(
    (definition.nodes ?? []).map((node, index) => [node.nodeKey, index])
  );
}

function getNodePrompt(configJson: Prisma.JsonValue | null | undefined) {
  const config = toRecord(configJson);
  return typeof config?.prompt === "string" ? config.prompt : null;
}

function sortProjects<T extends { status: string; createdAt: Date }>(projects: T[]) {
  const statusPriority: Record<string, number> = {
    RUNNING: 0,
    BLOCKED: 1,
    FAILED: 2,
    DRAFT: 3,
    COMPLETED: 4
  };

  return [...projects].sort((left, right) => {
    const priorityDelta =
      (statusPriority[left.status] ?? 99) - (statusPriority[right.status] ?? 99);

    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    return right.createdAt.getTime() - left.createdAt.getTime();
  });
}

function mapTaskSummary(taskRun: {
  id: string;
  workflowNodeId: string;
  workflowNode: {
    title: string;
  };
  status: string;
  progressPercent: number;
  runNo: number;
  assignedAgentInstance: {
    displayName: string;
  } | null;
  assignedUser: {
    displayName: string;
  } | null;
  queuedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}): DashboardTaskSummary {
  const assigneeLabel =
    taskRun.assignedAgentInstance?.displayName ??
    taskRun.assignedUser?.displayName ??
    null;

  return {
    id: taskRun.id,
    workflowNodeId: taskRun.workflowNodeId,
    title: taskRun.workflowNode.title,
    status: taskRun.status,
    progressPercent: taskRun.progressPercent,
    runNo: taskRun.runNo,
    assigneeLabel,
    assigneeType: taskRun.assignedAgentInstance
      ? "agent"
      : taskRun.assignedUser
        ? "human"
        : null,
    queuedAt: taskRun.queuedAt.toISOString(),
    startedAt: toIso(taskRun.startedAt),
    completedAt: toIso(taskRun.completedAt)
  };
}

function mapAgentSummary(membership: {
  agentInstance: {
    id: string;
    displayName: string;
    provider: string;
    status: string;
    lastHeartbeatAt: Date | null;
    capabilitiesJson: Prisma.JsonValue | null;
  } | null;
}): DashboardAgentSummary | null {
  if (!membership.agentInstance) {
    return null;
  }

  const capabilitiesRecord =
    membership.agentInstance.capabilitiesJson &&
    typeof membership.agentInstance.capabilitiesJson === "object" &&
    !Array.isArray(membership.agentInstance.capabilitiesJson)
      ? (membership.agentInstance.capabilitiesJson as Record<string, unknown>)
      : {};

  return {
    id: membership.agentInstance.id,
    displayName: membership.agentInstance.displayName,
    provider: membership.agentInstance.provider,
    status: membership.agentInstance.status,
    lastHeartbeatAt: toIso(membership.agentInstance.lastHeartbeatAt),
    capabilities: Object.keys(capabilitiesRecord)
  };
}

async function getSelectedProjectDetail(projectId: string): Promise<DashboardProjectDetail | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      company: {
        select: {
          id: true,
          name: true
        }
      },
      workflows: {
        orderBy: {
          createdAt: "desc"
        },
        take: 1,
        include: {
          nodes: {
            include: {
              targetMembership: {
                include: {
                  user: {
                    select: {
                      displayName: true
                    }
                  },
                  agentInstance: {
                    select: {
                      displayName: true,
                      status: true
                    }
                  }
                }
              }
            }
          }
        }
      },
      taskRuns: {
        orderBy: {
          queuedAt: "desc"
        },
        take: 12,
        include: {
          workflowNode: {
            select: {
              title: true
            }
          },
          assignedAgentInstance: {
            select: {
              displayName: true
            }
          },
          assignedUser: {
            select: {
              displayName: true
            }
          }
        }
      },
      projectEvents: {
        orderBy: {
          id: "desc"
        },
        take: 18
      }
    }
  });

  if (!project) {
    return null;
  }

  const latestWorkflow = project.workflows[0] ?? null;
  const nodeOrder = buildNodeOrder(latestWorkflow?.definitionJson);
  const workflowNodes = [...(latestWorkflow?.nodes ?? [])]
    .sort(
      (left, right) =>
        (nodeOrder.get(left.nodeKey) ?? Number.MAX_SAFE_INTEGER) -
        (nodeOrder.get(right.nodeKey) ?? Number.MAX_SAFE_INTEGER)
    )
    .map<DashboardWorkflowNodeSummary>((node) => ({
      id: node.id,
      nodeKey: node.nodeKey,
      title: node.title,
      status: node.status,
      progressPercent: node.progressPercent,
      targetMembershipId: node.targetMembershipId,
      targetLabel:
        node.targetMembership?.agentInstance?.displayName ??
        node.targetMembership?.user?.displayName ??
        null,
      targetType: node.targetMembership?.agentInstance
        ? "agent"
        : node.targetMembership?.user
          ? "human"
          : null,
      config: {
        prompt: getNodePrompt(node.configJson)
      },
      lastError: node.lastError,
      startedAt: toIso(node.startedAt),
      completedAt: toIso(node.completedAt)
    }));

  const workflowSummary: DashboardWorkflowSummary | null = latestWorkflow
    ? {
        id: latestWorkflow.id,
        version: latestWorkflow.version,
        status: latestWorkflow.status,
        nodeCount: workflowNodes.length,
        queuedNodeCount: workflowNodes.filter((node) => node.status === "QUEUED").length,
        runningNodeCount: workflowNodes.filter((node) => node.status === "RUNNING").length,
        blockedNodeCount: workflowNodes.filter((node) =>
          ["BLOCKED", "FAILED"].includes(node.status)
        ).length,
        completedNodeCount: workflowNodes.filter((node) => node.status === "COMPLETED").length,
        pendingNodeCount: workflowNodes.filter((node) => node.status === "PENDING").length,
        definition: {
          nodes: getWorkflowDefinitionNodes(latestWorkflow.definitionJson, workflowNodes),
          edges: getWorkflowDefinitionEdges(latestWorkflow.definitionJson)
        },
        nodes: workflowNodes
      }
    : null;

  const [agentMemberships, assignableMemberships, evaluationRows] = await Promise.all([
    prisma.membership.findMany({
      where: {
        companyId: project.companyId,
        memberType: MembershipMemberType.AGENT,
        status: MembershipStatus.ACTIVE
      },
      include: {
        agentInstance: {
          select: {
            id: true,
            displayName: true,
            provider: true,
            status: true,
            lastHeartbeatAt: true,
            capabilitiesJson: true
          }
        }
      },
      orderBy: {
        createdAt: "asc"
      }
    }),
    prisma.membership.findMany({
      where: {
        companyId: project.companyId,
        status: MembershipStatus.ACTIVE,
        role: {
          in: [MembershipRole.ADMIN, MembershipRole.MEMBER, MembershipRole.AGENT]
        }
      },
      include: {
        user: {
          select: {
            displayName: true
          }
        },
        agentInstance: {
          select: {
            displayName: true
          }
        }
      },
      orderBy: {
        createdAt: "asc"
      }
    }),
    prisma.taskRun.findMany({
      where: {
        projectId: project.id
      },
      select: {
        id: true,
        workflowRunId: true,
        workflowNodeId: true,
        status: true,
        runNo: true,
        queuedAt: true,
        startedAt: true,
        completedAt: true,
        outputJson: true,
        assignedAgentInstance: {
          select: {
            provider: true
          }
        }
      }
    })
  ]);

  const agents = agentMemberships
    .map(mapAgentSummary)
    .filter((agent): agent is DashboardAgentSummary => agent !== null);
  const evaluation = buildProjectEvaluationSummary(evaluationRows);
  const availableAssignees = assignableMemberships.map((membership) => ({
    membershipId: membership.id,
    label:
      membership.agentInstance?.displayName ??
      membership.user?.displayName ??
      "Unnamed assignee",
    type:
      membership.memberType === MembershipMemberType.AGENT
        ? ("agent" as const)
        : ("human" as const),
    role: membership.role,
    status: membership.status
  }));

  return {
    id: project.id,
    companyId: project.company.id,
    companyName: project.company.name,
    name: project.name,
    summary: project.summary,
    status: project.status,
    progressPercent: project.progressPercent,
    startedAt: toIso(project.startedAt),
    completedAt: toIso(project.completedAt),
    availableAssignees,
    evaluation,
    workflow: workflowSummary,
    agents: {
      onlineCount: agents.filter((agent) => agent.status === AgentStatus.ONLINE).length,
      offlineCount: agents.filter((agent) => agent.status === AgentStatus.OFFLINE).length,
      errorCount: agents.filter((agent) => agent.status === AgentStatus.ERROR).length,
      items: agents
    },
    recentTasks: project.taskRuns.map(mapTaskSummary),
    recentEvents: project.projectEvents.map(serializeProjectEvent)
  };
}

export function createAnonymousDashboardOverview(): DashboardOverview {
  return {
    user: null,
    stats: emptyStats,
    companies: [],
    projects: [],
    selectedProjectId: null,
    selectedProject: null,
    leaderboard: [],
    serverTime: new Date().toISOString()
  };
}

export async function buildDashboardOverview(input: {
  user: DashboardContextUser;
  projectId?: string | null;
}): Promise<DashboardOverview> {
  const companiesRaw = await prisma.company.findMany({
    where: {
      memberships: {
        some: {
          userId: input.user.id,
          status: MembershipStatus.ACTIVE,
          role: {
            in: accessibleRoles
          }
        }
      }
    },
    include: {
      memberships: {
        where: {
          status: MembershipStatus.ACTIVE
        },
        select: {
          memberType: true,
          agentInstance: {
            select: {
              status: true
            }
          }
        }
      },
      _count: {
        select: {
          memberships: true,
          projects: true
        }
      }
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  const companyIds = companiesRaw.map((company) => company.id);
  const projectRows = companyIds.length
    ? await prisma.project.findMany({
        where: {
          companyId: {
            in: companyIds
          }
        },
        include: {
          company: {
            select: {
              id: true,
              name: true
            }
          },
          _count: {
            select: {
              workflows: true
            }
          },
          projectEvents: {
            orderBy: {
              id: "desc"
            },
            take: 1,
            select: {
              eventType: true,
              createdAt: true
            }
          }
        }
      })
    : [];

  const sortedProjects = sortProjects(projectRows);
  const projectIds = sortedProjects.map((project) => project.id);
  const taskStatusCounts = projectIds.length
    ? await prisma.taskRun.groupBy({
        by: ["projectId", "status"],
        where: {
          projectId: {
            in: projectIds
          }
        },
        _count: {
          _all: true
        }
      })
    : [];

  const taskCountsByProject = createStatusCounter<string>();
  for (const row of taskStatusCounts) {
    const projectCounts = taskCountsByProject.get(row.projectId) ?? {};
    projectCounts[row.status] = row._count._all;
    taskCountsByProject.set(row.projectId, projectCounts);
  }

  const projectSummaries: DashboardProjectSummary[] = sortedProjects.map((project) => ({
    id: project.id,
    companyId: project.company.id,
    companyName: project.company.name,
    name: project.name,
    summary: project.summary,
    status: project.status,
    progressPercent: project.progressPercent,
    workflowCount: project._count.workflows,
    queuedTaskCount: getStatusCount(taskCountsByProject, project.id, "QUEUED"),
    runningTaskCount: getStatusCount(taskCountsByProject, project.id, "RUNNING"),
    blockedTaskCount:
      getStatusCount(taskCountsByProject, project.id, "BLOCKED") +
      getStatusCount(taskCountsByProject, project.id, "FAILED"),
    completedTaskCount: getStatusCount(taskCountsByProject, project.id, "COMPLETED"),
    lastEventType: project.projectEvents[0]?.eventType ?? null,
    lastEventAt: toIso(project.projectEvents[0]?.createdAt),
    startedAt: toIso(project.startedAt),
    completedAt: toIso(project.completedAt),
    createdAt: project.createdAt.toISOString()
  }));

  const runningProjectsByCompany = new Map<string, number>();
  for (const project of projectSummaries) {
    if (project.status !== "RUNNING") {
      continue;
    }

    runningProjectsByCompany.set(
      project.companyId,
      (runningProjectsByCompany.get(project.companyId) ?? 0) + 1
    );
  }

  const companySummaries: DashboardCompanySummary[] = companiesRaw.map((company) => {
    const humanCount = company.memberships.filter(
      (membership) => membership.memberType === MembershipMemberType.HUMAN
    ).length;
    const agentMemberships = company.memberships.filter(
      (membership) =>
        membership.memberType === MembershipMemberType.AGENT && membership.agentInstance
    );
    const onlineAgentCount = agentMemberships.filter(
      (membership) => membership.agentInstance?.status === AgentStatus.ONLINE
    ).length;

    return {
      id: company.id,
      name: company.name,
      slug: company.slug,
      description: company.description,
      score: company.score,
      memberCount: company.memberships.length,
      humanCount,
      agentCount: agentMemberships.length,
      onlineAgentCount,
      projectCount: company._count.projects,
      runningProjectCount: runningProjectsByCompany.get(company.id) ?? 0,
      createdAt: company.createdAt.toISOString()
    };
  });

  const selectedProjectId =
    projectSummaries.find((project) => project.id === input.projectId)?.id ??
    projectSummaries.find((project) => project.status === "RUNNING")?.id ??
    projectSummaries[0]?.id ??
    null;

  const [selectedProject, leaderboardCompanies] = await Promise.all([
    selectedProjectId ? getSelectedProjectDetail(selectedProjectId) : Promise.resolve(null),
    prisma.company.findMany({
      orderBy: [
        {
          score: "desc"
        },
        {
          createdAt: "asc"
        }
      ],
      take: 5,
      select: {
        id: true,
        name: true,
        slug: true,
        score: true
      }
    })
  ]);

  const leaderboard: DashboardLeaderboardEntry[] = leaderboardCompanies.map((company) => ({
    companyId: company.id,
    name: company.name,
    slug: company.slug,
    score: company.score
  }));

  const stats: DashboardStats = {
    companyCount: companySummaries.length,
    projectCount: projectSummaries.length,
    runningProjectCount: projectSummaries.filter((project) => project.status === "RUNNING")
      .length,
    blockedProjectCount: projectSummaries.filter((project) =>
      ["BLOCKED", "FAILED"].includes(project.status)
    ).length,
    onlineAgentCount: companySummaries.reduce(
      (sum, company) => sum + company.onlineAgentCount,
      0
    ),
    totalAgentCount: companySummaries.reduce((sum, company) => sum + company.agentCount, 0),
    queuedTaskCount: projectSummaries.reduce(
      (sum, project) => sum + project.queuedTaskCount,
      0
    ),
    runningTaskCount: projectSummaries.reduce(
      (sum, project) => sum + project.runningTaskCount,
      0
    ),
    completedTaskCount: projectSummaries.reduce(
      (sum, project) => sum + project.completedTaskCount,
      0
    )
  };

  return {
    user: serializeDashboardUser(input.user),
    stats,
    companies: companySummaries,
    projects: projectSummaries,
    selectedProjectId,
    selectedProject,
    leaderboard,
    serverTime: new Date().toISOString()
  };
}
