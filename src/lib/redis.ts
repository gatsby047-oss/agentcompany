import type { ConnectionOptions } from "bullmq";
import IORedis from "ioredis";
import { getEnv } from "@/lib/env";

declare global {
  var __agentcompanyRedis: IORedis | undefined;
}

export function getRedis() {
  if (!global.__agentcompanyRedis) {
    global.__agentcompanyRedis = new IORedis(getEnv().REDIS_URL ?? "redis://127.0.0.1:6379", {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: false
    });
  }

  return global.__agentcompanyRedis;
}

export function getBullConnection(): ConnectionOptions {
  const url = new URL(getEnv().REDIS_URL ?? "redis://127.0.0.1:6379");

  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    db: url.pathname && url.pathname !== "/" ? Number(url.pathname.slice(1)) : undefined,
    tls: url.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: null
  };
}
