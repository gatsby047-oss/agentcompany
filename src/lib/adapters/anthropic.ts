import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import {
  estimateAnthropicCost,
  extractAnthropicUsageSummary
} from "@/lib/anthropic-pricing";
import { handleTaskCallback } from "@/lib/workflow/engine";
import { AgentAdapter, DispatchTaskContext } from "@/lib/adapters/types";

type AnthropicTaskConfig = {
  prompt?: string;
  instructions?: string;
  model?: string;
  toolChoice?: "auto" | "any" | "none";
  maxOutputTokens?: number;
  enableBuiltInTools?: boolean;
};

type AnthropicMessage = {
  role: "user" | "assistant";
  content: Array<Record<string, unknown>>;
};

type AnthropicResponsePayload = {
  id: string;
  model: string;
  role?: string;
  stop_reason?: string | null;
  content?: AnthropicContentBlock[];
  usage?: Record<string, unknown>;
};

type AnthropicContentBlock =
  | {
      type: "text";
      text?: string;
    }
  | {
      type: "tool_use";
      id?: string;
      name?: string;
      input?: Record<string, unknown>;
    }
  | Record<string, unknown>;

type BuiltInTool = {
  definition: Record<string, unknown>;
  execute: (argumentsJson: Record<string, unknown>) => Promise<unknown>;
};

type RecordedToolCall = {
  callId: string;
  name: string;
  arguments: Record<string, unknown>;
  result: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toPrismaJson(value: unknown) {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.JsonValue;
}

function toAnthropicTaskConfig(input: unknown): AnthropicTaskConfig {
  if (!isRecord(input)) {
    return {};
  }

  return {
    prompt: typeof input.prompt === "string" ? input.prompt : undefined,
    instructions: typeof input.instructions === "string" ? input.instructions : undefined,
    model: typeof input.model === "string" ? input.model : undefined,
    toolChoice:
      input.toolChoice === "auto" || input.toolChoice === "any" || input.toolChoice === "none"
        ? input.toolChoice
        : undefined,
    maxOutputTokens:
      typeof input.maxOutputTokens === "number" && Number.isFinite(input.maxOutputTokens)
        ? input.maxOutputTokens
        : undefined,
    enableBuiltInTools:
      typeof input.enableBuiltInTools === "boolean" ? input.enableBuiltInTools : undefined
  };
}

function withoutReservedKeys(input: unknown) {
  if (!isRecord(input)) {
    return input;
  }

  const copy = { ...input };
  delete copy.prompt;
  delete copy.instructions;
  delete copy.model;
  delete copy.toolChoice;
  delete copy.maxOutputTokens;
  delete copy.enableBuiltInTools;
  return copy;
}

function clampLimit(value: unknown, fallback: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(1, Math.min(Math.trunc(value), max));
}

function extractResponseText(response: AnthropicResponsePayload) {
  const chunks: string[] = [];

  for (const item of response.content ?? []) {
    if (isRecord(item) && item.type === "text" && typeof item.text === "string" && item.text.trim()) {
      chunks.push(item.text.trim());
    }
  }

  return chunks.join("\n\n");
}

function extractToolUseBlocks(response: AnthropicResponsePayload) {
  const calls: Array<{
    callId: string;
    name: string;
    argumentsJson: Record<string, unknown>;
  }> = [];

  for (const item of response.content ?? []) {
    if (!isRecord(item) || item.type !== "tool_use") {
      continue;
    }

    const callId = typeof item.id === "string" ? item.id : null;
    const name = typeof item.name === "string" ? item.name : null;
    const argumentsJson = isRecord(item.input) ? item.input : {};

    if (!callId || !name) {
      continue;
    }

    calls.push({
      callId,
      name,
      argumentsJson
    });
  }

  return calls;
}

async function createAnthropicMessage(input: {
  endpointUrl: string;
  apiKey: string;
  apiVersion: string;
  body: Record<string, unknown>;
}) {
  const response = await fetch(input.endpointUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": input.apiKey,
      "anthropic-version": input.apiVersion
    },
    body: JSON.stringify(input.body)
  });

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as Record<string, unknown>) : {};

  if (!response.ok) {
    const errorObject = isRecord(payload.error) ? payload.error : null;
    const errorPayload =
      errorObject && typeof errorObject.message === "string" ? errorObject.message : text;
    throw new Error(`Anthropic request failed with ${response.status}: ${errorPayload}`);
  }

  return payload as unknown as AnthropicResponsePayload;
}

async function buildProjectSnapshot(
  context: DispatchTaskContext,
  argumentsJson: Record<string, unknown>
) {
  const [latestWorkflow, recentTaskRuns] = await Promise.all([
    prisma.workflow.findFirst({
      where: {
        projectId: context.project.id
      },
      orderBy: {
        createdAt: "desc"
      },
      include: {
        nodes: {
          orderBy: {
            id: "asc"
          },
          select: {
            nodeKey: true,
            title: true,
            status: true,
            progressPercent: true,
            lastError: true
          }
        }
      }
    }),
    prisma.taskRun.findMany({
      where: {
        projectId: context.project.id
      },
      orderBy: {
        queuedAt: "desc"
      },
      take: clampLimit(argumentsJson.taskLimit, 5, 10),
      select: {
        id: true,
        runNo: true,
        status: true,
        progressPercent: true,
        queuedAt: true,
        completedAt: true,
        workflowNode: {
          select: {
            title: true,
            nodeKey: true
          }
        }
      }
    })
  ]);

  return {
    project: context.project
      ? {
          id: context.project.id,
          name: context.project.name,
          summary: context.project.summary,
          status: context.project.status,
          progressPercent: context.project.progressPercent,
          latestWorkflow:
            latestWorkflow
              ? {
                  id: latestWorkflow.id,
                  status: latestWorkflow.status,
                  nodes: latestWorkflow.nodes
                }
              : null,
          recentTaskRuns
        }
      : null
  };
}

async function buildRecentProjectEvents(
  context: DispatchTaskContext,
  argumentsJson: Record<string, unknown>
) {
  const events = await prisma.projectEvent.findMany({
    where: {
      projectId: context.project.id
    },
    orderBy: {
      id: "desc"
    },
    take: clampLimit(argumentsJson.limit, 8, 20),
    select: {
      id: true,
      eventType: true,
      createdAt: true,
      payloadJson: true
    }
  });

  return {
    items: events.map((event) => ({
      id: event.id.toString(),
      eventType: event.eventType,
      createdAt: event.createdAt.toISOString(),
      payload: event.payloadJson
    }))
  };
}

function buildTaskExecutionContext(context: DispatchTaskContext) {
  return {
    taskRunId: context.taskRun.id,
    workflowNodeId: context.workflowNode.id,
    nodeKey: context.workflowNode.nodeKey,
    nodeTitle: context.workflowNode.title,
    project: {
      id: context.project.id,
      name: context.project.name,
      summary: context.project.summary,
      status: context.project.status,
      progressPercent: context.project.progressPercent
    },
    input: withoutReservedKeys(context.taskRun.inputJson as unknown)
  };
}

function createBuiltInTools(context: DispatchTaskContext): BuiltInTool[] {
  return [
    {
      definition: {
        name: "get_task_execution_context",
        description:
          "Get the current task context, including workflow node details, the project summary, and task input payload.",
        input_schema: {
          type: "object",
          properties: {},
          required: []
        }
      },
      async execute() {
        return buildTaskExecutionContext(context);
      }
    },
    {
      definition: {
        name: "get_project_snapshot",
        description:
          "Get the latest project snapshot with workflow state and recent task runs before answering the task.",
        input_schema: {
          type: "object",
          properties: {
            taskLimit: {
              type: "integer",
              minimum: 1,
              maximum: 10
            }
          },
          required: []
        }
      },
      async execute(argumentsJson) {
        return buildProjectSnapshot(context, argumentsJson);
      }
    },
    {
      definition: {
        name: "get_recent_project_events",
        description:
          "Inspect recent project events so the model can reference the latest task, workflow, or agent activity.",
        input_schema: {
          type: "object",
          properties: {
            limit: {
              type: "integer",
              minimum: 1,
              maximum: 20
            }
          },
          required: []
        }
      },
      async execute(argumentsJson) {
        return buildRecentProjectEvents(context, argumentsJson);
      }
    }
  ];
}

function buildDefaultInstructions() {
  return [
    "You are a managed Anthropic worker inside Agent Company.",
    "Finish the assigned workflow node and return a concise, execution-oriented answer.",
    "Use the available tools when you need fresh project context before answering.",
    "When the task asks for structured output, return JSON inside the final answer body."
  ].join(" ");
}

function buildPromptText(context: DispatchTaskContext, config: AnthropicTaskConfig) {
  const prompt =
    config.prompt?.trim() ||
    `Complete the workflow node "${context.workflowNode.title}" for project "${context.project.name}".`;

  const executionContext = {
    taskRunId: context.taskRun.id,
    projectId: context.project.id,
    projectName: context.project.name,
    projectSummary: context.project.summary,
    nodeKey: context.workflowNode.nodeKey,
    nodeTitle: context.workflowNode.title,
    input: withoutReservedKeys(context.taskRun.inputJson as unknown)
  };

  return [prompt, "", "Execution context:", JSON.stringify(executionContext, null, 2)].join("\n");
}

function summarizeArtifacts(recordedToolCalls: RecordedToolCall[]) {
  const timestamp = new Date().toISOString();
  return [
    {
      key: "anthropic-response-summary",
      name: "anthropic-response-summary.json",
      type: "application/json",
      createdAt: timestamp
    },
    {
      key: "anthropic-tool-calls",
      name: "anthropic-tool-calls.json",
      type: "application/json",
      size: recordedToolCalls.length,
      createdAt: timestamp
    }
  ];
}

function aggregateUsageAndCost(model: string, responses: AnthropicResponsePayload[]) {
  const totals = {
    inputTokens: 0,
    cachedInputTokens: 0,
    cacheCreationInputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    inputCostUsd: 0,
    outputCostUsd: 0,
    totalCostUsd: 0,
    pricingSource: "unavailable" as "env" | "fallback" | "unavailable"
  };

  for (const response of responses) {
    const cost = estimateAnthropicCost(model, response.usage);
    totals.inputTokens += cost.inputTokens;
    totals.cachedInputTokens += cost.cachedInputTokens;
    totals.cacheCreationInputTokens += cost.cacheCreationInputTokens;
    totals.outputTokens += cost.outputTokens;
    totals.totalTokens += cost.totalTokens;
    totals.inputCostUsd += cost.inputCostUsd ?? 0;
    totals.outputCostUsd += cost.outputCostUsd ?? 0;
    totals.totalCostUsd += cost.totalCostUsd ?? 0;

    if (totals.pricingSource === "unavailable" && cost.pricingSource !== "unavailable") {
      totals.pricingSource = cost.pricingSource;
    }
  }

  return {
    model,
    currency: "USD" as const,
    pricingSource: totals.pricingSource,
    inputTokens: totals.inputTokens,
    cachedInputTokens: totals.cachedInputTokens,
    cacheCreationInputTokens: totals.cacheCreationInputTokens,
    outputTokens: totals.outputTokens,
    totalTokens: totals.totalTokens,
    inputCostUsd:
      totals.pricingSource === "unavailable" ? null : Number(totals.inputCostUsd.toFixed(6)),
    outputCostUsd:
      totals.pricingSource === "unavailable" ? null : Number(totals.outputCostUsd.toFixed(6)),
    totalCostUsd:
      totals.pricingSource === "unavailable" ? null : Number(totals.totalCostUsd.toFixed(6))
  };
}

async function runManagedAnthropicTask(context: DispatchTaskContext) {
  const env = getEnv();
  const config = toAnthropicTaskConfig(context.taskRun.inputJson as unknown);
  const endpointUrl = context.agentInstance.endpointUrl || env.ANTHROPIC_BASE_URL;
  const apiKey = context.secret ?? env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error(
      "Anthropic API key is required. Provide authSecret when connecting the agent or set ANTHROPIC_API_KEY."
    );
  }

  const model = config.model ?? env.ANTHROPIC_MODEL;
  const instructions = config.instructions?.trim() || buildDefaultInstructions();
  const promptText = buildPromptText(context, config);
  const builtInTools = config.enableBuiltInTools === false ? [] : createBuiltInTools(context);
  const toolsByName = new Map(builtInTools.map((tool) => [String(tool.definition.name), tool]));
  const toolCalls: RecordedToolCall[] = [];
  const responses: AnthropicResponsePayload[] = [];
  const requestLog: Array<Record<string, unknown>> = [];
  const maxTokens = config.maxOutputTokens ?? 1_200;
  const messages: AnthropicMessage[] = [
    {
      role: "user",
      content: [{ type: "text", text: promptText }]
    }
  ];

  let response = await createAnthropicMessage({
    endpointUrl,
    apiKey,
    apiVersion: env.ANTHROPIC_API_VERSION,
    body: {
      model,
      system: instructions,
      max_tokens: maxTokens,
      messages,
      ...(builtInTools.length > 0 ? { tools: builtInTools.map((tool) => tool.definition) } : {}),
      ...(builtInTools.length > 0 && config.toolChoice
        ? { tool_choice: { type: config.toolChoice } }
        : {})
    }
  });

  responses.push(response);
  requestLog.push({
    phase: "initial",
    request: {
      model,
      instructions,
      prompt: promptText,
      toolCount: builtInTools.length
    },
    response
  });

  const maxToolRounds = 4;

  for (let round = 0; round < maxToolRounds; round += 1) {
    const toolUseBlocks = extractToolUseBlocks(response);
    if (toolUseBlocks.length === 0) {
      break;
    }

    const toolResultBlocks: Array<Record<string, unknown>> = [];

    for (const call of toolUseBlocks) {
      const tool = toolsByName.get(call.name);
      const result = tool
        ? await tool.execute(call.argumentsJson)
        : { ok: false, error: `Unknown tool: ${call.name}` };

      toolCalls.push({
        callId: call.callId,
        name: call.name,
        arguments: call.argumentsJson,
        result
      });

      toolResultBlocks.push({
        type: "tool_result",
        tool_use_id: call.callId,
        content: JSON.stringify(result)
      });
    }

    await handleTaskCallback({
      taskRunId: context.taskRun.id,
      agentInstanceId: context.agentInstance.id,
      provider: context.agentInstance.provider,
      status: "progress",
      progressPercent: Math.min(35 + (round + 1) * 15, 85),
      output: toPrismaJson({
        provider: "anthropic",
        model,
        toolCalls: toolCalls.map((call) => ({
          callId: call.callId,
          name: call.name,
          arguments: call.arguments
        }))
      })
    });

    messages.push({
      role: "assistant",
      content: (response.content ?? []).map((item) =>
        isRecord(item) ? item : { type: "text", text: String(item) }
      )
    });
    messages.push({
      role: "user",
      content: toolResultBlocks
    });

    response = await createAnthropicMessage({
      endpointUrl,
      apiKey,
      apiVersion: env.ANTHROPIC_API_VERSION,
      body: {
        model,
        system: instructions,
        max_tokens: maxTokens,
        messages,
        ...(builtInTools.length > 0 ? { tools: builtInTools.map((tool) => tool.definition) } : {}),
        ...(builtInTools.length > 0 && config.toolChoice
          ? { tool_choice: { type: config.toolChoice } }
          : {})
      }
    });

    responses.push(response);
    requestLog.push({
      phase: `tool-round-${round + 1}`,
      toolOutputs: toolResultBlocks,
      response
    });
  }

  if (extractToolUseBlocks(response).length > 0 && response.stop_reason === "tool_use") {
    throw new Error("Anthropic tool execution exceeded the maximum tool round limit.");
  }

  const usage = aggregateUsageAndCost(model, responses);
  const finalResponse = responses[responses.length - 1];

  return {
    output: {
      provider: "anthropic",
      model,
      responseId: finalResponse.id,
      text: extractResponseText(finalResponse),
      prompt: promptText,
      instructions,
      usage,
      cost: usage,
      toolCalls: toolCalls.map((call) => ({
        callId: call.callId,
        name: call.name,
        arguments: call.arguments,
        result: call.result
      })),
      responseSummaries: responses.map((item) => ({
        id: item.id,
        model: item.model,
        stopReason: item.stop_reason ?? null,
        text: extractResponseText(item),
        usage: extractAnthropicUsageSummary(item.usage)
      }))
    },
    logs: {
      provider: "anthropic",
      endpointUrl,
      model,
      prompt: promptText,
      instructions,
      exchanges: requestLog
    },
    artifacts: summarizeArtifacts(toolCalls)
  };
}

export const anthropicAdapter: AgentAdapter = {
  provider: "anthropic",
  async dispatchTask(context) {
    await handleTaskCallback({
      taskRunId: context.taskRun.id,
      agentInstanceId: context.agentInstance.id,
      provider: context.agentInstance.provider,
      status: "started",
      progressPercent: 5
    });

    try {
      const result = await runManagedAnthropicTask(context);

      await handleTaskCallback({
        taskRunId: context.taskRun.id,
        agentInstanceId: context.agentInstance.id,
        provider: context.agentInstance.provider,
        status: "completed",
        progressPercent: 100,
        output: toPrismaJson(result.output),
        logs: toPrismaJson(result.logs),
        artifacts: toPrismaJson(result.artifacts)
      });
    } catch (error) {
      await handleTaskCallback({
        taskRunId: context.taskRun.id,
        agentInstanceId: context.agentInstance.id,
        provider: context.agentInstance.provider,
        status: "failed",
        progressPercent: 100,
        error: error instanceof Error ? error.message : "Anthropic task execution failed",
        output: toPrismaJson({
          provider: "anthropic",
          error: error instanceof Error ? error.message : "Anthropic task execution failed"
        })
      });
    }
  }
};
