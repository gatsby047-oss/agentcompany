import { prisma } from "@/lib/db";
import { getRedis } from "@/lib/redis";

export interface SystemMetrics {
  timestamp: string;
  database: {
    connected: boolean;
    connectionCount?: number;
    responseTime?: number;
  };
  redis: {
    connected: boolean;
    responseTime?: number;
  };
  process: {
    uptime: number;
    memoryUsage: NodeJS.MemoryUsage;
  };
}

export async function collectSystemMetrics(): Promise<SystemMetrics> {
  const timestamp = new Date().toISOString();

  let dbConnected = false;
  let dbConnectionCount: number | undefined;
  let dbResponseTime: number | undefined;

  try {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    dbResponseTime = Date.now() - start;
    dbConnected = true;

    const result = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT count(*) as count FROM pg_stat_activity WHERE datname = current_database()
    `;
    dbConnectionCount = Number(result[0]?.count ?? 0);
  } catch {
    dbConnected = false;
  }

  let redisConnected = false;
  let redisResponseTime: number | undefined;

  try {
    const redis = getRedis();
    const start = Date.now();
    await redis.ping();
    redisResponseTime = Date.now() - start;
    redisConnected = true;
  } catch {
    redisConnected = false;
  }

  return {
    timestamp,
    database: {
      connected: dbConnected,
      connectionCount: dbConnectionCount,
      responseTime: dbResponseTime
    },
    redis: {
      connected: redisConnected,
      responseTime: redisResponseTime
    },
    process: {
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage()
    }
  };
}

export function getBasicMetrics() {
  return {
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
    cpuUsage: process.cpuUsage()
  };
}
