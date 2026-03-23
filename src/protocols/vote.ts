import type { ModelConfig, ModelResponse, Vote } from "../types.js";
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

function buildPeerReviewPrompt(
  question: string,
  responses: ModelResponse[],
  voterLabel: string,
  anonymize: boolean
): string {
  const responseList = responses
    .filter((r) => r.label !== voterLabel)
    .map((r) => {
      const name = anonymize ? r.label : `${r.provider}/${r.model}`;
      return `### ${name}\n${r.content}`;
    })
    .join("\n\n");

  const labels = responses
    .filter((r) => r.label !== voterLabel)
    .map((r) => (anonymize ? r.label : `${r.provider}/${r.model}`));

  return `You are a peer reviewer. The following question was posed to multiple experts:

**Question:** ${question}

Here are their responses:

${responseList}

Rank ALL of the above responses from best to worst. Consider accuracy, completeness, clarity, and reasoning quality.

Respond with ONLY valid JSON (no markdown fences):
{ "rankings": [${labels.map((l) => `"${l}"`).join(", ")}], "reasoning": "..." }

The "rankings" array must list all respondent names from best to worst. Reorder them according to your judgment.`;
}

export async function runVote(
  question: string,
  models: ModelConfig[],
  anonymize: boolean
): Promise<{ responses: ModelResponse[]; votes: Vote[] }> {
  // Step 1: Query all models in parallel
  const responses = await Promise.all(
    models.map((m) => queryModel(m, question))
  );

  // Step 2: Each model ranks all OTHER responses
  const votePromises = models.map((voterConfig, i) => {
    const voterLabel =
      voterConfig.label ?? `${voterConfig.provider}/${voterConfig.model}`;
    const prompt = buildPeerReviewPrompt(
      question,
      responses,
      voterLabel,
      anonymize
    );
    return queryModel(voterConfig, prompt).then(
      (voteResponse): Vote => {
        try {
          const cleaned = voteResponse.content
            .replace(/```json\s*/g, "")
            .replace(/```\s*/g, "")
            .trim();
          const parsed = JSON.parse(cleaned) as {
            rankings: string[];
            reasoning: string;
          };
          return {
            voter: voterLabel,
            rankings: parsed.rankings,
            reasoning: parsed.reasoning,
          };
        } catch {
          return {
            voter: voterLabel,
            rankings: [],
            reasoning: `Failed to parse vote: ${voteResponse.content.slice(0, 200)}`,
          };
        }
      }
    );
  });

  const votes = await Promise.all(votePromises);

  return { responses, votes };
}
