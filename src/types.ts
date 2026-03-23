// Provider & Model Types

export type ProviderName = "openai" | "gemini" | "anthropic";

export interface ModelConfig {
  provider: ProviderName;
  model: string;
  label?: string; // anonymous label for peer review
  maxTokens?: number;
  temperature?: number;
}

export interface ProviderClient {
  name: ProviderName;
  complete(prompt: string, config: ModelConfig): Promise<CompletionResult>;
  isAvailable(): boolean;
}

export interface CompletionResult {
  content: string;
  model: string;
  provider: ProviderName;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

// Council Types

export type Protocol = "vote" | "debate" | "synthesize" | "critique" | "redteam" | "mav";

export interface CouncilConfig {
  models: ModelConfig[];
  protocol: Protocol;
  chairman?: ModelConfig; // synthesizer model
  maxRounds?: number; // for debate (default: 1, research says dont add rounds)
  anonymize?: boolean; // hide model identities in peer review
  adaptiveStop?: boolean; // KS-statistic based early stopping
  ksEpsilon?: number; // KS threshold (default: 0.05)
  ksPatience?: number; // consecutive rounds below epsilon (default: 2)
}

export interface CouncilRequest {
  question: string;
  context?: string;
  config: CouncilConfig;
}

export interface ModelResponse {
  label: string; // anonymized or real
  provider: ProviderName;
  model: string;
  content: string;
  tokens: { input: number; output: number };
  latencyMs: number;
}

export interface Vote {
  voter: string;
  rankings: string[]; // ordered labels, best first
  reasoning: string;
}

export interface DebateRound {
  round: number;
  responses: ModelResponse[];
  ksStatistic?: number; // for adaptive stopping
  converged?: boolean;
}

export interface CouncilResult {
  protocol: Protocol;
  question: string;
  responses: ModelResponse[];
  votes?: Vote[];
  debateRounds?: DebateRound[];
  synthesis?: string;
  critique?: string;
  consensus?: {
    answer: string;
    confidence: number;
    dissent: string[];
  };
  cost: CostBreakdown;
  metadata: {
    totalLatencyMs: number;
    modelsUsed: string[];
    stoppedEarly?: boolean;
  };
}

// Cost Tracking

export interface CostBreakdown {
  totalUsd: number;
  byModel: Record<string, { inputTokens: number; outputTokens: number; costUsd: number }>;
}

export interface PricingTier {
  inputPer1M: number;
  outputPer1M: number;
  cachedInputPer1M?: number;
}

// Broker / Peer Discovery

export interface Peer {
  id: string;
  pid: number;
  cwd: string;
  gitRoot?: string;
  summary?: string;
  lastSeen: number;
  models?: string[]; // models this peer is configured to use
}

export interface BrokerMessage {
  id: string;
  from: string;
  to: string;
  content: string;
  timestamp: number;
  delivered: boolean;
}

// Default Configs

export const DEFAULT_MODELS: ModelConfig[] = [
  { provider: "openai", model: "gpt-5.4", label: "ModelA" },
  { provider: "gemini", model: "gemini-2.5-pro", label: "ModelB" },
  { provider: "anthropic", model: "claude-sonnet-4-6-20250514", label: "ModelC" },
];

export const DEFAULT_CHAIRMAN: ModelConfig = {
  provider: "anthropic",
  model: "claude-sonnet-4-6-20250514",
  label: "Chairman",
};

export const PRICING: Record<string, PricingTier> = {
  "gpt-5": { inputPer1M: 1.25, outputPer1M: 10.0, cachedInputPer1M: 0.125 },
  "gpt-5.4": { inputPer1M: 2.0, outputPer1M: 10.0 },
  "gpt-5-mini": { inputPer1M: 0.25, outputPer1M: 1.0 },
  "o3": { inputPer1M: 2.0, outputPer1M: 8.0 },
  "o4-mini": { inputPer1M: 1.1, outputPer1M: 4.4 },
  "gpt-4.1": { inputPer1M: 2.0, outputPer1M: 8.0 },
  "gemini-2.5-pro": { inputPer1M: 1.25, outputPer1M: 10.0 },
  "gemini-2.5-flash": { inputPer1M: 0.15, outputPer1M: 0.6 },
  "claude-sonnet-4-6-20250514": { inputPer1M: 3.0, outputPer1M: 15.0 },
  "claude-opus-4-6-20250219": { inputPer1M: 15.0, outputPer1M: 75.0 },
  "claude-haiku-4-5-20251001": { inputPer1M: 0.8, outputPer1M: 4.0 },
};
