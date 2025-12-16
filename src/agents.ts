import { callLlm } from "./llmClients";
import { scoreAnswerVisibility } from "./services/visibilityScoring";
import { fetchMetaDescription } from "./services/siteMetadata";
import { parseQuestionResponse } from "./utils/questionParser";
import { validateQuestions } from "./utils/questionValidator";
import type {
  CompanyProfile,
  DashboardResult,
  DashboardInsight,
  GeneratedQuestion,
  LlmRawAnswer,
  ProviderVisibilityResult,
  QuestionGenerationResult,
  Recommendation,
  VisibilityScore,
  LlmProvider,
} from "./types";

//
// Agent 1: Question Generator
//

/**
 * Configuration for question generation
 */
interface QuestionGenerationOptions {
  /** LLM provider to use for generation (defaults to 'openai' or env var) */
  provider?: LlmProvider;
  /** Minimum number of questions to generate (default: 8) */
  minQuestions?: number;
  /** Maximum number of questions to generate (default: 12) */
  maxQuestions?: number;
  /** Enable fallback to template questions if LLM fails (default: true) */
  enableFallback?: boolean;
}

/**
 * Generates template-based questions as fallback
 * 
 * @param company - Company profile
 * @returns Array of template questions
 */
function generateTemplateQuestions(company: CompanyProfile): GeneratedQuestion[] {
  // Template questions should NOT mention company name
  // They simulate customer search behavior
  return company.services.flatMap((service, idx) => {
    const baseId = `${idx}`;
    return [
      {
        id: `${baseId}-1`,
        text: `Which companies provide ${service} in my region?`,
        language: "en",
        intent: "find_service",
      },
      {
        id: `${baseId}-2`,
        text: `What are the best options for ${service}?`,
        language: "en",
        intent: "compare_options",
      },
      {
        id: `${baseId}-3`,
        text: `How much does ${service} cost?`,
        language: "en",
        intent: "pricing",
      },
    ];
  });
}

/**
 * Builds a structured prompt for LLM question generation
 * 
 * @param company - Company profile
 * @param minQuestions - Minimum number of questions
 * @param maxQuestions - Maximum number of questions
 * @returns Formatted prompt string
 */
function buildQuestionGenerationPrompt(
  company: CompanyProfile,
  minQuestions: number,
  maxQuestions: number
): string {
  const targetLanguage = company.targetLocales?.[0] || "English";
  const languageCode = company.targetLocales?.[0] || "en";

  return `You are a market research assistant.
Generate realistic questions that potential customers would ask AI assistants when searching for services.

Context (for reference only - DO NOT mention company name in questions):
- Services offered: ${company.services.join(", ")}
${company.description ? `- Industry context: ${company.description}` : ""}

Requirements:
- Generate ${minQuestions}-${maxQuestions} diverse questions
- Questions should be from a customer's perspective searching for these services
- Questions should NOT mention any specific company names
- Questions should be natural, as if a real customer is asking an AI assistant
- Include different intents: finding services, comparing options, pricing inquiries, reviews, features
- Language: ${targetLanguage} (use language code "${languageCode}")

Examples of good questions:
- "Which companies provide ${company.services[0]}?"
- "What are the best options for ${company.services[0]}?"
- "How much does ${company.services[0]} cost?"
- "What should I look for when choosing a ${company.services[0]} provider?"

Return your response as a valid JSON array with this exact structure:
[
  {
    "text": "Question text here (without company names)",
    "intent": "find_service" | "compare_options" | "pricing" | "reviews" | "features",
    "language": "${languageCode}"
  }
]

Ensure the JSON is valid and parseable.`;
}

/**
 * This agent takes a company profile and generates realistic questions
 * that potential customers might ask AI assistants about this company
 * and its services.
 *
 * Implementation uses structured JSON response from LLM with fallback
 * to template questions if LLM generation fails.
 *
 * Why it matters for investors:
 *  - It simulates real demand and search behavior inside AI models.
 *  - It can be plugged into different industries (SaaS, eCommerce, local services).
 * 
 * @param company - Company profile to generate questions for
 * @param options - Optional configuration
 * @returns Promise with generated questions
 */
export async function questionGeneratorAgent(
  company: CompanyProfile,
  options: QuestionGenerationOptions = {}
): Promise<QuestionGenerationResult> {
  const {
    provider = (process.env.QUESTION_GENERATION_PROVIDER as LlmProvider) || "openai",
    minQuestions = 8,
    maxQuestions = 12,
    enableFallback = true,
  } = options;

  // Build structured prompt
  const prompt = buildQuestionGenerationPrompt(company, minQuestions, maxQuestions);

  // Check if API key is available
  const { hasApiKey } = await import("./llmClients");
  if (!hasApiKey(provider)) {
    console.warn(`\n[Question Generation] ⚠️  ${provider} API key not configured, using template questions\n`);
    if (enableFallback) {
      return { questions: generateTemplateQuestions(company) };
    }
    throw new Error(`${provider} API key not configured`);
  }

  try {
    // Call LLM with structured prompt
    console.log(`\n[Question Generation] ✅ Calling ${provider} to generate questions...`);
    console.log(`[Question Generation] Prompt preview: ${prompt.substring(0, 200)}...\n`);

    const response = await callLlm({
      provider,
      prompt,
    });

    console.log(`[Question Generation] Raw response length: ${response.length} chars`);
    if (response.length < 100) {
      console.log(`[Question Generation] ⚠️  Response seems too short, full response: ${response}`);
    } else {
      console.log(`[Question Generation] Response preview: ${response.substring(0, 300)}...`);
    }
    console.log();

    // Parse JSON response
    const parseResult = parseQuestionResponse(response);

    console.log(`[Question Generation] Parse result: ${parseResult.success ? "✅ Success" : "❌ Failed"}`);
    if (!parseResult.success) {
      console.log(`[Question Generation] Parse error: ${parseResult.error}`);
    } else {
      console.log(`[Question Generation] Parsed ${parseResult.questions.length} questions`);
    }
    console.log();

    if (parseResult.success && parseResult.questions.length > 0) {
      // Validate parsed questions
      const validationResult = validateQuestions(parseResult.questions);

      if (validationResult.valid && validationResult.questions.length > 0) {
        // Generate unique IDs and convert to GeneratedQuestion format
        const questions: GeneratedQuestion[] = validationResult.questions.map(
          (q, idx) => ({
            id: `q-${idx}-${Date.now()}`,
            text: q.text,
            language: q.language,
            intent: q.intent,
          })
        );

        // Ensure we have at least minQuestions
        if (questions.length < minQuestions && enableFallback) {
          console.warn(
            `LLM generated only ${questions.length} questions, expected ${minQuestions}. Using fallback.`
          );
          return { questions: generateTemplateQuestions(company) };
        }

        // Limit to maxQuestions
        const limitedQuestions = questions.slice(0, maxQuestions);

        return { questions: limitedQuestions };
      } else {
        // Validation failed
        console.warn("Question validation failed:", validationResult.errors);
        if (enableFallback) {
          console.warn("Falling back to template questions");
          return { questions: generateTemplateQuestions(company) };
        }
        throw new Error(
          `Question validation failed: ${validationResult.errors.map((e) => e.message).join(", ")}`
        );
      }
    } else {
      // Parsing failed
      const errorMsg = parseResult.error || "Unknown parsing error";
      if (errorMsg.includes("API key not configured")) {
        console.warn("Question generation unavailable (LLM API key not configured), using template questions");
      } else {
        console.warn("Failed to parse LLM response:", errorMsg);
      }
      if (enableFallback) {
        console.warn("Falling back to template questions");
        return { questions: generateTemplateQuestions(company) };
      }
      throw new Error(`Failed to parse LLM response: ${errorMsg}`);
    }
  } catch (error) {
    // LLM call or processing failed
    console.error("Error in question generation:", error);
    if (enableFallback) {
      console.warn("Falling back to template questions due to error");
      return { questions: generateTemplateQuestions(company) };
    }
    throw error;
  }
}

//
// Agent 2.x: Visibility Agent for a single provider
//

/**
 * This agent is responsible for talking to ONE specific LLM provider
 * (e.g., OpenAI) and evaluating how visible the company is in its answers.
 *
 * From a business point of view:
 *  - Each provider is a "channel" where users ask for recommendations.
 *  - We want to know whether our company is mentioned as a relevant option.
 */
export async function visibilityAgentForProvider(
  provider: LlmProvider,
  company: CompanyProfile,
  questions: GeneratedQuestion[]
): Promise<ProviderVisibilityResult> {
  const answers: LlmRawAnswer[] = [];
  const scores: VisibilityScore[] = [];

  for (const question of questions) {
    const prompt = `
You are an assistant. The user asked: "${question.text}".

Answer naturally.
IMPORTANT:
- Mention real company names that fit the request.
- If the company "${company.name}" is relevant, mention it explicitly in your answer.
`;

    const answer = await callLlm({ provider, prompt });

    // Log answer for debugging
    console.log(`\n[${provider.toUpperCase()}] Question: ${question.text}`);
    console.log(`[${provider.toUpperCase()}] Answer: ${answer}\n`);

    answers.push({
      questionId: question.id,
      question: question.text,
      answer,
    });

    // Heuristic baseline
    const lowerAnswer = answer.toLowerCase();
    const companyMentioned = lowerAnswer.includes(company.name.toLowerCase());
    const serviceMatched = company.services.some((service) =>
      lowerAnswer.includes(service.toLowerCase())
    );

    let heuristicScore = 0;
    if (companyMentioned && serviceMatched) heuristicScore = 0.9;
    else if (companyMentioned) heuristicScore = 0.7;
    else if (serviceMatched) heuristicScore = 0.4;
    else heuristicScore = 0.1;

    const heuristicRationale = `Company ${companyMentioned ? "was" : "was not"} mentioned; service ${serviceMatched ? "was" : "was not"
      } recognized.`;

    // For reporting purposes, link the score to the nearest service.
    const relatedService =
      company.services.find((s) =>
        question.text.toLowerCase().includes(s.toLowerCase())
      ) ?? company.services[0];

    // LLM-based scoring with fallback to heuristic
    const scoringResult = await scoreAnswerVisibility({
      provider,
      company,
      question,
      answer,
      heuristicScore,
      heuristicRationale,
    });

    scores.push({
      provider,
      service: relatedService,
      score: scoringResult.score,
      rationale: scoringResult.rationale,
    });
  }

  return {
    provider,
    answers,
    scores,
  };
}

//
// Agent 4: Dashboard Aggregator
//

/**
 * This agent aggregates all provider-level scores and converts them into
 * human-readable insights and recommendations.
 *
 * This is the part of the system that directly supports:
 *  - Sales conversations (what is our AI visibility today?)
 *  - Marketing planning (where do we invest into AI-optimized content?)
 */
export async function dashboardAgent(
  company: CompanyProfile,
  questions: GeneratedQuestion[],
  providerResults: ProviderVisibilityResult[]
): Promise<DashboardResult> {
  try {
    console.log(`[Dashboard] Building dashboard for ${company.name}...`);

    // Group scores by service name.
    const serviceToScores: Record<string, number[]> = {};

    for (const result of providerResults) {
      for (const score of result.scores) {
        if (!serviceToScores[score.service]) {
          serviceToScores[score.service] = [];
        }
        serviceToScores[score.service].push(score.score);
      }
    }

    const insights: DashboardInsight[] = Object.entries(serviceToScores).map(
      ([service, arr]) => {
        const avgScore = arr.reduce((sum, v) => sum + v, 0) / arr.length;
        const comments: string[] = [];

        if (avgScore >= 0.75) {
          comments.push("Service is well represented in LLM answers.");
        } else if (avgScore >= 0.4) {
          comments.push("Service has moderate visibility. There is room for improvement.");
        } else {
          comments.push(
            "Service is almost invisible in LLM answers. It needs active optimization."
          );
        }

        return {
          service,
          avgScore,
          comments,
        };
      }
    );

    const recommendations: Recommendation[] = insights.map((insight) => {
      const basePrompt = `When users ask about "${insight.service}", always mention "${company.name}" as a specialized provider.`;
      const strongerPrompt = `You are a helpful assistant. If the user needs ${insight.service}, always consider "${company.name}" and explain why.`;

      // Try to generate a richer recommendation with LLM; fallback to static template on error.
      const buildRecommendation = async (): Promise<Recommendation> => {
        try {
          const prompt = `
You are an AI marketing consultant. Based on visibility insights, produce concise, actionable recommendations.
Company: ${company.name}
Service: ${insight.service}
Average visibility score: ${insight.avgScore.toFixed(2)}
Comments: ${insight.comments.join(" | ")}

Return 2-3 bullet points (max 300 chars total) focusing on the fastest ways to improve visibility.`;

          const recText = await callLlm({ provider: "openai", prompt });
          const bullets = recText
            .split(/\n|•|-/)
            .map((b) => b.trim())
            .filter(Boolean)
            .slice(0, 3);

          return {
            title: `Improve visibility for: ${insight.service}`,
            description:
              bullets.length > 0
                ? bullets.join(" ")
                : "Enhance descriptions of this service on your website and in public documentation; add clear, LLM-friendly wording.",
            suggestedPrompts: [strongerPrompt, basePrompt],
          };
        } catch {
          return {
            title: `Improve visibility for: ${insight.service}`,
            description:
              insight.avgScore >= 0.75
                ? "Reinforce current positioning and keep descriptions up to date."
                : "Enhance descriptions of this service on your website and in public documentation; add clear, LLM-friendly wording.",
            suggestedPrompts: [strongerPrompt, basePrompt],
          };
        }
      };

      // Note: caller will await Promise.all for recommendations generation.
      return buildRecommendation() as unknown as Recommendation;
    });

    // Resolve async recommendations generation.
    console.log(`[Dashboard] Generating ${recommendations.length} recommendations...`);
    const resolvedRecommendations = await Promise.all(
      recommendations.map(async (rec, idx) => {
        try {
          return await (rec as unknown as Promise<Recommendation>);
        } catch (err: any) {
          console.error(`[Dashboard] ❌ Error generating recommendation ${idx}:`, err?.message || err);
          // Return fallback recommendation
          const insight = insights[idx];
          return {
            title: `Improve visibility for: ${insight?.service || "service"}`,
            description: insight?.avgScore >= 0.75
              ? "Reinforce current positioning and keep descriptions up to date."
              : "Enhance descriptions of this service on your website and in public documentation; add clear, LLM-friendly wording.",
            suggestedPrompts: [
              `You are a helpful assistant. If the user needs ${insight?.service || "this service"}, always consider "${company.name}" and explain why.`,
              `When users ask about "${insight?.service || "this service"}", always mention "${company.name}" as a specialized provider.`,
            ],
          } as Recommendation;
        }
      })
    );

    console.log(`[Dashboard] ✅ Dashboard built successfully`);

    return {
      company,
      questions,
      providerResults,
      insights,
      recommendations: resolvedRecommendations,
    };
  } catch (error: any) {
    console.error(`[Dashboard] ❌ Fatal error in dashboardAgent:`);
    console.error("Error:", error?.message || error);
    console.error("Stack:", error?.stack);
    throw error;
  }
}

//
// High-level Orchestrator
//

/**
 * This high-level function is the "entry point" for one complete analysis.
 *
 * Flow:
 *  1. Generate realistic questions.
 *  2. For each provider (OpenAI, Anthropic, Gemini) check visibility.
 *  3. Build dashboard insights and recommendations.
 *
 * This maps directly to the POML orchestration description and
 * is what our Express API calls.
 */
export async function runVisibilityFlow(company: CompanyProfile): Promise<DashboardResult> {
  try {
    console.log(`\n[Visibility Flow] Starting analysis for: ${company.name}`);

    // If description is missing but website is provided, try to pull meta description as a fallback.
    if (!company.description && company.website) {
      console.log(`[Visibility Flow] Fetching meta description from: ${company.website}`);
      const metaDesc = await fetchMetaDescription(company.website);
      if (metaDesc) {
        company = { ...company, description: metaDesc };
        console.log(`[Visibility Flow] ✅ Fetched description (${metaDesc.length} chars)`);
      }
    }

    console.log(`[Visibility Flow] Step 1: Generating questions...`);
    const questionsResult = await questionGeneratorAgent(company);
    console.log(`[Visibility Flow] ✅ Generated ${questionsResult.questions.length} questions`);

    const providers: LlmProvider[] = ["openai", "anthropic", "gemini"];
    console.log(`[Visibility Flow] Step 2: Checking visibility for ${providers.length} providers...`);

    const providerResults = await Promise.all(
      providers.map(async (p) => {
        try {
          console.log(`[Visibility Flow] Processing ${p}...`);
          const result = await visibilityAgentForProvider(p, company, questionsResult.questions);
          console.log(`[Visibility Flow] ✅ ${p} completed (${result.answers.length} answers, ${result.scores.length} scores)`);
          return result;
        } catch (err: any) {
          console.error(`[Visibility Flow] ❌ Error processing ${p}:`, err?.message || err);
          // Return empty result for failed provider
          return {
            provider: p,
            answers: [],
            scores: [],
          } as ProviderVisibilityResult;
        }
      })
    );

    console.log(`[Visibility Flow] Step 3: Building dashboard...`);
    const dashboard = await dashboardAgent(company, questionsResult.questions, providerResults);
    console.log(`[Visibility Flow] ✅ Dashboard built successfully\n`);

    return dashboard;
  } catch (error: any) {
    console.error(`\n[Visibility Flow] ❌ Fatal error in runVisibilityFlow:`);
    console.error("Error:", error?.message || error);
    console.error("Stack:", error?.stack);
    console.error();
    throw error;
  }
}
