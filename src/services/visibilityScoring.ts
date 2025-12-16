/**
 * Visibility Scoring Service
 *
 * Uses LLM to generate a structured scoring breakdown for an answer,
 * then calculates a final visibility score. Falls back to heuristic if needed.
 */

import { callLlm, hasApiKey } from "../llmClients";
import { parseScoringResponse } from "../utils/scoringParser";
import {
  DEFAULT_SCORING_WEIGHTS,
  calculateVisibilityScore,
} from "../utils/scoringCalculator";
import type {
  CompanyProfile,
  GeneratedQuestion,
  LlmProvider,
  VisibilityScoringBreakdown,
  ScoringWeights,
} from "../types";

export interface VisibilityScoringOptions {
  provider?: LlmProvider;
  weights?: ScoringWeights;
  enableScoring?: boolean;
}

export interface VisibilityScoringResult {
  score: number;
  breakdown?: VisibilityScoringBreakdown;
  rationale: string;
}

/**
 * Build LLM prompt for scoring.
 */
function buildScoringPrompt(params: {
  company: CompanyProfile;
  question: GeneratedQuestion;
  answer: string;
}): string {
  const { company, question, answer } = params;
  return `You are an AI visibility analyst. Evaluate how well a company is represented in an AI assistant's answer.

Company Information:
- Name: ${company.name}
${company.description ? `- Description: ${company.description}` : "- Description: Not provided"}
- Services: ${company.services.join(", ")}

User Question: "${question.text}"
AI Answer: "${answer}"

Evaluate the visibility of "${company.name}" in the answer and return a JSON object with this exact structure:
{
  "mentionPresence": 0.0-1.0,
  "mentionCount": 0,
  "mentionContext": 0.0-1.0,
  "mentionPosition": 0.0-1.0,
  "descriptionDetail": 0.0-1.0,
  "answerRelevance": 0.0-1.0,
  "serviceMatch": 0.0-1.0,
  "rationale": "Brief explanation of the score"
}

Rules:
- JSON only. No extra text.
- All scores must be numbers between 0.0 and 1.0.
- If company is not mentioned, mentionPresence must be 0.0.`;
}

/**
 * Run LLM-based visibility scoring for one answer.
 * Falls back to heuristic if scoring is disabled or parsing fails.
 */
export async function scoreAnswerVisibility(params: {
  provider: LlmProvider;
  company: CompanyProfile;
  question: GeneratedQuestion;
  answer: string;
  options?: VisibilityScoringOptions;
  heuristicScore: number;
  heuristicRationale: string;
}): Promise<VisibilityScoringResult> {
  const { provider, company, question, answer, heuristicScore, heuristicRationale } = params;
  const enableScoring =
    params.options?.enableScoring ??
    (process.env.VISIBILITY_SCORING_ENABLED !== "false");

  // If scoring disabled, return heuristic
  if (!enableScoring) {
    return { score: heuristicScore, rationale: heuristicRationale };
  }

  // Resolve scoring provider with fallback to any available key (prefers OpenAI)
  const scoringProvider = selectScoringProvider(
    params.options?.provider,
    process.env.VISIBILITY_SCORING_PROVIDER as LlmProvider | undefined,
    provider
  );

  if (!scoringProvider) {
    console.warn("Scoring unavailable (no provider with API key), using heuristic fallback");
    return { score: heuristicScore, rationale: heuristicRationale };
  }

  const weights =
    params.options?.weights ||
    (parseWeightsEnv(process.env.VISIBILITY_SCORING_WEIGHTS) ?? DEFAULT_SCORING_WEIGHTS);

  try {
    const prompt = buildScoringPrompt({ company, question, answer });
    const scoringResponse = await callLlm({ provider: scoringProvider, prompt });

    const parsed = parseScoringResponse(scoringResponse);
    if (!parsed.success || !parsed.breakdown) {
      const errorMsg = parsed.error || "Unknown parsing error";
      if (errorMsg.includes("API key not configured")) {
        console.warn(`Scoring unavailable (${provider} API key not configured), using heuristic fallback`);
      } else {
        console.warn("Scoring parse failed, using heuristic:", errorMsg);
      }
      return { score: heuristicScore, rationale: heuristicRationale };
    }

    const score = calculateVisibilityScore(parsed.breakdown, weights);

    return {
      score,
      breakdown: parsed.breakdown,
      rationale: parsed.breakdown.rationale || heuristicRationale,
    };
  } catch (err) {
    console.error("Visibility scoring failed, using heuristic:", err);
    return { score: heuristicScore, rationale: heuristicRationale };
  }
}

/**
 * Parse weights from env JSON string if provided.
 */
function parseWeightsEnv(envValue?: string): ScoringWeights | null {
  if (!envValue) return null;
  try {
    const parsed = JSON.parse(envValue);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as ScoringWeights;
  } catch {
    console.warn("Failed to parse VISIBILITY_SCORING_WEIGHTS, using defaults");
    return null;
  }
}

/**
 * Choose scoring provider:
 * 1) explicit option if key exists
 * 2) env VISIBILITY_SCORING_PROVIDER if key exists
 * 3) first available provider with key (prefers openai -> anthropic -> gemini)
 * 4) if none, return null to force heuristic
 */
function selectScoringProvider(
  optionProvider: LlmProvider | undefined,
  envProvider: LlmProvider | undefined,
  fallbackProvider: LlmProvider
): LlmProvider | null {
  const order: LlmProvider[] = ["openai", "anthropic", "gemini"];

  if (optionProvider && hasApiKey(optionProvider)) return optionProvider;
  if (envProvider && hasApiKey(envProvider)) return envProvider;

  // prefer fallback provider if it has a key
  if (hasApiKey(fallbackProvider)) return fallbackProvider;

  // otherwise pick first available
  for (const p of order) {
    if (hasApiKey(p)) return p;
  }

  return null;
}

