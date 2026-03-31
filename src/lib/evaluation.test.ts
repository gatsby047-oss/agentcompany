import { describe, expect, it } from "vitest";
import { buildProjectEvaluationSummary } from "@/lib/evaluation";

describe("buildProjectEvaluationSummary", () => {
  it("aggregates retries, success rate, tokens, and cost across logical tasks", () => {
    const summary = buildProjectEvaluationSummary([
      {
        id: "run-1",
        workflowRunId: "workflow-run-1",
        workflowNodeId: "node-a",
        status: "FAILED",
        runNo: 1,
        queuedAt: new Date("2026-03-31T10:00:00.000Z"),
        startedAt: new Date("2026-03-31T10:00:01.000Z"),
        completedAt: new Date("2026-03-31T10:00:04.000Z"),
        outputJson: {
          provider: "openai",
          usage: {
            inputTokens: 100,
            outputTokens: 20
          },
          cost: {
            totalCostUsd: 0.002
          },
          toolCalls: [{ name: "get_task_execution_context" }]
        },
        assignedAgentInstance: {
          provider: "openai"
        }
      },
      {
        id: "run-2",
        workflowRunId: "workflow-run-1",
        workflowNodeId: "node-a",
        status: "COMPLETED",
        runNo: 2,
        queuedAt: new Date("2026-03-31T10:00:05.000Z"),
        startedAt: new Date("2026-03-31T10:00:06.000Z"),
        completedAt: new Date("2026-03-31T10:00:09.000Z"),
        outputJson: {
          provider: "openai",
          usage: {
            inputTokens: 140,
            outputTokens: 40
          },
          cost: {
            totalCostUsd: 0.004
          },
          toolCalls: [{ name: "get_project_snapshot" }]
        },
        assignedAgentInstance: {
          provider: "openai"
        }
      },
      {
        id: "run-3",
        workflowRunId: "workflow-run-1",
        workflowNodeId: "node-b",
        status: "COMPLETED",
        runNo: 1,
        queuedAt: new Date("2026-03-31T10:01:00.000Z"),
        startedAt: new Date("2026-03-31T10:01:02.000Z"),
        completedAt: new Date("2026-03-31T10:01:06.000Z"),
        outputJson: {
          provider: "openai",
          usage: {
            inputTokens: 60,
            outputTokens: 15
          },
          cost: {
            totalCostUsd: 0.001
          },
          toolCalls: []
        },
        assignedAgentInstance: {
          provider: "openai"
        }
      }
    ]);

    expect(summary.totalRuns).toBe(3);
    expect(summary.logicalTaskCount).toBe(2);
    expect(summary.successRate).toBe(1);
    expect(summary.retryRate).toBe(0.5);
    expect(summary.totalPromptTokens).toBe(300);
    expect(summary.totalOutputTokens).toBe(75);
    expect(summary.totalToolCalls).toBe(2);
    expect(summary.totalEstimatedCostUsd).toBeCloseTo(0.007, 6);
    expect(summary.providers).toHaveLength(1);
    expect(summary.providers[0]?.provider).toBe("openai");
  });
});
