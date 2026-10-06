/**
 * frost-dates tool — gets frost date information for garden planning.
 *
 * Calls the TabPFN service to compute spring/fall frost dates from
 * historical weather data. Essential for the garden planner feature.
 */

import { createTool } from "@mastra/core/tools";
import { z } from "zod";

const PREDICT_URL = process.env.PREDICT_URL || "http://localhost:8001";

export const getFrostDates = createTool({
  id: "get_frost_dates",
  description:
    "Get frost date information for garden planning at a location. " +
    "Returns estimated last spring frost, first fall frost, growing season length, " +
    "and whether today is in the frost-free window. " +
    "Use this to advise on planting schedules and frost protection.",
  inputSchema: z.object({
    latitude: z.number().min(-90).max(90).describe("Location latitude"),
    longitude: z.number().min(-180).max(180).describe("Location longitude"),
    year: z
      .number()
      .optional()
      .describe("Year to compute frost dates for (default: current year)"),
  }),
  outputSchema: z.object({
    last_spring_frost: z.string().nullable(),
    first_fall_frost: z.string().nullable(),
    growing_season_days: z.number().nullable(),
    frost_free_now: z.boolean(),
  }),
  execute: async (context) => {
    const response = await fetch(`${PREDICT_URL}/predict/frost-dates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        latitude: context.latitude,
        longitude: context.longitude,
        year: context.year,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Frost dates failed: ${response.status} ${await response.text()}`
      );
    }

    const data = await response.json();
    return {
      last_spring_frost: data.last_spring_frost,
      first_fall_frost: data.first_fall_frost,
      growing_season_days: data.growing_season_days,
      frost_free_now: data.frost_free_now,
    };
  },
});
