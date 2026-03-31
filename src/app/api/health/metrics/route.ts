import { collectSystemMetrics } from "@/lib/metrics";
import { getQueue } from "@/lib/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function formatMetric(name: string, value: number, type: "gauge" | "counter" = "gauge", labels?: Record<string, string>) {
  const labelStr = labels ? `{${Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(",")}}` : "";
  return `# TYPE ${name} ${type}\n${name}${labelStr} ${value}\n`;
}

export async function GET() {
  try {
    const metrics: string[] = [];

    // System metrics
    const systemMetrics = await collectSystemMetrics();

    // Process uptime
    metrics.push(formatMetric("agentcompany_process_uptime_seconds", systemMetrics.process.uptime));

    // Memory metrics
    metrics.push(formatMetric("agentcompany_process_memory_heap_bytes", systemMetrics.process.memoryUsage.heapUsed));
    metrics.push(formatMetric("agentcompany_process_memory_heap_total_bytes", systemMetrics.process.memoryUsage.heapTotal));
    metrics.push(formatMetric("agentcompany_process_memory_rss_bytes", systemMetrics.process.memoryUsage.rss));
    metrics.push(formatMetric("agentcompany_process_memory_external_bytes", systemMetrics.process.memoryUsage.external));

    // Database metrics
    metrics.push(formatMetric("agentcompany_database_connected", systemMetrics.database.connected ? 1 : 0));
    metrics.push(formatMetric("agentcompany_database_connections", systemMetrics.database.connectionCount ?? 0));
    if (systemMetrics.database.responseTime !== undefined) {
      metrics.push(
        formatMetric("agentcompany_database_response_time_ms", systemMetrics.database.responseTime)
      );
    }

    // Redis metrics
    metrics.push(formatMetric("agentcompany_redis_connected", systemMetrics.redis.connected ? 1 : 0));
    if (systemMetrics.redis.responseTime !== undefined) {
      metrics.push(formatMetric("agentcompany_redis_response_time_ms", systemMetrics.redis.responseTime));
    }

    // Queue metrics
    try {
      const queue = getQueue();
      const [waiting, active, completed, failed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getCompletedCount(),
        queue.getFailedCount()
      ]);

      metrics.push(formatMetric("agentcompany_queue_waiting", waiting));
      metrics.push(formatMetric("agentcompany_queue_active", active));
      metrics.push(formatMetric("agentcompany_queue_completed", completed, "counter"));
      metrics.push(formatMetric("agentcompany_queue_failed", failed, "counter"));
    } catch {
      // Queue might not be available
    }

    return new Response(metrics.join("\n"), {
      headers: {
        "Content-Type": "text/plain; charset=utf-8"
      }
    });
  } catch (error) {
    return new Response(`# Error collecting metrics: ${error instanceof Error ? error.message : "Unknown error"}`, {
      status: 500,
      headers: {
        "Content-Type": "text/plain"
      }
    });
  }
}
