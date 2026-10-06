/**
 * seasonal-checklist tool — what to plant, what birds to look for, foliage stage.
 *
 * Returns a curated checklist based on the user's interests, location zone,
 * and current month. This is the "what should I notice today" layer.
 */

import { createTool } from "@mastra/core/tools";
import { z } from "zod";

// ── Seasonal data ──────────────────────────────────────────────────

const PLANTING_GUIDE: Record<string, Record<string, string[]>> = {
  spring: {
    early: ["peas", "spinach", "lettuce", "radishes", "onion sets"],
    mid: ["broccoli", "cabbage", "kale", "carrots", "beets"],
    late: ["tomatoes (transplants)", "peppers", "beans", "squash", "cucumbers"],
  },
  summer: {
    early: ["basil", "second sowing of beans", "succession lettuce"],
    mid: ["fall broccoli starts", "second carrot sowing"],
    late: ["fall lettuce", "spinach", "turnips", "radishes (fall crop)"],
  },
  fall: {
    early: ["garlic", "cover crops (crimson clover, winter rye)"],
    mid: ["tulip and daffodil bulbs", "overwintering onions"],
    late: ["mulch beds for winter", "clean and store tools"],
  },
  winter: {
    early: ["plan next year's garden", "order seed catalogs"],
    mid: ["start onion seeds indoors", "prune dormant fruit trees"],
    late: ["start pepper and tomato seeds indoors (8 weeks before last frost)"],
  },
};

const BIRD_ACTIVITY: Record<string, Record<string, string[]>> = {
  spring: {
    early: ["First spring migrants arriving — look for red-winged blackbirds", "Woodpecker drumming peaks"],
    mid: ["Warbler migration wave — check treetops", "Hummingbirds returning — put out feeders"],
    late: ["Orioles and tanagers arriving", "Peak songbird diversity"],
  },
  summer: {
    early: ["Nesting season — watch for fledglings", "Dawn chorus is loudest now"],
    mid: ["Shorebird migration begins", "Young raptors learning to hunt"],
    late: ["Early fall migrants starting to move", "Swallow flocks gathering"],
  },
  fall: {
    early: ["Hawk migration — check ridge overlooks", "Sparrow diversity peaks"],
    mid: ["Waterfowl arriving on lakes", "Late warblers still passing through"],
    late: ["Winter finches may be arriving", "Owl activity increases at dusk"],
  },
  winter: {
    early: ["Christmas Bird Count season", "Check feeders for winter finches"],
    mid: ["Eagles active along rivers", "Owls calling — great horned owl nesting"],
    late: ["First spring songs begin (chickadees, cardinals)", "Watch for early migrants"],
  },
};

const FOLIAGE_STAGE: Record<string, string> = {
  spring: "🌱 Buds breaking — first green leaves emerging",
  summer: "🌿 Full canopy — deep green, peak shade",
  fall: "🍂 Peak color approaching — watch for reds, oranges, golds",
  winter: "🌲 Bare branches — evergreens stand out, good for structure photography",
};

// ── Helpers ──────────────────────────────────────────────────────

function getSeason(month: number): string {
  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  if (month >= 9 && month <= 11) return "fall";
  return "winter";
}

function getSubSeason(month: number): string {
  const m = month % 3;
  if (m === 0) return "early";
  if (m === 1) return "mid";
  return "late";
}

export const seasonalChecklist = createTool({
  id: "seasonal_checklist",
  description:
    "Get a seasonal checklist of what to plant, what birds are active, " +
    "and what the foliage looks like right now. Tailored to the user's " +
    "interests and current month.",
  inputSchema: z.object({
    month: z.number().min(1).max(12).describe("Current month (1-12)"),
    interests: z
      .array(z.enum(["hiking", "birding", "gardening", "running", "photography", "walking"]))
      .describe("User's outdoor interests"),
    frost_free: z
      .boolean()
      .default(true)
      .describe("Whether the location is currently frost-free"),
  }),
  outputSchema: z.object({
    season: z.string(),
    foliage: z.string(),
    gardening_tasks: z.array(z.string()),
    bird_notes: z.array(z.string()),
    tips: z.array(z.string()),
  }),
  execute: async (context) => {
    const season = getSeason(context.month);
    const subSeason = getSubSeason(context.month);

    const gardeningTasks = context.interests.includes("gardening")
      ? PLANTING_GUIDE[season]?.[subSeason] || []
      : [];

    const birdNotes = context.interests.includes("birding")
      ? BIRD_ACTIVITY[season]?.[subSeason] || []
      : [];

    const foliage = FOLIAGE_STAGE[season] || "";

    // Generate tips based on interests
    const tips: string[] = [];

    if (!context.frost_free && context.interests.includes("gardening")) {
      tips.push("⚠️ Frost risk — cover tender plants tonight or bring pots inside");
    }

    if (context.interests.includes("photography")) {
      if (season === "fall") tips.push("📸 Peak foliage light is in the morning — backlit leaves glow");
      if (season === "winter") tips.push("📸 Low sun angle = dramatic shadows all day");
      if (season === "spring") tips.push("📸 Overcast days = perfect soft light for flowers");
    }

    if (context.interests.includes("running")) {
      if (season === "summer") tips.push("🏃 Hydrate extra — run early or late to avoid heat");
      if (season === "winter") tips.push("🏃 Reflective gear for short daylight hours");
      if (season === "fall") tips.push("🏃 Best running weather of the year — enjoy it!");
    }

    if (context.interests.includes("hiking")) {
      if (season === "fall") tips.push("🥾 Trails may be slippery with wet leaves");
      if (season === "spring") tips.push("🥾 Muddy trails — waterproof boots recommended");
    }

    return {
      season: `${season} (${subSeason})`,
      foliage,
      gardening_tasks: gardeningTasks,
      bird_notes: birdNotes,
      tips,
    };
  },
});
