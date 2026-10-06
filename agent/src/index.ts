/**
 * Trailhead Agent Server — HTTP API for the frontend.
 *
 * Exposes the Mastra agent and daily-brief workflow over HTTP.
 * Connects to Ollama for local LLM inference.
 */

import "dotenv/config";
import express from "express";
import cors from "cors";

import { Mastra } from "@mastra/core";
import { trailheadAgent } from "./agents/trailhead.js";
import { dailyBriefWorkflow } from "./workflows/daily-brief.js";

// ── Mastra Instance ─────────────────────────────────────────────

const mastra = new Mastra({
  agents: { trailhead: trailheadAgent },
  workflows: { "daily-brief": dailyBriefWorkflow },
});

// ── Express Server ──────────────────────────────────────────────

const app = express();
const PORT = parseInt(process.env.AGENT_PORT || "3001");

app.use(cors({
  origin: process.env.CORS_ORIGINS?.split(",") || [
    "http://localhost:5173",
    "http://localhost:3000",
  ],
}));
app.use(express.json());

// ── Health Check ────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    model: process.env.MODEL_NAME || "gemma3:4b",
    ollama: process.env.OLLAMA_HOST || "http://localhost:11434",
  });
});

// ── Generate Daily Brief ────────────────────────────────────────

app.post("/api/brief", async (req, res) => {
  try {
    const {
      latitude,
      longitude,
      interests = ["walking"],
      skipped_recently = [],
      user_name,
    } = req.body;

    if (!latitude || !longitude) {
      res.status(400).json({ error: "latitude and longitude are required" });
      return;
    }

    console.log(
      `[brief] Generating for (${latitude}, ${longitude}) — interests: ${interests.join(", ")}`
    );

    const agent = mastra.getAgent("trailhead");
    const prompt = `Generate today's outdoor brief.

Location: ${latitude}, ${longitude}
Interests: ${interests.join(", ")}
${skipped_recently.length > 0 ? `Recently skipped: ${skipped_recently.join(", ")}` : ""}
${user_name ? `User: ${user_name}` : ""}

Call the weather forecast, seasonal checklist, and activity suggestion tools, 
then produce a brief that can be read aloud in 30 seconds.`;

    const startTime = Date.now();
    const response = await agent.generate(prompt);
    const elapsed = Date.now() - startTime;

    console.log(`[brief] Generated in ${elapsed}ms`);

    res.json({
      brief: response.text,
      generated_at: new Date().toISOString(),
      model: process.env.MODEL_NAME || "gemma3:4b",
      latency_ms: elapsed,
    });
  } catch (error: any) {
    console.error("[brief] Error:", error.message);
    res.status(500).json({
      error: "Failed to generate brief",
      details: error.message,
    });
  }
});

// ── Chat Endpoint (for follow-up questions on the trail) ────────

app.post("/api/chat", async (req, res) => {
  try {
    const { message, latitude, longitude, interests = [] } = req.body;

    if (!message) {
      res.status(400).json({ error: "message is required" });
      return;
    }

    const agent = mastra.getAgent("trailhead");
    const contextPrefix = latitude
      ? `The user is at (${latitude}, ${longitude}). Their interests: ${interests.join(", ")}. `
      : "";

    const response = await agent.generate(`${contextPrefix}${message}`);

    res.json({
      response: response.text,
      generated_at: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("[chat] Error:", error.message);
    res.status(500).json({
      error: "Failed to generate response",
      details: error.message,
    });
  }
});

// ── Check-in Endpoint (post-outing feedback) ────────────────────

app.post("/api/checkin", async (req, res) => {
  try {
    const { activity, status, note, latitude, longitude } = req.body;
    // status: "went" | "skipped"

    console.log(
      `[checkin] ${status}: ${activity}${note ? ` — "${note}"` : ""}`
    );

    // TODO: Store in Mastra memory when memory is configured
    // For now, log it and acknowledge

    res.json({
      recorded: true,
      activity,
      status,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("[checkin] Error:", error.message);
    res.status(500).json({ error: "Failed to record check-in" });
  }
});

// ── Start Server ────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`
🌲 Trailhead Agent Server
   Port:    ${PORT}
   Model:   ${process.env.MODEL_NAME || "gemma3:4b"}
   Ollama:  ${process.env.OLLAMA_HOST || "http://localhost:11434"}
   Predict: ${process.env.PREDICT_URL || "http://localhost:8001"}
  `);
});

export { app, mastra };
