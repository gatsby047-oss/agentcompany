import { AgentStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { handleTaskCallback } from "@/lib/workflow/engine";
import { parseJson, toErrorResponse, badRequest, notFound } from "@/lib/http";
import { verifyAgentRequest } from "@/lib/agent-auth";

export const runtime = "nodejs";

const callbackSchema = z.object({
  agentInstanceId: z.string().optional(),
  taskRunId: z.string().min(1),
  status: z.enum(["started", "progress", "completed", "failed"]),
  progressPercent: z.coerce.number().min(0).max(100).optional(),
  output: z.any().optional(),
  artifacts: z.any().optional(),
  logs: z.any().optional(),
  error: z.string().optional()
});

export async function POST(
  request: Request,
  { params }: { params: { provider: string } }
) {
  try {
    const input = await parseJson(request, callbackSchema);
    const agentInstanceId = request.headers.get("x-agent-instance-id") ?? input.agentInstanceId;

    if (!agentInstanceId) {
      throw badRequest("Agent instance id is required");
    }

    const agent = await prisma.agentInstance.findUnique({
      where: { id: agentInstanceId }
    });

    if (!agent) {
      throw notFound("Agent not found");
    }

    if (agent.provider !== params.provider) {
      throw badRequest("Provider does not match agent");
    }

    verifyAgentRequest(agent, request);

    await prisma.agentInstance.update({
      where: { id: agent.id },
      data: {
        status: AgentStatus.ONLINE,
        lastHeartbeatAt: new Date()
      }
    });

    await handleTaskCallback({
      taskRunId: input.taskRunId,
      agentInstanceId: agent.id,
      provider: params.provider,
      status: input.status,
      progressPercent: input.progressPercent,
      output: input.output,
      artifacts: input.artifacts,
      logs: input.logs,
      error: input.error
    });

    return Response.json({
      data: {
        ok: true
      }
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
