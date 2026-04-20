/**
 * Client-side API module — calls external APIs directly from the browser
 * so the app can run as a static site (GitHub Pages) without a backend server.
 *
 * Data sources:
 *  - OpenStreetMap (Overpass API) — free, no key, full CORS support
 *  - Google Maps Places (New)      — needs API key, supports CORS
 *  - Yelp Fusion                   — needs API key, NO browser CORS support
 *                                    → uses corsproxy.io as a thin relay
 */

import {
  CITY_BBOXES,
  CUISINE_GENRES,
  DINING_STYLES,
} from "@shared/schema";

// ── Types ───────────────────────────────────────────────────────────────────

export interface Restaurant {
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
  mapsLink: string;
  imageUrl: string;
  source: "osm" | "yelp" | "google";
  rating: number;
  reviewCount: number;
  price: string;
  yelpUrl: string;
  googleMapsUrl?: string;
}

export interface SearchParams {
  city: string;
  genre: string;
  diningStyle: string;
  groupSize: number;
  priceRange: string;
  halal: boolean;
  openNow: boolean;
  sortBy?: string;
  userLat?: number | null;
  userLon?: number | null;
  dataSource: "osm" | "yelp" | "google";
  yelpApiKey?: string;
  googleApiKey?: string;
}

export interface SearchResult {
  results: Restaurant[];
  source: string;
  total: number;
  error?: string;
  checksPerSearch?: number;
  endpoint?: string;
}

export interface ServerKeyStatus {
  yelpConfigured: boolean;
  googleConfigured: boolean;
}

const YELP_KEY_ERROR_PATTERN = /(api key|yelp_api_key|yelp key|key is required)/i;

// ── Internal types ──────────────────────────────────────────────────────────

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

// ── Helpers ─────────────────────────────────────────────────────────────────

const OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.ru/api/interpreter",
];
const YELP_BASE = "https://api.yelp.com/v3";
const GOOGLE_PLACES_BASE = "https://places.googleapis.com/v1";
const CORS_PROXY = "https://corsproxy.io/?url=";

function haversineDistanceMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 3958.8;
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
  lat: number,
  lon: number,
  refLat: number,
  refLon: number,
): string {
  if (!refLat || !refLon || !lat || !lon) return "";
  return haversineDistanceMiles(refLat, refLon, lat, lon).toFixed(1) + " mi";
}

function checkOpenNow(hoursStr: string): boolean | null {
  try {
    const now = new Date();
    const day = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"][now.getDay()];
    const timeNow = now.getHours() * 60 + now.getMinutes();
    if (hoursStr.trim() === "24/7") return true;
    const segments = hoursStr.split(";").map((s) => s.trim());
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
          const si = days.indexOf(sd),
            ei = days.indexOf(ed),
            ci = days.indexOf(day);
          if (si !== -1 && ei !== -1 && ci !== -1) {
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
  } catch (error) {
    console.warn("Backend Yelp search fallback unavailable.", error);
    return null;
  }
}

// ── Search History (localStorage) ───────────────────────────────────────────

const HISTORY_KEY = "yartedeats_searches";
const MAX_HISTORY = 20;

interface HistoryEntry {
  city: string;
  genre: string;
  diningStyle: string;
  dataSource: string;
  timestamp: number;
  resultCount: number;
}

export function saveSearchHistory(entry: Omit<HistoryEntry, "timestamp">) {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const history: HistoryEntry[] = raw ? JSON.parse(raw) : [];
    history.unshift({ ...entry, timestamp: Date.now() });
    if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    /* storage full or unavailable */
  }
}

export function getSearchHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// OVERPASS (OpenStreetMap) — free, full CORS
// ══════════════════════════════════════════════════════════════════════════════

function buildOverpassQuery(
  bbox: [number, number, number, number],
  amenityTypes: string[],
  cuisineOsm: string,
  halal: boolean,
): string {
  const [s, w, n, e] = bbox;
  const bboxStr = `${s},${w},${n},${e}`;
  const amenityRegex = amenityTypes.join("|");
  const cuisineFilter = cuisineOsm ? `["cuisine"~"${cuisineOsm}",i]` : "";
  const halalFilter = halal ? '["diet:halal"="yes"]' : "";

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

function osmToRestaurant(
  el: OsmElement,
  centerLat?: number,
  centerLon?: number,
): Restaurant {
  const tags = el.tags || {};
  const lat = el.lat ?? el.center?.lat ?? 0;
  const lon = el.lon ?? el.center?.lon ?? 0;

  const addressParts = [
    tags["addr:housenumber"],
    tags["addr:street"],
    tags["addr:city"],
  ].filter(Boolean);
  const address =
    addressParts.length > 0
      ? addressParts.join(" ")
      : tags["addr:full"] || "";

  const distance = formatDistance(lat, lon, centerLat || 0, centerLon || 0);

  const isHalal =
    tags["diet:halal"] === "yes" ||
    (tags.name || "").toLowerCase().includes("halal") ||
    (tags.cuisine || "").toLowerCase().includes("halal");

  const openingHours = tags["opening_hours"] || "";
  const isOpen = openingHours ? checkOpenNow(openingHours) : null;

  const mapsLink =
    lat && lon
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
    imageUrl: "",
    mapsLink,
    source: "osm" as const,
    rating: 0,
    reviewCount: 0,
    price: "",
    yelpUrl: "",
  };
}

async function searchOverpass(params: SearchParams): Promise<{
  results: Restaurant[];
  checks: number;
  endpoint: string;
}> {
  const { city, genre, diningStyle, halal, openNow, sortBy, userLat, userLon } =
    params;

  const bbox = CITY_BBOXES[city];
  if (!bbox) throw new Error("Unknown city");

  const genreConfig = CUISINE_GENRES.find((g) => g.id === genre);
  const diningConfig = DINING_STYLES.find((d) => d.id === diningStyle);
  const cuisineOsm = genreConfig?.osm || "";
  const amenityTypes = diningConfig?.osm || ["restaurant"];

  const query = buildOverpassQuery(bbox, amenityTypes, cuisineOsm, Boolean(halal));

  let checks = 0;
  let successfulEndpoint = "";
  let data: { elements?: OsmElement[] } | null = null;
  let lastError: unknown;

  for (const endpoint of OVERPASS_URLS) {
    checks += 1;
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
      });
      if (!response.ok) throw new Error(`Overpass error: ${response.status}`);
      data = await response.json();
      successfulEndpoint = endpoint;
      break;
    } catch (error) {
      lastError = error;
    }
  }

  if (!data) {
    throw new Error(
      `Overpass failed after ${checks} checks${
        lastError instanceof Error ? `: ${lastError.message}` : ""
      }`,
    );
  }

  const centerLat = (bbox[0] + bbox[2]) / 2;
  const centerLon = (bbox[1] + bbox[3]) / 2;
  const refLat = userLat ? Number(userLat) : centerLat;
  const refLon = userLon ? Number(userLon) : centerLon;

  let results: Restaurant[] = (data.elements || [])
    .filter((el: OsmElement) => el.tags?.name)
    .map((el: OsmElement) => osmToRestaurant(el, refLat, refLon));

  // Dedupe
  const seen = new Set<string>();
  results = results.filter((r) => {
    if (seen.has(r.name)) return false;
    seen.add(r.name);
    return true;
  });

  if (openNow) results = results.filter((r) => r.isOpen === true);

  if (sortBy === "distance")
    results.sort((a, b) => parseFloat(a.distance) - parseFloat(b.distance));
  else if (sortBy === "name")
    results.sort((a, b) => a.name.localeCompare(b.name));
  else
    results.sort((a, b) =>
      a.isHalal === b.isHalal ? 0 : a.isHalal ? -1 : 1,
    );

  return { results, checks, endpoint: successfulEndpoint };
}

// ══════════════════════════════════════════════════════════════════════════════
// YELP FUSION — needs API key, no browser CORS → use corsproxy.io
// ══════════════════════════════════════════════════════════════════════════════

async function searchYelp(
  params: SearchParams,
  apiKey: string,
): Promise<Restaurant[]> {
  const {
    city,
    genre,
    diningStyle,
    halal,
    priceRange,
    openNow,
    sortBy,
    groupSize,
  } = params;

  const genreConfig = CUISINE_GENRES.find((g) => g.id === genre);
  const diningConfig = DINING_STYLES.find((d) => d.id === diningStyle);

  let categories = genreConfig?.yelp || "";
  if (halal) {
    categories = categories ? `${categories},halal` : "halal";
  }
  const diningCat = diningConfig?.yelp || "restaurants";
  if (diningStyle === "food_trucks") {
    categories = `foodtrucks${categories ? "," + categories : ""}`;
  }

  const yelpParams: Record<string, string | number> = {
    location: city,
    limit: 20,
    sort_by:
      sortBy === "distance"
        ? "distance"
        : sortBy === "rating"
          ? "rating"
          : "best_match",
  };

  if (categories) yelpParams.categories = categories;
  if (!categories) yelpParams.term = diningCat;
  if (priceRange && priceRange !== "all") yelpParams.price = priceRange;
  if (openNow) yelpParams.open_now = 1;
  if (groupSize && Number(groupSize) >= 6)
    yelpParams.attributes = "good_for_groups";

  const qs = new URLSearchParams(
    Object.entries(yelpParams).map(([k, v]) => [k, String(v)]),
  ).toString();

  const targetUrl = `${YELP_BASE}/businesses/search?${qs}`;
  const response = await fetch(`${CORS_PROXY}${encodeURIComponent(targetUrl)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (response.status === 401)
    throw new Error("Invalid Yelp API key. Check your key and try again.");
  if (response.status === 429)
    throw new Error(
      "Yelp rate limit reached. Try again later or switch to OpenStreetMap.",
    );
  if (!response.ok)
    throw new Error(
      "Yelp API error. Check your key or switch to OpenStreetMap.",
    );

  const json = await response.json();

  return (json.businesses || []).map((b: YelpBusiness): Restaurant => {
    const catNames = b.categories?.map((c) => c.title) || [];
    const isHalal =
      catNames.some((c: string) => c.toLowerCase().includes("halal")) ||
      (b.name || "").toLowerCase().includes("halal");

    const mapsLink =
      b.coordinates?.latitude && b.coordinates?.longitude
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
      distance: b.distance
        ? (b.distance * 0.000621371).toFixed(1) + " mi"
        : "",
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

// ══════════════════════════════════════════════════════════════════════════════
// GOOGLE MAPS PLACES API (New) — needs API key, supports CORS
// ══════════════════════════════════════════════════════════════════════════════

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

async function searchGoogle(
  params: SearchParams,
  apiKey: string,
): Promise<Restaurant[]> {
  const { city, genre, halal, priceRange, openNow, sortBy, userLat, userLon } =
    params;

  const genreConfig = CUISINE_GENRES.find((g) => g.id === genre);
  const bbox = CITY_BBOXES[city];
  if (!bbox) throw new Error("Unknown city");

  const centerLat = (bbox[0] + bbox[2]) / 2;
  const centerLon = (bbox[1] + bbox[3]) / 2;

  const cuisineText = genreConfig?.google || "";
  const halalText = halal ? "halal" : "";
  const queryParts = [halalText, cuisineText, "in", city].filter(Boolean);
  const textQuery = queryParts.join(" ") || `restaurants in ${city}`;

  const body: Record<string, unknown> = {
    textQuery,
    maxResultCount: 20,
    locationBias: {
      circle: {
        center: { latitude: centerLat, longitude: centerLon },
        radius: 8000,
      },
    },
  };

  if (priceRange && priceRange !== "all") {
    const levels = priceRange
      .split(",")
      .map((p: string) => {
        const map: Record<string, string> = {
          "1": "PRICE_LEVEL_INEXPENSIVE",
          "2": "PRICE_LEVEL_MODERATE",
          "3": "PRICE_LEVEL_EXPENSIVE",
          "4": "PRICE_LEVEL_VERY_EXPENSIVE",
        };
        return map[p];
      })
      .filter(Boolean);
    if (levels.length) body.priceLevels = levels;
  }

  if (openNow) body.openNow = true;

  const response = await fetch(
    `${GOOGLE_PLACES_BASE}/places:searchText`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": GOOGLE_FIELD_MASK,
      },
      body: JSON.stringify(body),
    },
  );

  if (response.status === 403)
    throw new Error(
      "Google API key invalid or Places API not enabled. Check your key in Google Cloud Console.",
    );
  if (response.status === 429)
    throw new Error("Google API rate limit reached. Try again later.");
  if (!response.ok)
    throw new Error(
      "Google Places API error. Check your key or switch to OpenStreetMap.",
    );

  const json = await response.json();
  const places = json.places || [];
  const refLat = userLat ? Number(userLat) : centerLat;
  const refLon = userLon ? Number(userLon) : centerLon;

  return places.map((p: GooglePlace): Restaurant => {
    const lat = p.location?.latitude || 0;
    const lon = p.location?.longitude || 0;
    const distance = formatDistance(lat, lon, refLat, refLon);

    // Photo URL — direct from Google (API key in URL is fine for client-side)
    let imageUrl = "";
    if (p.photos && p.photos.length > 0) {
      const photoName = p.photos[0].name;
      imageUrl = `${GOOGLE_PLACES_BASE}/${photoName}/media?key=${apiKey}&maxWidthPx=600&maxHeightPx=400`;
    }

    const nameStr = p.displayName?.text || "";
    const typesArr = p.types || [];
    const typesStr = typesArr.join(" ");
    const isHalal =
      halal ||
      nameStr.toLowerCase().includes("halal") ||
      typesStr.includes("halal");

    let openingHours = "";
    if (p.currentOpeningHours?.weekdayDescriptions) {
      const today = new Date().getDay();
      const gIdx = today === 0 ? 6 : today - 1;
      openingHours = p.currentOpeningHours.weekdayDescriptions[gIdx] || "";
    }

    const mapsLink =
      p.googleMapsUri ||
      (lat && lon
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(nameStr)}+${lat},${lon}`
        : "");

    return {
      id: p.id || String(Math.random()),
      name: nameStr,
      cuisine:
        p.primaryTypeDisplayName?.text ||
        typesArr
          .slice(0, 3)
          .join(", ")
          .replace(/_/g, " "),
      amenity: "",
      address: p.formattedAddress || "",
      phone: p.nationalPhoneNumber || "",
      website: p.websiteUri || "",
      openingHours,
      isOpen: p.currentOpeningHours?.openNow ?? null,
      isHalal,
      isVegetarian: p.servesVegetarianFood || false,
      isVegan: false,
      lat,
      lon,
      distance,
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

// ══════════════════════════════════════════════════════════════════════════════
// VALIDATE KEYS
// ══════════════════════════════════════════════════════════════════════════════

export async function validateYelpKey(
  key: string,
): Promise<{ valid: boolean; error?: string }> {
  if (!key.trim()) return { valid: false, error: "No key provided" };
  try {
    const targetUrl = `${YELP_BASE}/businesses/search?location=Dearborn%2C+MI&limit=1`;
    const res = await fetch(`${CORS_PROXY}${encodeURIComponent(targetUrl)}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (res.status === 401) return { valid: false, error: "Invalid API key" };
    if (!res.ok) return { valid: false, error: "Connection error" };
    return { valid: true };
  } catch {
    return { valid: false, error: "Connection error" };
  }
}

export async function validateGoogleKey(
  key: string,
): Promise<{ valid: boolean; error?: string }> {
  if (!key.trim()) return { valid: false, error: "No key provided" };
  try {
    const res = await fetch(
      `${GOOGLE_PLACES_BASE}/places:searchText`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask": "places.id",
        },
        body: JSON.stringify({
          textQuery: "restaurant in Dearborn MI",
          maxResultCount: 1,
        }),
      },
    );
    if (res.status === 403)
      return {
        valid: false,
        error: "API key invalid or Places API (New) not enabled",
      };
    if (res.status === 400)
      return { valid: false, error: "Places API not enabled for this key" };
    if (!res.ok) return { valid: false, error: "Connection error" };
    return { valid: true };
  } catch {
    return { valid: false, error: "Connection error" };
  }
}

export async function getServerKeyStatus(): Promise<ServerKeyStatus | null> {
  try {
    const response = await fetch("/api/key-status");
    if (!response.ok) return null;
    const data: unknown = await response.json();
    if (!data || typeof data !== "object") return null;
    const parsed = data as Partial<ServerKeyStatus>;
    return {
      yelpConfigured: Boolean(parsed.yelpConfigured),
      googleConfigured: Boolean(parsed.googleConfigured),
    };
  } catch {
    return null;
  }
}

async function searchViaBackend(params: SearchParams): Promise<SearchResult | null> {
  try {
    const response = await fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) return null;

    const data: unknown = await response.json();
    const parsed = (data && typeof data === "object" ? data : {}) as {
      results?: Restaurant[];
      source?: string;
      total?: number;
      error?: string;
      checksPerSearch?: number;
      endpoint?: string;
    };
    if (!response.ok) {
      return {
        results: [],
        source: params.dataSource,
        total: 0,
        error: parsed.error || "Search error.",
        checksPerSearch: parsed.checksPerSearch,
        endpoint: parsed.endpoint,
      };
    }

    return {
      results: Array.isArray(parsed.results) ? parsed.results : [],
      source: parsed.source || params.dataSource,
      total: typeof parsed.total === "number" ? parsed.total : (Array.isArray(parsed.results) ? parsed.results.length : 0),
      error: parsed.error,
      checksPerSearch: parsed.checksPerSearch,
      endpoint: parsed.endpoint,
    };
  } catch (error) {
    console.warn("Backend Yelp search fallback unavailable.", error);
    return null;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN SEARCH ENTRY POINT
// ══════════════════════════════════════════════════════════════════════════════

export async function searchRestaurants(
  params: SearchParams,
): Promise<SearchResult> {
  const { dataSource, yelpApiKey, googleApiKey } = params;

  try {
    let results: Restaurant[];
    let checksPerSearch: number | undefined;
    let endpoint = "";

    if (dataSource === "yelp") {
      const trimmedYelpKey = yelpApiKey?.trim();
      const backendResult = await searchViaBackend(params);
      if (backendResult && !backendResult.error) {
        saveSearchHistory({
          city: params.city,
          genre: params.genre,
          diningStyle: params.diningStyle,
          dataSource,
          resultCount: backendResult.results.length,
        });
        return backendResult;
      }

      if (!trimmedYelpKey) {
        if (backendResult?.error) {
          const hasKeyHint = YELP_KEY_ERROR_PATTERN.test(backendResult.error);
          return {
            ...backendResult,
            error: hasKeyHint
              ? backendResult.error
              : "Yelp search failed via server and no local Yelp key is set. Paste one in Settings or set YELP_API_KEY.",
          };
        }

        return {
          results: [],
          source: "yelp",
          total: 0,
          error:
            "Yelp search is unavailable right now. Set YELP_API_KEY on the server for background Yelp search.",
        };
      }

      // Static/no-backend mode fallback (or backend error with a client key available).
      results = await searchYelp(params, trimmedYelpKey);
    } else if (dataSource === "google") {
      if (!googleApiKey?.trim()) {
        return {
          results: [],
          source: "google",
          total: 0,
          error:
            "Google Maps API key is required. Paste it in Settings.",
        };
      }
      results = await searchGoogle(params, googleApiKey.trim());
    } else {
      const overpass = await searchOverpass(params);
      results = overpass.results;
      checksPerSearch = overpass.checks;
      endpoint = overpass.endpoint;
    }

    // Save to history
    saveSearchHistory({
      city: params.city,
      genre: params.genre,
      diningStyle: params.diningStyle,
      dataSource,
      resultCount: results.length,
    });

    return { results, source: dataSource, total: results.length, checksPerSearch, endpoint };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Search error.";
    return { results: [], source: dataSource, total: 0, error: message };
  }
}
