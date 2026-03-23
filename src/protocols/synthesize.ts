import type { ModelConfig, ModelResponse } from "../types.js";
import { getProvider } from "../providers/index.js";

async function queryModel(
  config: ModelConfig,
  prompt: string
): Promise<ModelResponse> {
  const provider = getProvider(config.provider);
  const result = await provider.complete(prompt, config);
  return {
    label: config.label ?? `${config.provider}/${config.model}`,
    provider: result.provider,
    model: result.model,
    content: result.content,
    tokens: { input: result.inputTokens, output: result.outputTokens },
    latencyMs: result.latencyMs,
  };
}

function buildSynthesisPrompt(
  question: string,
  responses: ModelResponse[],
  anonymize: boolean
): string {
  const responseList = responses
    .map((r) => {
      const name = anonymize ? r.label : `${r.provider}/${r.model}`;
      return `### ${name}\n${r.content}`;
    })
    .join("\n\n");

  return `You are the chairman synthesizer. Given these expert responses to the question, produce a single authoritative answer. Identify areas of agreement, resolve disagreements with evidence, note any significant dissent.

**Question:** ${question}

**Expert Responses:**

${responseList}

Provide your synthesized answer:`;
}

export async function runSynthesis(
  question: string,
  responses: ModelResponse[],
  chairman: ModelConfig,
  anonymize: boolean
): Promise<string> {
  const prompt = buildSynthesisPrompt(question, responses, anonymize);
  const result = await queryModel(chairman, prompt);
  return result.content;
}
