/**
 * Question Parser Utility
 * 
 * This module handles parsing of LLM responses to extract structured question data.
 * It supports multiple parsing strategies with fallback mechanisms.
 */

/**
 * Raw question structure as returned by LLM (before validation)
 */
export interface RawQuestion {
  text: string;
  intent: string;
  language: string;
}

/**
 * Result of parsing attempt
 */
export interface ParseResult {
  success: boolean;
  questions: RawQuestion[];
  error?: string;
}

/**
 * Attempts to parse JSON from the LLM response.
 * Tries multiple strategies:
 * 1. Direct JSON parsing
 * 2. Extract from markdown code blocks (```json ... ```)
 * 3. Extract from code blocks without language tag (``` ... ```)
 * 
 * @param response - Raw text response from LLM
 * @returns ParseResult with parsed questions or error
 */
export function parseQuestionResponse(response: string): ParseResult {
  if (!response || typeof response !== "string") {
    return {
      success: false,
      questions: [],
      error: "Empty or invalid response",
    };
  }

  const trimmed = response.trim();

  // Check if this is a mock response (API key not configured)
  if (trimmed.startsWith("[") && trimmed.includes("MOCK]")) {
    return {
      success: false,
      questions: [],
      error: "LLM API key not configured - received mock response",
    };
  }

  // Strategy 1: Try direct JSON parsing
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return {
        success: true,
        questions: parsed,
      };
    }
  } catch {
    // Not valid JSON, continue to next strategy
  }

  // Strategy 2: Extract JSON from markdown code blocks with ```json
  const jsonBlockRegex = /```json\s*([\s\S]*?)\s*```/i;
  const jsonMatch = trimmed.match(jsonBlockRegex);
  if (jsonMatch && jsonMatch[1]) {
    try {
      const parsed = JSON.parse(jsonMatch[1].trim());
      if (Array.isArray(parsed)) {
        return {
          success: true,
          questions: parsed,
        };
      }
    } catch {
      // Invalid JSON in code block, continue
    }
  }

  // Strategy 3: Extract JSON from generic code blocks (``` ... ```)
  const codeBlockRegex = /```\s*([\s\S]*?)\s*```/;
  const codeMatch = trimmed.match(codeBlockRegex);
  if (codeMatch && codeMatch[1]) {
    try {
      const parsed = JSON.parse(codeMatch[1].trim());
      if (Array.isArray(parsed)) {
        return {
          success: true,
          questions: parsed,
        };
      }
    } catch {
      // Invalid JSON in code block, continue
    }
  }

  // Strategy 4: Try to find JSON array in the text (look for [ ... ])
  const arrayRegex = /\[\s*\{[\s\S]*\}\s*\]/;
  const arrayMatch = trimmed.match(arrayRegex);
  if (arrayMatch) {
    try {
      const parsed = JSON.parse(arrayMatch[0]);
      if (Array.isArray(parsed)) {
        return {
          success: true,
          questions: parsed,
        };
      }
    } catch {
      // Couldn't parse as JSON
    }
  }

  return {
    success: false,
    questions: [],
    error: "Could not extract valid JSON array from response",
  };
}

