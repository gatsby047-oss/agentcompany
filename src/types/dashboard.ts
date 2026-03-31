export type DashboardUser = {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  locale: string;
  createdAt: string;
};

export type DashboardStats = {
  companyCount: number;
  projectCount: number;
  runningProjectCount: number;
  blockedProjectCount: number;
  onlineAgentCount: number;
  totalAgentCount: number;
  queuedTaskCount: number;
  runningTaskCount: number;
  completedTaskCount: number;
};

export type DashboardCompanySummary = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  score: number;
  memberCount: number;
  humanCount: number;
  agentCount: number;
  onlineAgentCount: number;
  projectCount: number;
  runningProjectCount: number;
  createdAt: string;
};

export type DashboardProjectSummary = {
  id: string;
  companyId: string;
  companyName: string;
  name: string;
  summary: string | null;
  status: string;
  progressPercent: number;
  workflowCount: number;
  queuedTaskCount: number;
  runningTaskCount: number;
  blockedTaskCount: number;
  completedTaskCount: number;
  lastEventType: string | null;
  lastEventAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
};

export type DashboardProjectEvent = {
  id: string;
  projectId: string;
  taskRunId: string | null;
  eventType: string;
  payload: unknown;
  createdAt: string;
};

export type DashboardAgentSummary = {
  id: string;
  displayName: string;
  provider: string;
  status: string;
  lastHeartbeatAt: string | null;
  capabilities: string[];
};

export type DashboardWorkflowNodeSummary = {
  id: string;
  nodeKey: string;
  title: string;
  status: string;
  progressPercent: number;
  targetMembershipId: string | null;
  targetLabel: string | null;
  targetType: "human" | "agent" | null;
  config: {
    prompt: string | null;
  };
  lastError: string | null;
  startedAt: string | null;
  completedAt: string | null;
};

export type DashboardWorkflowDefinitionNode = {
  nodeKey: string;
  title: string;
  targetMembershipId?: string | null;
};

export type DashboardWorkflowDefinitionEdge = {
  fromNodeKey: string;
  toNodeKey: string;
};

export type DashboardTaskSummary = {
  id: string;
  workflowNodeId: string;
  title: string;
  status: string;
  progressPercent: number;
  runNo: number;
  assigneeLabel: string | null;
  assigneeType: "human" | "agent" | null;
  queuedAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

export type DashboardWorkflowSummary = {
  id: string;
  version: number;
  status: string;
  nodeCount: number;
  queuedNodeCount: number;
  runningNodeCount: number;
  blockedNodeCount: number;
  completedNodeCount: number;
  pendingNodeCount: number;
  definition: {
    nodes: DashboardWorkflowDefinitionNode[];
    edges: DashboardWorkflowDefinitionEdge[];
  };
  nodes: DashboardWorkflowNodeSummary[];
};

export type DashboardProjectAssigneeOption = {
  membershipId: string;
  label: string;
  type: "human" | "agent";
  role: string;
  status: string;
};

export type DashboardEvaluationProviderSummary = {
  provider: string;
  runCount: number;
  logicalTaskCount: number;
  successRate: number;
  retryRate: number;
  averageLatencyMs: number | null;
  totalEstimatedCostUsd: number;
  totalPromptTokens: number;
  totalOutputTokens: number;
  totalToolCalls: number;
};

export type DashboardEvaluationSummary = {
  totalRuns: number;
  logicalTaskCount: number;
  completedRuns: number;
  failedRuns: number;
  blockedRuns: number;
  successRate: number;
  retryRate: number;
  averageLatencyMs: number | null;
  averageQueueDelayMs: number | null;
  totalEstimatedCostUsd: number;
  totalPromptTokens: number;
  totalOutputTokens: number;
  totalToolCalls: number;
  providers: DashboardEvaluationProviderSummary[];
};

export type DashboardProjectDetail = {
  id: string;
  companyId: string;
  companyName: string;
  name: string;
  summary: string | null;
  status: string;
  progressPercent: number;
  startedAt: string | null;
  completedAt: string | null;
  availableAssignees: DashboardProjectAssigneeOption[];
  evaluation: DashboardEvaluationSummary;
  workflow: DashboardWorkflowSummary | null;
  agents: {
    onlineCount: number;
    offlineCount: number;
    errorCount: number;
    items: DashboardAgentSummary[];
  };
  recentTasks: DashboardTaskSummary[];
  recentEvents: DashboardProjectEvent[];
};

export type DashboardLeaderboardEntry = {
  companyId: string;
  name: string;
  slug: string;
  score: number;
};

export type DashboardOverview = {
  user: DashboardUser | null;
  stats: DashboardStats;
  companies: DashboardCompanySummary[];
  projects: DashboardProjectSummary[];
  selectedProjectId: string | null;
  selectedProject: DashboardProjectDetail | null;
  leaderboard: DashboardLeaderboardEntry[];
  serverTime: string;
};

export type DashboardOverviewResponse = {
  data: DashboardOverview;
};
