import { PrismaClient } from "@prisma/client";

declare global {
  var __agentcompanyPrisma: PrismaClient | undefined;
}

export const prisma =
  global.__agentcompanyPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"]
  });

if (process.env.NODE_ENV !== "production") {
  global.__agentcompanyPrisma = prisma;
}
