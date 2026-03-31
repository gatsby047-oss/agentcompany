import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { estimateOpenAiCost, extractOpenAiUsageSummary } from "@/lib/openai-pricing";
import { handleTaskCallback } from "@/lib/workflow/engine";
import { AgentAdapter, DispatchTaskContext } from "@/lib/adapters/types";

type OpenAiTaskConfig = {
  prompt?: string;
  instructions?: string;
  model?: string;
  toolChoice?: "auto" | "required" | "none";
  maxOutputTokens?: number;
  enableBuiltInTools?: boolean;
};

type OpenAiResponsePayload = {
  id: string;
  model: string;
  output?: OpenAiResponseOutputItem[];
  usage?: Record<string, unknown>;
};

type OpenAiResponseOutputItem =
  | {
      type: "message";
      role?: string;
      content?: Array<
        | {
            type: string;
            text?: string;
          }
        | Record<string, unknown>
      >;
    }
  | {
      type: "function_call";
      id?: string;
      call_id?: string;
      name?: string;
      arguments?: string;
      status?: string;
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

function toOpenAiTaskConfig(input: unknown): OpenAiTaskConfig {
  if (!isRecord(input)) {
    return {};
  }

  return {
    prompt: typeof input.prompt === "string" ? input.prompt : undefined,
    instructions: typeof input.instructions === "string" ? input.instructions : undefined,
    model: typeof input.model === "string" ? input.model : undefined,
    toolChoice:
      input.toolChoice === "auto" || input.toolChoice === "required" || input.toolChoice === "none"
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

function extractResponseText(response: OpenAiResponsePayload) {
  const chunks: string[] = [];

  for (const item of response.output ?? []) {
    if (!isRecord(item) || item.type !== "message" || !Array.isArray(item.content)) {
      continue;
    }

    for (const content of item.content) {
      if (isRecord(content) && typeof content.text === "string" && content.text.trim()) {
        chunks.push(content.text.trim());
      }
    }
  }

  return chunks.join("\n\n");
}

function extractFunctionCalls(response: OpenAiResponsePayload) {
  const calls: Array<{
    id: string;
    callId: string;
    name: string;
    argumentsJson: Record<string, unknown>;
    rawArguments: string;
    status: string | null;
  }> = [];

  for (const item of response.output ?? []) {
    if (!isRecord(item) || item.type !== "function_call") {
      continue;
    }

    const callId = typeof item.call_id === "string" ? item.call_id : null;
    const name = typeof item.name === "string" ? item.name : null;
    const rawArguments = typeof item.arguments === "string" ? item.arguments : "{}";

    if (!callId || !name) {
      continue;
    }

    let argumentsJson: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(rawArguments);
      argumentsJson = isRecord(parsed) ? parsed : {};
    } catch {
      argumentsJson = {};
    }

    calls.push({
      id: typeof item.id === "string" ? item.id : callId,
      callId,
      name,
      argumentsJson,
      rawArguments,
      status: typeof item.status === "string" ? item.status : null
    });
  }

  return calls;
}

async function createOpenAiResponse(input: {
  endpointUrl: string;
  apiKey: string;
  body: Record<string, unknown>;
}) {
  const response = await fetch(input.endpointUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input.body)
  });

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as Record<string, unknown>) : {};

  if (!response.ok) {
    const errorObject = isRecord(payload.error) ? payload.error : null;
    const errorPayload =
      errorObject && typeof errorObject.message === "string"
        ? errorObject.message
        : text;
    throw new Error(`OpenAI request failed with ${response.status}: ${errorPayload}`);
  }

  return payload as unknown as OpenAiResponsePayload;
}

async function buildProjectSnapshot(context: DispatchTaskContext, argumentsJson: Record<string, unknown>) {
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

async function buildRecentProjectEvents(context: DispatchTaskContext, argumentsJson: Record<string, unknown>) {
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
        type: "function",
        name: "get_task_execution_context",
        description:
          "Get the current task context, including workflow node details, the project summary, and task input payload.",
        strict: true,
        parameters: {
          type: "object",
          properties: {},
          required: [],
          additionalProperties: false
        }
      },
      async execute() {
        return buildTaskExecutionContext(context);
      }
    },
    {
      definition: {
        type: "function",
        name: "get_project_snapshot",
        description:
          "Get the latest project snapshot with workflow state and recent task runs before answering the task.",
        strict: true,
        parameters: {
          type: "object",
          properties: {
            taskLimit: {
              type: "integer",
              minimum: 1,
              maximum: 10
            }
          },
          required: [],
          additionalProperties: false
        }
      },
      async execute(argumentsJson) {
        return buildProjectSnapshot(context, argumentsJson);
      }
    },
    {
      definition: {
        type: "function",
        name: "get_recent_project_events",
        description:
          "Inspect recent project events so the model can reference the latest task, workflow, or agent activity.",
        strict: true,
        parameters: {
          type: "object",
          properties: {
            limit: {
              type: "integer",
              minimum: 1,
              maximum: 20
            }
          },
          required: [],
          additionalProperties: false
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
    "You are a managed OpenAI worker inside Agent Company.",
    "Finish the assigned workflow node and return a concise, execution-oriented answer.",
    "Use the available tools when you need fresh project context before answering.",
    "When the task asks for structured output, return JSON inside the final answer body."
  ].join(" ");
}

function buildPromptText(context: DispatchTaskContext, config: OpenAiTaskConfig) {
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
      key: "openai-response-summary",
      name: "openai-response-summary.json",
      type: "application/json",
      createdAt: timestamp
    },
    {
      key: "openai-tool-calls",
      name: "openai-tool-calls.json",
      type: "application/json",
      size: recordedToolCalls.length,
      createdAt: timestamp
    }
  ];
}

function aggregateUsageAndCost(model: string, responses: OpenAiResponsePayload[]) {
  const totals = {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    inputCostUsd: 0,
    outputCostUsd: 0,
    totalCostUsd: 0,
    pricingSource: "unavailable" as "env" | "fallback" | "unavailable"
  };

  for (const response of responses) {
    const cost = estimateOpenAiCost(model, response.usage);
    totals.inputTokens += cost.inputTokens;
    totals.cachedInputTokens += cost.cachedInputTokens;
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

async function runManagedOpenAiTask(context: DispatchTaskContext) {
  const env = getEnv();
  const config = toOpenAiTaskConfig(context.taskRun.inputJson as unknown);
  const endpointUrl = context.agentInstance.endpointUrl || env.OPENAI_BASE_URL;
  const apiKey = context.secret ?? env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OpenAI API key is required. Provide authSecret when connecting the agent or set OPENAI_API_KEY.");
  }

  const model = config.model ?? env.OPENAI_MODEL;
  const instructions = config.instructions?.trim() || buildDefaultInstructions();
  const promptText = buildPromptText(context, config);
  const builtInTools = config.enableBuiltInTools === false ? [] : createBuiltInTools(context);
  const toolsByName = new Map(builtInTools.map((tool) => [tool.definition.name, tool]));
  const toolCalls: RecordedToolCall[] = [];
  const responses: OpenAiResponsePayload[] = [];
  const requestLog: Array<Record<string, unknown>> = [];

  let response = await createOpenAiResponse({
    endpointUrl,
    apiKey,
    body: {
      model,
      instructions,
      input: promptText,
      ...(builtInTools.length > 0 ? { tools: builtInTools.map((tool) => tool.definition) } : {}),
      ...(builtInTools.length > 0 && config.toolChoice ? { tool_choice: config.toolChoice } : {}),
      ...(config.maxOutputTokens ? { max_output_tokens: config.maxOutputTokens } : {}),
      metadata: {
        taskRunId: context.taskRun.id,
        workflowNodeId: context.workflowNode.id,
        projectId: context.project.id
      }
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
    response: response
  });

  const maxToolRounds = 4;

  for (let round = 0; round < maxToolRounds; round += 1) {
    const functionCalls = extractFunctionCalls(response);
    if (functionCalls.length === 0) {
      break;
    }

    const toolOutputs: Array<{
      type: "function_call_output";
      call_id: string;
      output: string;
    }> = [];

    for (const call of functionCalls) {
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

      toolOutputs.push({
        type: "function_call_output",
        call_id: call.callId,
        output: JSON.stringify(result)
      });
    }

    await handleTaskCallback({
      taskRunId: context.taskRun.id,
      agentInstanceId: context.agentInstance.id,
      provider: context.agentInstance.provider,
      status: "progress",
      progressPercent: Math.min(35 + (round + 1) * 15, 85),
      output: toPrismaJson({
        provider: "openai",
        model,
        toolCalls: toolCalls.map((call) => ({
          callId: call.callId,
          name: call.name,
          arguments: call.arguments
        }))
      })
    });

    response = await createOpenAiResponse({
      endpointUrl,
      apiKey,
      body: {
        model,
        instructions,
        previous_response_id: response.id,
        input: toolOutputs,
        ...(builtInTools.length > 0 ? { tools: builtInTools.map((tool) => tool.definition) } : {}),
        ...(config.maxOutputTokens ? { max_output_tokens: config.maxOutputTokens } : {}),
        metadata: {
          taskRunId: context.taskRun.id,
          workflowNodeId: context.workflowNode.id,
          projectId: context.project.id
        }
      }
    });

    responses.push(response);
    requestLog.push({
      phase: `tool-round-${round + 1}`,
      toolOutputs,
      response
    });
  }

  const usage = aggregateUsageAndCost(model, responses);
  const finalResponse = responses[responses.length - 1];

  return {
    output: {
      provider: "openai",
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
        text: extractResponseText(item),
        usage: extractOpenAiUsageSummary(item.usage)
      }))
    },
    logs: {
      provider: "openai",
      endpointUrl,
      model,
      prompt: promptText,
      instructions,
      exchanges: requestLog
    },
    artifacts: summarizeArtifacts(toolCalls)
  };
}

export const openAiAdapter: AgentAdapter = {
  provider: "openai",
  async dispatchTask(context) {
    await handleTaskCallback({
      taskRunId: context.taskRun.id,
      agentInstanceId: context.agentInstance.id,
      provider: context.agentInstance.provider,
      status: "started",
      progressPercent: 5
    });

    try {
      const result = await runManagedOpenAiTask(context);

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
        error: error instanceof Error ? error.message : "OpenAI task execution failed",
        output: toPrismaJson({
          provider: "openai",
          error: error instanceof Error ? error.message : "OpenAI task execution failed"
        })
      });
    }
  }
};
