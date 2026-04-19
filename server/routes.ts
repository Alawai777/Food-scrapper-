import type { Express } from "express";
import type { Server } from "http";
import axios from "axios";
import { storage } from "./storage";
import { CITY_BBOXES, CUISINE_GENRES, DINING_STYLES } from "@shared/schema";

// Multiple public Overpass API instances — tried in order, next is used on failure
const OVERPASS_INSTANCES = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.ru/cgi/interpreter",
];
const YELP_BASE   = "https://api.yelp.com/v3";
const GOOGLE_PLACES_BASE = "https://places.googleapis.com/v1";

// Cached Google API key for proxying photo requests (set during search)
let cachedGoogleApiKey = "";

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
          if (si !== -1 && ei !== -1 && ci !== -1) {
            if (si <= ei) {
              if (ci >= si && ci <= ei) dayMatches = true;
            } else {
              // Wrapping range (e.g. "Fr-Mo" means Fr, Sa, Su, Mo)
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

async function searchOverpass(params: any) {
  const { city, genre, diningStyle, halal, openNow, sortBy, userLat, userLon } = params;

  const bbox = CITY_BBOXES[city];
  if (!bbox) throw new Error("Unknown city");

  const genreConfig  = CUISINE_GENRES.find(g => g.id === genre);
  const diningConfig = DINING_STYLES.find(d => d.id === diningStyle);
  const cuisineOsm   = genreConfig?.osm || "";
  const amenityTypes  = diningConfig?.osm || ["restaurant"];

  const query = buildOverpassQuery(bbox, amenityTypes, cuisineOsm, Boolean(halal));

  // Try each Overpass instance in turn; fall back to the next on network errors,
  // rate-limiting (HTTP 429), or a runtime error embedded in a 200 response.
  let response: any = null;
  let lastError: any = null;
  for (const url of OVERPASS_INSTANCES) {
    try {
      const res = await axios.post(url, `data=${encodeURIComponent(query)}`, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        timeout: 30000,
      });

      // Overpass may return HTTP 200 with a remark indicating a runtime error
      // (e.g. "Query timeout after 25 seconds" or server-overload messages).
      const remark: string = res.data?.remark || "";
      if (remark && !Array.isArray(res.data?.elements)) {
        lastError = new Error(`Overpass: ${remark}`);
        continue; // try next instance
      }

      response = res;
      break;
    } catch (err: any) {
      lastError = err;
      // Only retry on transient/network errors or rate-limiting
      const status = err?.response?.status;
      const code   = err?.code || "";
      const isRetryable =
        status === 429 || status === 503 || status === 504 ||
        code === "ECONNREFUSED" || code === "ENOTFOUND" ||
        code === "ETIMEDOUT"   || code === "ECONNRESET" ||
        (err?.message || "").toLowerCase().includes("timeout");
      if (isRetryable) continue;
      break; // non-retryable error — don't try remaining instances
    }
  }

  if (!response) {
    // Re-throw so the route's catch block can surface a useful message
    throw lastError || new Error("All Overpass instances failed");
  }

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

async function searchGoogle(params: any, apiKey: string) {
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
  const body: any = {
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

  return places.map((p: any) => {
    const lat = p.location?.latitude || 0;
    const lon = p.location?.longitude || 0;

    // Distance
    let distance = "";
    if (refLat && refLon && lat && lon) {
      const R = 3958.8;
      const dLat = ((lat - refLat) * Math.PI) / 180;
      const dLon = ((lon - refLon) * Math.PI) / 180;
      const a = Math.sin(dLat / 2) ** 2 +
        Math.cos((refLat * Math.PI) / 180) * Math.cos((lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
      distance = (R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(1) + " mi";
    }

    // Photo URL — proxy through server to avoid exposing API key
    let imageUrl = "";
    if (p.photos?.length > 0) {
      const photoName = p.photos[0].name; // e.g. "places/xxx/photos/yyy"
      imageUrl = `/api/google-photo?ref=${encodeURIComponent(photoName)}`;
    }

    // Detect halal from name or types
    const nameStr = p.displayName?.text || "";
    const typesStr = (p.types || []).join(" ");
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
      cuisine: p.primaryTypeDisplayName?.text || (p.types || []).slice(0, 3).join(", ").replace(/_/g, " "),
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
      price: GOOGLE_PRICE_MAP[p.priceLevel] || "",
      yelpUrl: "",
      googleMapsUrl: p.googleMapsUri || "",
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

export function registerRoutes(httpServer: Server, app: Express) {

  // Main search — supports OSM, Yelp, and Google
  app.post("/api/search", async (req, res) => {
    const { city, genre, diningStyle, groupSize, priceRange, halal, openNow,
            sortBy, userLat, userLon, dataSource, yelpApiKey, googleApiKey } = req.body;

    if (!city || !genre || !diningStyle) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const source = dataSource || "osm";
    // Env vars take priority — if the server has a key, never use the one from
    // the request body (prevents the key from being transmitted over the network
    // when it is already securely configured on the server).
    const resolvedYelpKey   = process.env.YELP_API_KEY   || yelpApiKey   || "";
    const resolvedGoogleKey = process.env.GOOGLE_MAPS_API_KEY || googleApiKey || "";

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
      } else if (source === "google") {
        if (!resolvedGoogleKey) {
          return res.status(400).json({
            error: "Google Maps API key is required. Paste it in Settings or set GOOGLE_MAPS_API_KEY env variable.",
            results: [],
          });
        }
        results = await searchGoogle(req.body, resolvedGoogleKey);
        // Cache the key for photo proxy requests
        cachedGoogleApiKey = resolvedGoogleKey;
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

      // Return HTTP 200 with an error field so the client's onSuccess handler
      // can display the specific message (non-200 responses are thrown by
      // throwIfResNotOk before the JSON body is read, showing only a generic
      // "Connection error" to the user).
      const errMsg = (err?.message || "").toLowerCase();
      const status = err?.response?.status;

      if (source === "yelp" && status === 401) {
        return res.json({ error: "Invalid Yelp API key. Check your key and try again.", results: [] });
      }
      if (source === "yelp" && status === 429) {
        return res.json({ error: "Yelp rate limit reached. Try again later or switch to OpenStreetMap.", results: [] });
      }
      if (source === "google" && status === 403) {
        return res.json({ error: "Google API key invalid or Places API not enabled. Check your key in Google Cloud Console.", results: [] });
      }
      if (source === "google" && status === 429) {
        return res.json({ error: "Google API rate limit reached. Try again later.", results: [] });
      }
      if (source === "osm" && (status === 429 || errMsg.includes("rate limit"))) {
        return res.json({ error: "OpenStreetMap is temporarily busy. Please wait a moment and try again.", results: [] });
      }
      if (source === "osm" && errMsg.includes("timeout")) {
        return res.json({ error: "OpenStreetMap query timed out. Try a more specific cuisine or a smaller city.", results: [] });
      }

      const errorMessages: Record<string, string> = {
        yelp: "Yelp API error. Check your key or switch to OpenStreetMap.",
        google: "Google Places API error. Check your key or switch to OpenStreetMap.",
        osm: "Could not fetch data from OpenStreetMap. Try again in a moment.",
      };
      res.json({ error: errorMessages[source] || "Search error.", results: [] });
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
    } catch (err: any) {
      const status = err?.response?.status;
      const msg = status === 403 ? "API key invalid or Places API (New) not enabled" :
                  status === 400 ? "Places API not enabled for this key" :
                  "Connection error";
      res.json({ valid: false, error: msg });
    }
  });

  // Tells the client which API keys are already configured server-side.
  // Returns boolean flags only — the actual key values are never exposed.
  app.get("/api/server-config", (_req, res) => {
    res.json({
      hasYelpKey:   Boolean(process.env.YELP_API_KEY),
      hasGoogleKey: Boolean(process.env.GOOGLE_MAPS_API_KEY),
    });
  });

  app.get("/api/recent", async (_req, res) => {
    const recent = await storage.getRecentSearches(6);
    res.json(recent);
  });

  // Proxy Google Places photos to avoid exposing API key to the client
  app.get("/api/google-photo", async (req, res) => {
    const photoRef = req.query.ref as string;
    const apiKey = cachedGoogleApiKey || process.env.GOOGLE_MAPS_API_KEY || "";

    if (!photoRef) {
      return res.status(400).json({ error: "Missing photo reference" });
    }
    // Validate photo reference format to prevent SSRF (e.g. "places/abc123/photos/xyz456")
    if (!/^places\/[\w-]+\/photos\/[\w-]+$/.test(photoRef)) {
      return res.status(400).json({ error: "Invalid photo reference format" });
    }
    if (!apiKey) {
      return res.status(400).json({ error: "Missing Google API key" });
    }

    try {
      const photoUrl = `${GOOGLE_PLACES_BASE}/${photoRef}/media?key=${apiKey}&maxWidthPx=600&maxHeightPx=400`;
      const response = await axios.get(photoUrl, {
        responseType: "arraybuffer",
        timeout: 10000,
        maxRedirects: 5,
      });
      const contentType = response.headers["content-type"] || "image/jpeg";
      res.set("Content-Type", contentType);
      res.set("Cache-Control", "public, max-age=86400");
      res.send(Buffer.from(response.data));
    } catch {
      res.status(502).json({ error: "Failed to fetch photo" });
    }
  });
}
