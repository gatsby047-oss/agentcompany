import { collectSystemMetrics } from "@/lib/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const metrics = await collectSystemMetrics();

    const isHealthy = metrics.database.connected && metrics.redis.connected;

    return Response.json({
      status: isHealthy ? "healthy" : "degraded",
      timestamp: metrics.timestamp,
      services: {
        database: {
          status: metrics.database.connected ? "connected" : "disconnected",
          connectionCount: metrics.database.connectionCount
        },
        redis: {
          status: metrics.redis.connected ? "connected" : "disconnected",
          responseTime: metrics.redis.responseTime
        }
      },
      process: {
        uptime: metrics.process.uptime,
        memoryUsage: {
          heapUsed: metrics.process.memoryUsage.heapUsed,
          heapTotal: metrics.process.memoryUsage.heapTotal,
          rss: metrics.process.memoryUsage.rss,
          external: metrics.process.memoryUsage.external
        }
      }
    }, {
      status: isHealthy ? 200 : 503
    });
  } catch (error) {
    return Response.json({
      status: "unhealthy",
      error: error instanceof Error ? error.message : "Unknown error"
    }, { status: 503 });
  }
}
