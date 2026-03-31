"use client";

import type { Dispatch, SetStateAction } from "react";
import type {
  DashboardCompanySummary,
  DashboardLeaderboardEntry,
  DashboardProjectDetail,
  DashboardProjectSummary,
  DashboardTaskSummary
} from "@/types/dashboard";

type CompanyFormState = {
  name: string;
  description: string;
};

type ProjectFormState = {
  companyId: string;
  name: string;
  summary: string;
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

type WorkflowFormState = {
  nodes: { nodeKey: string; title: string; prompt?: string; x?: number; y?: number }[];
  edges: { fromNodeKey: string; toNodeKey: string }[];
};

type DashboardLanguage = "zh-HK" | "en-US";

const panelCopy = {
  "zh-HK": {
    createCompanyKicker: "创建公司",
    createCompanyTitle: "设置你的公司",
    createCompanyDescription: "公司用于组织项目和团队。你会成为这个公司的管理员。",
    companyName: "公司名称",
    companyNamePlaceholder: "我的超棒公司",
    companyDescription: "描述（可选）",
    companyDescriptionPlaceholder: "简单介绍一下你的公司...",
    cancel: "取消",
    createCompany: "创建公司",
    creating: "创建中...",
    createProjectKicker: "创建项目",
    company: "公司",
    selectCompany: "选择一个公司...",
    projectName: "项目名称",
    projectNamePlaceholder: "我的超棒项目",
    projectSummary: "摘要（可选）",
    projectSummaryPlaceholder: "简单介绍一下这个项目...",
    createProject: "创建项目",
    projectSelectionKicker: "项目选择",
    projectSelectionTitle: "项目与运行态总览",
    refreshing: "刷新中",
    snapshotReady: "快照已就绪",
    noneSelected: "未选择项目",
    newProject: "+ 新建项目",
    selectedProjectFallback:
      "这个项目由实时快照、最近任务状态和项目事件流共同驱动。",
    startedPrefix: "开始于",
    projectProgress: "项目进度",
    projectProgressHint: "按工作流节点进度聚合",
    onlineAgents: "在线 Agent",
    offlinePrefix: "离线",
    runningPrefix: "运行中",
    queuedPrefix: "排队中",
    completedPrefix: "已完成",
    workflowKicker: "工作流视图",
    workflowTitle: "节点执行看板",
    noWorkflow: "无工作流",
    editWorkflow: "编辑工作流",
    newWorkflowLabel: "+ 新建工作流",
    nodesTitle: "节点",
    nodeKeyPlaceholder: "node_key",
    nodeTitlePlaceholder: "节点标题",
    nodePromptLabel: "节点 Prompt",
    nodePromptPlaceholder: "告诉这个节点要完成什么、输出什么，以及何时调用工具……",
    remove: "删除",
    addNode: "+ 添加节点",
    edgesTitle: "依赖边",
    noEdges: "还没有定义依赖边（所有节点将并行运行）",
    from: "来源...",
    to: "去向...",
    addEdge: "+ 添加依赖边",
    selfLoopWarning: "检测到自环。依赖边不能把节点连接到自己。",
    saveWorkflow: "保存工作流",
    savingWorkflow: "保存中...",
    noAssignee: "未分配执行者",
    runWorkflow: "运行工作流",
    startingWorkflow: "启动中...",
    workflowEmpty: "当前所选项目还没有工作流定义。",
    companyNetworkKicker: "公司视图",
    companyNetworkTitle: "你的公司网络",
    companiesSuffix: "家公司",
    connectAgent: "+ 连接 Agent",
    connectAgentSubmit: "连接 Agent",
    pointsSuffix: "分",
    companyFallback: "这个公司已经接入指挥舱，可以暴露项目、Agent 和积分。",
    projectsSuffix: "个项目",
    agentsOnlineSuffix: "个 Agent 在线",
    humanMembersSuffix: "位人类成员",
    inviteMember: "+ 邀请成员",
    inviteMemberKicker: "邀请成员",
    inviteMemberTitle: "邀请成员加入你的公司",
    inviteMemberDescription:
      "发送邀请后，对方会按其角色获得访问项目和工作流的权限。",
    emailAddress: "邮箱地址",
    inviteEmailPlaceholder: "colleague@company.com",
    role: "角色",
    adminRole: "管理员 - 完整权限",
    memberRole: "成员 - 标准权限",
    expiresInDays: "有效期（天）",
    days1: "1 天",
    days3: "3 天",
    days7: "7 天",
    days14: "14 天",
    days30: "30 天",
    sendInvitation: "发送邀请",
    sending: "发送中...",
    taskTickerKicker: "任务流",
    recentTaskRuns: "最近任务运行",
    rowsSuffix: "行",
    unassigned: "未分配",
    runPrefix: "运行 #",
    leaderboardKicker: "排行榜",
    leaderboardTitle: "公司积分榜",
    top5: "前 5 名",
    pointsUnit: "分",
    leaderboardFooter:
      "初始状态来自 GET /api/dashboard/overview，实时增量来自 GET /api/projects/:id/events，浏览器只会为当前项目保持一条 SSE 连接。",
    connectAgentKicker: "连接 Agent",
    connectAgentTitle: "接入外部 Agent",
    connectAgentDescription: "连接真实执行资源。托管的 OpenAI / Anthropic Agent 会在 worker 内运行，并自动记录 prompt、tool call、token 和成本。",
    connectingAgent: "连接中...",
    provider: "提供方",
    providerPlaceholder: "例如 openai、anthropic、custom",
    displayName: "显示名称",
    displayNamePlaceholder: "我的 AI Agent",
    endpointUrl: "端点 URL",
    endpointUrlPlaceholder: "https://api.example.com/agent",
    authMode: "认证模式",
    authTokenMode: "Token（自动生成）",
    authNoneMode: "不使用认证",
    agentTokenSaved: "Agent 已连接，请立即保存这个 token：",
    tokenNotShownAgain: "这个 token 不会再次显示。",
    done: "完成",
    taskDetailsKicker: "任务详情",
    loading: "加载中...",
    loadingTaskDetails: "正在加载任务详情...",
    status: "状态",
    progress: "进度",
    queuedAt: "排队时间",
    startedAt: "开始时间",
    completedAt: "完成时间",
    error: "错误",
    logs: "日志",
    artifacts: "产物",
    output: "输出",
    taskNotFound: "未找到任务",
    close: "关闭"
  },
  "en-US": {
    createCompanyKicker: "Create Company",
    createCompanyTitle: "Set up your company",
    createCompanyDescription: "Companies organize your projects and teams. You will be the admin of this company.",
    companyName: "Company Name",
    companyNamePlaceholder: "My Awesome Company",
    companyDescription: "Description (optional)",
    companyDescriptionPlaceholder: "Brief description of your company...",
    cancel: "Cancel",
    createCompany: "Create Company",
    creating: "Creating...",
    createProjectKicker: "Create Project",
    company: "Company",
    selectCompany: "Select a company...",
    projectName: "Project Name",
    projectNamePlaceholder: "My Awesome Project",
    projectSummary: "Summary (optional)",
    projectSummaryPlaceholder: "Brief description of the project...",
    createProject: "Create Project",
    projectSelectionKicker: "Project selection",
    projectSelectionTitle: "Projects and live execution state",
    refreshing: "Refreshing",
    snapshotReady: "Snapshot ready",
    noneSelected: "None selected",
    newProject: "+ New Project",
    selectedProjectFallback:
      "This project is backed by live snapshot data, recent task state, and a realtime project event feed.",
    startedPrefix: "Started",
    projectProgress: "Project progress",
    projectProgressHint: "Aggregated from workflow node progress",
    onlineAgents: "Online agents",
    offlinePrefix: "Offline",
    runningPrefix: "Running",
    queuedPrefix: "Queued",
    completedPrefix: "Completed",
    workflowKicker: "Workflow visibility",
    workflowTitle: "Node execution board",
    noWorkflow: "No workflow",
    editWorkflow: "Edit Workflow",
    newWorkflowLabel: "+ New Workflow",
    nodesTitle: "Nodes",
    nodeKeyPlaceholder: "node_key",
    nodeTitlePlaceholder: "Node Title",
    nodePromptLabel: "Node Prompt",
    nodePromptPlaceholder:
      "Tell this node what to accomplish, what to return, and when tools should be used...",
    remove: "Remove",
    addNode: "+ Add Node",
    edgesTitle: "Edges (dependencies)",
    noEdges: "No edges defined (all nodes will run in parallel)",
    from: "From...",
    to: "To...",
    addEdge: "+ Add Edge",
    selfLoopWarning: "Self-loop detected. Edges cannot connect a node to itself.",
    saveWorkflow: "Save Workflow",
    savingWorkflow: "Saving...",
    noAssignee: "No assignee",
    runWorkflow: "Run Workflow",
    startingWorkflow: "Starting...",
    workflowEmpty: "No workflow definition is available for the selected project.",
    companyNetworkKicker: "Company visibility",
    companyNetworkTitle: "Your company network",
    companiesSuffix: " companies",
    connectAgent: "+ Connect Agent",
    connectAgentSubmit: "Connect Agent",
    pointsSuffix: " pts",
    companyFallback: "This company is already wired into the cockpit and can expose projects, agents, and score.",
    projectsSuffix: " projects",
    agentsOnlineSuffix: " agents online",
    humanMembersSuffix: " human members",
    inviteMember: "+ Invite Member",
    inviteMemberKicker: "Invite Member",
    inviteMemberTitle: "Invite someone to your company",
    inviteMemberDescription:
      "Send an invitation to join your company. They will be able to access projects and workflows based on their role.",
    emailAddress: "Email Address",
    inviteEmailPlaceholder: "colleague@company.com",
    role: "Role",
    adminRole: "Admin - Full access",
    memberRole: "Member - Standard access",
    expiresInDays: "Expires In (days)",
    days1: "1 day",
    days3: "3 days",
    days7: "7 days",
    days14: "14 days",
    days30: "30 days",
    sendInvitation: "Send Invitation",
    sending: "Sending...",
    taskTickerKicker: "Task ticker",
    recentTaskRuns: "Recent task runs",
    rowsSuffix: " rows",
    unassigned: "Unassigned",
    runPrefix: "Run #",
    leaderboardKicker: "Leaderboard",
    leaderboardTitle: "Company score board",
    top5: "Top 5",
    pointsUnit: "pts",
    leaderboardFooter:
      "Initial state comes from GET /api/dashboard/overview. Realtime deltas come from GET /api/projects/:id/events. The browser keeps only one SSE connection open for the selected project.",
    connectAgentKicker: "Connect Agent",
    connectAgentTitle: "Add an external agent",
    connectAgentDescription:
      "Connect real execution resources. Managed OpenAI / Anthropic agents run inside the worker and automatically record prompt, tool calls, tokens, and cost.",
    connectingAgent: "Connecting...",
    provider: "Provider",
    providerPlaceholder: "e.g., openai, anthropic, custom",
    displayName: "Display Name",
    displayNamePlaceholder: "My AI Agent",
    endpointUrl: "Endpoint URL",
    endpointUrlPlaceholder: "https://api.example.com/agent",
    authMode: "Auth Mode",
    authTokenMode: "Token (Auto-generated)",
    authNoneMode: "No authentication",
    agentTokenSaved: "Agent connected! Save this token now:",
    tokenNotShownAgain: "This token will not be shown again!",
    done: "Done",
    taskDetailsKicker: "Task Details",
    loading: "Loading...",
    loadingTaskDetails: "Loading task details...",
    status: "Status",
    progress: "Progress",
    queuedAt: "Queued",
    startedAt: "Started",
    completedAt: "Completed",
    error: "Error",
    logs: "Logs",
    artifacts: "Artifacts",
    output: "Output",
    taskNotFound: "Task not found",
    close: "Close"
  }
} as const;

type CompanyCreationPanelProps = {
  language: DashboardLanguage;
  sectionId?: string;
  companyForm: CompanyFormState;
  companyCreateError: string | null;
  isSubmittingCompany: boolean;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
};

type ProjectCreationFormProps = {
  language: DashboardLanguage;
  companies: DashboardCompanySummary[];
  projectForm: ProjectFormState;
  projectCreateError: string | null;
  isSubmittingProject: boolean;
  onCompanyChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onSummaryChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
};

type ProjectCreationPanelProps = ProjectCreationFormProps & {
  title: string;
  description: string;
  kicker?: string;
  sectionId?: string;
};

type ProjectSelectionPanelProps = ProjectCreationFormProps & {
  projects: DashboardProjectSummary[];
  selectedProjectId: string | null;
  selectedProject: DashboardProjectDetail | null;
  isCreatingProject: boolean;
  isRefreshing: boolean;
  onStartCreatingProject: () => void;
  onSelectProject: (projectId: string) => void;
  getStatusLabel: (value: string | null | undefined) => string;
  formatDateTime: (value: string | null | undefined) => string;
};

type AgentConnectModalProps = {
  language: DashboardLanguage;
  isOpen: boolean;
  companies: DashboardCompanySummary[];
  agentForm: AgentFormState;
  agentCreateError: string | null;
  createdAgentToken: string | null;
  isConnectingAgent: boolean;
  onClose: () => void;
  onCompanyChange: (value: string) => void;
  onProviderChange: (value: string) => void;
  onDisplayNameChange: (value: string) => void;
  onEndpointUrlChange: (value: string) => void;
  onAuthModeChange: (value: AgentFormState["authMode"]) => void;
  onAuthSecretChange: (value: string) => void;
  onSubmit: () => void;
};

type CompanyNetworkPanelProps = {
  language: DashboardLanguage;
  companies: DashboardCompanySummary[];
  onOpenConnectAgent: () => void;
  onOpenInvite: (companyId: string) => void;
};

type InviteMemberModalProps = {
  language: DashboardLanguage;
  isOpen: boolean;
  inviteForm: InviteFormState;
  inviteCreateError: string | null;
  isSendingInvite: boolean;
  canSubmit: boolean;
  onClose: () => void;
  onEmailChange: (value: string) => void;
  onRoleChange: (value: InviteFormState["role"]) => void;
  onExpiresInDaysChange: (value: number) => void;
  onSubmit: () => void;
};

type RecentTasksPanelProps = {
  language: DashboardLanguage;
  tasks: DashboardTaskSummary[];
  onOpenTaskDetail: (taskId: string) => void;
  getStatusLabel: (value: string | null | undefined) => string;
};

type LeaderboardPanelProps = {
  language: DashboardLanguage;
  leaderboard: DashboardLeaderboardEntry[];
  formatNumber: (value: number) => string;
};

type EvaluationPanelProps = {
  language: DashboardLanguage;
  evaluation: DashboardProjectDetail["evaluation"];
};

type TaskDetailModalProps = {
  language: DashboardLanguage;
  taskDetail: TaskDetailState;
  onClose: () => void;
  formatDateTime: (value: string | null | undefined) => string;
  getStatusLabel: (value: string | null | undefined) => string;
};

type WorkflowPanelProps = {
  language: DashboardLanguage;
  selectedProject: DashboardProjectDetail | null;
  isCreatingWorkflow: boolean;
  workflowForm: WorkflowFormState;
  setWorkflowForm: Dispatch<SetStateAction<WorkflowFormState>>;
  workflowError: string | null;
  setWorkflowError: Dispatch<SetStateAction<string | null>>;
  defaultWorkflowForm: WorkflowFormState;
  isSavingWorkflow: boolean;
  isRunningWorkflow: boolean;
  onStartEditing: () => void;
  onCancelEditing: () => void;
  onSave: () => void;
  onRun: () => void;
  getStatusLabel: (value: string | null | undefined) => string;
};

function hasSelfLoop(
  edges: { fromNodeKey: string; toNodeKey: string }[],
  newEdge: { fromNodeKey: string; toNodeKey: string }
) {
  return newEdge.fromNodeKey === newEdge.toNodeKey;
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(value > 0 && value < 1 ? 1 : 0)}%`;
}

function formatDuration(value: number | null) {
  if (value === null) {
    return "--";
  }

  if (value < 1_000) {
    return `${value} ms`;
  }

  const seconds = value / 1_000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)} s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}

function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value < 1 ? 4 : 2,
    maximumFractionDigits: value < 1 ? 4 : 2
  }).format(value);
}

function toRecordedLlmOutput(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (record.provider !== "openai" && record.provider !== "anthropic") {
    return null;
  }

  return record;
}

export function CompanyCreationPanel({
  language,
  sectionId,
  companyForm,
  companyCreateError,
  isSubmittingCompany,
  onNameChange,
  onDescriptionChange,
  onCancel,
  onSubmit
}: CompanyCreationPanelProps) {
  const copy = panelCopy[language];

  return (
    <section id={sectionId} className="dashboard-grid">
      <article className="panel-shell auth-shell">
        <p className="panel-kicker">{copy.createCompanyKicker}</p>
        <h2>{copy.createCompanyTitle}</h2>
        <p>{copy.createCompanyDescription}</p>
        <div className="project-create-form">
          <div className="form-row">
            <label className="auth-field">
              <span>{copy.companyName}</span>
              <input
                type="text"
                value={companyForm.name}
                onChange={(event) => onNameChange(event.target.value)}
                placeholder={copy.companyNamePlaceholder}
              />
            </label>
          </div>
          <div className="form-row">
            <label className="auth-field">
              <span>{copy.companyDescription}</span>
              <textarea
                value={companyForm.description}
                onChange={(event) => onDescriptionChange(event.target.value)}
                placeholder={copy.companyDescriptionPlaceholder}
                rows={2}
              />
            </label>
          </div>
          {companyCreateError ? <p className="auth-error">{companyCreateError}</p> : null}
          <div className="form-actions">
            <button type="button" className="ghost-button" onClick={onCancel}>
              {copy.cancel}
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={onSubmit}
              disabled={isSubmittingCompany || !companyForm.name.trim()}
            >
              {isSubmittingCompany ? copy.creating : copy.createCompany}
            </button>
          </div>
        </div>
      </article>
    </section>
  );
}

export function ProjectCreationForm({
  language,
  companies,
  projectForm,
  projectCreateError,
  isSubmittingProject,
  onCompanyChange,
  onNameChange,
  onSummaryChange,
  onCancel,
  onSubmit
}: ProjectCreationFormProps) {
  const copy = panelCopy[language];

  return (
    <div className="project-create-form">
      <div className="form-row">
        <label className="auth-field">
          <span>{copy.company}</span>
          <select value={projectForm.companyId} onChange={(event) => onCompanyChange(event.target.value)}>
            <option value="">{copy.selectCompany}</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="form-row">
        <label className="auth-field">
          <span>{copy.projectName}</span>
          <input
            type="text"
            value={projectForm.name}
            onChange={(event) => onNameChange(event.target.value)}
            placeholder={copy.projectNamePlaceholder}
          />
        </label>
      </div>
      <div className="form-row">
        <label className="auth-field">
          <span>{copy.projectSummary}</span>
          <textarea
            value={projectForm.summary}
            onChange={(event) => onSummaryChange(event.target.value)}
            placeholder={copy.projectSummaryPlaceholder}
            rows={2}
          />
        </label>
      </div>
      {projectCreateError ? <p className="auth-error">{projectCreateError}</p> : null}
      <div className="form-actions">
        <button type="button" className="ghost-button" onClick={onCancel}>
          {copy.cancel}
        </button>
        <button
          type="button"
          className="primary-button"
          onClick={onSubmit}
          disabled={isSubmittingProject || !projectForm.companyId || !projectForm.name.trim()}
        >
          {isSubmittingProject ? copy.creating : copy.createProject}
        </button>
      </div>
    </div>
  );
}

export function ProjectCreationPanel({
  language,
  title,
  description,
  kicker,
  sectionId,
  ...formProps
}: ProjectCreationPanelProps) {
  const copy = panelCopy[language];

  return (
    <section id={sectionId} className="dashboard-grid">
      <article className="panel-shell auth-shell">
        <p className="panel-kicker">{kicker ?? copy.createProjectKicker}</p>
        <h2>{title}</h2>
        <p>{description}</p>
        <ProjectCreationForm language={language} {...formProps} />
      </article>
    </section>
  );
}

export function ProjectSelectionPanel({
  language,
  companies,
  projectForm,
  projectCreateError,
  isSubmittingProject,
  projects,
  selectedProjectId,
  selectedProject,
  isCreatingProject,
  isRefreshing,
  onCompanyChange,
  onNameChange,
  onSummaryChange,
  onCancel,
  onSubmit,
  onStartCreatingProject,
  onSelectProject,
  getStatusLabel,
  formatDateTime
}: ProjectSelectionPanelProps) {
  const copy = panelCopy[language];

  return (
    <article className="panel-shell progress-shell">
      <div className="section-heading">
        <div>
          <p className="panel-kicker">{copy.projectSelectionKicker}</p>
          <h2>{copy.projectSelectionTitle}</h2>
        </div>
        <div className="section-heading-actions">
          <span className="section-badge">{isRefreshing ? copy.refreshing : copy.snapshotReady}</span>
          <span className="section-badge">
            {selectedProject ? getStatusLabel(selectedProject.status) : copy.noneSelected}
          </span>
          <button
            type="button"
            className="primary-button"
            onClick={onStartCreatingProject}
            style={{ minWidth: "auto", padding: "8px 16px", fontSize: "0.85rem" }}
          >
            {copy.newProject}
          </button>
        </div>
      </div>

      {isCreatingProject ? (
        <ProjectCreationForm
          language={language}
          companies={companies}
          projectForm={projectForm}
          projectCreateError={projectCreateError}
          isSubmittingProject={isSubmittingProject}
          onCompanyChange={onCompanyChange}
          onNameChange={onNameChange}
          onSummaryChange={onSummaryChange}
          onCancel={onCancel}
          onSubmit={onSubmit}
        />
      ) : null}

      <div className="project-picker" role="tablist" aria-label={copy.projectSelectionTitle}>
        {projects.map((project) => (
          <button
            key={project.id}
            type="button"
            className={`project-chip ${selectedProjectId === project.id ? "is-active" : ""}`}
            onClick={() => onSelectProject(project.id)}
          >
            <strong>{project.name}</strong>
            <span>{project.companyName}</span>
          </button>
        ))}
      </div>

      {selectedProject ? (
        <div className="live-hero-grid">
          <div className="live-hero-copy">
            <strong>{selectedProject.name}</strong>
            <p>
              {selectedProject.summary ?? copy.selectedProjectFallback}
            </p>
            <div className="live-inline-meta">
              <span>{selectedProject.companyName}</span>
              <span>{getStatusLabel(selectedProject.status)}</span>
              <span>{copy.startedPrefix} {formatDateTime(selectedProject.startedAt)}</span>
            </div>
          </div>
          <div className="mini-stat-grid">
            <div className="mini-meter">
              <span>{copy.projectProgress}</span>
              <strong>{selectedProject.progressPercent}%</strong>
              <small>{copy.projectProgressHint}</small>
            </div>
            <div className="mini-meter">
              <span>{copy.onlineAgents}</span>
              <strong>{selectedProject.agents.onlineCount}</strong>
              <small>{copy.offlinePrefix} {selectedProject.agents.offlineCount}</small>
            </div>
          </div>
        </div>
      ) : null}

      <div className="project-list">
        {projects.map((project) => (
          <button
            key={project.id}
            type="button"
            className={`project-card project-card-button ${selectedProjectId === project.id ? "is-selected" : ""}`}
            onClick={() => onSelectProject(project.id)}
          >
            <div className="project-card-top">
              <div>
                <strong>{project.name}</strong>
                <p>{project.companyName}</p>
              </div>
              <span>{getStatusLabel(project.status)}</span>
            </div>
            <div className="project-bar">
              <span style={{ width: `${project.progressPercent}%` }} />
            </div>
            <div className="project-card-bottom">
              <small>
                {copy.runningPrefix} {project.runningTaskCount} | {copy.queuedPrefix} {project.queuedTaskCount} | {copy.completedPrefix} {project.completedTaskCount}
              </small>
              <strong>{project.progressPercent}%</strong>
            </div>
          </button>
        ))}
      </div>
    </article>
  );
}

export function WorkflowPanel({
  language,
  selectedProject,
  isCreatingWorkflow,
  workflowForm,
  setWorkflowForm,
  workflowError,
  setWorkflowError,
  defaultWorkflowForm,
  isSavingWorkflow,
  isRunningWorkflow,
  onStartEditing,
  onCancelEditing,
  onSave,
  onRun,
  getStatusLabel
}: WorkflowPanelProps) {
  const copy = panelCopy[language];
  const hasSelfLoopWarning = workflowForm.edges.some((edge) => hasSelfLoop(workflowForm.edges, edge));

  return (
    <article className="panel-shell company-shell">
      <div className="section-heading">
        <div>
          <p className="panel-kicker">{copy.workflowKicker}</p>
          <h2>{copy.workflowTitle}</h2>
        </div>
        <div className="section-heading-actions">
          <span className="section-badge">
            {selectedProject?.workflow ? `v${selectedProject.workflow.version}` : copy.noWorkflow}
          </span>
          {selectedProject ? (
            <button
              type="button"
              className="primary-button"
              onClick={onStartEditing}
            style={{ minWidth: "auto", padding: "8px 16px", fontSize: "0.85rem" }}
          >
              {selectedProject.workflow ? copy.editWorkflow : copy.newWorkflowLabel}
          </button>
        ) : null}
        </div>
      </div>

      {isCreatingWorkflow ? (
        <div className="workflow-editor">
          <div className="workflow-nodes">
            <div className="section-heading" style={{ marginBottom: "16px" }}>
              <h3 style={{ fontSize: "1rem", margin: 0 }}>{copy.nodesTitle}</h3>
            </div>
            {workflowForm.nodes.map((node, index) => (
              <div key={`${node.nodeKey}-${index}`} className="workflow-node-edit">
                <input
                  type="text"
                  value={node.nodeKey}
                  onChange={(event) => {
                    setWorkflowForm((current) => ({
                      ...current,
                      nodes: current.nodes.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, nodeKey: event.target.value } : item
                      )
                    }));
                  }}
                  placeholder={copy.nodeKeyPlaceholder}
                  style={{ width: "120px" }}
                />
                <input
                  type="text"
                  value={node.title}
                  onChange={(event) => {
                    setWorkflowForm((current) => ({
                      ...current,
                      nodes: current.nodes.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, title: event.target.value } : item
                      )
                    }));
                  }}
                  placeholder={copy.nodeTitlePlaceholder}
                  style={{ flex: 1 }}
                />
                <label style={{ display: "grid", gap: "8px", flexBasis: "100%" }}>
                  <span style={{ fontSize: "0.78rem", color: "rgba(226, 232, 240, 0.72)" }}>
                    {copy.nodePromptLabel}
                  </span>
                  <textarea
                    value={node.prompt ?? ""}
                    onChange={(event) => {
                      setWorkflowForm((current) => ({
                        ...current,
                        nodes: current.nodes.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, prompt: event.target.value } : item
                        )
                      }));
                    }}
                    placeholder={copy.nodePromptPlaceholder}
                    rows={4}
                    style={{ width: "100%", resize: "vertical" }}
                  />
                </label>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => {
                    setWorkflowForm((current) => ({
                      ...current,
                      nodes: current.nodes.filter((_, itemIndex) => itemIndex !== index)
                    }));
                  }}
                  disabled={workflowForm.nodes.length <= 1}
                  style={{ padding: "8px 12px" }}
                >
                  {copy.remove}
                </button>
              </div>
            ))}
            <button
              type="button"
              className="ghost-button"
              onClick={() => {
                const nextNodeIndex = workflowForm.nodes.length + 1;
                setWorkflowForm((current) => ({
                  ...current,
                  nodes: [
                    ...current.nodes,
                    {
                      nodeKey: `node${nextNodeIndex}`,
                      title: language === "zh-HK" ? "新节点" : "New Node",
                      prompt: ""
                    }
                  ]
                }));
              }}
              style={{ marginTop: "8px" }}
            >
              {copy.addNode}
            </button>
          </div>

          <div className="workflow-edges">
            <div className="section-heading" style={{ marginBottom: "16px" }}>
              <h3 style={{ fontSize: "1rem", margin: 0 }}>{copy.edgesTitle}</h3>
            </div>
            {workflowForm.edges.length === 0 ? (
              <p className="ops-empty" style={{ padding: "12px" }}>
                {copy.noEdges}
              </p>
            ) : (
              workflowForm.edges.map((edge, index) => (
                <div key={`${edge.fromNodeKey}-${edge.toNodeKey}-${index}`} className="workflow-edge-edit">
                  <select
                    value={edge.fromNodeKey}
                    onChange={(event) => {
                      setWorkflowForm((current) => ({
                        ...current,
                        edges: current.edges.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, fromNodeKey: event.target.value } : item
                        )
                      }));
                    }}
                  >
                    <option value="">{copy.from}</option>
                    {workflowForm.nodes.map((node) => (
                      <option key={node.nodeKey} value={node.nodeKey}>
                        {node.title} ({node.nodeKey})
                      </option>
                    ))}
                  </select>
                  <span>-&gt;</span>
                  <select
                    value={edge.toNodeKey}
                    onChange={(event) => {
                      setWorkflowForm((current) => ({
                        ...current,
                        edges: current.edges.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, toNodeKey: event.target.value } : item
                        )
                      }));
                    }}
                  >
                    <option value="">{copy.to}</option>
                    {workflowForm.nodes.map((node) => (
                      <option key={node.nodeKey} value={node.nodeKey}>
                        {node.title} ({node.nodeKey})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => {
                      setWorkflowForm((current) => ({
                        ...current,
                        edges: current.edges.filter((_, itemIndex) => itemIndex !== index)
                      }));
                    }}
                    style={{ padding: "8px 12px" }}
                  >
                    {copy.remove}
                  </button>
                </div>
              ))
            )}
            <button
              type="button"
              className="ghost-button"
              onClick={() => {
                setWorkflowForm((current) => ({
                  ...current,
                  edges: [...current.edges, { fromNodeKey: "", toNodeKey: "" }]
                }));
                setWorkflowError(null);
              }}
              style={{ marginTop: "8px" }}
            >
              {copy.addEdge}
            </button>

            {hasSelfLoopWarning ? (
              <p className="auth-error" style={{ marginTop: "8px", fontSize: "0.85rem" }}>
                {copy.selfLoopWarning}
              </p>
            ) : null}
          </div>

          {workflowError ? (
            <p className="auth-error" style={{ marginTop: "12px" }}>
              {workflowError}
            </p>
          ) : null}

          <div className="form-actions" style={{ marginTop: "16px" }}>
            <button
              type="button"
              className="ghost-button"
              onClick={() => {
                setWorkflowForm(defaultWorkflowForm);
                setWorkflowError(null);
                onCancelEditing();
              }}
            >
              {copy.cancel}
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={onSave}
              disabled={isSavingWorkflow || workflowForm.nodes.length === 0}
            >
              {isSavingWorkflow ? copy.savingWorkflow : copy.saveWorkflow}
            </button>
          </div>
        </div>
      ) : selectedProject?.workflow ? (
        <>
          <div className="workflow-grid">
            {selectedProject.workflow.nodes.map((node) => (
              <div key={node.id} className="workflow-node-row">
                <div className="workflow-node-head">
                  <strong>{node.title}</strong>
                  <span>{getStatusLabel(node.status)}</span>
                </div>
                <div className="project-bar workflow-bar">
                  <span style={{ width: `${node.progressPercent}%` }} />
                </div>
                <div className="workflow-node-meta">
                  <small>{node.targetLabel ?? copy.noAssignee}</small>
                  <small>{node.lastError ?? `${node.progressPercent}%`}</small>
                </div>
                {typeof node.config.prompt === "string" && node.config.prompt.trim() ? (
                  <p
                    style={{
                      margin: "10px 0 0",
                      fontSize: "0.8rem",
                      lineHeight: 1.5,
                      color: "rgba(226, 232, 240, 0.74)",
                      whiteSpace: "pre-wrap"
                    }}
                  >
                    {node.config.prompt}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
          <div className="workflow-actions" style={{ marginTop: "16px" }}>
            <button
              type="button"
              className="primary-button"
              onClick={onRun}
              disabled={isRunningWorkflow || selectedProject.status === "RUNNING"}
            >
              {isRunningWorkflow ? copy.startingWorkflow : copy.runWorkflow}
            </button>
          </div>
        </>
      ) : (
        <div className="ops-empty">
          <p>{copy.workflowEmpty}</p>
        </div>
      )}
    </article>
  );
}

export function CompanyNetworkPanel({
  language,
  companies,
  onOpenConnectAgent,
  onOpenInvite
}: CompanyNetworkPanelProps) {
  const copy = panelCopy[language];

  return (
    <article className="panel-shell company-shell">
      <div className="section-heading">
        <div>
          <p className="panel-kicker">{copy.companyNetworkKicker}</p>
          <h2>{copy.companyNetworkTitle}</h2>
        </div>
        <div className="section-heading-actions">
          <span className="section-badge">{companies.length}{copy.companiesSuffix}</span>
          <button
            type="button"
            className="primary-button"
            onClick={onOpenConnectAgent}
            style={{ minWidth: "auto", padding: "8px 16px", fontSize: "0.85rem" }}
          >
            {copy.connectAgent}
          </button>
        </div>
      </div>

      <div className="company-grid">
        {companies.map((company) => (
          <div key={company.id} className="lattice-card">
            <div className="lattice-card-head">
              <strong>{company.name}</strong>
              <span>{company.score}{copy.pointsSuffix}</span>
            </div>
            <p>
              {company.description ?? copy.companyFallback}
            </p>
            <div className="lattice-tags">
              <span>{company.projectCount}{copy.projectsSuffix}</span>
              <span>{company.onlineAgentCount}/{company.agentCount}{copy.agentsOnlineSuffix}</span>
              <span>{company.humanCount}{copy.humanMembersSuffix}</span>
            </div>
            <div className="company-card-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={() => onOpenInvite(company.id)}
                style={{ fontSize: "0.8rem", padding: "6px 12px" }}
              >
                {copy.inviteMember}
              </button>
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

export function InviteMemberModal({
  language,
  isOpen,
  inviteForm,
  inviteCreateError,
  isSendingInvite,
  canSubmit,
  onClose,
  onEmailChange,
  onRoleChange,
  onExpiresInDaysChange,
  onSubmit
}: InviteMemberModalProps) {
  if (!isOpen) {
    return null;
  }

  const copy = panelCopy[language];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(event) => event.stopPropagation()}>
        <div className="section-heading">
          <div>
            <p className="panel-kicker">{copy.inviteMemberKicker}</p>
            <h2>{copy.inviteMemberTitle}</h2>
          </div>
          <button
            type="button"
            className="ghost-button"
            onClick={onClose}
            style={{ padding: "8px 12px" }}
          >
            X
          </button>
        </div>
        <p style={{ color: "var(--text-muted)", marginBottom: "20px" }}>
          {copy.inviteMemberDescription}
        </p>
        <div
          className="project-create-form"
          style={{ border: "none", padding: "0", background: "transparent" }}
        >
          <div className="form-row">
            <label className="auth-field">
              <span>{copy.emailAddress}</span>
              <input
                type="email"
                value={inviteForm.email}
                onChange={(event) => onEmailChange(event.target.value)}
                placeholder={copy.inviteEmailPlaceholder}
              />
            </label>
          </div>
          <div className="form-row">
            <label className="auth-field">
              <span>{copy.role}</span>
              <select
                value={inviteForm.role}
                onChange={(event) => onRoleChange(event.target.value as InviteFormState["role"])}
              >
                <option value="ADMIN">{copy.adminRole}</option>
                <option value="MEMBER">{copy.memberRole}</option>
              </select>
            </label>
          </div>
          <div className="form-row">
            <label className="auth-field">
              <span>{copy.expiresInDays}</span>
              <select
                value={inviteForm.expiresInDays}
                onChange={(event) => onExpiresInDaysChange(parseInt(event.target.value, 10))}
              >
                <option value="1">{copy.days1}</option>
                <option value="3">{copy.days3}</option>
                <option value="7">{copy.days7}</option>
                <option value="14">{copy.days14}</option>
                <option value="30">{copy.days30}</option>
              </select>
            </label>
          </div>
          {inviteCreateError ? <p className="auth-error">{inviteCreateError}</p> : null}
          <div className="form-actions" style={{ marginTop: "20px" }}>
            <button type="button" className="ghost-button" onClick={onClose}>
              {copy.cancel}
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={onSubmit}
              disabled={isSendingInvite || !canSubmit}
            >
              {isSendingInvite ? copy.sending : copy.sendInvitation}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function RecentTasksPanel({
  language,
  tasks,
  onOpenTaskDetail,
  getStatusLabel
}: RecentTasksPanelProps) {
  const copy = panelCopy[language];

  return (
    <article className="panel-shell performance-shell">
      <div className="section-heading">
        <div>
          <p className="panel-kicker">{copy.taskTickerKicker}</p>
          <h2>{copy.recentTaskRuns}</h2>
        </div>
        <span className="section-badge">{tasks.length}{copy.rowsSuffix}</span>
      </div>

      <div className="task-ticker">
        {tasks.map((task) => (
          <div
            key={task.id}
            className="task-row"
            onClick={() => onOpenTaskDetail(task.id)}
            style={{ cursor: "pointer" }}
          >
            <div>
              <strong>{task.title}</strong>
              <p>
                {task.assigneeLabel ?? copy.unassigned} | {copy.runPrefix}{task.runNo}
              </p>
            </div>
            <div className="task-row-side">
              <span>{getStatusLabel(task.status)}</span>
              <strong>{task.progressPercent}%</strong>
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

export function LeaderboardPanel({
  language,
  leaderboard,
  formatNumber
}: LeaderboardPanelProps) {
  const copy = panelCopy[language];

  return (
    <article className="panel-shell leaderboard-shell">
      <div className="section-heading">
        <div>
          <p className="panel-kicker">{copy.leaderboardKicker}</p>
          <h2>{copy.leaderboardTitle}</h2>
        </div>
        <span className="section-badge">{copy.top5}</span>
      </div>

      <div className="leaderboard-list">
        {leaderboard.map((entry, index) => (
          <div key={entry.companyId} className="leaderboard-row">
            <span className="leaderboard-rank">{String(index + 1).padStart(2, "0")}</span>
            <div>
              <strong>{entry.name}</strong>
              <p>{entry.slug}</p>
            </div>
            <small>{formatNumber(entry.score)} {copy.pointsUnit}</small>
          </div>
        ))}
      </div>

      <div className="dashboard-footer dashboard-footer--tight">
        <p>{copy.leaderboardFooter}</p>
      </div>
    </article>
  );
}

export function EvaluationPanel({ language, evaluation }: EvaluationPanelProps) {
  const title = language === "zh-HK" ? "离线评估" : "Offline evaluation";
  const subtitle =
    language === "zh-HK"
      ? "成功率、延迟、重试和成本会按项目历史任务汇总。"
      : "Success, latency, retries, and cost are aggregated from historical task runs.";

  return (
    <article className="panel-shell performance-shell">
      <div className="section-heading">
        <div>
          <p className="panel-kicker">Evaluation</p>
          <h2>{title}</h2>
        </div>
        <span className="section-badge">{evaluation.logicalTaskCount} tasks</span>
      </div>

      <p style={{ color: "var(--text-muted)", marginBottom: "16px" }}>{subtitle}</p>

      <div className="mini-stat-grid" style={{ marginBottom: "16px" }}>
        <div className="mini-meter">
          <span>Success</span>
          <strong>{formatPercent(evaluation.successRate)}</strong>
        </div>
        <div className="mini-meter">
          <span>Avg latency</span>
          <strong>{formatDuration(evaluation.averageLatencyMs)}</strong>
        </div>
        <div className="mini-meter">
          <span>Retry rate</span>
          <strong>{formatPercent(evaluation.retryRate)}</strong>
        </div>
        <div className="mini-meter">
          <span>Total cost</span>
          <strong>{formatUsd(evaluation.totalEstimatedCostUsd)}</strong>
        </div>
      </div>

      <div className="mini-stat-grid" style={{ marginBottom: "16px" }}>
        <div className="mini-meter">
          <span>Prompt tokens</span>
          <strong>{evaluation.totalPromptTokens}</strong>
        </div>
        <div className="mini-meter">
          <span>Output tokens</span>
          <strong>{evaluation.totalOutputTokens}</strong>
        </div>
        <div className="mini-meter">
          <span>Tool calls</span>
          <strong>{evaluation.totalToolCalls}</strong>
        </div>
        <div className="mini-meter">
          <span>Queue delay</span>
          <strong>{formatDuration(evaluation.averageQueueDelayMs)}</strong>
        </div>
      </div>

      <div className="project-list">
        {evaluation.providers.map((provider) => (
          <div key={provider.provider} className="project-card" style={{ padding: "12px" }}>
            <div className="project-card-top">
              <div>
                <strong>{provider.provider}</strong>
                <p>
                  {provider.logicalTaskCount} tasks | {provider.runCount} runs
                </p>
              </div>
              <span>{formatUsd(provider.totalEstimatedCostUsd)}</span>
            </div>
            <div className="lattice-tags" style={{ marginTop: "8px" }}>
              <span>Success {formatPercent(provider.successRate)}</span>
              <span>Retry {formatPercent(provider.retryRate)}</span>
              <span>Latency {formatDuration(provider.averageLatencyMs)}</span>
              <span>Tools {provider.totalToolCalls}</span>
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

export function AgentConnectModal({
  language,
  isOpen,
  companies,
  agentForm,
  agentCreateError,
  createdAgentToken,
  isConnectingAgent,
  onClose,
  onCompanyChange,
  onProviderChange,
  onDisplayNameChange,
  onEndpointUrlChange,
  onAuthModeChange,
  onAuthSecretChange,
  onSubmit
}: AgentConnectModalProps) {
  if (!isOpen) {
    return null;
  }

  const copy = panelCopy[language];
  const provider = agentForm.provider.trim().toLowerCase();
  const isManagedProvider = provider === "openai" || provider === "anthropic";
  const managedProviderLabel =
    provider === "anthropic" ? "Anthropic" : provider === "openai" ? "OpenAI" : "Managed";
  const managedEndpointPlaceholder =
    provider === "anthropic"
      ? "Leave blank to use the default Anthropic Messages endpoint"
      : "Leave blank to use the default OpenAI Responses endpoint";
  const managedSecretPlaceholder = provider === "anthropic" ? "sk-ant-..." : "sk-...";

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(event) => event.stopPropagation()}>
        <div className="section-heading">
          <div>
            <p className="panel-kicker">{copy.connectAgentKicker}</p>
            <h2>{copy.connectAgentTitle}</h2>
          </div>
          <button
            type="button"
            className="ghost-button"
            onClick={onClose}
            style={{ padding: "8px 12px" }}
          >
            X
          </button>
        </div>
        <p style={{ color: "var(--text-muted)", marginBottom: "20px" }}>
          {copy.connectAgentDescription}
        </p>
        <div
          className="project-create-form"
          style={{ border: "none", padding: "0", background: "transparent" }}
        >
          <div className="form-row">
            <label className="auth-field">
              <span>{copy.company}</span>
              <select value={agentForm.companyId} onChange={(event) => onCompanyChange(event.target.value)}>
                <option value="" disabled>
                  {copy.selectCompany}
                </option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-row">
            <label className="auth-field">
              <span>{copy.provider}</span>
              <input
                type="text"
                value={agentForm.provider}
                onChange={(event) => onProviderChange(event.target.value)}
                placeholder={copy.providerPlaceholder}
              />
            </label>
          </div>
          <div className="form-row">
            <label className="auth-field">
              <span>{copy.displayName}</span>
              <input
                type="text"
                value={agentForm.displayName}
                onChange={(event) => onDisplayNameChange(event.target.value)}
                placeholder={copy.displayNamePlaceholder}
              />
            </label>
          </div>
          <div className="form-row">
            <label className="auth-field">
              <span>{copy.endpointUrl}</span>
              <input
                type="url"
                value={agentForm.endpointUrl}
                onChange={(event) => onEndpointUrlChange(event.target.value)}
                placeholder={
                  isManagedProvider
                    ? managedEndpointPlaceholder
                    : copy.endpointUrlPlaceholder
                }
              />
            </label>
          </div>
          {!isManagedProvider ? (
            <div className="form-row">
              <label className="auth-field">
                <span>{copy.authMode}</span>
                <select
                  value={agentForm.authMode}
                  onChange={(event) => onAuthModeChange(event.target.value as AgentFormState["authMode"])}
                >
                  <option value="TOKEN">{copy.authTokenMode}</option>
                  <option value="NONE">{copy.authNoneMode}</option>
                </select>
              </label>
            </div>
          ) : null}
          <div className="form-row">
            <label className="auth-field">
              <span>
                {isManagedProvider ? `${managedProviderLabel} API key` : "Secret / API key (optional)"}
              </span>
              <input
                type="password"
                value={agentForm.authSecret}
                onChange={(event) => onAuthSecretChange(event.target.value)}
                placeholder={isManagedProvider ? managedSecretPlaceholder : "Optional bearer token"}
              />
            </label>
          </div>
          {isManagedProvider ? (
            <p style={{ color: "var(--text-muted)", marginTop: "-4px", marginBottom: "8px" }}>
              Managed {managedProviderLabel} agents run inside the worker, keep themselves online,
              and record prompt, tool calls, token usage, and estimated cost automatically.
            </p>
          ) : null}
          {agentCreateError ? <p className="auth-error">{agentCreateError}</p> : null}
          {createdAgentToken ? (
            <div
              className="agent-token-display"
              style={{
                padding: "16px",
                background: "rgba(121, 255, 183, 0.1)",
                borderRadius: "12px",
                border: "1px solid rgba(121, 255, 183, 0.2)"
              }}
            >
              <p style={{ color: "var(--accent-mint)", marginBottom: "12px" }}>
                {copy.agentTokenSaved}
              </p>
              <code
                style={{
                  display: "block",
                  padding: "12px",
                  background: "rgba(0,0,0,0.4)",
                  borderRadius: "8px",
                  wordBreak: "break-all",
                  fontSize: "0.85rem"
                }}
              >
                {createdAgentToken}
              </code>
              <p style={{ color: "var(--accent-rose)", fontSize: "0.8rem", marginTop: "12px" }}>
                {copy.tokenNotShownAgain}
              </p>
            </div>
          ) : null}
          <div className="form-actions" style={{ marginTop: "20px" }}>
            <button type="button" className="ghost-button" onClick={onClose}>
              {createdAgentToken ? copy.done : copy.cancel}
            </button>
            {!createdAgentToken ? (
              <button
                type="button"
                className="primary-button"
                onClick={onSubmit}
                disabled={
                  isConnectingAgent ||
                  !agentForm.companyId ||
                  !agentForm.provider ||
                  !agentForm.displayName ||
                  (!isManagedProvider && !agentForm.endpointUrl) ||
                  (isManagedProvider && !agentForm.authSecret)
                }
              >
                {isConnectingAgent ? copy.connectingAgent : copy.connectAgentSubmit}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export function TaskDetailModal({
  language,
  taskDetail,
  onClose,
  formatDateTime,
  getStatusLabel
}: TaskDetailModalProps) {
  if (!taskDetail.taskId) {
    return null;
  }

  const copy = panelCopy[language];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(event) => event.stopPropagation()} style={{ maxWidth: "600px" }}>
        <div className="section-heading">
          <div>
            <p className="panel-kicker">{copy.taskDetailsKicker}</p>
            <h2>{taskDetail.task?.nodeTitle ?? copy.loading}</h2>
          </div>
          <button
            type="button"
            className="ghost-button"
            onClick={onClose}
            style={{ padding: "8px 12px" }}
          >
            X
          </button>
        </div>

        {taskDetail.isLoading ? (
          <p style={{ padding: "40px", textAlign: "center" }}>{copy.loadingTaskDetails}</p>
        ) : taskDetail.task ? (
          <>
            <div style={{ marginBottom: "20px" }}>
              <div className="mini-stat-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
                <div className="mini-meter">
                  <span>{copy.status}</span>
                  <strong>{getStatusLabel(taskDetail.task.status)}</strong>
                </div>
                <div className="mini-meter">
                  <span>{copy.progress}</span>
                  <strong>{taskDetail.task.progressPercent}%</strong>
                </div>
                <div className="mini-meter">
                  <span>{copy.runPrefix}</span>
                  <strong>{taskDetail.task.runNo}</strong>
                </div>
              </div>
            </div>

            <div style={{ marginBottom: "20px" }}>
              <div style={{ display: "flex", gap: "12px", marginBottom: "8px" }}>
                <span className="section-badge">
                  {taskDetail.task.assignedAgentInstance?.displayName ??
                    taskDetail.task.assignedUser?.displayName ??
                    copy.unassigned}
                </span>
                <span className="section-badge">{copy.queuedAt}: {formatDateTime(taskDetail.task.queuedAt)}</span>
                {taskDetail.task.startedAt ? (
                  <span className="section-badge">
                    {copy.startedAt}: {formatDateTime(taskDetail.task.startedAt)}
                  </span>
                ) : null}
                {taskDetail.task.completedAt ? (
                  <span className="section-badge">
                    {copy.completedAt}: {formatDateTime(taskDetail.task.completedAt)}
                  </span>
                ) : null}
              </div>
            </div>

            {taskDetail.task.status === "FAILED" && taskDetail.task.lastError ? (
              <div
                style={{
                  padding: "16px",
                  background: "rgba(255, 82, 82, 0.1)",
                  borderRadius: "8px",
                  marginBottom: "20px"
                }}
              >
                <strong style={{ color: "var(--accent-rose)" }}>{copy.error}:</strong>
                <p style={{ marginTop: "8px", fontFamily: "monospace", fontSize: "0.85rem" }}>
                  {taskDetail.task.lastError}
                </p>
              </div>
            ) : null}

            {taskDetail.logs ? (
              <div style={{ marginBottom: "20px" }}>
                <h3 style={{ fontSize: "1rem", marginBottom: "8px" }}>{copy.logs}</h3>
                <pre
                  style={{
                    padding: "12px",
                    background: "rgba(0,0,0,0.3)",
                    borderRadius: "8px",
                    overflow: "auto",
                    maxHeight: "200px",
                    fontSize: "0.8rem",
                    fontFamily: "monospace"
                  }}
                >
                  {typeof taskDetail.logs === "string"
                    ? taskDetail.logs
                    : JSON.stringify(taskDetail.logs, null, 2)}
                </pre>
              </div>
            ) : null}

            {(() => {
              const llmOutput = toRecordedLlmOutput(taskDetail.task.outputJson);
              if (!llmOutput) {
                return null;
              }

              const usage =
                llmOutput.usage &&
                typeof llmOutput.usage === "object" &&
                !Array.isArray(llmOutput.usage)
                  ? (llmOutput.usage as Record<string, unknown>)
                  : {};
              const cost =
                llmOutput.cost &&
                typeof llmOutput.cost === "object" &&
                !Array.isArray(llmOutput.cost)
                  ? (llmOutput.cost as Record<string, unknown>)
                  : {};
              const toolCalls = Array.isArray(llmOutput.toolCalls) ? llmOutput.toolCalls : [];

              return (
                <div style={{ marginBottom: "20px" }}>
                  <h3 style={{ fontSize: "1rem", marginBottom: "8px" }}>LLM run</h3>
                  <div className="mini-stat-grid" style={{ marginBottom: "12px" }}>
                    <div className="mini-meter">
                      <span>Model</span>
                      <strong>
                        {typeof llmOutput.model === "string"
                          ? llmOutput.model
                          : typeof llmOutput.provider === "string"
                            ? llmOutput.provider
                            : "llm"}
                      </strong>
                    </div>
                    <div className="mini-meter">
                      <span>Prompt tokens</span>
                      <strong>{typeof usage.inputTokens === "number" ? usage.inputTokens : 0}</strong>
                    </div>
                    <div className="mini-meter">
                      <span>Output tokens</span>
                      <strong>{typeof usage.outputTokens === "number" ? usage.outputTokens : 0}</strong>
                    </div>
                    <div className="mini-meter">
                      <span>Estimated cost</span>
                      <strong>
                        {typeof cost.totalCostUsd === "number" ? formatUsd(cost.totalCostUsd) : "--"}
                      </strong>
                    </div>
                  </div>

                  {typeof llmOutput.prompt === "string" && llmOutput.prompt.trim() ? (
                    <div style={{ marginBottom: "12px" }}>
                      <h4 style={{ fontSize: "0.95rem", marginBottom: "8px" }}>Prompt</h4>
                      <pre
                        style={{
                          padding: "12px",
                          background: "rgba(0,0,0,0.3)",
                          borderRadius: "8px",
                          overflow: "auto",
                          maxHeight: "160px",
                          fontSize: "0.8rem",
                          fontFamily: "monospace"
                        }}
                      >
                        {llmOutput.prompt}
                      </pre>
                    </div>
                  ) : null}

                  {toolCalls.length > 0 ? (
                    <div style={{ marginBottom: "12px" }}>
                      <h4 style={{ fontSize: "0.95rem", marginBottom: "8px" }}>Tool calls</h4>
                      <div className="project-list">
                        {toolCalls.map((toolCall, index) => {
                          const record =
                            toolCall && typeof toolCall === "object" && !Array.isArray(toolCall)
                              ? (toolCall as Record<string, unknown>)
                              : {};

                          return (
                            <div
                              key={`${String(record.callId ?? index)}-${index}`}
                              className="project-card"
                              style={{ padding: "12px" }}
                            >
                              <div className="project-card-top">
                                <div>
                                  <strong>{String(record.name ?? "tool")}</strong>
                                  <p>{String(record.callId ?? `call-${index + 1}`)}</p>
                                </div>
                              </div>
                              <pre
                                style={{
                                  marginTop: "8px",
                                  padding: "12px",
                                  background: "rgba(0,0,0,0.24)",
                                  borderRadius: "8px",
                                  overflow: "auto",
                                  maxHeight: "120px",
                                  fontSize: "0.78rem",
                                  fontFamily: "monospace"
                                }}
                              >
                                {JSON.stringify(record.arguments ?? {}, null, 2)}
                              </pre>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })()}

            {taskDetail.artifacts.length > 0 ? (
              <div style={{ marginBottom: "20px" }}>
                <h3 style={{ fontSize: "1rem", marginBottom: "8px" }}>{copy.artifacts}</h3>
                <div className="project-list">
                  {taskDetail.artifacts.map((artifact, index) => (
                    <div key={`${artifact.key}-${index}`} className="project-card" style={{ padding: "12px" }}>
                      <div className="project-card-top">
                        <div>
                          <strong>{artifact.name}</strong>
                          <p>{artifact.type}</p>
                        </div>
                        {artifact.size ? <span>{Math.round(artifact.size / 1024)} KB</span> : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {taskDetail.task.outputJson ? (
              <div style={{ marginBottom: "20px" }}>
                <h3 style={{ fontSize: "1rem", marginBottom: "8px" }}>{copy.output}</h3>
                <pre
                  style={{
                    padding: "12px",
                    background: "rgba(0,0,0,0.3)",
                    borderRadius: "8px",
                    overflow: "auto",
                    maxHeight: "200px",
                    fontSize: "0.8rem",
                    fontFamily: "monospace"
                  }}
                >
                  {JSON.stringify(taskDetail.task.outputJson, null, 2)}
                </pre>
              </div>
            ) : null}
          </>
        ) : (
          <p>{copy.taskNotFound}</p>
        )}

        <div className="form-actions" style={{ marginTop: "20px" }}>
          <button type="button" className="primary-button" onClick={onClose}>
            {copy.close}
          </button>
        </div>
      </div>
    </div>
  );
}
