import { AgentInstance, User } from "@prisma/client";

export function serializeUser(user: User) {
  const { passwordHash, ...safeUser } = user;
  return safeUser;
}

export function serializeAgent(agent: AgentInstance) {
  const { secretRef, ...safeAgent } = agent;
  return safeAgent;
}
