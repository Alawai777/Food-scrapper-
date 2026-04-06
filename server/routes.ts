import type { Express } from "express";
import type { Server } from "http";
import axios from "axios";
import { storage } from "./storage";
import { CITY_BBOXES, CUISINE_GENRES, DINING_STYLES } from "@shared/schema";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

function buildOverpassQuery(
  bbox: [number, number, number, number],
  amenityTypes: string[],
  cuisineOsm: string,
  halal: boolean
): string {
  const [s, w, n, e] = bbox;
  const bboxStr = `${s},${w},${n},${e}`;
  const amenityRegex = amenityTypes.join("|");
  const cuisineFilter = cuisineOsm ? `["cuisine"~"${cuisineOsm}",i]` : "";
  const halalFilter   = halal ? '["diet:halal"="yes"]' : "";

  // Halal-only mode: search all restaurants with diet:halal=yes, ignore cuisine
  if (halal && !cuisineOsm) {
    return `[out:json][timeout:25];(
      node["amenity"~"${amenityRegex}"]["diet:halal"="yes"](${bboxStr});
      way["amenity"~"${amenityRegex}"]["diet:halal"="yes"](${bboxStr});
    );out center 40;`;
  }

  // Combined cuisine + halal
  if (cuisineOsm && halal) {
    return `[out:json][timeout:25];(
      node["amenity"~"${amenityRegex}"]["cuisine"~"${cuisineOsm}",i]["diet:halal"="yes"](${bboxStr});
      way["amenity"~"${amenityRegex}"]["cuisine"~"${cuisineOsm}",i]["diet:halal"="yes"](${bboxStr});
      node["amenity"~"${amenityRegex}"]["cuisine"~"${cuisineOsm}",i](${bboxStr});
      way["amenity"~"${amenityRegex}"]["cuisine"~"${cuisineOsm}",i](${bboxStr});
    );out center 40;`;
  }

  return `[out:json][timeout:25];(
    node["amenity"~"${amenityRegex}"]${cuisineFilter}${halalFilter}(${bboxStr});
    way["amenity"~"${amenityRegex}"]${cuisineFilter}${halalFilter}(${bboxStr});
  );out center 40;`;
}

function osmToRestaurant(el: any, centerLat?: number, centerLon?: number) {
  const tags = el.tags || {};
  const lat = el.lat ?? el.center?.lat ?? 0;
  const lon = el.lon ?? el.center?.lon ?? 0;

  // Build address
  const addressParts = [
    tags["addr:housenumber"],
    tags["addr:street"],
    tags["addr:city"],
  ].filter(Boolean);
  const address = addressParts.length ? addressParts.join(" ") : tags["addr:full"] || "";

  // Distance from center
  let distance = "";
  if (centerLat && centerLon && lat && lon) {
    const R = 3958.8;
    const dLat = ((lat - centerLat) * Math.PI) / 180;
    const dLon = ((lon - centerLon) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((centerLat * Math.PI) / 180) *
      Math.cos((lat * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
    const d = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    distance = d.toFixed(1) + " mi";
  }

  // Detect if halal
  const isHalal =
    tags["diet:halal"] === "yes" ||
    (tags.name || "").toLowerCase().includes("halal") ||
    (tags.cuisine || "").toLowerCase().includes("halal");

  // Opening hours — basic open-now check
  const openingHours = tags["opening_hours"] || "";
  let isOpen: boolean | null = null;
  if (openingHours) {
    isOpen = checkOpenNow(openingHours);
  }

  // Map image via static map
  const mapImg = lat && lon
    ? `https://static-maps.yandex.ru/1.x/?lang=en_US&ll=${lon},${lat}&z=16&l=map&size=450,200`
    : "";

  // Google Maps link
  const mapsLink = lat && lon
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(tags.name || "restaurant")}+${lat},${lon}`
    : "";

  return {
    id: String(el.id),
    name: tags.name || tags["name:en"] || "Unnamed Place",
    cuisine: tags.cuisine?.replace(/_/g, " ").replace(/;/g, ", ") || "",
    amenity: tags.amenity || "",
    address,
    phone: tags.phone || tags["contact:phone"] || "",
    website: tags.website || tags["contact:website"] || "",
    openingHours,
    isOpen,
    isHalal,
    isVegetarian: tags["diet:vegetarian"] === "yes",
    isVegan: tags["diet:vegan"] === "yes",
    lat,
    lon,
    distance,
    imageUrl: "", // OSM doesn't have photos
    mapsLink,
    source: "openstreetmap",
    nodeType: el.type,
  };
}

/** Very basic open-now check. Returns null if can't parse. */
function checkOpenNow(hoursStr: string): boolean | null {
  try {
    const now = new Date();
    const day = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"][now.getDay()];
    const timeNow = now.getHours() * 60 + now.getMinutes();

    // Handle "24/7"
    if (hoursStr.trim() === "24/7") return true;

    // Look for patterns like "Mo-Fr 11:00-22:00" or "Mo,Tu,We 10:00-21:00"
    const segments = hoursStr.split(";").map(s => s.trim());
    for (const seg of segments) {
      const match = seg.match(/^([\w,\-]+)\s+(\d+:\d+)-(\d+:\d+)/);
      if (!match) continue;
      const [, daysPart, open, close] = match;

      // Check if current day is in range
      const dayRanges = daysPart.split(",");
      let dayMatches = false;
      for (const dr of dayRanges) {
        if (dr.includes("-")) {
          const days = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
          const [startDay, endDay] = dr.split("-");
          const si = days.indexOf(startDay);
          const ei = days.indexOf(endDay);
          const ci = days.indexOf(day);
          if (si !== -1 && ei !== -1 && ci !== -1 && ci >= si && ci <= ei) {
            dayMatches = true;
          }
        } else if (dr === day) {
          dayMatches = true;
        }
      }

      if (dayMatches) {
        const [oh, om] = open.split(":").map(Number);
        const [ch, cm] = close.split(":").map(Number);
        const openMin = oh * 60 + om;
        const closeMin = ch * 60 + cm;
        return timeNow >= openMin && timeNow <= closeMin;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function registerRoutes(httpServer: Server, app: Express) {
  app.post("/api/search", async (req, res) => {
    const { city, genre, diningStyle, groupSize, priceRange, halal, openNow, sortBy, userLat, userLon } = req.body;

    if (!city || !genre || !diningStyle) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const bbox = CITY_BBOXES[city];
    if (!bbox) return res.status(400).json({ error: "Unknown city" });

    const genreConfig = CUISINE_GENRES.find(g => g.id === genre);
    const diningConfig = DINING_STYLES.find(d => d.id === diningStyle);

    const cuisineOsm = genreConfig?.osm || "";
    const amenityTypes = diningConfig?.osm || ["restaurant"];

    const query = buildOverpassQuery(bbox, amenityTypes, cuisineOsm, Boolean(halal));

    try {
      const response = await axios.post(OVERPASS_URL, `data=${encodeURIComponent(query)}`, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        timeout: 28000,
      });

      const elements: any[] = response.data.elements || [];

      // Center of bbox for distance calc
      const centerLat = (bbox[0] + bbox[2]) / 2;
      const centerLon = (bbox[1] + bbox[3]) / 2;
      const refLat = userLat ? Number(userLat) : centerLat;
      const refLon = userLon ? Number(userLon) : centerLon;

      let results = elements
        .filter(el => el.tags?.name) // only named places
        .map(el => osmToRestaurant(el, refLat, refLon));

      // Deduplicate by name
      const seen = new Set<string>();
      results = results.filter(r => {
        if (seen.has(r.name)) return false;
        seen.add(r.name);
        return true;
      });

      // Filter open now
      if (openNow) {
        results = results.filter(r => r.isOpen === true);
      }

      // Sort
      if (sortBy === "distance") {
        results.sort((a, b) => parseFloat(a.distance) - parseFloat(b.distance));
      } else if (sortBy === "name") {
        results.sort((a, b) => a.name.localeCompare(b.name));
      } else {
        // default: halal first, then named
        results.sort((a, b) => {
          if (a.isHalal && !b.isHalal) return -1;
          if (!a.isHalal && b.isHalal) return 1;
          return 0;
        });
      }

      // Save search
      await storage.saveSearch({
        city,
        genre,
        diningStyle,
        groupSize: Number(groupSize),
        priceRange: priceRange || "all",
        halal: Boolean(halal),
        openNow: Boolean(openNow),
        resultsJson: JSON.stringify(results),
      });

      res.json({ results, source: "openstreetmap", total: results.length });
    } catch (err: any) {
      console.error("Overpass error:", err.message);
      res.status(500).json({ error: "Could not fetch data from OpenStreetMap. Try again in a moment.", results: [] });
    }
  });

  app.get("/api/recent", async (_req, res) => {
    const recent = await storage.getRecentSearches(6);
    res.json(recent);
  });
}
