/**
 * build-route tool — finds walking/running/hiking routes using OpenStreetMap.
 *
 * Uses the Overpass API to find nearby green spaces, trails, and parks,
 * then optionally uses OSRM for turn-by-turn routing.
 *
 * All open data — no API key required.
 */

import { createTool } from "@mastra/core/tools";
import { z } from "zod";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

/**
 * Query Overpass for nearby outdoor POIs (parks, trails, nature reserves).
 */
async function findNearbyOutdoorSpots(
  lat: number,
  lon: number,
  radiusMeters: number = 3000,
  activity: string = "walking"
): Promise<Array<{ name: string; type: string; lat: number; lon: number; distance_m: number }>> {
  // Build Overpass query based on activity type
  let tags: string;
  switch (activity) {
    case "hiking":
      tags = `["route"="hiking"]`;
      break;
    case "birding":
      tags = `["leisure"="nature_reserve"]`;
      break;
    case "running":
      tags = `["highway"~"path|footway|cycleway"]`;
      break;
    case "gardening":
      tags = `["leisure"~"garden|allotments"]`;
      break;
    default:
      tags = `["leisure"~"park|garden|nature_reserve"]`;
  }

  const query = `
    [out:json][timeout:10];
    (
      way${tags}(around:${radiusMeters},${lat},${lon});
      relation${tags}(around:${radiusMeters},${lat},${lon});
      node["leisure"~"park|garden|nature_reserve"](around:${radiusMeters},${lat},${lon});
    );
    out center body 10;
  `;

  try {
    const response = await fetch(OVERPASS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
    });

    if (!response.ok) {
      // Overpass can be rate-limited; return empty rather than failing
      console.warn(`Overpass API returned ${response.status}`);
      return [];
    }

    const data = await response.json();

    return data.elements
      .filter((el: any) => el.tags?.name)
      .map((el: any) => {
        const elLat = el.lat || el.center?.lat || lat;
        const elLon = el.lon || el.center?.lon || lon;
        const distance = haversineDistance(lat, lon, elLat, elLon);

        return {
          name: el.tags.name,
          type: el.tags.leisure || el.tags.route || el.tags.highway || "outdoor",
          lat: elLat,
          lon: elLon,
          distance_m: Math.round(distance),
        };
      })
      .sort((a: any, b: any) => a.distance_m - b.distance_m)
      .slice(0, 5);
  } catch (error) {
    console.error("Overpass query failed:", error);
    return [];
  }
}

/**
 * Haversine distance between two points in meters.
 */
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export const buildRoute = createTool({
  id: "build_route",
  description:
    "Find nearby outdoor locations and build a route for the recommended activity. " +
    "Uses OpenStreetMap data (free, open). Returns nearby parks, trails, and " +
    "nature spots sorted by distance, with estimated walk time.",
  inputSchema: z.object({
    latitude: z.number().min(-90).max(90).describe("Starting location latitude"),
    longitude: z.number().min(-180).max(180).describe("Starting location longitude"),
    activity: z
      .enum(["hiking", "birding", "gardening", "running", "walking", "photography"])
      .describe("Type of activity to find spots for"),
    radius_km: z
      .number()
      .min(0.5)
      .max(20)
      .default(3)
      .describe("Search radius in kilometers"),
  }),
  outputSchema: z.object({
    spots: z.array(
      z.object({
        name: z.string(),
        type: z.string(),
        distance_m: z.number(),
        walk_time_min: z.number(),
        lat: z.number(),
        lon: z.number(),
      })
    ),
    nearest: z
      .object({
        name: z.string(),
        distance_m: z.number(),
        walk_time_min: z.number(),
      })
      .nullable(),
    map_url: z.string(),
  }),
  execute: async (context) => {
    const spots = await findNearbyOutdoorSpots(
      context.latitude,
      context.longitude,
      context.radius_km * 1000,
      context.activity
    );

    const enriched = spots.map((spot) => ({
      ...spot,
      walk_time_min: Math.round(spot.distance_m / 80), // ~80m/min walking speed
    }));

    const nearest = enriched.length > 0 ? enriched[0] : null;

    // Generate OpenStreetMap link
    const mapUrl = nearest
      ? `https://www.openstreetmap.org/?mlat=${nearest.lat}&mlon=${nearest.lon}#map=15/${nearest.lat}/${nearest.lon}`
      : `https://www.openstreetmap.org/#map=13/${context.latitude}/${context.longitude}`;

    return {
      spots: enriched,
      nearest: nearest
        ? {
            name: nearest.name,
            distance_m: nearest.distance_m,
            walk_time_min: nearest.walk_time_min,
          }
        : null,
      map_url: mapUrl,
    };
  },
});
