import express from "express";
import cors from "cors";
import { runVisibilityFlow } from "./agents";
import type { CompanyProfile } from "./types";
import "dotenv/config";
/**
 * This file exposes a simple HTTP API for the frontend.
 * In production this can be:
 *  - containerized (Docker, Kubernetes),
 *  - deployed to any cloud (AWS, GCP, Azure),
 *  - integrated with authentication and billing.
 */

const app = express();
app.use(cors());
app.use(express.json());

/**
 * POST /api/visibility/check
 *
 * Request body:
 * {
 *   "company": {
 *     "name": "Example Corp",
 *     "description": "...",
 *     "services": ["AI SEO consulting", "Web development"],
 *     "website": "https://example.com",
 *     "targetLocales": ["en"]
 *   }
 * }
 *
 * Response: DashboardResult (see types.ts)
 */
app.post("/api/visibility/check", async (req, res) => {
  try {
    const company: CompanyProfile = req.body.company;

    if (!company?.name || !company?.services?.length) {
      return res.status(400).json({
        error: "Invalid company payload. 'name' and 'services' are required.",
      });
    }

    const result = await runVisibilityFlow(company);

    // Validate result before sending
    if (!result) {
      throw new Error("runVisibilityFlow returned null/undefined");
    }

    console.log(`[API] ✅ Successfully generated result with ${result.questions?.length || 0} questions`);
    res.json(result);
  } catch (err: any) {
    console.error("\n[API] ❌ Error in /api/visibility/check:");
    console.error("Error message:", err?.message || err);
    console.error("Error stack:", err?.stack);
    console.error("Full error:", err);
    console.error();

    // Return detailed error in development, generic in production
    const isDev = process.env.NODE_ENV !== "production";
    res.status(500).json({
      error: "Internal server error",
      ...(isDev && {
        message: err?.message || String(err),
        stack: err?.stack,
      }),
    });
  }
});

const PORT = process.env.PORT || 4000;

/**
 * For demo and investor presentations, we keep the startup simple:
 *  - single port,
 *  - no clustering,
 *  - logs go to stdout (container-friendly).
 */
// Diagnostic: Check API keys status
import { hasApiKey } from "./llmClients";
import * as path from "path";

console.log("\n=== API Keys Status ===");
const openaiKey = process.env.OPENAI_API_KEY;
const anthropicKey = process.env.ANTHROPIC_API_KEY;
const geminiKey = process.env.GEMINI_API_KEY;

console.log(`OpenAI: ${hasApiKey("openai") ? "✅ Configured" : "❌ Not configured"}`);
if (openaiKey) {
  console.log(`  Key preview: ${openaiKey.substring(0, 7)}...${openaiKey.substring(openaiKey.length - 4)}`);
} else {
  console.log(`  Set OPENAI_API_KEY in .env file (server/.env or root/.env)`);
}

console.log(`Anthropic: ${hasApiKey("anthropic") ? "✅ Configured" : "❌ Not configured"}`);
if (anthropicKey) {
  console.log(`  Key preview: ${anthropicKey.substring(0, 7)}...${anthropicKey.substring(anthropicKey.length - 4)}`);
} else {
  console.log(`  Set ANTHROPIC_API_KEY in .env file`);
}

console.log(`Gemini: ${hasApiKey("gemini") ? "✅ Configured" : "❌ Not configured"}`);
if (geminiKey) {
  console.log(`  Key preview: ${geminiKey.substring(0, 7)}...${geminiKey.substring(geminiKey.length - 4)}`);
} else {
  console.log(`  Set GEMINI_API_KEY in .env file`);
}

console.log(`\nNote: .env file should be in: ${path.resolve(process.cwd())}`);
console.log("======================\n");

app.listen(PORT, () => {
  console.log(`AI Visibility backend listening on port ${PORT}`);
});
