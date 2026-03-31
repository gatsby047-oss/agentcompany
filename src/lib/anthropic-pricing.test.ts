import { describe, expect, it } from "vitest";
import {
  estimateAnthropicCost,
  extractAnthropicUsageSummary
} from "@/lib/anthropic-pricing";

describe("extractAnthropicUsageSummary", () => {
  it("reads token counts from an Anthropic Messages API usage payload", () => {
    expect(
      extractAnthropicUsageSummary({
        input_tokens: 120,
        cache_creation_input_tokens: 30,
        cache_read_input_tokens: 10,
        output_tokens: 45
      })
    ).toEqual({
      inputTokens: 160,
      cachedInputTokens: 10,
      cacheCreationInputTokens: 30,
      outputTokens: 45,
      totalTokens: 205
    });
  });
});

describe("estimateAnthropicCost", () => {
  it("estimates cost for supported fallback models", () => {
    const summary = estimateAnthropicCost("claude-sonnet-4-6", {
      input_tokens: 1_000,
      output_tokens: 500
    });

    expect(summary.pricingSource).toBe("fallback");
    expect(summary.inputCostUsd).toBeGreaterThan(0);
    expect(summary.outputCostUsd).toBeGreaterThan(0);
    expect(summary.totalCostUsd).toBeCloseTo(0.0105, 6);
  });
});
