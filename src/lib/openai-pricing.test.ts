import { describe, expect, it } from "vitest";
import {
  estimateOpenAiCost,
  extractOpenAiUsageSummary
} from "@/lib/openai-pricing";

describe("extractOpenAiUsageSummary", () => {
  it("reads token counts from a Responses API usage payload", () => {
    expect(
      extractOpenAiUsageSummary({
        input_tokens: 120,
        output_tokens: 45,
        total_tokens: 165,
        input_tokens_details: {
          cached_tokens: 20
        }
      })
    ).toEqual({
      inputTokens: 120,
      cachedInputTokens: 20,
      outputTokens: 45,
      totalTokens: 165
    });
  });
});

describe("estimateOpenAiCost", () => {
  it("estimates cost for supported fallback models", () => {
    const summary = estimateOpenAiCost("gpt-5-mini", {
      input_tokens: 1_000,
      output_tokens: 500,
      total_tokens: 1_500
    });

    expect(summary.pricingSource).toBe("fallback");
    expect(summary.inputCostUsd).toBeGreaterThan(0);
    expect(summary.outputCostUsd).toBeGreaterThan(0);
    expect(summary.totalCostUsd).toBeCloseTo(0.00125, 6);
  });
});
