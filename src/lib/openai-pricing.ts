import { getEnv } from "@/lib/env";

export type OpenAiUsageSummary = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

type OpenAiPricingConfig = {
  inputUsdPer1M: number;
  cachedInputUsdPer1M?: number;
  outputUsdPer1M: number;
};

export type OpenAiCostSummary = OpenAiUsageSummary & {
  model: string;
  currency: "USD";
  pricingSource: "env" | "fallback" | "unavailable";
  inputCostUsd: number | null;
  outputCostUsd: number | null;
  totalCostUsd: number | null;
};

const fallbackPricingTable: Record<string, OpenAiPricingConfig> = {
  "gpt-5": {
    inputUsdPer1M: 1.25,
    cachedInputUsdPer1M: 0.125,
    outputUsdPer1M: 10
  },
  "gpt-5-mini": {
    inputUsdPer1M: 0.25,
    cachedInputUsdPer1M: 0.025,
    outputUsdPer1M: 2
  },
  "gpt-5.4": {
    inputUsdPer1M: 2.5,
    cachedInputUsdPer1M: 0.5,
    outputUsdPer1M: 12.5
  },
  "gpt-5.4-mini": {
    inputUsdPer1M: 0.4,
    cachedInputUsdPer1M: 0.1,
    outputUsdPer1M: 2
  }
};

function toNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isPricingRecord(value: unknown): value is Record<string, OpenAiPricingConfig> {
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
      (pricing.cachedInputUsdPer1M === undefined ||
        typeof pricing.cachedInputUsdPer1M === "number")
  );
}

function getPricingTable() {
  const env = getEnv();
  if (!env.OPENAI_MODEL_PRICING_JSON) {
    return {
      pricingSource: "fallback" as const,
      pricingTable: fallbackPricingTable
    };
  }

  try {
    const parsed = JSON.parse(env.OPENAI_MODEL_PRICING_JSON);
    if (isPricingRecord(parsed)) {
      return {
        pricingSource: "env" as const,
        pricingTable: parsed
      };
    }
  } catch {
    // Fall back to the baked-in table when the env override is invalid.
  }

  return {
    pricingSource: "fallback" as const,
    pricingTable: fallbackPricingTable
  };
}

export function extractOpenAiUsageSummary(payload: unknown): OpenAiUsageSummary {
  const usage =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {};

  const inputTokens = toNumber(usage.input_tokens);
  const outputTokens = toNumber(usage.output_tokens);
  const totalTokens = toNumber(usage.total_tokens) || inputTokens + outputTokens;
  const inputTokenDetails =
    usage.input_tokens_details &&
    typeof usage.input_tokens_details === "object" &&
    !Array.isArray(usage.input_tokens_details)
      ? (usage.input_tokens_details as Record<string, unknown>)
      : {};

  return {
    inputTokens,
    cachedInputTokens: toNumber(inputTokenDetails.cached_tokens),
    outputTokens,
    totalTokens
  };
}

export function estimateOpenAiCost(model: string, usagePayload: unknown): OpenAiCostSummary {
  const usage = extractOpenAiUsageSummary(usagePayload);
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

  const nonCachedInputTokens = Math.max(usage.inputTokens - usage.cachedInputTokens, 0);
  const inputCostUsd =
    (nonCachedInputTokens / 1_000_000) * pricing.inputUsdPer1M +
    (usage.cachedInputTokens / 1_000_000) *
      (pricing.cachedInputUsdPer1M ?? pricing.inputUsdPer1M);
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

