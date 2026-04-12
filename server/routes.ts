import type { Express, Request, Response } from "express";
import type { Server } from "http";
import axios from "axios";
import { storage } from "./storage";
import { CITY_BBOXES, CUISINE_GENRES, DINING_STYLES } from "@shared/schema";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const YELP_BASE   = "https://api.yelp.com/v3";
const GOOGLE_PLACES_BASE = "https://places.googleapis.com/v1";

// ═══════════════════════════════════════════════════════════════════════════════
// SHARED TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface Restaurant {
  id: string;
  name: string;
  cuisine: string;
  amenity: string;
  address: string;
  phone: string;
  website: string;
  openingHours: string;
  isOpen: boolean | null;
  isHalal: boolean;
  isVegetarian: boolean;
  isVegan: boolean;
  lat: number;
  lon: number;
  distance: string;
  imageUrl: string;
  mapsLink: string;
  source: "osm" | "yelp" | "google";
  rating: number;
  reviewCount: number;
  price: string;
  yelpUrl: string;
  googleMapsUrl?: string;
}

interface SearchParams {
  city: string;
  genre: string;
  diningStyle: string;
  halal: boolean;
  openNow: boolean;
  sortBy?: string;
  userLat?: string | number;
  userLon?: string | number;
  priceRange?: string;
  groupSize?: string | number;
  dataSource?: string;
  yelpApiKey?: string;
  googleApiKey?: string;
}

interface OsmElement {
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface YelpBusiness {
  id: string;
  name: string;
  categories?: Array<{ alias: string; title: string }>;
  location?: { display_address?: string[] };
  display_phone?: string;
  coordinates?: { latitude: number; longitude: number };
  distance?: number;
  image_url?: string;
  rating?: number;
  review_count?: number;
  price?: string;
  url?: string;
  is_closed?: boolean;
}

interface GooglePlace {
  id?: string;
  displayName?: { text: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  currentOpeningHours?: {
    openNow?: boolean;
    weekdayDescriptions?: string[];
  };
  nationalPhoneNumber?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  photos?: Array<{ name: string }>;
  types?: string[];
  primaryTypeDisplayName?: { text: string };
  servesVegetarianFood?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HAVERSINE DISTANCE — shared utility
// ═══════════════════════════════════════════════════════════════════════════════

function haversineDistanceMiles(
  lat1: number, lon1: number, lat2: number, lon2: number
): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(
  lat: number, lon: number, refLat: number, refLon: number
): string {
  if (!refLat || !refLon || !lat || !lon) return "";
  return haversineDistanceMiles(refLat, refLon, lat, lon).toFixed(1) + " mi";
}

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
    );out center 40;`;
  }

  return `[out:json][timeout:25];(
    node["amenity"~"${amenityRegex}"]${cuisineFilter}${halalFilter}(${bboxStr});
    way["amenity"~"${amenityRegex}"]${cuisineFilter}${halalFilter}(${bboxStr});
  );out center 40;`;
}

function osmToRestaurant(el: OsmElement, centerLat?: number, centerLon?: number): Restaurant {
  const tags = el.tags || {};
  const lat = el.lat ?? el.center?.lat ?? 0;
  const lon = el.lon ?? el.center?.lon ?? 0;

  const addressParts = [tags["addr:housenumber"], tags["addr:street"], tags["addr:city"]].filter(Boolean);
  const address = addressParts.length ? addressParts.join(" ") : tags["addr:full"] || "";

  const distance = formatDistance(lat, lon, centerLat || 0, centerLon || 0);

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
          if (si !== -1 && ei !== -1 && ci !== -1) {
            // Handle ranges that wrap around the week (e.g., Fr-Mo = Fr,Sa,Su,Mo)
            if (si <= ei) {
              if (ci >= si && ci <= ei) dayMatches = true;
            } else {
              if (ci >= si || ci <= ei) dayMatches = true;
            }
          }
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

async function searchOverpass(params: SearchParams): Promise<Restaurant[]> {
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

  let results: Restaurant[] = (response.data.elements || [])
    .filter((el: OsmElement) => el.tags?.name)
    .map((el: OsmElement) => osmToRestaurant(el, refLat, refLon));

  // Dedupe
  const seen = new Set<string>();
  results = results.filter((r) => { if (seen.has(r.name)) return false; seen.add(r.name); return true; });

  if (openNow) results = results.filter((r) => r.isOpen === true);

  if (sortBy === "distance") results.sort((a, b) => parseFloat(a.distance) - parseFloat(b.distance));
  else if (sortBy === "name") results.sort((a, b) => a.name.localeCompare(b.name));
  else results.sort((a, b) => (a.isHalal === b.isHalal ? 0 : a.isHalal ? -1 : 1));

  return results;
}

// ═══════════════════════════════════════════════════════════════════════════════
// YELP FUSION API — requires API key, richer data
// ═══════════════════════════════════════════════════════════════════════════════

async function searchYelp(params: SearchParams, apiKey: string): Promise<Restaurant[]> {
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

  return (response.data.businesses || []).map((b: YelpBusiness): Restaurant => {
    const catNames = b.categories?.map((c) => c.title) || [];
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
// GOOGLE MAPS PLACES API (New) — requires API key, rich data
// ═══════════════════════════════════════════════════════════════════════════════

const GOOGLE_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.rating",
  "places.userRatingCount",
  "places.priceLevel",
  "places.currentOpeningHours",
  "places.nationalPhoneNumber",
  "places.websiteUri",
  "places.googleMapsUri",
  "places.photos",
  "places.types",
  "places.primaryTypeDisplayName",
  "places.takeout",
  "places.delivery",
  "places.dineIn",
  "places.servesVegetarianFood",
  "places.goodForGroups",
].join(",");

const GOOGLE_PRICE_MAP: Record<string, string> = {
  PRICE_LEVEL_FREE: "",
  PRICE_LEVEL_INEXPENSIVE: "$",
  PRICE_LEVEL_MODERATE: "$$",
  PRICE_LEVEL_EXPENSIVE: "$$$",
  PRICE_LEVEL_VERY_EXPENSIVE: "$$$$",
};

async function searchGoogle(params: SearchParams, apiKey: string): Promise<Restaurant[]> {
  const { city, genre, diningStyle, halal, priceRange, openNow, sortBy, userLat, userLon } = params;

  const genreConfig  = CUISINE_GENRES.find(g => g.id === genre);
  const bbox = CITY_BBOXES[city];
  if (!bbox) throw new Error("Unknown city");

  const centerLat = (bbox[0] + bbox[2]) / 2;
  const centerLon = (bbox[1] + bbox[3]) / 2;

  // Build the text query
  const cuisineText = genreConfig?.google || "";
  const halalText = halal ? "halal" : "";
  const queryParts = [halalText, cuisineText, "in", city].filter(Boolean);
  const textQuery = queryParts.join(" ") || `restaurants in ${city}`;

  // Build request body for Text Search (New)
  const body: Record<string, unknown> = {
    textQuery,
    maxResultCount: 20,
    locationBias: {
      circle: {
        center: { latitude: centerLat, longitude: centerLon },
        radius: 8000, // ~5 miles
      },
    },
  };

  // Price filter
  if (priceRange && priceRange !== "all") {
    const levels = priceRange.split(",").map((p: string) => {
      const map: Record<string, string> = {
        "1": "PRICE_LEVEL_INEXPENSIVE",
        "2": "PRICE_LEVEL_MODERATE",
        "3": "PRICE_LEVEL_EXPENSIVE",
        "4": "PRICE_LEVEL_VERY_EXPENSIVE",
      };
      return map[p];
    }).filter(Boolean);
    if (levels.length) body.priceLevels = levels;
  }

  // Open now
  if (openNow) body.openNow = true;

  const response = await axios.post(
    `${GOOGLE_PLACES_BASE}/places:searchText`,
    body,
    {
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": GOOGLE_FIELD_MASK,
      },
      timeout: 15000,
    }
  );

  const places = response.data.places || [];
  const refLat = userLat ? Number(userLat) : centerLat;
  const refLon = userLon ? Number(userLon) : centerLon;

  return places.map((p: GooglePlace): Restaurant => {
    const lat = p.location?.latitude || 0;
    const lon = p.location?.longitude || 0;

    // Distance — use shared utility
    const distance = formatDistance(lat, lon, refLat, refLon);

    // Photo URL — use server-side proxy to avoid exposing API key
    let imageUrl = "";
    if (p.photos?.length && p.photos.length > 0) {
      const photoName = p.photos[0].name; // e.g. "places/xxx/photos/yyy"
      imageUrl = `/api/google-photo?ref=${encodeURIComponent(photoName)}`;
    }

    // Detect halal from name or types
    const nameStr = p.displayName?.text || "";
    const typesArr = p.types || [];
    const typesStr = typesArr.join(" ");
    const isHalal = halal || nameStr.toLowerCase().includes("halal") || typesStr.includes("halal");

    // Opening hours
    let openingHours = "";
    if (p.currentOpeningHours?.weekdayDescriptions) {
      const today = new Date().getDay();
      // Google returns Mon=0 index, JS getDay Sun=0
      const gIdx = today === 0 ? 6 : today - 1;
      openingHours = p.currentOpeningHours.weekdayDescriptions[gIdx] || "";
    }

    const mapsLink = p.googleMapsUri || (lat && lon
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(nameStr)}+${lat},${lon}`
      : "");

    return {
      id: p.id || String(Math.random()),
      name: nameStr,
      cuisine: p.primaryTypeDisplayName?.text || typesArr.slice(0, 3).join(", ").replace(/_/g, " "),
      amenity: "",
      address: p.formattedAddress || "",
      phone: p.nationalPhoneNumber || "",
      website: p.websiteUri || "",
      openingHours,
      isOpen: p.currentOpeningHours?.openNow ?? null,
      isHalal,
      isVegetarian: p.servesVegetarianFood || false,
      isVegan: false,
      lat, lon, distance,
      imageUrl,
      mapsLink,
      source: "google" as const,
      rating: p.rating || 0,
      reviewCount: p.userRatingCount || 0,
      price: (p.priceLevel && GOOGLE_PRICE_MAP[p.priceLevel]) || "",
      yelpUrl: "",
      googleMapsUrl: p.googleMapsUri || "",
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// Track the last Google API key used so the photo proxy can access it
let lastGoogleApiKey = "";

export function registerRoutes(httpServer: Server, app: Express) {

  // Main search — supports OSM, Yelp, and Google
  app.post("/api/search", async (req, res) => {
    const { city, genre, diningStyle, groupSize, priceRange, halal, openNow,
            sortBy, userLat, userLon, dataSource, yelpApiKey, googleApiKey } = req.body;

    if (!city || !genre || !diningStyle) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const source = dataSource || "osm";
    // Resolve keys: request body > server env var
    const resolvedYelpKey   = yelpApiKey   || process.env.YELP_API_KEY   || "";
    const resolvedGoogleKey = googleApiKey || process.env.GOOGLE_MAPS_API_KEY || "";

    // Store for photo proxy
    if (resolvedGoogleKey) lastGoogleApiKey = resolvedGoogleKey;

    try {
      let results: Restaurant[];

      if (source === "yelp") {
        if (!resolvedYelpKey) {
          return res.status(400).json({
            error: "Yelp API key is required. Paste it in Settings or set YELP_API_KEY env variable.",
            results: [],
          });
        }
        results = await searchYelp(req.body, resolvedYelpKey);
      } else if (source === "google") {
        if (!resolvedGoogleKey) {
          return res.status(400).json({
            error: "Google Maps API key is required. Paste it in Settings or set GOOGLE_MAPS_API_KEY env variable.",
            results: [],
          });
        }
        results = await searchGoogle(req.body, resolvedGoogleKey);
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
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: unknown; status?: number }; message?: string };
      console.error(`${source} error:`, axiosErr?.response?.data || (err instanceof Error ? err.message : err));

      // Source-specific error handling
      if (source === "yelp" && axiosErr?.response?.status === 401) {
        return res.status(401).json({ error: "Invalid Yelp API key. Check your key and try again.", results: [] });
      }
      if (source === "yelp" && axiosErr?.response?.status === 429) {
        return res.status(429).json({ error: "Yelp rate limit reached. Try again later or switch to OpenStreetMap.", results: [] });
      }
      if (source === "google" && axiosErr?.response?.status === 403) {
        return res.status(403).json({ error: "Google API key invalid or Places API not enabled. Check your key in Google Cloud Console.", results: [] });
      }
      if (source === "google" && axiosErr?.response?.status === 429) {
        return res.status(429).json({ error: "Google API rate limit reached. Try again later.", results: [] });
      }

      const errorMessages: Record<string, string> = {
        yelp: "Yelp API error. Check your key or switch to OpenStreetMap.",
        google: "Google Places API error. Check your key or switch to OpenStreetMap.",
        osm: "Could not fetch data from OpenStreetMap. Try again in a moment.",
      };
      res.status(500).json({ error: errorMessages[source] || "Search error.", results: [] });
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
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number } };
      res.json({ valid: false, error: axiosErr?.response?.status === 401 ? "Invalid API key" : "Connection error" });
    }
  });

  // Validate Google Maps API key
  app.post("/api/validate-google-key", async (req, res) => {
    const { googleApiKey } = req.body;
    if (!googleApiKey) return res.json({ valid: false, error: "No key provided" });

    try {
      await axios.post(
        `${GOOGLE_PLACES_BASE}/places:searchText`,
        { textQuery: "restaurant in Dearborn MI", maxResultCount: 1 },
        {
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": googleApiKey,
            "X-Goog-FieldMask": "places.id",
          },
          timeout: 8000,
        }
      );
      res.json({ valid: true });
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number } };
      const status = axiosErr?.response?.status;
      const msg = status === 403 ? "API key invalid or Places API (New) not enabled" :
                  status === 400 ? "Places API not enabled for this key" :
                  "Connection error";
      res.json({ valid: false, error: msg });
    }
  });

  app.get("/api/recent", async (_req, res) => {
    const recent = await storage.getRecentSearches(6);
    res.json(recent);
  });

  // Google photo proxy — serves photos without exposing the API key to the client
  app.get("/api/google-photo", async (req: Request, res: Response) => {
    const ref = req.query.ref as string;
    if (!ref) {
      return res.status(400).json({ error: "Missing ref parameter" });
    }

    // Validate ref format to prevent SSRF: must match "places/<id>/photos/<id>"
    if (!/^places\/[\w-]+\/photos\/[\w-]+$/.test(ref)) {
      return res.status(400).json({ error: "Invalid photo reference format" });
    }

    const apiKey = lastGoogleApiKey || process.env.GOOGLE_MAPS_API_KEY || "";
    if (!apiKey) {
      return res.status(400).json({ error: "No Google API key configured" });
    }

    try {
      const photoUrl = `${GOOGLE_PLACES_BASE}/${ref}/media?key=${apiKey}&maxWidthPx=600&maxHeightPx=400`;
      const photoRes = await axios.get(photoUrl, {
        responseType: "arraybuffer",
        timeout: 10000,
        maxRedirects: 5,
      });

      const contentType = photoRes.headers["content-type"] || "image/jpeg";
      res.set("Content-Type", contentType);
      res.set("Cache-Control", "public, max-age=86400"); // Cache for 24h
      res.send(Buffer.from(photoRes.data));
    } catch {
      res.status(502).json({ error: "Failed to fetch photo" });
    }
  });
}
