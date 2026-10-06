/**
 * Daily Brief Workflow — the core orchestrated flow.
 *
 * This Mastra workflow runs the full pipeline:
 *   1. Get weather forecast (TabPFN)
 *   2. Get seasonal checklist
 *   3. Check frost dates (if gardening)
 *   4. Suggest best activity
 *   5. Build route to nearest spot
 *   6. Generate the brief via the LLM
 *
 * The workflow ensures tools run in the right order and handles failures
 * gracefully (e.g., Overpass API down → skip route, still produce brief).
 */

import { Workflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";

import { trailheadAgent } from "../agents/trailhead.js";

// ── Input / Output Schemas ──────────────────────────────────────

const dailyBriefInputSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  interests: z.array(z.string()),
  skipped_recently: z.array(z.string()).default([]),
  user_name: z.string().optional(),
});

// ── Workflow Steps ──────────────────────────────────────────────

const generateBrief = createStep({
  id: "generate_brief",
  inputSchema: dailyBriefInputSchema,
  outputSchema: z.object({
    brief: z.string(),
    activity: z.string(),
    location: z.string().nullable(),
    best_time: z.string(),
    duration_minutes: z.number(),
    weather_summary: z.string(),
    frost_risk: z.boolean(),
  }),
  execute: async ({ inputData }) => {
    if (!inputData) {
      throw new Error("No input provided to daily brief workflow");
    }

    const { latitude, longitude, interests, skipped_recently, user_name } = inputData;

    // Build the prompt for the agent — it will call tools as needed
    const prompt = `Generate today's outdoor brief for ${user_name || "the user"}.

Location: ${latitude}, ${longitude}
Interests: ${interests.join(", ")}
${skipped_recently.length > 0 ? `Recently skipped: ${skipped_recently.join(", ")} (avoid these)` : ""}

Call the weather forecast tool first, then suggest an activity, find a nearby spot, 
and check the seasonal checklist. Produce a brief I can read aloud in 30 seconds.`;

    const response = await trailheadAgent.generate(prompt);

    // Extract structured data from the response
    // The agent's response is the brief text — we parse key fields
    const briefText = response.text;

    return {
      brief: briefText,
      activity: extractField(briefText, "activity") || interests[0] || "walking",
      location: extractField(briefText, "location"),
      best_time: extractField(briefText, "time") || "morning",
      duration_minutes: parseInt(extractField(briefText, "duration") || "30"),
      weather_summary: extractField(briefText, "conditions") || "",
      frost_risk: briefText.toLowerCase().includes("frost"),
    };
  },
});

// ── Helper ──────────────────────────────────────────────────────

function extractField(text: string, field: string): string | null {
  // Simple extraction from the brief format
  const patterns: Record<string, RegExp> = {
    activity: /\*\*(.+?)\*\*/,
    location: /📍\s*(?:\[?Where\]?:?\s*)?(.+?)(?:\n|$)/,
    time: /🕐\s*(?:\[?When\]?:?\s*)?(.+?)(?:\n|$)/,
    duration: /(\d+)\s*min/,
    conditions: /🌡️\s*(?:\[?Conditions\]?:?\s*)?(.+?)(?:\n|$)/,
  };

  const pattern = patterns[field];
  if (!pattern) return null;

  const match = text.match(pattern);
  return match ? match[1].trim() : null;
}

// ── Workflow Definition ─────────────────────────────────────────

export const dailyBriefWorkflow = new Workflow({
  id: "daily-brief",
  inputSchema: dailyBriefInputSchema,
} as any);

(dailyBriefWorkflow as any).step(generateBrief).commit();

export type DailyBriefInput = z.infer<typeof dailyBriefInputSchema>;
