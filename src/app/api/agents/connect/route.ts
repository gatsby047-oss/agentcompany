import {
  AgentAuthMode,
  AgentStatus,
  MembershipMemberType,
  MembershipRole,
  MembershipStatus
} from "@prisma/client";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ensureCompanyAccess } from "@/lib/access";
import { getAgentProviderDefinition } from "@/lib/agent-providers";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { badRequest, parseJson, toErrorResponse } from "@/lib/http";
import { encryptSecret, createOpaqueToken } from "@/lib/security";
import { serializeAgent } from "@/lib/serializers";
import { emitAgentStatusToProjects } from "@/lib/workflow/engine";

export const runtime = "nodejs";

const connectAgentSchema = z.object({
  companyId: z.string().min(1),
  provider: z.string().min(1),
  displayName: z.string().min(1),
  endpointUrl: z.string().url().optional(),
  authMode: z.nativeEnum(AgentAuthMode).default(AgentAuthMode.TOKEN),
  authSecret: z.string().min(8).optional(),
  capabilities: z.record(z.any()).optional()
});

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const input = await parseJson(request, connectAgentSchema);
    await ensureCompanyAccess(user.id, input.companyId);
    const provider = getAgentProviderDefinition(input.provider);
    const endpointUrl = input.endpointUrl ?? provider.defaultEndpointUrl ?? "";

    if (provider.requiresEndpointUrl && !endpointUrl) {
      throw badRequest(`Provider "${input.provider}" requires an endpoint URL`);
    }

    if (provider.requiresSecret && !input.authSecret) {
      throw badRequest(`Provider "${input.provider}" requires a secret or API key`);
    }

    const issuedToken =
      !provider.managed && input.authMode === AgentAuthMode.TOKEN && !input.authSecret
        ? createOpaqueToken()
        : null;
    const secretToStore = input.authSecret ?? issuedToken;
    const env = getEnv();
    const capabilities = {
      ...(provider.defaultCapabilities ?? {}),
      ...(input.capabilities ?? {}),
      ...(input.provider === "openai"
        ? {
            model: env.OPENAI_MODEL,
            endpointUrl
          }
        : input.provider === "anthropic"
          ? {
              model: env.ANTHROPIC_MODEL,
              endpointUrl,
              apiVersion: env.ANTHROPIC_API_VERSION
            }
        : {})
    };

    const result = await prisma.$transaction(async (tx) => {
      const agent = await tx.agentInstance.create({
        data: {
          ownerUserId: user.id,
          provider: input.provider,
          displayName: input.displayName,
          endpointUrl,
          authMode: provider.managed ? AgentAuthMode.TOKEN : input.authMode,
          secretRef: secretToStore ? encryptSecret(secretToStore) : null,
          capabilitiesJson: capabilities,
          ...(provider.managed
            ? {
                status: AgentStatus.ONLINE,
                lastHeartbeatAt: new Date()
              }
            : {})
        }
      });

      const membership = await tx.membership.create({
        data: {
          companyId: input.companyId,
          memberType: MembershipMemberType.AGENT,
          agentInstanceId: agent.id,
          role: MembershipRole.AGENT,
          status: MembershipStatus.ACTIVE
        }
      });

      return {
        agent,
        membership
      };
    });

    if (provider.managed) {
      await emitAgentStatusToProjects(result.agent.id, AgentStatus.ONLINE);
    }

    return Response.json({
      data: {
        agent: serializeAgent(result.agent),
        membershipId: result.membership.id,
        companyId: input.companyId,
        issuedToken
      }
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
