export type AgentProviderDefinition = {
  provider: string;
  label: string;
  managed: boolean;
  requiresEndpointUrl: boolean;
  requiresSecret: boolean;
  defaultEndpointUrl?: string;
  defaultCapabilities?: Record<string, unknown>;
};

const providerDefinitions: Record<string, AgentProviderDefinition> = {
  generic: {
    provider: "generic",
    label: "Generic HTTP Agent",
    managed: false,
    requiresEndpointUrl: true,
    requiresSecret: false
  },
  openclaw: {
    provider: "openclaw",
    label: "OpenClaw Agent",
    managed: false,
    requiresEndpointUrl: true,
    requiresSecret: false
  },
  openai: {
    provider: "openai",
    label: "OpenAI Managed Agent",
    managed: true,
    requiresEndpointUrl: false,
    requiresSecret: true,
    defaultEndpointUrl: "https://api.openai.com/v1/responses",
    defaultCapabilities: {
      mode: "managed",
      supportsBuiltInTools: true,
      tracksUsage: true,
      tracksEstimatedCost: true
    }
  },
  anthropic: {
    provider: "anthropic",
    label: "Anthropic Managed Agent",
    managed: true,
    requiresEndpointUrl: false,
    requiresSecret: true,
    defaultEndpointUrl: "https://api.anthropic.com/v1/messages",
    defaultCapabilities: {
      mode: "managed",
      supportsBuiltInTools: true,
      tracksUsage: true,
      tracksEstimatedCost: true
    }
  }
};

export function getAgentProviderDefinition(provider: string): AgentProviderDefinition {
  return providerDefinitions[provider] ?? {
    provider,
    label: provider,
    managed: false,
    requiresEndpointUrl: true,
    requiresSecret: false
  };
}

export function isManagedAgentProvider(provider: string) {
  return getAgentProviderDefinition(provider).managed;
}
