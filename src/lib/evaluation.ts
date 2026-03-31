import { Prisma } from "@prisma/client";

export type ProjectEvaluationProviderSummary = {
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

export type ProjectEvaluationSummary = {
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
  providers: ProjectEvaluationProviderSummary[];
};

type EvaluationTaskRow = {
  id: string;
  workflowRunId: string;
  workflowNodeId: string;
  status: string;
  runNo: number;
  queuedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  outputJson: Prisma.JsonValue | null;
  assignedAgentInstance: {
    provider: string;
  } | null;
};

type RecordedLlmMetrics = {
  estimatedCostUsd: number;
  promptTokens: number;
  outputTokens: number;
  toolCallCount: number;
};

type LogicalTaskAccumulator = {
  provider: string;
  maxRunNo: number;
  finalStatus: string;
};

function toRecord(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function toNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function roundRate(numerator: number, denominator: number) {
  if (denominator <= 0) {
    return 0;
  }

  return Number((numerator / denominator).toFixed(4));
}

function average(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function extractRecordedLlmMetrics(outputJson: Prisma.JsonValue | null): RecordedLlmMetrics {
  const payload = toRecord(outputJson);
  const usage = payload ? toRecord(payload.usage as Prisma.JsonValue | null | undefined) : null;
  const cost = payload ? toRecord(payload.cost as Prisma.JsonValue | null | undefined) : null;
  const toolCalls = payload?.toolCalls;

  return {
    estimatedCostUsd: toNumber(cost?.totalCostUsd),
    promptTokens: toNumber(usage?.inputTokens),
    outputTokens: toNumber(usage?.outputTokens),
    toolCallCount: Array.isArray(toolCalls) ? toolCalls.length : 0
  };
}

function summarizeRows(rows: EvaluationTaskRow[], provider: string): ProjectEvaluationProviderSummary {
  const latencyValues = rows
    .map((row) =>
      row.startedAt && row.completedAt ? row.completedAt.getTime() - row.startedAt.getTime() : null
    )
    .filter((value): value is number => value !== null && value >= 0);

  const logicalTaskMap = new Map<string, LogicalTaskAccumulator>();
  let completedRuns = 0;
  let failedRuns = 0;
  let blockedRuns = 0;
  let totalEstimatedCostUsd = 0;
  let totalPromptTokens = 0;
  let totalOutputTokens = 0;
  let totalToolCalls = 0;

  for (const row of rows) {
    if (row.status === "COMPLETED") {
      completedRuns += 1;
    } else if (row.status === "FAILED") {
      failedRuns += 1;
    } else if (row.status === "BLOCKED") {
      blockedRuns += 1;
    }

    const metrics = extractRecordedLlmMetrics(row.outputJson);
    totalEstimatedCostUsd += metrics.estimatedCostUsd;
    totalPromptTokens += metrics.promptTokens;
    totalOutputTokens += metrics.outputTokens;
    totalToolCalls += metrics.toolCallCount;

    const logicalTaskKey = `${row.workflowRunId}:${row.workflowNodeId}`;
    const current = logicalTaskMap.get(logicalTaskKey);
    if (!current || row.runNo >= current.maxRunNo) {
      logicalTaskMap.set(logicalTaskKey, {
        provider,
        maxRunNo: row.runNo,
        finalStatus: row.status
      });
    }
  }

  const logicalTasks = [...logicalTaskMap.values()];
  const terminalLogicalTasks = logicalTasks.filter((task) =>
    ["COMPLETED", "FAILED", "BLOCKED"].includes(task.finalStatus)
  );
  const retriedLogicalTasks = logicalTasks.filter((task) => task.maxRunNo > 1);
  const successfulLogicalTasks = logicalTasks.filter((task) => task.finalStatus === "COMPLETED");

  return {
    provider,
    runCount: rows.length,
    logicalTaskCount: logicalTasks.length,
    successRate: roundRate(successfulLogicalTasks.length, terminalLogicalTasks.length),
    retryRate: roundRate(retriedLogicalTasks.length, logicalTasks.length),
    averageLatencyMs: average(latencyValues),
    totalEstimatedCostUsd,
    totalPromptTokens,
    totalOutputTokens,
    totalToolCalls
  };
}

export function buildProjectEvaluationSummary(rows: EvaluationTaskRow[]): ProjectEvaluationSummary {
  const providerGroups = new Map<string, EvaluationTaskRow[]>();
  const queueDelayValues: number[] = [];
  const logicalTaskMap = new Map<string, LogicalTaskAccumulator>();
  let completedRuns = 0;
  let failedRuns = 0;
  let blockedRuns = 0;
  let totalEstimatedCostUsd = 0;
  let totalPromptTokens = 0;
  let totalOutputTokens = 0;
  let totalToolCalls = 0;

  for (const row of rows) {
    const provider = row.assignedAgentInstance?.provider ?? "unassigned";
    const group = providerGroups.get(provider) ?? [];
    group.push(row);
    providerGroups.set(provider, group);

    const logicalTaskKey = `${row.workflowRunId}:${row.workflowNodeId}`;
    const current = logicalTaskMap.get(logicalTaskKey);
    if (!current || row.runNo >= current.maxRunNo) {
      logicalTaskMap.set(logicalTaskKey, {
        provider,
        maxRunNo: row.runNo,
        finalStatus: row.status
      });
    }

    if (row.status === "COMPLETED") {
      completedRuns += 1;
    } else if (row.status === "FAILED") {
      failedRuns += 1;
    } else if (row.status === "BLOCKED") {
      blockedRuns += 1;
    }

    if (row.startedAt) {
      queueDelayValues.push(row.startedAt.getTime() - row.queuedAt.getTime());
    }

    const metrics = extractRecordedLlmMetrics(row.outputJson);
    totalEstimatedCostUsd += metrics.estimatedCostUsd;
    totalPromptTokens += metrics.promptTokens;
    totalOutputTokens += metrics.outputTokens;
    totalToolCalls += metrics.toolCallCount;
  }

  const logicalTasks = [...logicalTaskMap.values()];
  const terminalLogicalTasks = logicalTasks.filter((task) =>
    ["COMPLETED", "FAILED", "BLOCKED"].includes(task.finalStatus)
  );
  const retriedLogicalTasks = logicalTasks.filter((task) => task.maxRunNo > 1);
  const successfulLogicalTasks = logicalTasks.filter((task) => task.finalStatus === "COMPLETED");
  const providerSummaries = [...providerGroups.entries()]
    .map(([provider, providerRows]) => summarizeRows(providerRows, provider))
    .sort((left, right) => right.totalEstimatedCostUsd - left.totalEstimatedCostUsd);
  const latencyValues = rows
    .map((row) =>
      row.startedAt && row.completedAt ? row.completedAt.getTime() - row.startedAt.getTime() : null
    )
    .filter((value): value is number => value !== null && value >= 0);

  return {
    totalRuns: rows.length,
    logicalTaskCount: logicalTasks.length,
    completedRuns,
    failedRuns,
    blockedRuns,
    successRate: roundRate(successfulLogicalTasks.length, terminalLogicalTasks.length),
    retryRate: roundRate(retriedLogicalTasks.length, logicalTasks.length),
    averageLatencyMs: average(latencyValues),
    averageQueueDelayMs: average(queueDelayValues),
    totalEstimatedCostUsd,
    totalPromptTokens,
    totalOutputTokens,
    totalToolCalls,
    providers: providerSummaries
  };
}
