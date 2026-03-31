import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import { expect, test, type APIResponse, type Browser, type BrowserContext } from "@playwright/test";

test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

type RegisterResponse = {
  data: {
    user: {
      email: string;
      displayName: string;
    };
  };
};

type CompanyCreateResponse = {
  data: {
    company: {
      id: string;
      name: string;
    };
  };
};

type ProjectCreateResponse = {
  data: {
    id: string;
    name: string;
  };
};

type WorkflowCreateResponse = {
  data: {
    id: string;
  };
};

type AgentConnectResponse = {
  data: {
    agent: {
      id: string;
    };
    membershipId: string;
    issuedToken: string | null;
  };
};

type InvitationCreateResponse = {
  data: {
    token: string;
  };
};

type ProjectEventsResponse = {
  data: Array<{
    id: string;
    projectId: string;
    eventType: string;
  }>;
};

type ErrorResponse = {
  error?: {
    message?: string;
  };
};

type WorkflowDefinitionPayload = {
  nodes: Array<{
    nodeKey: string;
    title: string;
    targetMembershipId?: string | null;
    config?: Record<string, unknown>;
  }>;
  edges: Array<{
    fromNodeKey: string;
    toNodeKey: string;
  }>;
};

type SseEvent = {
  id: string | null;
  event: string;
  data: string;
  json: unknown | null;
};

type MockDispatch = {
  authHeader: string;
  payload: {
    taskRunId: string;
    callback: {
      url: string;
      agentInstanceId: string;
    };
  };
};

async function parseSuccessJson<T>(response: APIResponse): Promise<T> {
  const payload = (await response.json()) as T;
  expect(response.ok(), JSON.stringify(payload)).toBeTruthy();
  return payload;
}

async function parseErrorJson(response: APIResponse) {
  return (await response.json()) as ErrorResponse;
}

async function registerUser(
  context: BrowserContext,
  input: { email: string; password: string; displayName: string }
) {
  const response = await context.request.post("/api/auth/register", {
    data: {
      ...input,
      locale: "zh-HK"
    }
  });

  return parseSuccessJson<RegisterResponse>(response);
}

async function createCompany(context: BrowserContext, name: string) {
  const response = await context.request.post("/api/companies", {
    data: {
      name
    }
  });

  return parseSuccessJson<CompanyCreateResponse>(response);
}

async function createProject(
  context: BrowserContext,
  input: { companyId: string; name: string; summary?: string }
) {
  const response = await context.request.post("/api/projects", {
    data: input
  });

  return parseSuccessJson<ProjectCreateResponse>(response);
}

async function createWorkflow(
  context: BrowserContext,
  input: {
    projectId: string;
    nodeTitle?: string;
    definition?: WorkflowDefinitionPayload;
  }
) {
  const definition = input.definition ?? {
    nodes: [
      {
        nodeKey: "start",
        title: input.nodeTitle ?? "Start"
      }
    ],
    edges: []
  };

  const response = await context.request.post("/api/workflows", {
    data: {
      projectId: input.projectId,
      definition
    }
  });

  return parseSuccessJson<WorkflowCreateResponse>(response);
}

async function runWorkflow(context: BrowserContext, workflowId: string) {
  const response = await context.request.post(`/api/workflows/${workflowId}/run`);
  expect(response.ok(), await response.text()).toBeTruthy();
}

async function createInvitation(
  context: BrowserContext,
  input: { companyId: string; inviteeEmail: string }
) {
  const response = await context.request.post(`/api/companies/${input.companyId}/invitations`, {
    data: {
      inviteeEmail: input.inviteeEmail,
      role: "MEMBER",
      expiresInDays: 7
    }
  });

  return response;
}

async function acceptInvitation(context: BrowserContext, token: string) {
  const response = await context.request.post(`/api/invitations/${token}/accept`);
  expect(response.ok(), await response.text()).toBeTruthy();
}

async function createFounderContext(browser: Browser, baseURL: string, suffix: string) {
  const context = await browser.newContext({ baseURL });
  const founderEmail = `founder-api-${suffix}@example.com`;

  await registerUser(context, {
    email: founderEmail,
    password: "testpassword123",
    displayName: `Founder ${suffix}`
  });

  return context;
}

async function connectAgent(
  context: BrowserContext,
  input: { companyId: string; endpointUrl: string; displayName: string }
) {
  const response = await context.request.post("/api/agents/connect", {
    data: {
      companyId: input.companyId,
      provider: "generic",
      displayName: input.displayName,
      endpointUrl: input.endpointUrl,
      authMode: "TOKEN"
    }
  });

  return parseSuccessJson<AgentConnectResponse>(response);
}

async function heartbeatAgent(
  context: BrowserContext,
  input: { agentId: string; token: string; capabilities?: Record<string, unknown> }
) {
  const response = await context.request.post(`/api/agents/${input.agentId}/heartbeat`, {
    headers: {
      Authorization: `Bearer ${input.token}`
    },
    data: {
      capabilities: input.capabilities ?? {}
    }
  });

  expect(response.ok(), await response.text()).toBeTruthy();
}

async function delay(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor<T>(
  callback: () => Promise<T | null> | T | null,
  timeoutMs: number,
  label: string
) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const value = await callback();
    if (value) {
      return value;
    }

    await delay(250);
  }

  throw new Error(`Timed out waiting for ${label}`);
}

function parseSseBlock(block: string) {
  const normalized = block.replace(/\r/g, "");
  const lines = normalized.split("\n").filter(Boolean);

  if (lines.length === 0) {
    return null;
  }

  const commentLines = lines.filter((line) => line.startsWith(":"));
  if (commentLines.length > 0) {
    return {
      type: "comment" as const,
      comment: commentLines.map((line) => line.slice(1).trim()).join("\n")
    };
  }

  const entry = {
    type: "event" as const,
    id: null as string | null,
    event: "message",
    data: "",
    sawRetryField: false
  };

  for (const line of lines) {
    if (line.startsWith("id:")) {
      entry.id = line.slice("id:".length).trim();
    } else if (line.startsWith("event:")) {
      entry.event = line.slice("event:".length).trim();
    } else if (line.startsWith("data:")) {
      entry.data += (entry.data ? "\n" : "") + line.slice("data:".length).trim();
    } else if (line.startsWith("retry:")) {
      entry.sawRetryField = true;
    }
  }

  if (!entry.id && !entry.data && entry.event === "message" && entry.sawRetryField) {
    return null;
  }

  if (!entry.id && !entry.data && entry.event === "message") {
    return null;
  }

  return {
    type: entry.type,
    id: entry.id,
    event: entry.event,
    data: entry.data,
    json: entry.data ? JSON.parse(entry.data) : null
  };
}

async function getCookieHeader(context: BrowserContext) {
  const storageState = await context.storageState();
  return storageState.cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

async function createSseConnection(input: { url: string; headers: HeadersInit }) {
  const controller = new AbortController();
  const response = await fetch(input.url, {
    headers: input.headers,
    signal: controller.signal
  });

  expect(response.ok).toBe(true);
  expect(response.headers.get("content-type") ?? "").toContain("text/event-stream");

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("SSE response body is missing");
  }

  const decoder = new TextDecoder();
  const state = {
    events: [] as SseEvent[],
    comments: [] as string[],
    buffer: ""
  };

  const pump = (async () => {
    while (true) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          return;
        }

        state.buffer += decoder.decode(value, { stream: true });
        let separatorIndex = state.buffer.indexOf("\n\n");

        while (separatorIndex !== -1) {
          const block = state.buffer.slice(0, separatorIndex);
          state.buffer = state.buffer.slice(separatorIndex + 2);

          const parsed = parseSseBlock(block);
          if (parsed?.type === "comment") {
            state.comments.push(parsed.comment);
          } else if (parsed?.type === "event") {
            state.events.push(parsed);
          }

          separatorIndex = state.buffer.indexOf("\n\n");
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }

        throw error;
      }
    }
  })();

  return {
    state,
    async close() {
      controller.abort();
      await pump.catch((error) => {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }

        throw error;
      });
    }
  };
}

async function createMockAgentServer() {
  const dispatchQueue: MockDispatch[] = [];

  const server = createServer((req, res) => {
    if (req.method !== "POST" || req.url !== "/dispatch") {
      res.writeHead(404).end();
      return;
    }

    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        dispatchQueue.push({
          authHeader: req.headers.authorization ?? "",
          payload: JSON.parse(body) as MockDispatch["payload"]
        });

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } catch (error) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            ok: false,
            error: error instanceof Error ? error.message : "Unknown mock agent error"
          })
        );
      }
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address() as AddressInfo;

  return {
    endpointUrl: `http://127.0.0.1:${address.port}/dispatch`,
    async nextDispatch(timeoutMs: number, label: string) {
      return waitFor(() => dispatchQueue.shift() ?? null, timeoutMs, label);
    },
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }
  };
}

async function postAgentCallback(
  dispatch: MockDispatch,
  payload: {
    status: "started" | "progress" | "completed" | "failed";
    progressPercent?: number;
    output?: unknown;
    error?: string;
  }
) {
  const response = await fetch(dispatch.payload.callback.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: dispatch.authHeader,
      "x-agent-instance-id": dispatch.payload.callback.agentInstanceId
    },
    body: JSON.stringify({
      taskRunId: dispatch.payload.taskRunId,
      ...payload
    })
  });

  expect(response.ok, await response.text()).toBe(true);
}

test.describe("API regression coverage", () => {
  test("project events recovery endpoint returns JSON snapshots for catch-up requests", async ({
    browser,
    baseURL
  }) => {
    const resolvedBaseURL = baseURL ?? "http://127.0.0.1:3001";
    const suffix = `${Date.now()}-events`;
    const founderContext = await createFounderContext(browser, resolvedBaseURL, suffix);

    try {
      const company = await createCompany(founderContext, `Events Company ${suffix}`);
      const project = await createProject(founderContext, {
        companyId: company.data.company.id,
        name: `Events Project ${suffix}`
      });
      const workflow = await createWorkflow(founderContext, {
        projectId: project.data.id,
        nodeTitle: "Queued Event Node"
      });

      await runWorkflow(founderContext, workflow.data.id);

      const response = await founderContext.request.get(
        `/api/projects/${project.data.id}/events?after=0`,
        {
          headers: {
            Accept: "application/json"
          }
        }
      );

      expect(response.ok(), await response.text()).toBeTruthy();
      expect(response.headers()["content-type"]).toContain("application/json");

      const payload = (await response.json()) as ProjectEventsResponse;
      expect(Array.isArray(payload.data)).toBe(true);
      expect(payload.data.some((event) => event.eventType === "task.queued")).toBe(true);
    } finally {
      await founderContext.close();
    }
  });

  test("live SSE stream does not emit duplicate event ids when replay overlaps with live updates", async ({
    browser,
    baseURL
  }) => {
    const resolvedBaseURL = baseURL ?? "http://127.0.0.1:3001";
    const suffix = `${Date.now()}-sse-live`;
    const founderContext = await createFounderContext(browser, resolvedBaseURL, suffix);
    const mockAgent = await createMockAgentServer();

    try {
      const company = await createCompany(founderContext, `SSE Live Company ${suffix}`);
      const project = await createProject(founderContext, {
        companyId: company.data.company.id,
        name: `SSE Live Project ${suffix}`
      });
      const agent = await connectAgent(founderContext, {
        companyId: company.data.company.id,
        endpointUrl: mockAgent.endpointUrl,
        displayName: `SSE Live Agent ${suffix}`
      });
      const workflow = await createWorkflow(founderContext, {
        projectId: project.data.id,
        definition: {
          nodes: [
            {
              nodeKey: "start",
              title: "SSE Guard",
              targetMembershipId: agent.data.membershipId
            }
          ],
          edges: []
        }
      });

      const cookieHeader = await getCookieHeader(founderContext);
      const sse = await createSseConnection({
        url: `${resolvedBaseURL}/api/projects/${project.data.id}/events`,
        headers: {
          Accept: "text/event-stream",
          Cookie: cookieHeader
        }
      });

      try {
        await delay(250);
        await heartbeatAgent(founderContext, {
          agentId: agent.data.agent.id,
          token: agent.data.issuedToken ?? "",
          capabilities: {
            sseGuard: true
          }
        });
        await runWorkflow(founderContext, workflow.data.id);

        const dispatch = await mockAgent.nextDispatch(10_000, "workflow dispatch");
        await postAgentCallback(dispatch, {
          status: "started",
          progressPercent: 5
        });
        await postAgentCallback(dispatch, {
          status: "progress",
          progressPercent: 95
        });
        await postAgentCallback(dispatch, {
          status: "completed",
          output: {
            ok: true
          }
        });

        await waitFor(
          () =>
            sse.state.events.some((event) => event.event === "workflow.completed")
              ? true
              : null,
          10_000,
          "workflow completion event"
        );

        const eventIds = sse.state.events
          .map((event) => event.id)
          .filter((eventId): eventId is string => Boolean(eventId));
        expect(new Set(eventIds).size).toBe(eventIds.length);
        expect(sse.state.events.map((event) => event.event)).toEqual([
          "agent.online",
          "task.queued",
          "task.started",
          "task.progress",
          "task.completed",
          "workflow.completed"
        ]);
      } finally {
        await sse.close();
      }
    } finally {
      await mockAgent.close();
      await founderContext.close();
    }
  });

  test("SSE reconnection replays missed events once after Last-Event-ID", async ({
    browser,
    baseURL
  }) => {
    const resolvedBaseURL = baseURL ?? "http://127.0.0.1:3001";
    const suffix = `${Date.now()}-sse-recovery`;
    const founderContext = await createFounderContext(browser, resolvedBaseURL, suffix);
    const mockAgent = await createMockAgentServer();

    try {
      const company = await createCompany(founderContext, `SSE Recovery Company ${suffix}`);
      const project = await createProject(founderContext, {
        companyId: company.data.company.id,
        name: `SSE Recovery Project ${suffix}`
      });
      const agent = await connectAgent(founderContext, {
        companyId: company.data.company.id,
        endpointUrl: mockAgent.endpointUrl,
        displayName: `SSE Recovery Agent ${suffix}`
      });
      const workflow = await createWorkflow(founderContext, {
        projectId: project.data.id,
        definition: {
          nodes: [
            {
              nodeKey: "step-one",
              title: "Step One",
              targetMembershipId: agent.data.membershipId
            },
            {
              nodeKey: "step-two",
              title: "Step Two",
              targetMembershipId: agent.data.membershipId
            }
          ],
          edges: [
            {
              fromNodeKey: "step-one",
              toNodeKey: "step-two"
            }
          ]
        }
      });

      const cookieHeader = await getCookieHeader(founderContext);
      const sseUrl = `${resolvedBaseURL}/api/projects/${project.data.id}/events`;
      const liveConnection = await createSseConnection({
        url: sseUrl,
        headers: {
          Accept: "text/event-stream",
          Cookie: cookieHeader
        }
      });

      let recoveredConnection:
        | Awaited<ReturnType<typeof createSseConnection>>
        | null = null;

      try {
        await delay(250);
        await heartbeatAgent(founderContext, {
          agentId: agent.data.agent.id,
          token: agent.data.issuedToken ?? "",
          capabilities: {
            replayGuard: true
          }
        });
        await runWorkflow(founderContext, workflow.data.id);

        const firstDispatch = await mockAgent.nextDispatch(10_000, "first workflow dispatch");
        await postAgentCallback(firstDispatch, {
          status: "started",
          progressPercent: 15
        });

        const lastSeenEvent = await waitFor(
          () => liveConnection.state.events.find((event) => event.event === "task.started") ?? null,
          10_000,
          "first task started event"
        );
        expect(lastSeenEvent.id).toBeTruthy();

        await liveConnection.close();

        await postAgentCallback(firstDispatch, {
          status: "completed",
          output: {
            step: 1
          }
        });

        const secondDispatch = await mockAgent.nextDispatch(10_000, "second workflow dispatch");
        await postAgentCallback(secondDispatch, {
          status: "started",
          progressPercent: 30
        });
        await postAgentCallback(secondDispatch, {
          status: "completed",
          output: {
            step: 2
          }
        });

        recoveredConnection = await createSseConnection({
          url: sseUrl,
          headers: {
            Accept: "text/event-stream",
            Cookie: cookieHeader,
            "Last-Event-ID": lastSeenEvent.id ?? ""
          }
        });

        await waitFor(
          () =>
            recoveredConnection?.state.events.some((event) => event.event === "workflow.completed")
              ? true
              : null,
          10_000,
          "workflow replay completion"
        );

        const replayEventIds = recoveredConnection.state.events
          .map((event) => event.id)
          .filter((eventId): eventId is string => Boolean(eventId));
        expect(new Set(replayEventIds).size).toBe(replayEventIds.length);
        expect(recoveredConnection.state.events.map((event) => event.event)).toEqual([
          "task.completed",
          "task.queued",
          "task.started",
          "task.completed",
          "workflow.completed"
        ]);
        expect(
          replayEventIds.every((eventId) => BigInt(eventId) > BigInt(lastSeenEvent.id ?? "0"))
        ).toBe(true);
      } finally {
        if (recoveredConnection) {
          await recoveredConnection.close();
        }
      }
    } finally {
      await mockAgent.close();
      await founderContext.close();
    }
  });

  test("duplicate pending invitations are rejected with a conflict", async ({
    browser,
    baseURL
  }) => {
    const resolvedBaseURL = baseURL ?? "http://127.0.0.1:3001";
    const suffix = `${Date.now()}-pending`;
    const founderContext = await createFounderContext(browser, resolvedBaseURL, suffix);
    const inviteeEmail = `pending-invitee-${suffix}@example.com`;

    try {
      const company = await createCompany(founderContext, `Invite Company ${suffix}`);

      const firstResponse = await createInvitation(founderContext, {
        companyId: company.data.company.id,
        inviteeEmail
      });
      await parseSuccessJson<InvitationCreateResponse>(firstResponse);

      const duplicateResponse = await createInvitation(founderContext, {
        companyId: company.data.company.id,
        inviteeEmail
      });
      const payload = await parseErrorJson(duplicateResponse);

      expect(duplicateResponse.status()).toBe(409);
      expect(payload.error?.message).toBe("A pending invitation already exists for this email");
    } finally {
      await founderContext.close();
    }
  });

  test("active members cannot be invited again", async ({ browser, baseURL }) => {
    const resolvedBaseURL = baseURL ?? "http://127.0.0.1:3001";
    const suffix = `${Date.now()}-member`;
    const founderContext = await createFounderContext(browser, resolvedBaseURL, suffix);
    const inviteeContext = await browser.newContext({ baseURL: resolvedBaseURL });
    const inviteeEmail = `active-member-${suffix}@example.com`;

    try {
      const company = await createCompany(founderContext, `Member Company ${suffix}`);
      const invitationResponse = await createInvitation(founderContext, {
        companyId: company.data.company.id,
        inviteeEmail
      });
      const invitation = await parseSuccessJson<InvitationCreateResponse>(invitationResponse);

      await registerUser(inviteeContext, {
        email: inviteeEmail,
        password: "testpassword123",
        displayName: `Invitee ${suffix}`
      });
      await acceptInvitation(inviteeContext, invitation.data.token);

      const duplicateResponse = await createInvitation(founderContext, {
        companyId: company.data.company.id,
        inviteeEmail
      });
      const payload = await parseErrorJson(duplicateResponse);

      expect(duplicateResponse.status()).toBe(409);
      expect(payload.error?.message).toBe("This user is already an active member of the company");
    } finally {
      await founderContext.close();
      await inviteeContext.close();
    }
  });
});
