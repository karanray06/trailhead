/**
 * weather-forecast tool — calls the TabPFN prediction service.
 *
 * This is the bridge between the Mastra agent and the Python TabPFN service.
 * Returns 7-day outdoor activity probability forecast with anomaly detection.
 */

import { createTool } from "@mastra/core/tools";
import { z } from "zod";

const PREDICT_URL = process.env.PREDICT_URL || "http://localhost:8001";

export const getWeatherForecast = createTool({
  id: "get_weather_forecast",
  description:
    "Get a 7-day outdoor activity forecast for a location. " +
    "Returns probability of good outdoor conditions for each day, " +
    "flags weather anomalies (cold snaps, frost risk, heat waves), " +
    "and identifies the best day. Powered by TabPFN.",
  inputSchema: z.object({
    latitude: z.number().min(-90).max(90).describe("Location latitude"),
    longitude: z.number().min(-180).max(180).describe("Location longitude"),
    days_ahead: z
      .number()
      .min(1)
      .max(14)
      .default(7)
      .describe("Number of days to forecast"),
  }),
  outputSchema: z.object({
    days: z.array(
      z.object({
        date: z.string(),
        good_outdoor_probability: z.number(),
        predicted_temp_max_c: z.number(),
        predicted_temp_min_c: z.number(),
        predicted_precipitation_mm: z.number(),
        is_anomaly: z.boolean(),
        anomaly_description: z.string().nullable(),
        confidence: z.number(),
      })
    ),
    best_day: z
      .object({
        date: z.string(),
        good_outdoor_probability: z.number(),
      })
      .nullable(),
    frost_risk_days: z.array(z.string()),
  }),
  execute: async (context) => {
    const response = await fetch(`${PREDICT_URL}/predict/forecast`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        latitude: context.latitude,
        longitude: context.longitude,
        days_ahead: context.days_ahead,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `TabPFN forecast failed: ${response.status} ${await response.text()}`
      );
    }

    const data = await response.json();
    return {
      days: data.days,
      best_day: data.best_day,
      frost_risk_days: data.frost_risk_days,
    };
  },
});
