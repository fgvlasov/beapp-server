/**
 * Question Validator Utility
 * 
 * This module validates parsed questions to ensure they meet quality standards
 * and match the expected structure.
 */

import type { RawQuestion } from "./questionParser";

/**
 * Valid question intent types
 */
export const VALID_INTENTS = [
  "find_service",
  "evaluate_company",
  "compare_options",
  "pricing",
  "reviews",
  "features",
  "alternatives",
] as const;

export type QuestionIntent = (typeof VALID_INTENTS)[number];

/**
 * Validation configuration
 */
export interface ValidationConfig {
  minTextLength?: number; // default: 10
  maxTextLength?: number; // default: 200
  allowedIntents?: readonly string[]; // default: VALID_INTENTS
  allowedLanguages?: readonly string[]; // default: any ISO 639-1 code
}

/**
 * Validation error details
 */
export interface ValidationError {
  field: string;
  value: unknown;
  message: string;
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  questions: RawQuestion[];
  errors: ValidationError[];
}

/**
 * Validates a single question against the schema
 * 
 * @param question - Question to validate
 * @param index - Index in array (for error reporting)
 * @param config - Validation configuration
 * @returns Array of validation errors (empty if valid)
 */
function validateSingleQuestion(
  question: unknown,
  index: number,
  config: ValidationConfig
): ValidationError[] {
  const errors: ValidationError[] = [];
  const minLength = config.minTextLength ?? 10;
  const maxLength = config.maxTextLength ?? 200;
  const allowedIntents = config.allowedIntents ?? VALID_INTENTS;

  // Check if it's an object
  if (typeof question !== "object" || question === null || Array.isArray(question)) {
    errors.push({
      field: `questions[${index}]`,
      value: question,
      message: "Question must be an object",
    });
    return errors;
  }

  const q = question as Record<string, unknown>;

  // Validate 'text' field
  if (typeof q.text !== "string") {
    errors.push({
      field: `questions[${index}].text`,
      value: q.text,
      message: "Question text must be a string",
    });
  } else {
    const textLength = q.text.trim().length;
    if (textLength < minLength) {
      errors.push({
        field: `questions[${index}].text`,
        value: q.text,
        message: `Question text must be at least ${minLength} characters`,
      });
    }
    if (textLength > maxLength) {
      errors.push({
        field: `questions[${index}].text`,
        value: q.text,
        message: `Question text must not exceed ${maxLength} characters`,
      });
    }
    if (textLength === 0) {
      errors.push({
        field: `questions[${index}].text`,
        value: q.text,
        message: "Question text cannot be empty",
      });
    }
  }

  // Validate 'intent' field
  if (typeof q.intent !== "string") {
    errors.push({
      field: `questions[${index}].intent`,
      value: q.intent,
      message: "Question intent must be a string",
    });
  } else if (!allowedIntents.includes(q.intent)) {
    errors.push({
      field: `questions[${index}].intent`,
      value: q.intent,
      message: `Intent must be one of: ${allowedIntents.join(", ")}`,
    });
  }

  // Validate 'language' field
  if (typeof q.language !== "string") {
    errors.push({
      field: `questions[${index}].language`,
      value: q.language,
      message: "Question language must be a string",
    });
  } else {
    // Basic ISO 639-1 validation (2-letter code)
    const langCode = q.language.toLowerCase().trim();
    if (langCode.length !== 2 || !/^[a-z]{2}$/.test(langCode)) {
      errors.push({
        field: `questions[${index}].language`,
        value: q.language,
        message: "Language must be a valid ISO 639-1 code (2 letters)",
      });
    }
  }

  return errors;
}

/**
 * Validates an array of questions
 * 
 * @param questions - Array of raw questions to validate
 * @param config - Validation configuration
 * @returns ValidationResult with valid questions and errors
 */
export function validateQuestions(
  questions: unknown[],
  config: ValidationConfig = {}
): ValidationResult {
  const errors: ValidationError[] = [];

  if (!Array.isArray(questions)) {
    return {
      valid: false,
      questions: [],
      errors: [
        {
          field: "questions",
          value: questions,
          message: "Questions must be an array",
        },
      ],
    };
  }

  const validQuestions: RawQuestion[] = [];

  for (let i = 0; i < questions.length; i++) {
    const questionErrors = validateSingleQuestion(questions[i], i, config);

    if (questionErrors.length === 0) {
      // Question is valid, add to valid list
      const q = questions[i] as RawQuestion;
      validQuestions.push({
        text: q.text.trim(),
        intent: q.intent,
        language: q.language.toLowerCase().trim(),
      });
    } else {
      // Collect errors
      errors.push(...questionErrors);
    }
  }

  return {
    valid: errors.length === 0,
    questions: validQuestions,
    errors,
  };
}

