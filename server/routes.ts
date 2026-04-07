import type { Express } from "express";
import type { Server } from "http";
import axios from "axios";
import { storage } from "./storage";
import { CITY_BBOXES, CUISINE_GENRES, DINING_STYLES } from "@shared/schema";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const YELP_BASE   = "https://api.yelp.com/v3";

// ═══════════════════════════════════════════════════════════════════════════════
// OVERPASS (OpenStreetMap) — free, no API key
// ═══════════════════════════════════════════════════════════════════════════════

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

  if (halal && !cuisineOsm) {
    return `[out:json][timeout:25];(
      node["amenity"~"${amenityRegex}"]["diet:halal"="yes"](${bboxStr});
      way["amenity"~"${amenityRegex}"]["diet:halal"="yes"](${bboxStr});
    );out center 40;`;
  }

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

  const addressParts = [tags["addr:housenumber"], tags["addr:street"], tags["addr:city"]].filter(Boolean);
  const address = addressParts.length ? addressParts.join(" ") : tags["addr:full"] || "";

  let distance = "";
  if (centerLat && centerLon && lat && lon) {
    const R = 3958.8;
    const dLat = ((lat - centerLat) * Math.PI) / 180;
    const dLon = ((lon - centerLon) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos((centerLat * Math.PI) / 180) * Math.cos((lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
    distance = (R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(1) + " mi";
  }

  const isHalal = tags["diet:halal"] === "yes" ||
    (tags.name || "").toLowerCase().includes("halal") ||
    (tags.cuisine || "").toLowerCase().includes("halal");

  const openingHours = tags["opening_hours"] || "";
  const isOpen = openingHours ? checkOpenNow(openingHours) : null;

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
    lat, lon, distance,
    imageUrl: "",
    mapsLink,
    source: "osm" as const,
    // Yelp-specific fields (empty for OSM)
    rating: 0,
    reviewCount: 0,
    price: "",
    yelpUrl: "",
  };
}

function checkOpenNow(hoursStr: string): boolean | null {
  try {
    const now = new Date();
    const day = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"][now.getDay()];
    const timeNow = now.getHours() * 60 + now.getMinutes();
    if (hoursStr.trim() === "24/7") return true;
    const segments = hoursStr.split(";").map(s => s.trim());
    for (const seg of segments) {
      const match = seg.match(/^([\w,\-]+)\s+(\d+:\d+)-(\d+:\d+)/);
      if (!match) continue;
      const [, daysPart, open, close] = match;
      const dayRanges = daysPart.split(",");
      let dayMatches = false;
      for (const dr of dayRanges) {
        if (dr.includes("-")) {
          const days = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
          const [sd, ed] = dr.split("-");
          const si = days.indexOf(sd), ei = days.indexOf(ed), ci = days.indexOf(day);
          if (si !== -1 && ei !== -1 && ci !== -1 && ci >= si && ci <= ei) dayMatches = true;
        } else if (dr === day) dayMatches = true;
      }
      if (dayMatches) {
        const [oh, om] = open.split(":").map(Number);
        const [ch, cm] = close.split(":").map(Number);
        return timeNow >= oh * 60 + om && timeNow <= ch * 60 + cm;
      }
    }
    return null;
  } catch { return null; }
}

async function searchOverpass(params: any) {
  const { city, genre, diningStyle, halal, openNow, sortBy, userLat, userLon } = params;

  const bbox = CITY_BBOXES[city];
  if (!bbox) throw new Error("Unknown city");

  const genreConfig  = CUISINE_GENRES.find(g => g.id === genre);
  const diningConfig = DINING_STYLES.find(d => d.id === diningStyle);
  const cuisineOsm   = genreConfig?.osm || "";
  const amenityTypes  = diningConfig?.osm || ["restaurant"];

  const query = buildOverpassQuery(bbox, amenityTypes, cuisineOsm, Boolean(halal));
  const response = await axios.post(OVERPASS_URL, `data=${encodeURIComponent(query)}`, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    timeout: 28000,
  });

  const centerLat = (bbox[0] + bbox[2]) / 2;
  const centerLon = (bbox[1] + bbox[3]) / 2;
  const refLat = userLat ? Number(userLat) : centerLat;
  const refLon = userLon ? Number(userLon) : centerLon;

  let results = (response.data.elements || [])
    .filter((el: any) => el.tags?.name)
    .map((el: any) => osmToRestaurant(el, refLat, refLon));

  // Dedupe
  const seen = new Set<string>();
  results = results.filter((r: any) => { if (seen.has(r.name)) return false; seen.add(r.name); return true; });

  if (openNow) results = results.filter((r: any) => r.isOpen === true);

  if (sortBy === "distance") results.sort((a: any, b: any) => parseFloat(a.distance) - parseFloat(b.distance));
  else if (sortBy === "name") results.sort((a: any, b: any) => a.name.localeCompare(b.name));
  else results.sort((a: any, b: any) => (a.isHalal === b.isHalal ? 0 : a.isHalal ? -1 : 1));

  return results;
}

// ═══════════════════════════════════════════════════════════════════════════════
// YELP FUSION API — requires API key, richer data
// ═══════════════════════════════════════════════════════════════════════════════

async function searchYelp(params: any, apiKey: string) {
  const { city, genre, diningStyle, halal, priceRange, openNow, sortBy, groupSize } = params;

  const genreConfig  = CUISINE_GENRES.find(g => g.id === genre);
  const diningConfig = DINING_STYLES.find(d => d.id === diningStyle);

  // Build categories string
  let categories = genreConfig?.yelp || "";
  if (halal) {
    categories = categories ? `${categories},halal` : "halal";
  }
  // Add dining style category
  const diningCat = diningConfig?.yelp || "restaurants";
  if (diningStyle === "food_trucks") {
    categories = `foodtrucks${categories ? "," + categories : ""}`;
  }

  const yelpParams: Record<string, string | number> = {
    location: city,
    limit: 20,
    sort_by: sortBy === "distance" ? "distance" : sortBy === "rating" ? "rating" : "best_match",
  };

  if (categories) yelpParams.categories = categories;
  if (!categories) yelpParams.term = diningCat;

  // Price filter — Yelp uses "1,2,3,4"
  if (priceRange && priceRange !== "all") {
    yelpParams.price = priceRange;
  }

  // Open now
  if (openNow) yelpParams.open_now = 1;

  // Group-friendly
  if (groupSize && Number(groupSize) >= 6) {
    yelpParams.attributes = "good_for_groups";
  }

  const response = await axios.get(`${YELP_BASE}/businesses/search`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    params: yelpParams,
    timeout: 15000,
  });

  return (response.data.businesses || []).map((b: any) => {
    const catNames = b.categories?.map((c: any) => c.title) || [];
    const isHalal = catNames.some((c: string) => c.toLowerCase().includes("halal")) ||
      (b.name || "").toLowerCase().includes("halal");

    const mapsLink = b.coordinates?.latitude && b.coordinates?.longitude
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.name)}+${b.coordinates.latitude},${b.coordinates.longitude}`
      : "";

    return {
      id: b.id,
      name: b.name,
      cuisine: catNames.join(", "),
      amenity: "",
      address: b.location?.display_address?.join(", ") || "",
      phone: b.display_phone || "",
      website: "",
      openingHours: "",
      isOpen: !b.is_closed,
      isHalal,
      isVegetarian: false,
      isVegan: false,
      lat: b.coordinates?.latitude || 0,
      lon: b.coordinates?.longitude || 0,
      distance: b.distance ? (b.distance * 0.000621371).toFixed(1) + " mi" : "",
      imageUrl: b.image_url || "",
      mapsLink,
      source: "yelp" as const,
      rating: b.rating || 0,
      reviewCount: b.review_count || 0,
      price: b.price || "",
      yelpUrl: b.url || "",
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

export function registerRoutes(httpServer: Server, app: Express) {

  // Main search — supports both OSM and Yelp
  app.post("/api/search", async (req, res) => {
    const { city, genre, diningStyle, groupSize, priceRange, halal, openNow,
            sortBy, userLat, userLon, dataSource, yelpApiKey } = req.body;

    if (!city || !genre || !diningStyle) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const source = dataSource || "osm";
    // Resolve Yelp key: request body > server env var
    const resolvedYelpKey = yelpApiKey || process.env.YELP_API_KEY || "";

    try {
      let results: any[];

      if (source === "yelp") {
        if (!resolvedYelpKey) {
          return res.status(400).json({
            error: "Yelp API key is required. Paste it in Settings or set YELP_API_KEY env variable.",
            results: [],
          });
        }
        results = await searchYelp(req.body, resolvedYelpKey);
      } else {
        results = await searchOverpass(req.body);
      }

      // Save search
      await storage.saveSearch({
        city, genre, diningStyle,
        groupSize: Number(groupSize),
        priceRange: priceRange || "all",
        halal: Boolean(halal),
        openNow: Boolean(openNow),
        dataSource: source,
        resultsJson: JSON.stringify(results),
      });

      res.json({ results, source, total: results.length });
    } catch (err: any) {
      console.error(`${source} error:`, err?.response?.data || err.message);

      // If Yelp fails, give a clear message
      if (source === "yelp" && err?.response?.status === 401) {
        return res.status(401).json({ error: "Invalid Yelp API key. Check your key and try again.", results: [] });
      }
      if (source === "yelp" && err?.response?.status === 429) {
        return res.status(429).json({ error: "Yelp rate limit reached. Try again later or switch to OpenStreetMap.", results: [] });
      }

      res.status(500).json({
        error: source === "yelp"
          ? "Yelp API error. Check your key or switch to OpenStreetMap."
          : "Could not fetch data from OpenStreetMap. Try again in a moment.",
        results: [],
      });
    }
  });

  // Validate Yelp API key
  app.post("/api/validate-yelp-key", async (req, res) => {
    const { yelpApiKey } = req.body;
    if (!yelpApiKey) return res.json({ valid: false, error: "No key provided" });

    try {
      await axios.get(`${YELP_BASE}/businesses/search`, {
        headers: { Authorization: `Bearer ${yelpApiKey}` },
        params: { location: "Dearborn, MI", limit: 1 },
        timeout: 8000,
      });
      res.json({ valid: true });
    } catch (err: any) {
      res.json({ valid: false, error: err?.response?.status === 401 ? "Invalid API key" : "Connection error" });
    }
  });

  app.get("/api/recent", async (_req, res) => {
    const recent = await storage.getRecentSearches(6);
    res.json(recent);
  });
}
