/**
 * Scoring Parser Utility
 *
 * Parses structured JSON scoring responses from LLM.
 */

import type { VisibilityScoringBreakdown } from "../types";

export interface ScoringParseResult {
  success: boolean;
  breakdown?: VisibilityScoringBreakdown;
  error?: string;
}

/**
 * Attempt to parse JSON directly or from markdown code blocks.
 */
export function parseScoringResponse(response: string): ScoringParseResult {
  if (!response || typeof response !== "string") {
    return { success: false, error: "Empty or invalid response" };
  }

  const trimmed = response.trim();

  // Check if this is a mock response (API key not configured)
  if (trimmed.startsWith("[") && trimmed.includes("MOCK]")) {
    return {
      success: false,
      error: "LLM API key not configured - received mock response",
    };
  }

  const tryParse = (text: string): ScoringParseResult => {
    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== "object") {
        return { success: false, error: "Parsed scoring is not an object" };
      }

      const normalized: VisibilityScoringBreakdown = {
        mentionPresence: clamp(parsed.mentionPresence),
        mentionCount: Number.isFinite(parsed.mentionCount) ? parsed.mentionCount : 0,
        mentionContext: clamp(parsed.mentionContext),
        mentionPosition: clamp(parsed.mentionPosition),
        descriptionDetail: clamp(parsed.descriptionDetail),
        answerRelevance: clamp(parsed.answerRelevance),
        serviceMatch: clamp(parsed.serviceMatch),
        rationale: typeof parsed.rationale === "string" ? parsed.rationale : "",
      };

      return { success: true, breakdown: normalized };
    } catch (err: any) {
      return { success: false, error: err?.message || "Failed to parse scoring JSON" };
    }
  };

  // Strategy 1: direct JSON
  const direct = tryParse(trimmed);
  if (direct.success) return direct;

  // Strategy 2: markdown ```json blocks
  const jsonBlockRegex = /```json\s*([\s\S]*?)\s*```/i;
  const jsonBlock = trimmed.match(jsonBlockRegex);
  if (jsonBlock?.[1]) {
    const parsed = tryParse(jsonBlock[1]);
    if (parsed.success) return parsed;
  }

  // Strategy 3: generic code block ```
  const codeBlockRegex = /```\s*([\s\S]*?)\s*```/;
  const codeBlock = trimmed.match(codeBlockRegex);
  if (codeBlock?.[1]) {
    const parsed = tryParse(codeBlock[1]);
    if (parsed.success) return parsed;
  }

  return { success: false, error: direct.error || "Could not parse scoring response" };
}

function clamp(value: any, min = 0, max = 1): number {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return 0;
  if (num < min) return min;
  if (num > max) return max;
  return num;
}

