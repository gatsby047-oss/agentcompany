import { AgentInstance, AgentAuthMode } from "@prisma/client";
import { decryptSecret } from "@/lib/security";
import { unauthorized } from "@/lib/http";

function extractBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice("Bearer ".length).trim();
}

export function verifyAgentRequest(agent: AgentInstance, request: Request) {
  if (agent.authMode === AgentAuthMode.NONE) {
    return;
  }

  const bearer = extractBearerToken(request);
  if (!bearer || !agent.secretRef) {
    throw unauthorized("Missing agent token");
  }

  const expected = decryptSecret(agent.secretRef);
  if (bearer !== expected) {
    throw unauthorized("Invalid agent token");
  }
}

export function getRequestBearerToken(request: Request) {
  return extractBearerToken(request);
}
