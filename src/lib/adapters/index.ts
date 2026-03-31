import { AgentAdapter } from "@/lib/adapters/types";
import { anthropicAdapter } from "@/lib/adapters/anthropic";
import { openAiAdapter } from "@/lib/adapters/openai";
import { openClawAdapter } from "@/lib/adapters/openclaw";

const genericHttpAdapter: AgentAdapter = {
  provider: "generic",
  async dispatchTask(context) {
    return openClawAdapter.dispatchTask(context);
  }
};

export function getAgentAdapter(provider: string): AgentAdapter {
  if (provider === "anthropic") {
    return anthropicAdapter;
  }

  if (provider === "openai") {
    return openAiAdapter;
  }

  if (provider === "openclaw") {
    return openClawAdapter;
  }

  return genericHttpAdapter;
}
