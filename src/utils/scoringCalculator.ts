/**
 * Scoring Calculator Utility
 *
 * Combines scoring factors into a final visibility score using configurable weights.
 */

import type { ScoringWeights, VisibilityScoringBreakdown } from "../types";

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  mentionPresence: 0.2,
  mentionContext: 0.25,
  mentionPosition: 0.15,
  descriptionDetail: 0.2,
  answerRelevance: 0.1,
  serviceMatch: 0.1,
};

/**
 * Calculate final visibility score from scoring breakdown.
 *
 * @param breakdown - scoring factors
 * @param weights - optional custom weights
 * @returns score in range [0, 1]
 */
export function calculateVisibilityScore(
  breakdown: VisibilityScoringBreakdown,
  weights: ScoringWeights = DEFAULT_SCORING_WEIGHTS
): number {
  const w = normalizeWeights(weights);

  const baseScore =
    breakdown.mentionPresence * w.mentionPresence +
    breakdown.mentionContext * w.mentionContext +
    breakdown.mentionPosition * w.mentionPosition +
    breakdown.descriptionDetail * w.descriptionDetail +
    breakdown.answerRelevance * w.answerRelevance +
    breakdown.serviceMatch * w.serviceMatch;

  // If company not mentioned at all, cap score to avoid overstating visibility
  const finalScore =
    breakdown.mentionPresence > 0 ? baseScore : Math.min(baseScore, 0.2);

  return clamp(finalScore);
}

/**
 * Normalize weights to sum to 1.0 to keep scores bounded.
 */
function normalizeWeights(weights: ScoringWeights): ScoringWeights {
  const sum =
    weights.mentionPresence +
    weights.mentionContext +
    weights.mentionPosition +
    weights.descriptionDetail +
    weights.answerRelevance +
    weights.serviceMatch;

  if (sum === 0) return DEFAULT_SCORING_WEIGHTS;

  return {
    mentionPresence: weights.mentionPresence / sum,
    mentionContext: weights.mentionContext / sum,
    mentionPosition: weights.mentionPosition / sum,
    descriptionDetail: weights.descriptionDetail / sum,
    answerRelevance: weights.answerRelevance / sum,
    serviceMatch: weights.serviceMatch / sum,
  };
}

function clamp(value: number, min = 0, max = 1): number {
  if (!Number.isFinite(value)) return 0;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

