// server/src/types.ts

/**
 * This file defines the core TypeScript types used across the backend.
 * The idea is to make the business model and data flow readable even for
 * non-technical stakeholders, such as investors or potential buyers.
 */

/**
 * We currently support three different LLM providers.
 * In a real product this can be extended to 5–10 providers.
 */
export type LlmProvider = "openai" | "anthropic" | "gemini";

/**
 * High-level description of a company we want to analyze.
 * This is provided by the user or taken from a CRM / internal database.
 */
export interface CompanyProfile {
  /** Public-facing company name */
  name: string;
  /** Optional website – future extension: auto-crawl and summarize */
  website?: string;
  /** Short human-readable description of what the company does */
  description: string;
  /** List of services or products that we want to track visibility for */
  services: string[];
  /**
   * Target locales or markets we care about, e.g. ["en", "fi", "de"].
   * This is important for international go-to-market strategy.
   */
  targetLocales?: string[];
}

/**
 * Single natural-language question that a real user could ask an AI assistant.
 * This is generated automatically by our Question Generator Agent.
 */
export interface GeneratedQuestion {
  /** Local unique ID inside the current analysis run */
  id: string;
  /** The actual text of the question */
  text: string;
  /** Language code, e.g. "en", "fi" */
  language: string;
  /** Simple label describing the user intent, e.g. "find_service" */
  intent: string;
}

/**
 * Result of the question generation phase.
 */
export interface QuestionGenerationResult {
  /** Final list of questions that will be sent to LLM providers */
  questions: GeneratedQuestion[];
}

/**
 * Raw answer we get back from a specific LLM provider for a given question.
 * We keep this for transparency and later deep-dive analysis.
 */
export interface LlmRawAnswer {
  /** Link to the question we asked */
  questionId: string;
  /** Copy of the question text, stored for convenience */
  question: string;
  /** Full text answer returned by the LLM provider */
  answer: string;
}

/**
 * Normalized visibility score for a specific service and provider.
 * This is the "quantitative" output shown on the dashboard.
 */
export interface VisibilityScore {
  /** Which LLM provider this score belongs to */
  provider: LlmProvider;
  /** Which service or product this score is about */
  service: string;
  /**
   * Numeric visibility score in range [0, 1].
   * Higher means "the company is more visible when users ask about this topic".
   */
  score: number;
  /**
   * Short explanation of why this score was assigned.
   * Useful for auditors, compliance and transparency.
   */
  rationale: string;
}

/**
 * Detailed scoring breakdown returned by LLM-based visibility scoring.
 */
export interface VisibilityScoringBreakdown {
  mentionPresence: number;
  mentionCount: number;
  mentionContext: number;
  mentionPosition: number;
  descriptionDetail: number;
  answerRelevance: number;
  serviceMatch: number;
  rationale: string;
}

/**
 * Optional weighting configuration for final visibility score calculation.
 */
export interface ScoringWeights {
  mentionPresence: number;
  mentionContext: number;
  mentionPosition: number;
  descriptionDetail: number;
  answerRelevance: number;
  serviceMatch: number;
}

/**
 * Full visibility result for a single provider:
 *  - all raw answers
 *  - all normalized scores
 */
export interface ProviderVisibilityResult {
  provider: LlmProvider;
  answers: LlmRawAnswer[];
  scores: VisibilityScore[];
}

/**
 * Aggregated view per service across all providers.
 * This is what we visualize in the main dashboard.
 */
export interface DashboardInsight {
  /** Name of the service or product */
  service: string;
  /** Average score across all LLM providers */
  avgScore: number;
  /** Human-readable explanations and comments */
  comments: string[];
}

/**
 * Concrete suggestions that a marketing / content team can implement
 * to improve visibility in AI models.
 */
export interface Recommendation {
  /** Short title, e.g. "Improve visibility for AI SEO consulting" */
  title: string;
  /** Description in plain business language */
  description: string;
  /** Example prompts that can be used in documentation or guidelines */
  suggestedPrompts: string[];
}

/**
 * Final object returned to the frontend and presented in the dashboard.
 * It combines:
 *  - the original company profile,
 *  - generated questions,
 *  - provider-level visibility results,
 *  - aggregated insights,
 *  - actionable recommendations.
 */
export interface DashboardResult {
  company: CompanyProfile;
  questions: GeneratedQuestion[];
  providerResults: ProviderVisibilityResult[];
  insights: DashboardInsight[];
  recommendations: Recommendation[];
}
