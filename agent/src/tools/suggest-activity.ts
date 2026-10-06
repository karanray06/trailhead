/**
 * suggest-activity tool — recommends the best outdoor activity for today.
 *
 * Takes weather conditions, user interests, season, and past outings to
 * suggest the single best thing to do outside today.
 */

import { createTool } from "@mastra/core/tools";
import { z } from "zod";

const ACTIVITY_DATABASE = {
  hiking: {
    ideal: { minTemp: 5, maxTemp: 30, maxPrecip: 2, maxWind: 25 },
    seasons: {
      spring: "Spring wildflower hike — trails are waking up",
      summer: "Early morning hike to beat the heat — sunrise trail",
      fall: "Fall foliage hike — peak colors on the ridge",
      winter: "Winter hike with microspikes — crisp views, no crowds",
    },
  },
  birding: {
    ideal: { minTemp: 0, maxTemp: 35, maxPrecip: 5, maxWind: 20 },
    seasons: {
      spring: "Spring migration watch — warblers are passing through",
      summer: "Dawn chorus session — best singing before 8 AM",
      fall: "Fall raptor migration — hawk watch from the overlook",
      winter: "Winter waterfowl count — ducks and geese on the reservoir",
    },
  },
  gardening: {
    ideal: { minTemp: 5, maxTemp: 32, maxPrecip: 0, maxWind: 15 },
    seasons: {
      spring: "Plant cool-season crops — lettuce, peas, radishes go in now",
      summer: "Morning harvest and watering — get out before it's hot",
      fall: "Plant garlic and cover crops — prepare beds for winter",
      winter: "Prune dormant trees and plan next year's garden",
    },
  },
  running: {
    ideal: { minTemp: 0, maxTemp: 25, maxPrecip: 1, maxWind: 20 },
    seasons: {
      spring: "Tempo run on the greenway — warm enough, not yet humid",
      summer: "Sunrise run — cool air, golden light, empty paths",
      fall: "Long run through the foliage — best running weather of the year",
      winter: "Brisk winter run — layer up, the cold air is energizing",
    },
  },
  photography: {
    ideal: { minTemp: -5, maxTemp: 35, maxPrecip: 3, maxWind: 30 },
    seasons: {
      spring: "Golden hour flower shoot — cherry blossoms or wildflowers",
      summer: "Blue hour cityscape — late sunset, warm evening light",
      fall: "Foliage portrait session — backlit leaves, warm tones",
      winter: "Frost and fog morning — moody landscapes at dawn",
    },
  },
  walking: {
    ideal: { minTemp: 0, maxTemp: 32, maxPrecip: 2, maxWind: 20 },
    seasons: {
      spring: "Neighborhood walk — notice what's blooming",
      summer: "Evening stroll — cool down after the day",
      fall: "Leaf-peeping walk — bring a warm drink",
      winter: "Bundled-up walk — fresh air clears the mind",
    },
  },
};

function getSeason(month: number): "spring" | "summer" | "fall" | "winter" {
  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  if (month >= 9 && month <= 11) return "fall";
  return "winter";
}

function scoreActivity(
  activity: keyof typeof ACTIVITY_DATABASE,
  tempMax: number,
  tempMin: number,
  precip: number,
  wind: number
): number {
  const ideal = ACTIVITY_DATABASE[activity].ideal;
  let score = 1.0;

  // Temperature fit
  if (tempMax > ideal.maxTemp) score *= Math.max(0, 1 - (tempMax - ideal.maxTemp) / 10);
  if (tempMin < ideal.minTemp) score *= Math.max(0, 1 - (ideal.minTemp - tempMin) / 10);

  // Precipitation penalty
  if (precip > ideal.maxPrecip) score *= Math.max(0, 1 - (precip - ideal.maxPrecip) / 10);

  // Wind penalty
  if (wind > ideal.maxWind) score *= Math.max(0, 1 - (wind - ideal.maxWind) / 15);

  return Math.max(0, Math.min(1, score));
}

export const suggestActivity = createTool({
  id: "suggest_activity",
  description:
    "Suggest the best outdoor activity for today based on weather conditions, " +
    "user interests, and season. Returns a ranked list of activities with " +
    "descriptions and time-of-day recommendations.",
  inputSchema: z.object({
    interests: z
      .array(z.enum(["hiking", "birding", "gardening", "running", "photography", "walking"]))
      .describe("User's outdoor interests"),
    temp_max_c: z.number().describe("Today's high temperature in °C"),
    temp_min_c: z.number().describe("Today's low temperature in °C"),
    precipitation_mm: z.number().describe("Expected precipitation in mm"),
    wind_speed_kmh: z.number().default(10).describe("Wind speed in km/h"),
    month: z.number().min(1).max(12).describe("Current month (1-12)"),
    skipped_recently: z
      .array(z.string())
      .default([])
      .describe("Activities the user skipped recently (avoid suggesting again)"),
  }),
  outputSchema: z.object({
    top_pick: z.object({
      activity: z.string(),
      description: z.string(),
      score: z.number(),
      best_time: z.string(),
      duration_minutes: z.number(),
    }),
    alternatives: z.array(
      z.object({
        activity: z.string(),
        description: z.string(),
        score: z.number(),
      })
    ),
  }),
  execute: async (context) => {
    const season = getSeason(context.month);
    const scored: Array<{ activity: string; description: string; score: number }> = [];

    for (const interest of context.interests) {
      if (context.skipped_recently.includes(interest)) continue;

      const activityData = ACTIVITY_DATABASE[interest as keyof typeof ACTIVITY_DATABASE];
      if (!activityData) continue;

      const score = scoreActivity(
        interest,
        context.temp_max_c,
        context.temp_min_c,
        context.precipitation_mm,
        context.wind_speed_kmh
      );

      scored.push({
        activity: interest,
        description: activityData.seasons[season],
        score: Math.round(score * 100) / 100,
      });
    }

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    // If no interests match well, add walking as a fallback
    if (scored.length === 0 || scored[0].score < 0.3) {
      const walkData = ACTIVITY_DATABASE.walking;
      scored.unshift({
        activity: "walking",
        description: walkData.seasons[season],
        score: scoreActivity("walking", context.temp_max_c, context.temp_min_c, context.precipitation_mm, context.wind_speed_kmh),
      });
    }

    const topPick = scored[0];

    // Determine best time of day
    let bestTime = "morning (8-10 AM)";
    if (context.temp_max_c > 28) bestTime = "early morning (6-8 AM) or evening (6-8 PM)";
    else if (context.temp_min_c < 0) bestTime = "midday (11 AM - 2 PM) when it's warmest";
    else if (topPick.activity === "photography") bestTime = "golden hour (sunrise or 1hr before sunset)";

    // Estimate duration
    const durations: Record<string, number> = {
      hiking: 90,
      birding: 60,
      gardening: 45,
      running: 40,
      photography: 60,
      walking: 30,
    };

    return {
      top_pick: {
        activity: topPick.activity,
        description: topPick.description,
        score: topPick.score,
        best_time: bestTime,
        duration_minutes: durations[topPick.activity] || 30,
      },
      alternatives: scored.slice(1, 3),
    };
  },
});
