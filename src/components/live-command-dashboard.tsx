"use client";

import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import LiveOpsFeed, { type FeedItem } from "@/components/live-ops-feed";
import {
  AgentConnectModal,
  CompanyNetworkPanel,
  CompanyCreationPanel,
  EvaluationPanel,
  InviteMemberModal,
  LeaderboardPanel,
  ProjectCreationForm,
  ProjectCreationPanel,
  ProjectSelectionPanel,
  RecentTasksPanel,
  TaskDetailModal,
  WorkflowPanel
} from "@/components/live-command-dashboard-panels";
import PixelCommandDeck, {
  type PixelNodeSnapshot
} from "@/components/pixel-command-deck";
import type {
  DashboardOverview,
  DashboardOverviewResponse,
  DashboardProjectDetail,
  DashboardProjectEvent,
  DashboardWorkflowSummary
} from "@/types/dashboard";

const STREAM_EVENT_TYPES = [
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

type DashboardLanguage = "zh-HK" | "en-US";

const LANGUAGE_STORAGE_KEY = "agentcompany.dashboard.language";
const GUIDE_STORAGE_KEY = "agentcompany.dashboard.guide.dismissed";

const statusLabelMapByLanguage: Record<DashboardLanguage, Record<string, string>> = {
  "zh-HK": {
    DRAFT: "草稿",
    RUNNING: "运行中",
    BLOCKED: "阻塞",
    FAILED: "失败",
    COMPLETED: "已完成",
    QUEUED: "排队中",
    PENDING: "待处理"
  },
  "en-US": {
    DRAFT: "Draft",
    RUNNING: "Running",
    BLOCKED: "Blocked",
    FAILED: "Failed",
    COMPLETED: "Completed",
    QUEUED: "Queued",
    PENDING: "Pending"
  }
};

const streamStateMapByLanguage = {
  "zh-HK": {
    idle: { label: "空闲", tone: "neutral" },
    connecting: { label: "连接中", tone: "warm" },
    live: { label: "SSE 已连接", tone: "good" },
    retrying: { label: "重连中", tone: "warm" },
    error: { label: "已断开", tone: "danger" }
  },
  "en-US": {
    idle: { label: "Idle", tone: "neutral" },
    connecting: { label: "Connecting", tone: "warm" },
    live: { label: "SSE Live", tone: "good" },
    retrying: { label: "Reconnecting", tone: "warm" },
    error: { label: "Disconnected", tone: "danger" }
  }
} as const;

const dashboardCopy = {
  "zh-HK": {
    login: "登录",
    register: "注册",
    displayName: "显示名称",
    displayNamePlaceholder: "创始人",
    email: "邮箱",
    emailPlaceholder: "founder@company.ai",
    password: "密码",
    passwordPlaceholder: "至少 8 位字符",
    submitting: "提交中...",
    createAccount: "创建账号",
    loginHint: "使用已有会话即可进入实时指挥舱。",
    registerHint: "注册后会立即创建登录会话。",
    unknown: "未知",
    notStarted: "未开始",
    workflowNode: "工作流节点",
    waitingForAssignee: "等待 Agent 或成员接手。运行 #",
    executionStarted: "执行已开始",
    progressing: "进度同步到指挥舱",
    taskFailedDetail: "任务失败，需要重试或人工介入。",
    taskCompletedDetail: "输出已持久化，下游依赖可以继续执行。",
    workflowBlocked: "工作流阻塞",
    workflowBlockedDetail: "某个依赖或派发步骤阻塞了这次运行。",
    workflowCompleted: "工作流已完成",
    workflowCompletedDetail: "所有节点均已完成，项目进入终态。",
    agentOnline: "Agent 已上线",
    agentOnlineDetail: "心跳恢复，Agent 重新加入调度。",
    agentOffline: "Agent 已离线",
    agentOfflineDetail: "心跳过期或 Agent 已断开。",
    realtimeEventReceived: "收到实时事件",
    realtimeEventReceivedDetail: "客户端已将该事件合并到实时指挥舱状态。",
    dashboardLoadError: "无法加载仪表盘总览",
    authFailed: "认证失败",
    createProjectValidation: "请选择公司并输入项目名称",
    createProjectFailed: "创建项目失败",
    createCompanyValidation: "请输入公司名称",
    createCompanyFailed: "创建公司失败",
    workflowValidationNodes: "请至少为工作流添加一个节点",
    workflowValidationSelfLoop: "工作流不能包含自环，请移除连接自身的边。",
    workflowValidationCycle: "工作流不能包含循环依赖，请检查边连接关系。",
    saveWorkflowFailed: "保存工作流失败",
    runWorkflowMissing: "当前没有可运行的工作流",
    runWorkflowFailed: "启动工作流失败",
    createAgentValidation: "请填写所有必填字段",
    createAgentFailed: "创建 Agent 失败",
    inviteValidation: "请输入邮箱地址",
    inviteFailed: "创建邀请失败",
    brandSubtitle: "面向面试展示的 Agent 编排指挥舱",
    navProjects: "项目",
    navWorkflow: "工作流",
    navCompanies: "公司",
    logout: "退出登录",
    heroKicker: "面试版总览",
    heroTitleLines: ["可运行的 Agent Workflow 系统", "而不只是一个 LLM Demo"],
    heroCopy:
      "这一版首页优先帮助面试官理解你的工程价值：真实 Provider 接入、工作流执行、工具调用、Token 与成本记录、离线评估，以及能稳定演示的本地与 E2E 环境。",
    refreshOverview: "刷新总览",
    viewLiveProjects: "查看实时项目",
    openAuthConsole: "打开认证面板",
    quickStartKicker: "推荐演示顺序",
    quickStartTitle: "5 分钟看懂系统主链路",
    quickStartDescription: "按这个顺序演示，面试官最容易同时看到产品理解、后端编排、LLM 集成和可观测性。",
    quickStartSteps: [
      { title: "1. 连接真实 Provider", detail: "先连接 OpenAI 或 Anthropic，让面试官确认这不是假数据或纯前端演示。" },
      { title: "2. 查看节点 Prompt", detail: "在 Workflow 区打开节点配置，说明任务是如何被 Prompt 和工具驱动的。" },
      { title: "3. 运行并看任务详情", detail: "展示 prompt、tool calls、token、cost，再切到 evaluation 面板看聚合指标。" }
    ],
    nextActionKicker: "当前最适合展示",
    nextActionTitle: "下一步操作建议",
    nextActionLoggedOut: "先登录或注册",
    nextActionLoggedOutDetail: "只有拿到会话后，页面才会开始读取真实项目、任务和 SSE 实时事件。",
    nextActionNoCompany: "先创建第一家公司",
    nextActionNoCompanyDetail: "公司是最外层容器，项目、成员和 Agent 都会挂在公司下面。",
    nextActionNoProject: "接着创建第一个项目",
    nextActionNoProjectDetail: "项目是工作流和任务的承载体，后面的运行、排行和事件都围绕项目展开。",
    nextActionNoWorkflow: "先补一条工作流",
    nextActionNoWorkflowDetail: "有了项目之后，下一步是定义节点和依赖边，这样系统才知道怎样执行。",
    nextActionRunning: "现在适合观察实时反馈",
    nextActionRunningDetail: "工作流已经在运行，你可以重点看右侧事件流、任务列表和节点状态颜色变化。",
    nextActionReady: "可以直接运行一次试试看",
    nextActionReadyDetail: "如果工作流已经保存但还没开跑，点 Run Workflow 最容易看到系统完整效果。",
    reviewHighlightsKicker: "面试官应重点看",
    reviewHighlightsTitle: "这份项目最能说明你的三个点",
    reviewHighlightsDescription: "这三项一起出现，才会让项目从普通 AI Demo 升级成更像工程作品的材料。",
    reviewHighlights: [
      { title: "真实执行链路", detail: "Provider 运行在 worker 中，任务状态、日志、输出和项目事件可以串成一条完整链路。" },
      { title: "可观测与可评估", detail: "单次任务能看 prompt、tool call、token、cost；项目层还能看 success rate、latency、retry rate。" },
      { title: "演示可靠性", detail: "Node、pnpm、Playwright、启动脚本和 smoke command 都对齐过，现场成功率更高。" }
    ],
    guideButton: "面试导览",
    guideDismiss: "先收起",
    guideKicker: "Reviewer guide",
    guideTitle: "建议按这个顺序审阅",
    guideDescription: "这不是功能阉割版，而是保留完整能力、同时把价值解释得更清楚的面试版本。",
    guideFlow: [
      { title: "登录", detail: "进入真实后端数据和实时 SSE 事件，而不是静态页面。" },
      { title: "项目", detail: "项目区展示状态快照、任务和事件流，是系统运行态的入口。" },
      { title: "工作流", detail: "在这里查看节点 Prompt、依赖关系以及执行结果。" },
      { title: "任务详情", detail: "重点看 prompt、tool calls、token usage、estimated cost。" },
      { title: "评估面板", detail: "最后看 success rate、latency、retry rate 和 cost，说明你有运营视角。" }
    ],
    guideOpenAuth: "去登录",
    guideOpenSetup: "去完成初始化",
    guideOpenOps: "去看项目区",
    guideOpenWorkflow: "去看工作流区",
    guideOpenCompanies: "去看公司区",
    opsGuideTitle: "先看系统当前在运行什么",
    opsGuideDetail: "项目区会把状态快照、事件流和最近任务并排展示，适合先建立整体运行图景。",
    workflowGuideTitle: "这里最能体现你的 Agent 工程能力",
    workflowGuideDetail: "工作流区不仅能定义和运行流程，还能展示节点 Prompt、任务细节和离线评估。",
    companiesGuideTitle: "这里展示资源接入与协作边界",
    companiesGuideDetail: "公司区适合展示成员、Agent、邀请和 Provider 接入，帮助面试官理解执行资源来自哪里。",
    onlineAgents: "在线 Agent",
    totalPrefix: "总计",
    runningProjects: "运行中项目",
    trackedSuffix: "个已追踪",
    runningTasks: "运行中任务",
    queuedPrefix: "排队中",
    completedPrefix: "已完成",
    loading: "加载中",
    pullOverview: "正在拉取实时总览",
    pullOverviewDetail: "正在读取公司、项目、任务、工作流状态和排行榜快照。",
    errorKicker: "错误",
    dashboardLoadFailed: "仪表盘加载失败",
    authConsoleKicker: "认证面板",
    authConsoleTitle: "登录或注册以开启实时 SSE 数据",
    authConsoleDescription: "这是创建会话 Cookie 并进入实时指挥舱所需的最小界面。注册后会立即登录。",
    apiSurfaceKicker: "API 面",
    authEndpointsTitle: "认证接口已经接好",
    cookieSession: "Cookie 会话",
    addFirstProjectTitle: "添加你的第一个项目",
    addFirstProjectDescription: "项目承载工作流并追踪进度。选择一个公司来组织这个项目。",
    waitingForFirstEvent: "等待第一条事件",
    waitingForFirstEventDetail: "工作流启动后，task.*、workflow.*、agent.* 事件会在这里持续流入。",
    goThere: "前往这里",
    languageLabel: "语言",
    chinese: "中文",
    english: "English"
  },
  "en-US": {
    login: "Login",
    register: "Register",
    displayName: "Display name",
    displayNamePlaceholder: "Founder",
    email: "Email",
    emailPlaceholder: "founder@company.ai",
    password: "Password",
    passwordPlaceholder: "minimum 8 characters",
    submitting: "Submitting...",
    createAccount: "Create account",
    loginHint: "Use an existing session to unlock the live cockpit.",
    registerHint: "Registration also creates a session cookie immediately.",
    unknown: "Unknown",
    notStarted: "Not started",
    workflowNode: "Workflow node",
    waitingForAssignee: "Waiting for an agent or member to take over. Run #",
    executionStarted: "Execution has started",
    progressing: "SSE synced progress to the cockpit",
    taskFailedDetail: "Task failed and requires retry or intervention.",
    taskCompletedDetail: "Output is persisted and downstream dependencies can continue.",
    workflowBlocked: "Workflow blocked",
    workflowBlockedDetail: "A dependency or dispatch step is blocking the run.",
    workflowCompleted: "Workflow completed",
    workflowCompletedDetail: "All nodes finished and the project reached its terminal state.",
    agentOnline: "Agent online",
    agentOnlineDetail: "Heartbeat resumed and the agent rejoined scheduling.",
    agentOffline: "Agent offline",
    agentOfflineDetail: "Heartbeat expired or the agent disconnected.",
    realtimeEventReceived: "Realtime event received",
    realtimeEventReceivedDetail: "The client merged the event into the live cockpit state.",
    dashboardLoadError: "Unable to load dashboard overview",
    authFailed: "Authentication failed",
    createProjectValidation: "Please select a company and enter a project name",
    createProjectFailed: "Failed to create project",
    createCompanyValidation: "Please enter a company name",
    createCompanyFailed: "Failed to create company",
    workflowValidationNodes: "Please add at least one node to the workflow",
    workflowValidationSelfLoop: "Workflow cannot contain self-loops. Please remove the edge connecting a node to itself.",
    workflowValidationCycle: "Workflow cannot contain circular dependencies. Please check your edge connections.",
    saveWorkflowFailed: "Failed to save workflow",
    runWorkflowMissing: "No workflow available to run",
    runWorkflowFailed: "Failed to start workflow",
    createAgentValidation: "Please fill in all required fields",
    createAgentFailed: "Failed to create agent",
    inviteValidation: "Please enter an email address",
    inviteFailed: "Failed to create invitation",
    brandSubtitle: "Interview-ready agent orchestration cockpit",
    navProjects: "Projects",
    navWorkflow: "Workflow",
    navCompanies: "Companies",
    logout: "Logout",
    heroKicker: "Interview overview",
    heroTitleLines: ["A runnable agent workflow system", "not just an LLM demo"],
    heroCopy:
      "This interview build is optimized for reviewer clarity. It foregrounds real provider integration, workflow execution, tool calling, token and cost logging, offline evaluation, and a demo setup that is meant to be repeatable.",
    refreshOverview: "Refresh overview",
    viewLiveProjects: "View live projects",
    openAuthConsole: "Open auth console",
    quickStartKicker: "Suggested demo path",
    quickStartTitle: "Understand the system in 5 minutes",
    quickStartDescription: "This sequence makes the candidate value easier to see: product thinking, orchestration, LLM integration, and observability.",
    quickStartSteps: [
      { title: "1. Connect a real provider", detail: "Start with OpenAI or Anthropic so the reviewer sees this is a real execution path, not mocked UI data." },
      { title: "2. Inspect a workflow node prompt", detail: "Use the Workflow section to show how prompts and built-in tools drive node behavior." },
      { title: "3. Run and inspect the result", detail: "Open task details for prompt, tool calls, tokens, and cost, then finish in the evaluation panel." }
    ],
    nextActionKicker: "Best next move",
    nextActionTitle: "What to show next",
    nextActionLoggedOut: "Log in or register first",
    nextActionLoggedOutDetail: "The dashboard only begins loading real projects, tasks, and SSE events after a valid session exists.",
    nextActionNoCompany: "Create your first company",
    nextActionNoCompanyDetail: "The company is the top-level container for projects, members, and connected agents.",
    nextActionNoProject: "Create the first project",
    nextActionNoProjectDetail: "Projects hold workflows and tasks. Most of the dashboard becomes meaningful once a project exists.",
    nextActionNoWorkflow: "Add a workflow next",
    nextActionNoWorkflowDetail: "Once the project exists, define nodes and dependencies so the system knows how to run it.",
    nextActionRunning: "Now watch the live feedback",
    nextActionRunningDetail: "The workflow is already running, so focus on the event feed, task list, and node color changes.",
    nextActionReady: "You can run a real test now",
    nextActionReadyDetail: "If the workflow is already saved but idle, click Run Workflow to see the full loop in action.",
    reviewHighlightsKicker: "What interviewers should notice",
    reviewHighlightsTitle: "Three signals this project is stronger than a basic AI demo",
    reviewHighlightsDescription:
      "These are the things that usually help reviewers understand candidate value quickly.",
    reviewHighlights: [
      { title: "Real execution path", detail: "Providers run in the worker and feed task state, logs, outputs, and project events through one end-to-end path." },
      { title: "Observability and evaluation", detail: "Single runs expose prompt, tool calls, tokens, and cost. Project-level views aggregate success, latency, retries, and spend." },
      { title: "Demo reliability", detail: "Versions, startup scripts, Playwright, and smoke tooling were aligned so the system is easier to demonstrate with confidence." }
    ],
    guideButton: "Interview guide",
    guideDismiss: "Hide for now",
    guideKicker: "Reviewer guide",
    guideTitle: "Suggested order for a 5-minute review",
    guideDescription:
      "This is not a stripped-down demo. It keeps the real feature set while making the engineering value easier to inspect.",
    guideFlow: [
      { title: "Login", detail: "Enter the real backend state and live SSE stream rather than a static mock." },
      { title: "Project", detail: "Start with the project overview to establish current state, recent tasks, and recent events." },
      { title: "Workflow", detail: "Use the workflow area to show prompt-driven nodes and execution structure." },
      { title: "Task detail", detail: "Open one task detail modal to inspect prompt, tool calls, token usage, and estimated cost." },
      { title: "Evaluation", detail: "End on success rate, latency, retry rate, and cost to show system-level thinking." }
    ],
    guideOpenAuth: "Open login",
    guideOpenSetup: "Open setup",
    guideOpenOps: "Open projects",
    guideOpenWorkflow: "Open workflow",
    guideOpenCompanies: "Open companies",
    opsGuideTitle: "Start with what the system is doing right now",
    opsGuideDetail: "The project area combines status, recent tasks, and recent events so reviewers can build a mental model of the running system first.",
    workflowGuideTitle: "This area shows the most candidate signal",
    workflowGuideDetail: "The workflow area is where prompt-driven nodes, execution control, task detail, and offline evaluation come together.",
    companiesGuideTitle: "This area explains the execution boundary",
    companiesGuideDetail: "Use the company area to show who can execute work, which agents are connected, and how provider-backed resources enter the system.",
    onlineAgents: "Online agents",
    totalPrefix: "Total",
    runningProjects: "Running projects",
    trackedSuffix: "tracked",
    runningTasks: "Running tasks",
    queuedPrefix: "Queued",
    completedPrefix: "Completed",
    loading: "Loading",
    pullOverview: "Pulling live overview",
    pullOverviewDetail: "Reading companies, projects, tasks, workflow state, and leaderboard snapshots.",
    errorKicker: "Error",
    dashboardLoadFailed: "Dashboard load failed",
    authConsoleKicker: "Auth console",
    authConsoleTitle: "Login or register to unlock live SSE data",
    authConsoleDescription: "This is the minimum UI needed to create a session cookie and enter the live cockpit. Registration logs the user in immediately.",
    apiSurfaceKicker: "API surface",
    authEndpointsTitle: "Auth endpoints already wired",
    cookieSession: "Cookie session",
    addFirstProjectTitle: "Add your first project",
    addFirstProjectDescription: "Projects contain workflows and track progress. Select a company to organize this project.",
    waitingForFirstEvent: "Waiting for the first event",
    waitingForFirstEventDetail: "Once a workflow starts, task.*, workflow.*, and agent.* events will stream here.",
    goThere: "Go there",
    languageLabel: "Language",
    chinese: "中文",
    english: "English"
  }
} as const;

type StreamState = keyof (typeof streamStateMapByLanguage)["en-US"];
type AuthMode = "login" | "register";

type AuthFormState = {
  displayName: string;
  email: string;
  password: string;
};

type ProjectFormState = {
  companyId: string;
  name: string;
  summary: string;
};

type CompanyFormState = {
  name: string;
  description: string;
};

type WorkflowFormState = {
  nodes: { nodeKey: string; title: string; prompt?: string; x?: number; y?: number }[];
  edges: { fromNodeKey: string; toNodeKey: string }[];
};

type AgentFormState = {
  companyId: string;
  provider: string;
  displayName: string;
  endpointUrl: string;
  authMode: "TOKEN" | "NONE";
  authSecret: string;
};

type InviteFormState = {
  email: string;
  role: "ADMIN" | "MEMBER";
  expiresInDays: number;
};

type TaskDetailState = {
  taskId: string | null;
  task: {
    id: string;
    nodeTitle: string;
    nodeKey: string;
    runNo: number;
    status: string;
    progressPercent: number;
    assignedUser: { displayName: string } | null;
    assignedAgentInstance: { displayName: string; provider: string } | null;
    assignedAgentInstanceId: string | null;
    queuedAt: string;
    startedAt: string | null;
    completedAt: string | null;
    inputJson: unknown;
    outputJson: unknown;
    lastError: string | null;
  } | null;
  logs: unknown;
  artifacts: Array<{
    key: string;
    name: string;
    type: string;
    size?: number;
  }>;
  isLoading: boolean;
};

const defaultAuthForm: AuthFormState = {
  displayName: "",
  email: "",
  password: ""
};

const defaultProjectForm: ProjectFormState = {
  companyId: "",
  name: "",
  summary: ""
};

const defaultCompanyForm: CompanyFormState = {
  name: "",
  description: ""
};

const defaultWorkflowForm: WorkflowFormState = {
  nodes: [{ nodeKey: "start", title: "Start", x: 50, y: 100 }],
  edges: []
};

function hasSelfLoop(edges: { fromNodeKey: string; toNodeKey: string }[], newEdge: { fromNodeKey: string; toNodeKey: string }) {
  return newEdge.fromNodeKey === newEdge.toNodeKey;
}

function hasCircularDependency(
  nodes: { nodeKey: string; title: string }[],
  edges: { fromNodeKey: string; toNodeKey: string }[],
  newEdge: { fromNodeKey: string; toNodeKey: string }
) {
  const adjacency = new Map<string, string[]>();
  for (const node of nodes) {
    adjacency.set(node.nodeKey, []);
  }
  for (const edge of edges) {
    adjacency.get(edge.fromNodeKey)?.push(edge.toNodeKey);
  }
  adjacency.get(newEdge.fromNodeKey)?.push(newEdge.toNodeKey);

  const visited = new Set<string>();
  const recStack = new Set<string>();

  function dfs(nodeKey: string): boolean {
    visited.add(nodeKey);
    recStack.add(nodeKey);

    for (const neighbor of adjacency.get(nodeKey) ?? []) {
      if (!visited.has(neighbor)) {
        if (dfs(neighbor)) return true;
      } else if (recStack.has(neighbor)) {
        return true;
      }
    }

    recStack.delete(nodeKey);
    return false;
  }

  for (const node of nodes) {
    if (!visited.has(node.nodeKey)) {
      if (dfs(node.nodeKey)) return true;
    }
  }
  return false;
}

function toWorkflowFormState(workflow: DashboardWorkflowSummary | null | undefined): WorkflowFormState {
  if (!workflow) {
    return defaultWorkflowForm;
  }

  const nodePromptByKey = new Map(
    workflow.nodes.map((node) => [node.nodeKey, node.config.prompt ?? ""])
  );

  const nodes = workflow.definition.nodes.map((node) => ({
    nodeKey: node.nodeKey,
    title: node.title,
    prompt: nodePromptByKey.get(node.nodeKey) ?? ""
  }));

  return {
    nodes: nodes.length > 0 ? nodes : defaultWorkflowForm.nodes,
    edges: workflow.definition.edges.map((edge) => ({
      fromNodeKey: edge.fromNodeKey,
      toNodeKey: edge.toNodeKey
    }))
  };
}

const defaultAgentForm: AgentFormState = {
  companyId: "",
  provider: "openai",
  displayName: "",
  endpointUrl: "",
  authMode: "TOKEN",
  authSecret: ""
};

const defaultInviteForm: InviteFormState = {
  email: "",
  role: "MEMBER",
  expiresInDays: 7
};

const defaultTaskDetailState: TaskDetailState = {
  taskId: null,
  task: null,
  logs: null,
  artifacts: [],
  isLoading: false
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isManagedProvider(provider: string) {
  return ["openai", "anthropic"].includes(provider.trim().toLowerCase());
}

function formatNumber(value: number, language: DashboardLanguage) {
  return new Intl.NumberFormat(language).format(value);
}

function formatClock(isoString: string | null | undefined, language: DashboardLanguage) {
  if (!isoString) {
    return "--:--";
  }

  return new Intl.DateTimeFormat(language, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(isoString));
}

function formatDateTime(
  isoString: string | null | undefined,
  language: DashboardLanguage,
  notStartedLabel: string
) {
  if (!isoString) {
    return notStartedLabel;
  }

  return new Intl.DateTimeFormat(language, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(isoString));
}

function getStatusLabel(
  status: string | null | undefined,
  language: DashboardLanguage,
  unknownLabel: string
) {
  if (!status) {
    return unknownLabel;
  }

  return statusLabelMapByLanguage[language][status] ?? status;
}

function getDefaultAgentCompanyId(overview: DashboardOverview | null) {
  return overview?.selectedProject?.companyId ?? overview?.companies[0]?.id ?? "";
}

function getSectionHref(
  overview: DashboardOverview | null,
  section: "ops" | "workflow" | "companies"
) {
  if (!overview?.user) {
    return "#auth";
  }

  if (overview.projects.length === 0) {
    return "#setup";
  }

  return `#${section}`;
}

function getNextActionCard(
  overview: DashboardOverview | null,
  copy: {
    nextActionLoggedOut: string;
    nextActionLoggedOutDetail: string;
    nextActionNoCompany: string;
    nextActionNoCompanyDetail: string;
    nextActionNoProject: string;
    nextActionNoProjectDetail: string;
    nextActionNoWorkflow: string;
    nextActionNoWorkflowDetail: string;
    nextActionRunning: string;
    nextActionRunningDetail: string;
    nextActionReady: string;
    nextActionReadyDetail: string;
  }
) {
  if (!overview?.user) {
    return {
      title: copy.nextActionLoggedOut,
      detail: copy.nextActionLoggedOutDetail,
      href: "#auth"
    };
  }

  if (overview.companies.length === 0) {
    return {
      title: copy.nextActionNoCompany,
      detail: copy.nextActionNoCompanyDetail,
      href: "#setup"
    };
  }

  if (overview.projects.length === 0) {
    return {
      title: copy.nextActionNoProject,
      detail: copy.nextActionNoProjectDetail,
      href: "#setup"
    };
  }

  if (!overview.selectedProject?.workflow) {
    return {
      title: copy.nextActionNoWorkflow,
      detail: copy.nextActionNoWorkflowDetail,
      href: "#workflow"
    };
  }

  if (overview.selectedProject.status === "RUNNING") {
    return {
      title: copy.nextActionRunning,
      detail: copy.nextActionRunningDetail,
      href: "#workflow"
    };
  }

  return {
    title: copy.nextActionReady,
    detail: copy.nextActionReadyDetail,
    href: "#workflow"
  };
}

function getGuideActions(
  overview: DashboardOverview | null,
  copy: {
    guideOpenAuth: string;
    guideOpenSetup: string;
    guideOpenOps: string;
    guideOpenWorkflow: string;
    guideOpenCompanies: string;
  }
) {
  if (!overview?.user) {
    return [{ label: copy.guideOpenAuth, href: "#auth" }];
  }

  if (overview.projects.length === 0) {
    return [{ label: copy.guideOpenSetup, href: "#setup" }];
  }

  return [
    { label: copy.guideOpenOps, href: "#ops" },
    { label: copy.guideOpenWorkflow, href: "#workflow" },
    { label: copy.guideOpenCompanies, href: "#companies" }
  ];
}

function getNodeTitle(
  project: DashboardProjectDetail | null | undefined,
  payload: Record<string, unknown>,
  language: DashboardLanguage
) {
  if (typeof payload.title === "string" && payload.title.length > 0) {
    return payload.title;
  }

  const workflowNodeId =
    typeof payload.workflowNodeId === "string" ? payload.workflowNodeId : null;

  if (!workflowNodeId) {
    return dashboardCopy[language].workflowNode;
  }

  return (
    project?.workflow?.nodes.find((node) => node.id === workflowNodeId)?.title ??
    dashboardCopy[language].workflowNode
  );
}

function toFeedItem(
  event: DashboardProjectEvent,
  project: DashboardProjectDetail | null | undefined,
  language: DashboardLanguage
): FeedItem {
  const copy = dashboardCopy[language];
  const payload = isRecord(event.payload) ? event.payload : {};
  const nodeTitle = getNodeTitle(project, payload, language);
  const progress =
    typeof payload.progressPercent === "number" ? payload.progressPercent : null;
  const error = typeof payload.error === "string" ? payload.error : null;

  switch (event.eventType) {
    case "task.queued":
      return {
        id: event.id,
        time: formatClock(event.createdAt, language),
        tag: event.eventType,
        title: language === "zh-HK" ? `${nodeTitle} 已排队` : `${nodeTitle} queued`,
        detail: `${copy.waitingForAssignee}${typeof payload.runNo === "number" ? payload.runNo : 1}.`
      };
    case "task.started":
      return {
        id: event.id,
        time: formatClock(event.createdAt, language),
        tag: event.eventType,
        title: language === "zh-HK" ? `${nodeTitle} 已开始` : `${nodeTitle} started`,
        detail:
          language === "zh-HK"
            ? `${copy.executionStarted}${progress !== null ? `，当前 ${progress}%` : ""}。`
            : `${copy.executionStarted}${progress !== null ? ` at ${progress}%` : ""}.`
      };
    case "task.progress":
      return {
        id: event.id,
        time: formatClock(event.createdAt, language),
        tag: event.eventType,
        title: language === "zh-HK" ? `${nodeTitle} 进度更新` : `${nodeTitle} progressing`,
        detail:
          language === "zh-HK"
            ? `${copy.progressing}${progress !== null ? ` ${progress}%` : ""}。`
            : `${copy.progressing}${progress !== null ? ` ${progress}%` : ""}.`
      };
    case "task.failed":
      return {
        id: event.id,
        time: formatClock(event.createdAt, language),
        tag: event.eventType,
        title: language === "zh-HK" ? `${nodeTitle} 失败` : `${nodeTitle} failed`,
        detail: error ?? copy.taskFailedDetail
      };
    case "task.completed":
      return {
        id: event.id,
        time: formatClock(event.createdAt, language),
        tag: event.eventType,
        title: language === "zh-HK" ? `${nodeTitle} 已完成` : `${nodeTitle} completed`,
        detail: copy.taskCompletedDetail
      };
    case "workflow.blocked":
      return {
        id: event.id,
        time: formatClock(event.createdAt, language),
        tag: event.eventType,
        title: copy.workflowBlocked,
        detail: error ?? copy.workflowBlockedDetail
      };
    case "workflow.completed":
      return {
        id: event.id,
        time: formatClock(event.createdAt, language),
        tag: event.eventType,
        title: copy.workflowCompleted,
        detail: copy.workflowCompletedDetail
      };
    case "agent.online":
      return {
        id: event.id,
        time: formatClock(event.createdAt, language),
        tag: event.eventType,
        title: copy.agentOnline,
        detail: copy.agentOnlineDetail
      };
    case "agent.offline":
      return {
        id: event.id,
        time: formatClock(event.createdAt, language),
        tag: event.eventType,
        title: copy.agentOffline,
        detail: copy.agentOfflineDetail
      };
    default:
      return {
        id: event.id,
        time: formatClock(event.createdAt, language),
        tag: event.eventType,
        title: copy.realtimeEventReceived,
        detail: copy.realtimeEventReceivedDetail
      };
  }
}

function mapNodeStatus(status: string): PixelNodeSnapshot["status"] {
  if (status === "RUNNING" || status === "QUEUED") {
    return "busy";
  }

  if (status === "BLOCKED" || status === "FAILED") {
    return "warning";
  }

  if (status === "COMPLETED") {
    return "done";
  }

  return "idle";
}

function dedupeEvents(events: DashboardProjectEvent[]) {
  const seen = new Set<string>();
  const result: DashboardProjectEvent[] = [];

  for (const event of events) {
    if (seen.has(event.id)) {
      continue;
    }

    seen.add(event.id);
    result.push(event);
  }

  return result.slice(0, 18);
}

function applyEventLocally(
  current: DashboardOverview,
  event: DashboardProjectEvent,
  language: DashboardLanguage
): DashboardOverview {
  const selectedProject =
    current.selectedProject && current.selectedProject.id === event.projectId
      ? {
          ...current.selectedProject,
          recentEvents: dedupeEvents([event, ...current.selectedProject.recentEvents])
        }
      : current.selectedProject;

  const projects = current.projects.map((project) =>
    project.id === event.projectId
      ? {
          ...project,
          lastEventType: event.eventType,
          lastEventAt: event.createdAt,
          ...(event.eventType === "workflow.completed"
            ? {
                status: "COMPLETED",
                progressPercent: 100,
                completedAt: event.createdAt
              }
            : {}),
          ...(event.eventType === "workflow.blocked" || event.eventType === "task.failed"
            ? {
                status: "BLOCKED"
              }
            : {})
        }
      : project
  );

  if (!selectedProject || selectedProject.id !== event.projectId) {
    return {
      ...current,
      projects,
      selectedProject,
      serverTime: new Date().toISOString()
    };
  }

  const payload = isRecord(event.payload) ? event.payload : {};
  const workflowNodeId =
    typeof payload.workflowNodeId === "string" ? payload.workflowNodeId : null;
  const taskRunId = typeof payload.taskRunId === "string" ? payload.taskRunId : event.taskRunId;
  const progress =
    typeof payload.progressPercent === "number" ? payload.progressPercent : undefined;
  const existingTask = taskRunId
    ? selectedProject.recentTasks.find((task) => task.id === taskRunId) ?? null
    : null;

  const workflow =
    selectedProject.workflow && workflowNodeId
      ? {
          ...selectedProject.workflow,
          nodes: selectedProject.workflow.nodes.map((node) => {
            if (node.id !== workflowNodeId) {
              return node;
            }

            if (event.eventType === "task.queued") {
              return {
                ...node,
                status: "QUEUED",
                progressPercent: 0
              };
            }

            if (event.eventType === "task.started" || event.eventType === "task.progress") {
              return {
                ...node,
                status: "RUNNING",
                progressPercent: progress ?? node.progressPercent,
                startedAt: node.startedAt ?? event.createdAt
              };
            }

            if (event.eventType === "task.completed") {
              return {
                ...node,
                status: "COMPLETED",
                progressPercent: 100,
                completedAt: event.createdAt,
                lastError: null
              };
            }

            if (event.eventType === "task.failed") {
              return {
                ...node,
                status: payload.willRetry === true ? "QUEUED" : "FAILED",
                lastError:
                  typeof payload.error === "string" ? payload.error : node.lastError
              };
            }

            return node;
          })
        }
      : selectedProject.workflow;

  const recentTasks =
    taskRunId && workflowNodeId
      ? [
          {
            id: taskRunId,
            workflowNodeId,
            title: getNodeTitle(selectedProject, payload, language),
            status:
              event.eventType === "task.queued"
                ? "QUEUED"
                : event.eventType === "task.completed"
                  ? "COMPLETED"
                  : event.eventType === "task.failed"
                    ? payload.willRetry === true
                      ? "QUEUED"
                      : "FAILED"
                    : "RUNNING",
            progressPercent:
              event.eventType === "task.completed"
                ? 100
                : progress ?? existingTask?.progressPercent ?? 0,
            runNo:
              typeof payload.runNo === "number" ? payload.runNo : existingTask?.runNo ?? 1,
            assigneeLabel: existingTask?.assigneeLabel ?? null,
            assigneeType: existingTask?.assigneeType ?? null,
            queuedAt: existingTask?.queuedAt ?? event.createdAt,
            startedAt:
              event.eventType === "task.started" || event.eventType === "task.progress"
                ? existingTask?.startedAt ?? event.createdAt
                : existingTask?.startedAt ?? null,
            completedAt:
              event.eventType === "task.completed" || event.eventType === "task.failed"
                ? event.createdAt
                : existingTask?.completedAt ?? null
          },
          ...selectedProject.recentTasks.filter((task) => task.id !== taskRunId)
        ].slice(0, 12)
      : selectedProject.recentTasks;

  return {
    ...current,
    projects,
    selectedProject: {
      ...selectedProject,
      status:
        event.eventType === "workflow.completed"
          ? "COMPLETED"
          : event.eventType === "workflow.blocked" || event.eventType === "task.failed"
            ? "BLOCKED"
            : selectedProject.status,
      progressPercent:
        event.eventType === "workflow.completed" ? 100 : selectedProject.progressPercent,
      workflow,
      recentTasks,
      recentEvents: dedupeEvents([event, ...selectedProject.recentEvents])
    },
    serverTime: new Date().toISOString()
  };
}

function AuthConsole(props: {
  language: DashboardLanguage;
  mode: AuthMode;
  setMode: (mode: AuthMode) => void;
  form: AuthFormState;
  setForm: Dispatch<SetStateAction<AuthFormState>>;
  isSubmitting: boolean;
  error: string | null;
  onSubmit: () => void;
}) {
  const { language, mode, setMode, form, setForm, isSubmitting, error, onSubmit } = props;
  const copy = dashboardCopy[language];

  return (
    <div className="auth-console">
      <div className="auth-mode-toggle">
        <button
          type="button"
          className={`auth-mode-button ${mode === "login" ? "is-active" : ""}`}
          onClick={() => setMode("login")}
        >
          {copy.login}
        </button>
        <button
          type="button"
          className={`auth-mode-button ${mode === "register" ? "is-active" : ""}`}
          onClick={() => setMode("register")}
        >
          {copy.register}
        </button>
      </div>
      <div className="auth-fields">
        {mode === "register" ? (
          <label className="auth-field">
            <span>{copy.displayName}</span>
            <input
              value={form.displayName}
              onChange={(event) =>
                setForm((current) => ({ ...current, displayName: event.target.value }))
              }
              placeholder={copy.displayNamePlaceholder}
            />
          </label>
        ) : null}

        <label className="auth-field">
          <span>{copy.email}</span>
          <input
            type="email"
            value={form.email}
            onChange={(event) =>
              setForm((current) => ({ ...current, email: event.target.value }))
            }
            placeholder={copy.emailPlaceholder}
          />
        </label>

        <label className="auth-field">
          <span>{copy.password}</span>
          <input
            type="password"
            value={form.password}
            onChange={(event) =>
              setForm((current) => ({ ...current, password: event.target.value }))
            }
            placeholder={copy.passwordPlaceholder}
          />
        </label>
      </div>

      <div className="auth-actions">
        <button
          type="button"
          className="primary-button"
          onClick={onSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? copy.submitting : mode === "login" ? copy.login : copy.createAccount}
        </button>
        <small>
          {mode === "login" ? copy.loginHint : copy.registerHint}
        </small>
      </div>

      {error ? <p className="auth-error">{error}</p> : null}
    </div>
  );
}

export default function LiveCommandDashboard() {
  const [language, setLanguage] = useState<DashboardLanguage>("en-US");
  const [showGuide, setShowGuide] = useState<boolean | null>(null);
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamState, setStreamState] = useState<StreamState>("idle");
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authForm, setAuthForm] = useState<AuthFormState>(defaultAuthForm);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
  const [projectForm, setProjectForm] = useState<ProjectFormState>(defaultProjectForm);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [isSubmittingProject, setIsSubmittingProject] = useState(false);
  const [projectCreateError, setProjectCreateError] = useState<string | null>(null);
  const [companyForm, setCompanyForm] = useState<CompanyFormState>(defaultCompanyForm);
  const [isCreatingCompany, setIsCreatingCompany] = useState(false);
  const [isSubmittingCompany, setIsSubmittingCompany] = useState(false);
  const [companyCreateError, setCompanyCreateError] = useState<string | null>(null);
  const [workflowForm, setWorkflowForm] = useState<WorkflowFormState>(defaultWorkflowForm);
  const [isCreatingWorkflow, setIsCreatingWorkflow] = useState(false);
  const [isSavingWorkflow, setIsSavingWorkflow] = useState(false);
  const [isRunningWorkflow, setIsRunningWorkflow] = useState(false);
  const [workflowError, setWorkflowError] = useState<string | null>(null);
  const [agentForm, setAgentForm] = useState<AgentFormState>(defaultAgentForm);
  const [isCreatingAgent, setIsCreatingAgent] = useState(false);
  const [isConnectingAgent, setIsConnectingAgent] = useState(false);
  const [agentCreateError, setAgentCreateError] = useState<string | null>(null);
  const [createdAgentToken, setCreatedAgentToken] = useState<string | null>(null);
  const [inviteForm, setInviteForm] = useState<InviteFormState>(defaultInviteForm);
  const [inviteCompanyId, setInviteCompanyId] = useState<string | null>(null);
  const [isCreatingInvite, setIsCreatingInvite] = useState(false);
  const [isSendingInvite, setIsSendingInvite] = useState(false);
  const [inviteCreateError, setInviteCreateError] = useState<string | null>(null);
  const [taskDetail, setTaskDetail] = useState<TaskDetailState>(defaultTaskDetailState);
  const refreshTimerRef = useRef<number | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const taskDetailRequestIdRef = useRef(0);
  const selectedProject = overview?.selectedProject ?? null;
  const copy = dashboardCopy[language];
  const isGuideVisible = showGuide === true;
  const guideActions = getGuideActions(overview, copy);
  const opsHref = getSectionHref(overview, "ops");
  const workflowHref = getSectionHref(overview, "workflow");
  const companiesHref = getSectionHref(overview, "companies");

  useEffect(() => {
    const savedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (savedLanguage === "zh-HK" || savedLanguage === "en-US") {
      setLanguage(savedLanguage);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  }, [language]);

  useEffect(() => {
    const dismissed = window.localStorage.getItem(GUIDE_STORAGE_KEY);
    setShowGuide(dismissed !== "true");
  }, []);

  useEffect(() => {
    if (showGuide === null) {
      return;
    }

    window.localStorage.setItem(GUIDE_STORAGE_KEY, showGuide ? "false" : "true");
  }, [showGuide]);

  useEffect(() => {
    const companies = overview?.companies ?? [];

    setProjectForm((current) => {
      if (companies.length === 0) {
        return current.companyId ? { ...current, companyId: "" } : current;
      }

      const currentCompanyStillExists = companies.some((company) => company.id === current.companyId);
      if (currentCompanyStillExists) {
        return current;
      }

      // If there is only one available company, preselect it to reduce setup friction.
      if (companies.length === 1) {
        return {
          ...current,
          companyId: companies[0].id
        };
      }

      return current.companyId ? { ...current, companyId: "" } : current;
    });
  }, [overview?.companies]);

  const formatNumberForUi = useCallback((value: number) => formatNumber(value, language), [language]);
  const formatDateTimeForUi = useCallback(
    (value: string | null | undefined) => formatDateTime(value, language, copy.notStarted),
    [copy.notStarted, language]
  );
  const getStatusLabelForUi = useCallback(
    (value: string | null | undefined) => getStatusLabel(value, language, copy.unknown),
    [copy.unknown, language]
  );

  const loadOverview = useCallback(
    async (
      projectId?: string | null,
      options: {
        background?: boolean;
        silentError?: boolean;
      } = {}
    ) => {
      const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";

      if (options.background) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      try {
        const response = await fetch(`/api/dashboard/overview${query}`, {
          cache: "no-store"
        });

        if (!response.ok) {
          throw new Error(`Dashboard request failed with ${response.status}`);
        }

        const json = (await response.json()) as DashboardOverviewResponse;
        setOverview(json.data);
        setSelectedProjectId(json.data.selectedProjectId);
        setError(null);
      } catch (nextError) {
        if (!options.silentError) {
          setError(
            nextError instanceof Error ? nextError.message : copy.dashboardLoadError
          );
        }
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [copy.dashboardLoadError]
  );

  const scheduleRefresh = useCallback(
    (projectId: string) => {
      if (refreshTimerRef.current) {
        return;
      }

      refreshTimerRef.current = window.setTimeout(() => {
        refreshTimerRef.current = null;
        void loadOverview(projectId, {
          background: true,
          silentError: true
        });
      }, 900);
    },
    [loadOverview]
  );

  const submitAuth = useCallback(async () => {
    setIsAuthSubmitting(true);
    setAuthError(null);

    try {
      const response = await fetch(
        authMode === "login" ? "/api/auth/login" : "/api/auth/register",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            email: authForm.email,
            password: authForm.password,
            ...(authMode === "register"
              ? {
                  displayName: authForm.displayName || copy.displayNamePlaceholder,
                  locale: language
                }
              : {})
          })
        }
      );

      const payload = (await response.json()) as {
        error?: {
          message?: string;
        };
      };

      if (!response.ok) {
        throw new Error(payload.error?.message ?? copy.authFailed);
      }

      setAuthForm(defaultAuthForm);
      await loadOverview();
    } catch (nextError) {
      setAuthError(nextError instanceof Error ? nextError.message : copy.authFailed);
    } finally {
      setIsAuthSubmitting(false);
    }
  }, [authForm, authMode, copy.authFailed, copy.displayNamePlaceholder, language, loadOverview]);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", {
      method: "POST"
    });

    setSelectedProjectId(null);
    await loadOverview();
  }, [loadOverview]);

  const createProject = useCallback(async () => {
    if (!projectForm.companyId || !projectForm.name.trim()) {
      setProjectCreateError(copy.createProjectValidation);
      return;
    }

    setIsSubmittingProject(true);
    setProjectCreateError(null);

    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          companyId: projectForm.companyId,
          name: projectForm.name.trim(),
          summary: projectForm.summary.trim() || undefined
        })
      });

      const payload = (await response.json()) as {
        error?: {
          message?: string;
        };
      };

      if (!response.ok) {
        throw new Error(payload.error?.message ?? copy.createProjectFailed);
      }

      setProjectForm(defaultProjectForm);
      setIsCreatingProject(false);
      setIsSubmittingProject(false);
      await loadOverview();
    } catch (nextError) {
      setProjectCreateError(
        nextError instanceof Error ? nextError.message : copy.createProjectFailed
      );
      setIsSubmittingProject(false);
    }
  }, [copy.createProjectFailed, copy.createProjectValidation, projectForm, loadOverview]);

  const closeProjectComposer = useCallback(() => {
    setIsCreatingProject(false);
    setProjectForm(defaultProjectForm);
    setProjectCreateError(null);
  }, []);

  const createCompany = useCallback(async () => {
    if (!companyForm.name.trim()) {
      setCompanyCreateError(copy.createCompanyValidation);
      return;
    }

    setIsSubmittingCompany(true);
    setCompanyCreateError(null);

    try {
      const response = await fetch("/api/companies", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: companyForm.name.trim(),
          description: companyForm.description.trim() || undefined
        })
      });

      const payload = (await response.json()) as {
        error?: {
          message?: string;
        };
      };

      if (!response.ok) {
        throw new Error(payload.error?.message ?? copy.createCompanyFailed);
      }

      setCompanyForm(defaultCompanyForm);
      setIsCreatingCompany(false);
      setIsSubmittingCompany(false);
      await loadOverview();
    } catch (nextError) {
      setCompanyCreateError(
        nextError instanceof Error ? nextError.message : copy.createCompanyFailed
      );
      setIsSubmittingCompany(false);
    }
  }, [companyForm, copy.createCompanyFailed, copy.createCompanyValidation, loadOverview]);

  const closeCompanyComposer = useCallback(() => {
    setIsCreatingCompany(false);
    setCompanyForm(defaultCompanyForm);
    setCompanyCreateError(null);
  }, []);

  const closeWorkflowComposer = useCallback(() => {
    setIsCreatingWorkflow(false);
    setWorkflowForm(defaultWorkflowForm);
    setWorkflowError(null);
  }, []);

  const startWorkflowEditing = useCallback(() => {
    setWorkflowForm(toWorkflowFormState(selectedProject?.workflow));
    setWorkflowError(null);
    setIsCreatingWorkflow(true);
  }, [selectedProject?.workflow]);

  const closeInviteComposer = useCallback(() => {
    setIsCreatingInvite(false);
    setIsSendingInvite(false);
    setInviteCompanyId(null);
    setInviteForm(defaultInviteForm);
    setInviteCreateError(null);
  }, []);

  const saveWorkflow = useCallback(async () => {
    if (!selectedProjectId || workflowForm.nodes.length === 0) {
      setWorkflowError(copy.workflowValidationNodes);
      return;
    }

    const selfLoopEdge = workflowForm.edges.find((edge) => hasSelfLoop(workflowForm.edges, edge));
    if (selfLoopEdge) {
      setWorkflowError(copy.workflowValidationSelfLoop);
      return;
    }

    const circularEdge = workflowForm.edges.find((edge) => hasCircularDependency(workflowForm.nodes, workflowForm.edges, edge));
    if (circularEdge) {
      setWorkflowError(copy.workflowValidationCycle);
      return;
    }

    setIsSavingWorkflow(true);
    setWorkflowError(null);

    try {
      const response = await fetch("/api/workflows", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          projectId: selectedProjectId,
          definition: {
            nodes: workflowForm.nodes.map((node) => ({
              nodeKey: node.nodeKey,
              title: node.title,
              config:
                typeof node.prompt === "string" && node.prompt.trim()
                  ? { prompt: node.prompt.trim() }
                  : {}
            })),
            edges: workflowForm.edges
          }
        })
      });

      const payload = (await response.json()) as {
        error?: {
          message?: string;
        };
      };

      if (!response.ok) {
        throw new Error(payload.error?.message ?? copy.saveWorkflowFailed);
      }

      setIsSavingWorkflow(false);
      closeWorkflowComposer();
      await loadOverview(selectedProjectId, { background: true });
    } catch (nextError) {
      setWorkflowError(
        nextError instanceof Error ? nextError.message : copy.saveWorkflowFailed
      );
      setIsSavingWorkflow(false);
    }
  }, [closeWorkflowComposer, copy.saveWorkflowFailed, copy.workflowValidationCycle, copy.workflowValidationNodes, copy.workflowValidationSelfLoop, selectedProjectId, workflowForm, loadOverview]);

  const runWorkflow = useCallback(async () => {
    const project = overview?.selectedProject;
    if (!project?.workflow?.id) {
      setWorkflowError(copy.runWorkflowMissing);
      return;
    }

    setIsRunningWorkflow(true);
    setWorkflowError(null);

    try {
      const response = await fetch(`/api/workflows/${project.workflow.id}/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        }
      });

      const payload = (await response.json()) as {
        error?: {
          message?: string;
        };
      };

      if (!response.ok) {
        throw new Error(payload.error?.message ?? copy.runWorkflowFailed);
      }

setIsRunningWorkflow(false);
    await loadOverview(selectedProjectId, { background: true });
  } catch (nextError) {
    setWorkflowError(
      nextError instanceof Error ? nextError.message : copy.runWorkflowFailed
    );
    setIsRunningWorkflow(false);
  }
  }, [copy.runWorkflowFailed, copy.runWorkflowMissing, loadOverview, overview, selectedProjectId]);

  const createAgent = useCallback(async () => {
    if (
      !agentForm.companyId ||
      !agentForm.provider ||
      !agentForm.displayName ||
      (!isManagedProvider(agentForm.provider) && !agentForm.endpointUrl) ||
      (isManagedProvider(agentForm.provider) && !agentForm.authSecret)
    ) {
      setAgentCreateError(copy.createAgentValidation);
      return;
    }

    setIsConnectingAgent(true);
    setAgentCreateError(null);
    setCreatedAgentToken(null);

    try {
      const response = await fetch("/api/agents/connect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          companyId: agentForm.companyId,
          provider: agentForm.provider,
          displayName: agentForm.displayName,
          endpointUrl: agentForm.endpointUrl || undefined,
          authMode: isManagedProvider(agentForm.provider) ? "TOKEN" : agentForm.authMode,
          authSecret:
            (isManagedProvider(agentForm.provider) || agentForm.authMode === "TOKEN") &&
            agentForm.authSecret
              ? agentForm.authSecret
              : undefined
        })
      });

      const payload = (await response.json()) as {
        error?: {
          message?: string;
        };
        data?: {
          issuedToken?: string;
        };
      };

      if (!response.ok) {
        throw new Error(payload.error?.message ?? copy.createAgentFailed);
      }

      if (payload.data?.issuedToken) {
        setCreatedAgentToken(payload.data.issuedToken);
      } else {
        setIsCreatingAgent(false);
        setAgentForm(defaultAgentForm);
      }

      setIsConnectingAgent(false);
      await loadOverview();
    } catch (nextError) {
      setAgentCreateError(
        nextError instanceof Error ? nextError.message : copy.createAgentFailed
      );
      setIsConnectingAgent(false);
    }
  }, [agentForm, copy.createAgentFailed, copy.createAgentValidation, loadOverview]);

  const closeAgentModal = useCallback(() => {
    setIsCreatingAgent(false);
    setIsConnectingAgent(false);
    setAgentForm(defaultAgentForm);
    setAgentCreateError(null);
    setCreatedAgentToken(null);
  }, []);

  useEffect(() => {
    if (!isCreatingAgent || agentForm.companyId) {
      return;
    }

    const defaultCompanyId = getDefaultAgentCompanyId(overview);
    if (!defaultCompanyId) {
      return;
    }

    setAgentForm((current) => ({
      ...current,
      companyId: defaultCompanyId
    }));
  }, [agentForm.companyId, isCreatingAgent, overview]);

  const createInvite = useCallback(async (companyId: string) => {
    if (!inviteForm.email) {
      setInviteCreateError(copy.inviteValidation);
      return;
    }

    setIsSendingInvite(true);
    setInviteCreateError(null);

    try {
      const response = await fetch(`/api/companies/${companyId}/invitations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          inviteeEmail: inviteForm.email,
          role: inviteForm.role,
          expiresInDays: inviteForm.expiresInDays
        })
      });

      const payload = (await response.json()) as {
        error?: {
          message?: string;
        };
      };

      if (!response.ok) {
        throw new Error(payload.error?.message ?? copy.inviteFailed);
      }

      closeInviteComposer();
      await loadOverview();
    } catch (nextError) {
      setInviteCreateError(
        nextError instanceof Error ? nextError.message : copy.inviteFailed
      );
      setIsSendingInvite(false);
    }
  }, [closeInviteComposer, copy.inviteFailed, copy.inviteValidation, inviteForm, loadOverview]);

  const openTaskDetail = useCallback(async (taskId: string) => {
    const requestId = taskDetailRequestIdRef.current + 1;
    taskDetailRequestIdRef.current = requestId;
    setTaskDetail((current) => ({ ...current, taskId, isLoading: true }));

    try {
      const [taskResponse, logsResponse, artifactsResponse] = await Promise.all([
        fetch(`/api/task-runs/${taskId}`),
        fetch(`/api/task-runs/${taskId}/logs`),
        fetch(`/api/task-runs/${taskId}/artifacts`)
      ]);

      const taskData = await taskResponse.json();
      const logsData = await logsResponse.json();
      const artifactsData = await artifactsResponse.json();

      if (taskDetailRequestIdRef.current !== requestId) {
        return;
      }

      setTaskDetail({
        taskId,
        task: taskData.data,
        logs: logsData.data?.logs ?? null,
        artifacts: artifactsData.data?.artifacts ?? [],
        isLoading: false
      });
    } catch {
      if (taskDetailRequestIdRef.current !== requestId) {
        return;
      }

      setTaskDetail((current) => ({ ...current, isLoading: false }));
    }
  }, []);

  const closeTaskDetail = useCallback(() => {
    taskDetailRequestIdRef.current += 1;
    setTaskDetail(defaultTaskDetailState);
  }, []);

  useEffect(() => {
    void loadOverview();

    return () => {
      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current);
      }
    };
  }, [loadOverview]);

  useEffect(() => {
    if (!overview?.user) {
      return;
    }

    if (overview.companies.length === 0) {
      setIsCreatingCompany(true);
      setIsCreatingProject(false);
      return;
    }

    setIsCreatingCompany(false);

    if (overview.projects.length === 0) {
      setIsCreatingProject(true);
    }
  }, [overview?.user, overview?.companies.length, overview?.projects.length]);

  const eventBufferRef = useRef<DashboardProjectEvent[]>([]);
  const lastEventIdRef = useRef<string | null>(null);
  const retryCountRef = useRef(0);
  const MAX_RETRY_COUNT = 5;
  const RETRY_DELAY_BASE = 1000;

  useEffect(() => {
    if (!overview?.user || !selectedProjectId) {
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }

      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }

      setStreamState("idle");
      return;
    }

    // Clear buffer on project change
    eventBufferRef.current = [];
    lastEventIdRef.current = null;
    retryCountRef.current = 0;
    let isDisposed = false;

    const closeCurrentSource = () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }

      delete (window as unknown as { __currentSSE?: EventSource }).__currentSSE;
    };

    const handleMessage = (message: MessageEvent<string>) => {
      try {
        const event = JSON.parse(message.data) as DashboardProjectEvent;

        // Update last event ID for recovery
        if (event.id) {
          lastEventIdRef.current = event.id;
        }

        setStreamState("live");
        retryCountRef.current = 0;

        // Add to buffer for reliability
        eventBufferRef.current = [event, ...eventBufferRef.current].slice(0, 50);

        setOverview((current) => (current ? applyEventLocally(current, event, language) : current));
        scheduleRefresh(selectedProjectId);
      } catch {
        setStreamState("error");
      }
    };

    const recoverMissedEvents = async () => {
      if (!lastEventIdRef.current) {
        return;
      }

      try {
        const response = await fetch(`/api/projects/${selectedProjectId}/events?after=${lastEventIdRef.current}`, {
          headers: { Accept: "application/json" }
        });

        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as { data?: DashboardProjectEvent[] };
        if (isDisposed || !data.data?.length) {
          return;
        }

        data.data.forEach((event) => {
          lastEventIdRef.current = event.id;
          setOverview((current) => (current ? applyEventLocally(current, event, language) : current));
        });
      } catch {
        // Silently fail, subsequent SSE messages will continue the stream.
      }
    };

    const connect = () => {
      if (isDisposed) {
        return;
      }

      closeCurrentSource();

      const nextSource = new EventSource(`/api/projects/${selectedProjectId}/events`);
      eventSourceRef.current = nextSource;
      (window as unknown as { __currentSSE: EventSource }).__currentSSE = nextSource;

      nextSource.onopen = () => {
        setStreamState("live");
        retryCountRef.current = 0;
        void recoverMissedEvents();
      };

      nextSource.onerror = () => {
        if (eventSourceRef.current !== nextSource) {
          return;
        }

        closeCurrentSource();

        if (isDisposed) {
          return;
        }

        if (retryCountRef.current < MAX_RETRY_COUNT) {
          setStreamState("retrying");
          retryCountRef.current += 1;

          const delay = RETRY_DELAY_BASE * Math.pow(2, retryCountRef.current - 1);
          reconnectTimerRef.current = window.setTimeout(() => {
            reconnectTimerRef.current = null;
            connect();
          }, delay);
        } else {
          setStreamState("error");
        }
      };

      for (const eventType of STREAM_EVENT_TYPES) {
        nextSource.addEventListener(eventType, handleMessage as EventListener);
      }
    };

    setStreamState("connecting");
    connect();

    return () => {
      isDisposed = true;

      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }

      closeCurrentSource();
    };
  }, [language, overview?.user, scheduleRefresh, selectedProjectId]);

  const feedItems = useMemo(
    () => (selectedProject?.recentEvents ?? []).map((event) => toFeedItem(event, selectedProject, language)),
    [language, selectedProject]
  );

  const pixelNodes = useMemo<PixelNodeSnapshot[]>(
    () =>
      (selectedProject?.workflow?.nodes ?? []).slice(0, 6).map((node) => ({
        id: node.id,
        label: node.title,
        status: mapNodeStatus(node.status)
      })),
    [selectedProject]
  );

  const streamMeta = streamStateMapByLanguage[language][streamState];
  const nextActionCard = getNextActionCard(overview, copy);

  return (
    <main className="dashboard-shell">
      <header className="command-nav">
        <div className="brand-lockup">
          <span className="brand-mark">AC</span>
          <div>
            <p>Agent Company</p>
            <span>{copy.brandSubtitle}</span>
          </div>
        </div>
        <nav className="command-links" aria-label="Page sections">
          <a href={opsHref}>{copy.navProjects}</a>
          <a href={workflowHref}>{copy.navWorkflow}</a>
          <a href={companiesHref}>{copy.navCompanies}</a>
        </nav>
        <div className="nav-actions">
          <div className="user-chip" style={{ gap: "8px", alignItems: "center" }}>
            <strong>{copy.languageLabel}</strong>
            <div style={{ display: "flex", gap: "6px" }}>
              <button
                type="button"
                className={`ghost-button nav-button ${language === "zh-HK" ? "is-active" : ""}`}
                onClick={() => setLanguage("zh-HK")}
              >
                {copy.chinese}
              </button>
              <button
                type="button"
                className={`ghost-button nav-button ${language === "en-US" ? "is-active" : ""}`}
                onClick={() => setLanguage("en-US")}
              >
                {copy.english}
              </button>
            </div>
          </div>
          <button
            type="button"
            className="ghost-button nav-button"
            onClick={() => setShowGuide((current) => !(current ?? false))}
          >
            {copy.guideButton}
          </button>
          <div className={`signal-pill signal-pill--${streamMeta.tone}`}>
            <span className="signal-dot" />
            {streamMeta.label}
          </div>
          {overview?.user ? (
            <>
              <div className="user-chip">
                <strong>{overview.user.displayName}</strong>
                <span>{overview.user.email}</span>
              </div>
              <button type="button" className="ghost-button nav-button" onClick={() => void logout()}>
                {copy.logout}
              </button>
            </>
          ) : (
            <a className="ghost-button nav-button" href="#auth">
              {copy.login}
            </a>
          )}
        </div>
      </header>

      <section className="hero-grid">
        <article className="panel-shell hero-shell">
          <p className="panel-kicker">{copy.heroKicker}</p>
          <h1 className="hero-title">
            {copy.heroTitleLines.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </h1>
          <p className="hero-copy">{copy.heroCopy}</p>

          <div className="hero-actions">
            <button
              type="button"
              className="primary-button"
              onClick={() => void loadOverview(selectedProjectId, { background: true })}
              disabled={isLoading}
            >
              {copy.refreshOverview}
            </button>
            <a className="ghost-button" href={overview?.user ? opsHref : "#auth"}>
              {overview?.user ? copy.viewLiveProjects : copy.openAuthConsole}
            </a>
          </div>

          <div className="hero-stats">
            <div className="hero-stat-card">
              <span>{copy.onlineAgents}</span>
              <strong>{overview ? formatNumberForUi(overview.stats.onlineAgentCount) : "--"}</strong>
              <small>{overview ? `${copy.totalPrefix} ${formatNumberForUi(overview.stats.totalAgentCount)}` : copy.loading}</small>
            </div>
            <div className="hero-stat-card">
              <span>{copy.runningProjects}</span>
              <strong>{overview ? formatNumberForUi(overview.stats.runningProjectCount) : "--"}</strong>
              <small>{overview ? `${formatNumberForUi(overview.stats.projectCount)} ${copy.trackedSuffix}` : copy.loading}</small>
            </div>
            <div className="hero-stat-card">
              <span>{copy.runningTasks}</span>
              <strong>{overview ? formatNumberForUi(overview.stats.runningTaskCount) : "--"}</strong>
              <small>
                {overview
                  ? `${copy.queuedPrefix} ${formatNumberForUi(overview.stats.queuedTaskCount)} | ${copy.completedPrefix} ${formatNumberForUi(overview.stats.completedTaskCount)}`
                  : copy.loading}
              </small>
            </div>
          </div>

          <div className="onboarding-grid">
            <article className="onboarding-card">
              <p className="panel-kicker">{copy.quickStartKicker}</p>
              <h3>{copy.quickStartTitle}</h3>
              <p className="onboarding-lead">{copy.quickStartDescription}</p>
              <div className="onboarding-step-list">
                {copy.quickStartSteps.map((step) => (
                  <div key={step.title} className="onboarding-step">
                    <strong>{step.title}</strong>
                    <p>{step.detail}</p>
                  </div>
                ))}
              </div>
            </article>

            <article className="onboarding-card onboarding-card--accent">
              <p className="panel-kicker">{copy.nextActionKicker}</p>
              <h3>{copy.nextActionTitle}</h3>
              <div className="next-action-card">
                <strong>{nextActionCard.title}</strong>
                <p>{nextActionCard.detail}</p>
                <a className="ghost-button onboarding-link" href={nextActionCard.href}>
                  {copy.goThere}
                </a>
              </div>
            </article>

            <article className="onboarding-card">
              <p className="panel-kicker">{copy.reviewHighlightsKicker}</p>
              <h3>{copy.reviewHighlightsTitle}</h3>
              <p className="onboarding-lead">{copy.reviewHighlightsDescription}</p>
              <div className="onboarding-step-list">
                {copy.reviewHighlights.map((item) => (
                  <div key={item.title} className="onboarding-step">
                    <strong>{item.title}</strong>
                    <p>{item.detail}</p>
                  </div>
                ))}
              </div>
            </article>
          </div>
        </article>

        <aside className="panel-shell stage-shell">
          <PixelCommandDeck
            className="stage-widget"
            language={language}
            projectName={selectedProject?.name}
            connectionLabel={streamMeta.label}
            agentsOnline={selectedProject?.agents.onlineCount ?? 0}
            runningTasks={selectedProject?.recentTasks.filter((task) => task.status === "RUNNING").length ?? 0}
            nodes={pixelNodes}
          />
        </aside>
      </section>

      {isGuideVisible ? (
        <section className="guide-shell">
          <article className="panel-shell guide-panel">
            <div className="section-heading">
              <div>
                <p className="panel-kicker">{copy.guideKicker}</p>
                <h2>{copy.guideTitle}</h2>
              </div>
              <button
                type="button"
                className="ghost-button nav-button"
                onClick={() => setShowGuide(false)}
              >
                {copy.guideDismiss}
              </button>
            </div>
            <p className="guide-lead">{copy.guideDescription}</p>
            <div className="guide-flow-list">
              {copy.guideFlow.map((item) => (
                <div key={item.title} className="guide-flow-item">
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </div>
              ))}
            </div>
            <div className="guide-actions">
              {guideActions.map((action) => (
                <a key={action.href} className="ghost-button onboarding-link" href={action.href}>
                  {action.label}
                </a>
              ))}
            </div>
          </article>
        </section>
      ) : null}

      {isLoading ? (
        <section className="dashboard-grid">
          <article className="panel-shell loading-shell">
            <p className="panel-kicker">{copy.loading}</p>
            <h2>{copy.pullOverview}</h2>
            <p>{copy.pullOverviewDetail}</p>
          </article>
        </section>
      ) : null}

      {!isLoading && error ? (
        <section className="dashboard-grid">
          <article className="panel-shell loading-shell">
            <p className="panel-kicker">{copy.errorKicker}</p>
            <h2>{copy.dashboardLoadFailed}</h2>
            <p>{error}</p>
          </article>
        </section>
      ) : null}

      {!isLoading && !overview?.user ? (
        <section id="auth" className="dashboard-grid dashboard-grid--feature">
          <article className="panel-shell auth-shell">
            <p className="panel-kicker">{copy.authConsoleKicker}</p>
            <h2>{copy.authConsoleTitle}</h2>
            <p>{copy.authConsoleDescription}</p>
            <AuthConsole
              language={language}
              mode={authMode}
              setMode={setAuthMode}
              form={authForm}
              setForm={setAuthForm}
              isSubmitting={isAuthSubmitting}
              error={authError}
              onSubmit={() => void submitAuth()}
            />
          </article>

          <article className="panel-shell performance-shell">
            <div className="section-heading">
              <div>
                <p className="panel-kicker">{copy.apiSurfaceKicker}</p>
                <h2>{copy.authEndpointsTitle}</h2>
              </div>
              <span className="section-badge">{copy.cookieSession}</span>
            </div>
            <div className="command-rack">
              <code>POST /api/auth/register</code>
              <code>POST /api/auth/login</code>
              <code>POST /api/auth/logout</code>
              <code>GET /api/auth/session</code>
              <code>GET /api/dashboard/overview</code>
            </div>
          </article>
        </section>
      ) : null}

      {!isLoading && overview?.user && overview.projects.length === 0 && overview.companies.length === 0 ? (
        <CompanyCreationPanel
          sectionId="setup"
          language={language}
          companyForm={companyForm}
          companyCreateError={companyCreateError}
          isSubmittingCompany={isSubmittingCompany}
          onNameChange={(value) =>
            setCompanyForm((current) => ({
              ...current,
              name: value
            }))
          }
          onDescriptionChange={(value) =>
            setCompanyForm((current) => ({
              ...current,
              description: value
            }))
          }
          onCancel={closeCompanyComposer}
          onSubmit={() => void createCompany()}
        />
      ) : null}

      {!isLoading && overview?.user && overview.projects.length === 0 && overview.companies.length > 0 ? (
        <ProjectCreationPanel
          sectionId="setup"
          language={language}
          title={copy.addFirstProjectTitle}
          description={copy.addFirstProjectDescription}
          companies={overview.companies}
          projectForm={projectForm}
          projectCreateError={projectCreateError}
          isSubmittingProject={isSubmittingProject}
          onCompanyChange={(value) =>
            setProjectForm((current) => ({
              ...current,
              companyId: value
            }))
          }
          onNameChange={(value) =>
            setProjectForm((current) => ({
              ...current,
              name: value
            }))
          }
          onSummaryChange={(value) =>
            setProjectForm((current) => ({
              ...current,
              summary: value
            }))
          }
          onCancel={closeProjectComposer}
          onSubmit={() => void createProject()}
        />
      ) : null}

      {!isLoading && overview?.user && overview.projects.length > 0 ? (
        <>
          <section id="ops" className="dashboard-grid dashboard-grid--feature">
            {isGuideVisible ? (
              <article className="panel-shell section-guide-banner">
                <p className="panel-kicker">{copy.navProjects}</p>
                <h3>{copy.opsGuideTitle}</h3>
                <p>{copy.opsGuideDetail}</p>
              </article>
            ) : null}
            <ProjectSelectionPanel
              language={language}
              companies={overview.companies}
              projectForm={projectForm}
              projectCreateError={projectCreateError}
              isSubmittingProject={isSubmittingProject}
              projects={overview.projects}
              selectedProjectId={selectedProjectId}
              selectedProject={selectedProject}
              isCreatingProject={isCreatingProject}
              isRefreshing={isRefreshing}
              onCompanyChange={(value) =>
                setProjectForm((current) => ({
                  ...current,
                  companyId: value
                }))
              }
              onNameChange={(value) =>
                setProjectForm((current) => ({
                  ...current,
                  name: value
                }))
              }
              onSummaryChange={(value) =>
                setProjectForm((current) => ({
                  ...current,
                  summary: value
                }))
              }
              onCancel={closeProjectComposer}
              onSubmit={() => void createProject()}
              onStartCreatingProject={() => setIsCreatingProject(true)}
              onSelectProject={(projectId) => {
                setSelectedProjectId(projectId);
                void loadOverview(projectId, { background: true });
              }}
              getStatusLabel={getStatusLabelForUi}
              formatDateTime={formatDateTimeForUi}
            />

            <article className="panel-shell feed-shell">
              <LiveOpsFeed
                language={language}
                items={feedItems}
                emptyTitle={copy.waitingForFirstEvent}
                emptyDetail={copy.waitingForFirstEventDetail}
              />
              <div className="signal-ribbon">
                <span>task.queued</span>
                <span>task.progress</span>
                <span>workflow.blocked</span>
                <span>agent.online</span>
              </div>
            </article>
          </section>

          <section id="workflow" className="dashboard-grid dashboard-grid--feature">
            {isGuideVisible ? (
              <article className="panel-shell section-guide-banner">
                <p className="panel-kicker">{copy.navWorkflow}</p>
                <h3>{copy.workflowGuideTitle}</h3>
                <p>{copy.workflowGuideDetail}</p>
              </article>
            ) : null}
            <WorkflowPanel
              language={language}
              selectedProject={selectedProject}
              isCreatingWorkflow={isCreatingWorkflow}
              workflowForm={workflowForm}
              setWorkflowForm={setWorkflowForm}
              workflowError={workflowError}
              setWorkflowError={setWorkflowError}
              defaultWorkflowForm={defaultWorkflowForm}
              isSavingWorkflow={isSavingWorkflow}
              isRunningWorkflow={isRunningWorkflow}
              onStartEditing={startWorkflowEditing}
              onCancelEditing={closeWorkflowComposer}
              onSave={() => void saveWorkflow()}
              onRun={() => void runWorkflow()}
              getStatusLabel={getStatusLabelForUi}
            />

            {selectedProject ? (
              <EvaluationPanel
                language={language}
                evaluation={selectedProject.evaluation}
              />
            ) : null}

            <RecentTasksPanel
              language={language}
              tasks={selectedProject?.recentTasks ?? []}
              onOpenTaskDetail={(taskId) => void openTaskDetail(taskId)}
              getStatusLabel={getStatusLabelForUi}
            />
          </section>

          <section id="companies" className="dashboard-grid dashboard-grid--feature">
            {isGuideVisible ? (
              <article className="panel-shell section-guide-banner">
                <p className="panel-kicker">{copy.navCompanies}</p>
                <h3>{copy.companiesGuideTitle}</h3>
                <p>{copy.companiesGuideDetail}</p>
              </article>
            ) : null}
            <CompanyNetworkPanel
              language={language}
              companies={overview.companies}
              onOpenConnectAgent={() => {
                setIsCreatingAgent(true);
                setIsConnectingAgent(false);
                setAgentForm({
                  ...defaultAgentForm,
                  companyId: getDefaultAgentCompanyId(overview)
                });
                setAgentCreateError(null);
                setCreatedAgentToken(null);
              }}
              onOpenInvite={(companyId) => {
                setInviteForm(defaultInviteForm);
                setInviteCompanyId(companyId);
                setInviteCreateError(null);
                setIsCreatingInvite(true);
              }}
            />

            <InviteMemberModal
              language={language}
              isOpen={isCreatingInvite}
              inviteForm={inviteForm}
              inviteCreateError={inviteCreateError}
              isSendingInvite={isSendingInvite}
              canSubmit={Boolean(inviteForm.email && inviteCompanyId)}
              onClose={closeInviteComposer}
              onEmailChange={(value) =>
                setInviteForm((current) => ({
                  ...current,
                  email: value
                }))
              }
              onRoleChange={(value) =>
                setInviteForm((current) => ({
                  ...current,
                  role: value
                }))
              }
              onExpiresInDaysChange={(value) =>
                setInviteForm((current) => ({
                  ...current,
                  expiresInDays: value
                }))
              }
              onSubmit={() => {
                if (inviteCompanyId) {
                  void createInvite(inviteCompanyId);
                }
              }}
            />

            <LeaderboardPanel
              language={language}
              leaderboard={overview.leaderboard}
              formatNumber={formatNumberForUi}
            />
          </section>
        </>
      ) : null}

      <AgentConnectModal
        language={language}
        isOpen={isCreatingAgent}
        companies={overview?.companies ?? []}
        agentForm={agentForm}
        agentCreateError={agentCreateError}
        createdAgentToken={createdAgentToken}
        isConnectingAgent={isConnectingAgent}
        onClose={closeAgentModal}
        onCompanyChange={(value) =>
          setAgentForm((current) => ({
            ...current,
            companyId: value
          }))
        }
        onProviderChange={(value) =>
          setAgentForm((current) => ({
            ...current,
            provider: value.trim().toLowerCase(),
            endpointUrl: isManagedProvider(value) ? "" : current.endpointUrl
          }))
        }
        onDisplayNameChange={(value) =>
          setAgentForm((current) => ({
            ...current,
            displayName: value
          }))
        }
        onEndpointUrlChange={(value) =>
          setAgentForm((current) => ({
            ...current,
            endpointUrl: value
          }))
        }
        onAuthModeChange={(value) =>
          setAgentForm((current) => ({
            ...current,
            authMode: value
          }))
        }
        onAuthSecretChange={(value) =>
          setAgentForm((current) => ({
            ...current,
            authSecret: value
          }))
        }
        onSubmit={() => void createAgent()}
      />
      <TaskDetailModal
        language={language}
        taskDetail={taskDetail}
        onClose={closeTaskDetail}
        formatDateTime={formatDateTimeForUi}
        getStatusLabel={getStatusLabelForUi}
      />    </main>
  );
}

