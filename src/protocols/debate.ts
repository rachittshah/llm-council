import type {
  CouncilConfig,
  DebateRound,
  ModelConfig,
  ModelResponse,
} from "../types.js";
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

function wordSet(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 0)
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const word of a) {
    if (b.has(word)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 1 : intersection / union;
}

function computeKS(
  prevResponses: ModelResponse[],
  currResponses: ModelResponse[]
): number {
  if (prevResponses.length === 0 || currResponses.length === 0) return 1;

  let totalSimilarity = 0;
  let count = 0;

  for (const curr of currResponses) {
    const prev = prevResponses.find((p) => p.label === curr.label);
    if (prev) {
      totalSimilarity += jaccardSimilarity(
        wordSet(prev.content),
        wordSet(curr.content)
      );
      count++;
    }
  }

  const avgSimilarity = count > 0 ? totalSimilarity / count : 0;
  return 1 - avgSimilarity;
}

function buildDebatePrompt(
  question: string,
  previousResponses: ModelResponse[],
  round: number,
  anonymize: boolean
): string {
  const responseList = previousResponses
    .map((r) => {
      const name = anonymize ? r.label : `${r.provider}/${r.model}`;
      return `### ${name}\n${r.content}`;
    })
    .join("\n\n");

  return `This is round ${round} of a structured debate.

**Question:** ${question}

Here are the responses from the previous round:

${responseList}

Consider the arguments made by others. Where you agree, acknowledge it. Where you disagree, explain why with evidence. Refine and improve your answer based on this discussion.

Provide your updated response:`;
}

export async function runDebate(
  question: string,
  config: CouncilConfig
): Promise<{ rounds: DebateRound[]; responses: ModelResponse[] }> {
  const maxRounds = config.maxRounds ?? 1;
  const anonymize = config.anonymize ?? false;
  const adaptiveStop = config.adaptiveStop ?? false;
  const ksEpsilon = config.ksEpsilon ?? 0.05;
  const ksPatience = config.ksPatience ?? 2;

  const rounds: DebateRound[] = [];
  let patienceCounter = 0;

  // Round 1: independent answers
  const round1Responses = await Promise.all(
    config.models.map((m) => queryModel(m, question))
  );

  rounds.push({ round: 1, responses: round1Responses });

  // Subsequent rounds
  for (let r = 2; r <= maxRounds + 1; r++) {
    const prevResponses = rounds[rounds.length - 1].responses;

    const roundResponses = await Promise.all(
      config.models.map((m) => {
        const prompt = buildDebatePrompt(
          question,
          prevResponses,
          r,
          anonymize
        );
        return queryModel(m, prompt);
      })
    );

    const ksStatistic = computeKS(prevResponses, roundResponses);
    const converged = ksStatistic < ksEpsilon;

    rounds.push({
      round: r,
      responses: roundResponses,
      ksStatistic,
      converged,
    });

    if (adaptiveStop) {
      if (converged) {
        patienceCounter++;
        if (patienceCounter >= ksPatience) break;
      } else {
        patienceCounter = 0;
      }
    }
  }

  const finalResponses = rounds[rounds.length - 1].responses;
  return { rounds, responses: finalResponses };
}
