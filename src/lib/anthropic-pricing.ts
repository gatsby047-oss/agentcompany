import { getEnv } from "@/lib/env";

export type AnthropicUsageSummary = {
  inputTokens: number;
  cachedInputTokens: number;
  cacheCreationInputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

type AnthropicPricingConfig = {
  inputUsdPer1M: number;
  cacheReadInputUsdPer1M?: number;
  cacheCreationInputUsdPer1M?: number;
  outputUsdPer1M: number;
};

export type AnthropicCostSummary = AnthropicUsageSummary & {
  model: string;
  currency: "USD";
  pricingSource: "env" | "fallback" | "unavailable";
  inputCostUsd: number | null;
  outputCostUsd: number | null;
  totalCostUsd: number | null;
};

const fallbackPricingTable: Record<string, AnthropicPricingConfig> = {
  "claude-opus-4-6": {
    inputUsdPer1M: 5,
    cacheReadInputUsdPer1M: 0.5,
    cacheCreationInputUsdPer1M: 6.25,
    outputUsdPer1M: 25
  },
  "claude-sonnet-4-6": {
    inputUsdPer1M: 3,
    cacheReadInputUsdPer1M: 0.3,
    cacheCreationInputUsdPer1M: 3.75,
    outputUsdPer1M: 15
  },
  "claude-haiku-4-5": {
    inputUsdPer1M: 1,
    cacheReadInputUsdPer1M: 0.1,
    cacheCreationInputUsdPer1M: 1.25,
    outputUsdPer1M: 5
  },
  "claude-haiku-4-5-20251001": {
    inputUsdPer1M: 1,
    cacheReadInputUsdPer1M: 0.1,
    cacheCreationInputUsdPer1M: 1.25,
    outputUsdPer1M: 5
  }
};

function toNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isPricingRecord(value: unknown): value is Record<string, AnthropicPricingConfig> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every(
    (pricing) =>
      pricing &&
      typeof pricing === "object" &&
      !Array.isArray(pricing) &&
      typeof pricing.inputUsdPer1M === "number" &&
      typeof pricing.outputUsdPer1M === "number" &&
      (pricing.cacheReadInputUsdPer1M === undefined ||
        typeof pricing.cacheReadInputUsdPer1M === "number") &&
      (pricing.cacheCreationInputUsdPer1M === undefined ||
        typeof pricing.cacheCreationInputUsdPer1M === "number")
  );
}

function getPricingTable() {
  const env = getEnv();
  if (!env.ANTHROPIC_MODEL_PRICING_JSON) {
    return {
      pricingSource: "fallback" as const,
      pricingTable: fallbackPricingTable
    };
  }

  try {
    const parsed = JSON.parse(env.ANTHROPIC_MODEL_PRICING_JSON);
    if (isPricingRecord(parsed)) {
      return {
        pricingSource: "env" as const,
        pricingTable: parsed
      };
    }
  } catch {
    // Fall back to baked-in pricing when the env override is invalid.
  }

  return {
    pricingSource: "fallback" as const,
    pricingTable: fallbackPricingTable
  };
}

export function extractAnthropicUsageSummary(payload: unknown): AnthropicUsageSummary {
  const usage =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {};

  const baseInputTokens = toNumber(usage.input_tokens);
  const cacheCreationInputTokens = toNumber(usage.cache_creation_input_tokens);
  const cachedInputTokens = toNumber(usage.cache_read_input_tokens);
  const inputTokens = baseInputTokens + cacheCreationInputTokens + cachedInputTokens;
  const outputTokens = toNumber(usage.output_tokens);

  return {
    inputTokens,
    cachedInputTokens,
    cacheCreationInputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens
  };
}

export function estimateAnthropicCost(model: string, usagePayload: unknown): AnthropicCostSummary {
  const usage = extractAnthropicUsageSummary(usagePayload);
  const { pricingSource, pricingTable } = getPricingTable();
  const pricing = pricingTable[model];

  if (!pricing) {
    return {
      model,
      currency: "USD",
      pricingSource: "unavailable",
      inputCostUsd: null,
      outputCostUsd: null,
      totalCostUsd: null,
      ...usage
    };
  }

  const standardInputTokens = Math.max(
    usage.inputTokens - usage.cachedInputTokens - usage.cacheCreationInputTokens,
    0
  );
  const inputCostUsd =
    (standardInputTokens / 1_000_000) * pricing.inputUsdPer1M +
    (usage.cacheCreationInputTokens / 1_000_000) *
      (pricing.cacheCreationInputUsdPer1M ?? pricing.inputUsdPer1M) +
    (usage.cachedInputTokens / 1_000_000) *
      (pricing.cacheReadInputUsdPer1M ?? pricing.inputUsdPer1M);
  const outputCostUsd = (usage.outputTokens / 1_000_000) * pricing.outputUsdPer1M;

  return {
    model,
    currency: "USD",
    pricingSource,
    inputCostUsd,
    outputCostUsd,
    totalCostUsd: inputCostUsd + outputCostUsd,
    ...usage
  };
}
