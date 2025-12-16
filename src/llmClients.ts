import type { LlmProvider } from "./types";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Helper to check if API key is valid (not empty)
function hasValidApiKey(key: string | undefined): boolean {
  return !!key && key.trim().length > 0;
}

// Initialize clients - will be re-checked at call time if .env loads late
// This allows dotenv to load before clients are actually used
let openai: OpenAI | null = null;
let anthropic: Anthropic | null = null;
let gemini: GoogleGenerativeAI | null = null;


function getAnthropicClient(): Anthropic | null {
  if (!anthropic && hasValidApiKey(process.env.ANTHROPIC_API_KEY)) {
    anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  }
  return anthropic;
}

function getGeminiClient(): GoogleGenerativeAI | null {
  if (!gemini && hasValidApiKey(process.env.GEMINI_API_KEY)) {
    gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  }
  return gemini;
}

/**
 * Check if API key is configured for a provider
 */
export function hasApiKey(provider: LlmProvider): boolean {
  switch (provider) {
    case "openai":
      return hasValidApiKey(process.env.OPENAI_API_KEY);
    case "anthropic":
      return hasValidApiKey(process.env.ANTHROPIC_API_KEY);
    case "gemini":
      return hasValidApiKey(process.env.GEMINI_API_KEY);
    default:
      return false;
  }
}

export interface LlmCallParams {
  provider: LlmProvider;
  prompt: string;
}

export async function callLlm({ provider, prompt }: LlmCallParams): Promise<string> {
  switch (provider) {
    case "openai":
      return callOpenAI(prompt);

    case "anthropic":
      return callAnthropic(prompt);

    case "gemini":
      return callGemini(prompt);

    default:
      const _never: never = provider;
      throw new Error(`Unknown provider: ${_never}`);
  }
}

//
// --- OpenAI ---
//
async function callOpenAI(prompt: string): Promise<string> {
  // Lazy initialization - check API key at call time
  const client = new OpenAI();

  if (!client) {
    console.warn(`[OpenAI] ⚠️  API key not available. `);

    return `[OPENAI MOCK] ${prompt}`;
  }

  try {
    console.log(`[OpenAI] ✅ Making API call with model: gpt-4o-mini`);
    const response = await client.responses.create({
      model: "gpt-4o-mini",    // fast + cheap for prototype
      input: prompt,
    });
    console.log(`[OpenAI] ✅ Response:`, response.output_text);

    // OpenAI Responses API returns outputs; use both safe paths
    const answer =
      (response as any).output_text ??
      (response as any).output?.[0]?.content?.[0]?.text ??
      "";

    if (!answer) {
      console.warn("[OpenAI] ⚠️ Empty answer received, raw response:", response);
    } else {
      console.log(`[OpenAI] ✅ Received response (${answer.length} chars)`);
    }
    return answer;
  } catch (error: any) {
    console.error(`[OpenAI] ❌ API call failed:`, error.message || error);
    throw error;
  }
}

//
// --- Anthropic ---
//
async function callAnthropic(prompt: string): Promise<string> {
  const client = getAnthropicClient();
  if (!client) return `[ANTHROPIC MOCK] ${prompt.slice(0, 100)}`;

  const response = await client.messages.create({
    model: "claude-3-5-sonnet-latest",
    max_tokens: 512,
    messages: [{ role: "user", content: prompt }],
  });

  return response.content[0].text;
}

//
// --- Gemini ---
//
async function callGemini(prompt: string): Promise<string> {
  const client = getGeminiClient();
  if (!client) return `[GEMINI MOCK] ${prompt.slice(0, 100)}`;

  const model = client.getGenerativeModel({
    model: "gemini-1.5-flash",
  });

  const result = await model.generateContent(prompt);
  return result.response.text();
}
