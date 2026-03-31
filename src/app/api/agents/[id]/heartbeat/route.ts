import { AgentStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { parseJson, toErrorResponse, notFound } from "@/lib/http";
import { verifyAgentRequest } from "@/lib/agent-auth";
import { emitAgentStatusToProjects } from "@/lib/workflow/engine";
import { serializeAgent } from "@/lib/serializers";

export const runtime = "nodejs";

const heartbeatSchema = z.object({
  capabilities: z.record(z.any()).optional()
});

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const agent = await prisma.agentInstance.findUnique({
      where: { id: params.id }
    });

    if (!agent) {
      throw notFound("Agent not found");
    }

    verifyAgentRequest(agent, request);
    const input = await parseJson(request, heartbeatSchema);

    const updatedAgent = await prisma.agentInstance.update({
      where: { id: agent.id },
      data: {
        status: AgentStatus.ONLINE,
        lastHeartbeatAt: new Date(),
        ...(input.capabilities ? { capabilitiesJson: input.capabilities } : {})
      }
    });

    if (agent.status !== AgentStatus.ONLINE) {
      await emitAgentStatusToProjects(agent.id, AgentStatus.ONLINE);
    }

    return Response.json({
      data: serializeAgent(updatedAgent)
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
