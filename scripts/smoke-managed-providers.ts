import { existsSync } from "fs";
import { rm } from "fs/promises";
import path from "path";
import bcrypt from "bcryptjs";
import {
  AgentAuthMode,
  AgentStatus,
  MembershipMemberType,
  MembershipRole,
  MembershipStatus,
  Prisma,
  ProjectStatus,
  TaskRunStatus,
  WorkflowNodeStatus,
  WorkflowRunStatus,
  WorkflowStatus
} from "@prisma/client";
import { getAgentAdapter } from "@/lib/adapters";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";

type SmokeProvider = "openai" | "anthropic";

type CliOptions = {
  providers: SmokeProvider[];
  keepData: boolean;
  prompt: string;
};

type SmokeFixture = {
  provider: SmokeProvider;
  user: {
    id: string;
    email: string;
    password: string;
  };
  company: {
    id: string;
    name: string;
    slug: string;
  };
  project: {
    id: string;
    name: string;
  };
  workflow: {
    id: string;
  };
  workflowRun: {
    id: string;
  };
  workflowNode: {
    id: string;
    nodeKey: string;
    title: string;
  };
  taskRun: {
    id: string;
  };
  agent: {
    id: string;
    displayName: string;
  };
  membership: {
    id: string;
  };
};

type SmokeOutcome = {
  provider: SmokeProvider;
  status: "completed" | "failed" | "skipped";
  message: string;
  summary?: Record<string, unknown>;
  keptFixture?: SmokeFixture;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    providers: [],
    keepData: false,
    prompt:
      "Use the available tools to inspect the project, then return a concise execution summary with the current project status, the most relevant task context, and one next-step recommendation."
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];

    if (current === "--keep-data") {
      options.keepData = true;
      continue;
    }

    if (current === "--provider" || current === "-p") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("Missing value for --provider");
      }

      index += 1;
      options.providers = expandProviderArgument(value);
      continue;
    }

    if (current.startsWith("--provider=")) {
      options.providers = expandProviderArgument(current.split("=", 2)[1] ?? "");
      continue;
    }

    if (current === "--prompt") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("Missing value for --prompt");
      }

      options.prompt = value;
      index += 1;
      continue;
    }

    if (current.startsWith("--prompt=")) {
      options.prompt = current.split("=", 2)[1] ?? options.prompt;
      continue;
    }

    if (current === "--help" || current === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  return options;
}

function expandProviderArgument(value: string): SmokeProvider[] {
  const normalized = value.trim().toLowerCase();

  if (!normalized || normalized === "all") {
    return ["openai", "anthropic"];
  }

  if (normalized === "openai" || normalized === "anthropic") {
    return [normalized];
  }

  throw new Error(`Unsupported provider "${value}". Use openai, anthropic, or all.`);
}

function printHelp() {
  console.log(
    [
      "Managed provider smoke runner",
      "",
      "Usage:",
      "  pnpm smoke:providers -- --provider openai",
      "  pnpm smoke:providers -- --provider anthropic --keep-data",
      "  pnpm smoke:providers -- --provider all",
      "",
      "Options:",
      "  --provider, -p   openai | anthropic | all",
      "  --keep-data      Keep the created user/company/project data for dashboard inspection",
      "  --prompt         Override the workflow node prompt used for the smoke task"
    ].join("\n")
  );
}

function selectProviders(options: CliOptions, env: ReturnType<typeof getEnv>) {
  if (options.providers.length > 0) {
    return options.providers;
  }

  const discovered: SmokeProvider[] = [];
  if (env.OPENAI_API_KEY) {
    discovered.push("openai");
  }
  if (env.ANTHROPIC_API_KEY) {
    discovered.push("anthropic");
  }

  return discovered;
}

function getProviderCredential(provider: SmokeProvider, env: ReturnType<typeof getEnv>) {
  if (provider === "openai") {
    return env.OPENAI_API_KEY ?? null;
  }

  return env.ANTHROPIC_API_KEY ?? null;
}

function buildProviderTaskInput(provider: SmokeProvider, prompt: string) {
  return {
    prompt,
    enableBuiltInTools: true,
    maxOutputTokens: 600,
    toolChoice: provider === "openai" ? "required" : "any"
  };
}

function createBaseSlug(prefix: string) {
  const randomSuffix = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now()}-${randomSuffix}`.toLowerCase();
}

function toRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function formatUsd(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "--";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value < 1 ? 4 : 2,
    maximumFractionDigits: value < 1 ? 4 : 2
  }).format(value);
}

async function createFixture(provider: SmokeProvider, prompt: string): Promise<SmokeFixture> {
  const baseSlug = createBaseSlug(`smoke-${provider}`);
  const email = `${baseSlug}@local.test`;
  const password = "SmokePass123!";
  const passwordHash = await bcrypt.hash(password, 10);
  const companySlug = createBaseSlug(`company-${provider}`);

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        passwordHash,
        displayName: `${provider.toUpperCase()} Smoke User`,
        locale: "en-US"
      }
    });

    const company = await tx.company.create({
      data: {
        founderUserId: user.id,
        name: `${provider.toUpperCase()} Smoke Company`,
        slug: companySlug,
        description: `Managed provider smoke run for ${provider}`
      }
    });

    await tx.membership.create({
      data: {
        companyId: company.id,
        memberType: MembershipMemberType.HUMAN,
        userId: user.id,
        role: MembershipRole.ADMIN,
        status: MembershipStatus.ACTIVE
      }
    });

    const agent = await tx.agentInstance.create({
      data: {
        ownerUserId: user.id,
        provider,
        displayName: `${provider === "openai" ? "OpenAI" : "Anthropic"} Smoke Agent`,
        endpointUrl: "",
        authMode: AgentAuthMode.TOKEN,
        status: AgentStatus.ONLINE,
        lastHeartbeatAt: new Date(),
        capabilitiesJson: {
          mode: "managed",
          smokeRun: true
        }
      }
    });

    const membership = await tx.membership.create({
      data: {
        companyId: company.id,
        memberType: MembershipMemberType.AGENT,
        agentInstanceId: agent.id,
        role: MembershipRole.AGENT,
        status: MembershipStatus.ACTIVE
      }
    });

    const project = await tx.project.create({
      data: {
        companyId: company.id,
        name: `${provider === "openai" ? "OpenAI" : "Anthropic"} Smoke Project`,
        summary: `Smoke validation project for ${provider}`,
        status: ProjectStatus.RUNNING,
        progressPercent: 0,
        startedAt: new Date()
      }
    });

    const definition: Prisma.InputJsonValue = {
      nodes: [
        {
          nodeKey: "smoke_start",
          title: "Smoke Start",
          targetMembershipId: membership.id,
          config: buildProviderTaskInput(provider, prompt)
        }
      ],
      edges: []
    };

    const workflow = await tx.workflow.create({
      data: {
        projectId: project.id,
        version: 1,
        status: WorkflowStatus.RUNNING,
        definitionJson: definition
      }
    });

    const workflowNode = await tx.workflowNode.create({
      data: {
        workflowId: workflow.id,
        nodeKey: "smoke_start",
        title: "Smoke Start",
        targetMembershipId: membership.id,
        status: WorkflowNodeStatus.QUEUED,
        configJson: buildProviderTaskInput(provider, prompt)
      }
    });

    const workflowRun = await tx.workflowRun.create({
      data: {
        workflowId: workflow.id,
        projectId: project.id,
        status: WorkflowRunStatus.RUNNING,
        startedAt: new Date()
      }
    });

    const taskRun = await tx.taskRun.create({
      data: {
        projectId: project.id,
        workflowRunId: workflowRun.id,
        workflowNodeId: workflowNode.id,
        assignedAgentInstanceId: agent.id,
        runNo: 1,
        status: TaskRunStatus.QUEUED,
        inputJson: buildProviderTaskInput(provider, prompt)
      }
    });

    return {
      provider,
      user: {
        id: user.id,
        email,
        password
      },
      company: {
        id: company.id,
        name: company.name,
        slug: company.slug
      },
      project: {
        id: project.id,
        name: project.name
      },
      workflow: {
        id: workflow.id
      },
      workflowRun: {
        id: workflowRun.id
      },
      workflowNode: {
        id: workflowNode.id,
        nodeKey: workflowNode.nodeKey,
        title: workflowNode.title
      },
      taskRun: {
        id: taskRun.id
      },
      agent: {
        id: agent.id,
        displayName: agent.displayName
      },
      membership: {
        id: membership.id
      }
    };
  });
}

async function cleanupFixture(fixture: SmokeFixture) {
  const taskRuns = await prisma.taskRun.findMany({
    where: {
      workflowRun: {
        workflowId: fixture.workflow.id
      }
    },
    select: {
      id: true,
      logObjectKey: true
    }
  });

  await prisma.$transaction(async (tx) => {
    await tx.pointLedger.deleteMany({
      where: {
        OR: [
          {
            subjectId: fixture.user.id
          },
          {
            subjectId: fixture.company.id
          },
          {
            refId: {
              in: taskRuns.map((taskRun) => taskRun.id)
            }
          }
        ]
      }
    });

    await tx.leaderboardSnapshot.deleteMany({
      where: {
        subjectId: {
          in: [fixture.user.id, fixture.company.id]
        }
      }
    });

    await tx.user.delete({
      where: {
        id: fixture.user.id
      }
    });
  });

  for (const taskRun of taskRuns) {
    if (!taskRun.logObjectKey) {
      continue;
    }

    const localPath = path.join(process.cwd(), "var", "storage", taskRun.logObjectKey);
    if (existsSync(localPath)) {
      await rm(localPath, { force: true });
    }
  }
}

async function runProviderSmoke(
  provider: SmokeProvider,
  options: CliOptions,
  env: ReturnType<typeof getEnv>
): Promise<SmokeOutcome> {
  const credential = getProviderCredential(provider, env);

  if (!credential) {
    return {
      provider,
      status: "skipped",
      message: `Skipped ${provider}: missing API key (${provider === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY"}).`
    };
  }

  const fixture = await createFixture(provider, options.prompt);
  const adapter = getAgentAdapter(provider);
  const startedAt = Date.now();

  try {
    const [agentInstance, taskRun, workflowNode, project] = await Promise.all([
      prisma.agentInstance.findUniqueOrThrow({
        where: { id: fixture.agent.id }
      }),
      prisma.taskRun.findUniqueOrThrow({
        where: { id: fixture.taskRun.id }
      }),
      prisma.workflowNode.findUniqueOrThrow({
        where: { id: fixture.workflowNode.id }
      }),
      prisma.project.findUniqueOrThrow({
        where: { id: fixture.project.id }
      })
    ]);

    await adapter.dispatchTask({
      agentInstance,
      taskRun,
      workflowNode,
      project,
      secret: credential
    });

    const completedTaskRun = await prisma.taskRun.findUniqueOrThrow({
      where: {
        id: fixture.taskRun.id
      },
      include: {
        workflowNode: true,
        assignedAgentInstance: true
      }
    });

    const output = toRecord(completedTaskRun.outputJson);
    const usage = toRecord(output?.usage);
    const cost = toRecord(output?.cost);
    const toolCalls = Array.isArray(output?.toolCalls) ? output?.toolCalls : [];
    const text = typeof output?.text === "string" ? output.text : "";

    const summary = {
      provider,
      taskRunId: completedTaskRun.id,
      workflowNodeId: completedTaskRun.workflowNodeId,
      agentId: completedTaskRun.assignedAgentInstanceId,
      status: completedTaskRun.status,
      model: typeof output?.model === "string" ? output.model : null,
      durationMs: Date.now() - startedAt,
      promptTokens: typeof usage?.inputTokens === "number" ? usage.inputTokens : 0,
      outputTokens: typeof usage?.outputTokens === "number" ? usage.outputTokens : 0,
      estimatedCostUsd:
        typeof cost?.totalCostUsd === "number" ? cost.totalCostUsd : null,
      toolCallCount: toolCalls.length,
      textPreview: text.slice(0, 400),
      login: options.keepData
        ? {
            email: fixture.user.email,
            password: fixture.user.password,
            companyName: fixture.company.name,
            projectName: fixture.project.name
          }
        : null
    };

    const status =
      completedTaskRun.status === TaskRunStatus.COMPLETED ? "completed" : "failed";
    const message =
      status === "completed"
        ? `Completed ${provider} smoke run with ${toolCalls.length} tool call(s), ${usage?.inputTokens ?? 0} prompt tokens, ${usage?.outputTokens ?? 0} output tokens, and ${formatUsd(cost?.totalCostUsd)} estimated cost.`
        : `Smoke run for ${provider} finished with task status ${completedTaskRun.status}.`;

    if (!options.keepData) {
      await cleanupFixture(fixture);
    }

    return {
      provider,
      status,
      message,
      summary,
      ...(options.keepData ? { keptFixture: fixture } : {})
    };
  } catch (error) {
    const failureMessage =
      error instanceof Error ? error.message : `${provider} smoke run failed`;

    if (!options.keepData) {
      await cleanupFixture(fixture);
    }

    return {
      provider,
      status: "failed",
      message: failureMessage,
      ...(options.keepData ? { keptFixture: fixture } : {})
    };
  }
}

async function main() {
  const env = getEnv();
  const options = parseArgs(process.argv.slice(2));
  const providers = selectProviders(options, env);

  if (providers.length === 0) {
    console.log(
      "No managed provider API keys were found. Set OPENAI_API_KEY and/or ANTHROPIC_API_KEY, then rerun this command."
    );
    return;
  }

  console.log(`Running managed provider smoke for: ${providers.join(", ")}`);
  const results: SmokeOutcome[] = [];

  for (const provider of providers) {
    console.log(`\n--- ${provider} ---`);
    const result = await runProviderSmoke(provider, options, env);
    results.push(result);
    console.log(result.message);

    if (result.summary) {
      console.log(JSON.stringify(result.summary, null, 2));
    }

    if (result.keptFixture) {
      console.log(
        [
          "Kept data for dashboard inspection:",
          `  Email: ${result.keptFixture.user.email}`,
          `  Password: ${result.keptFixture.user.password}`,
          `  Company: ${result.keptFixture.company.name}`,
          `  Project: ${result.keptFixture.project.name}`
        ].join("\n")
      );
    }
  }

  const failed = results.filter((result) => result.status === "failed");
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

void main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
