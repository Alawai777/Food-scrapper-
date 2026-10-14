import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  ChevronDown,
  Clock3,
  Compass,
  ExternalLink,
  Filter,
  Leaf,
  MapPin,
  Moon,
  Navigation,
  Search,
  Settings2,
  Sparkles,
  Star,
  Sun,
  Utensils,
  X,
} from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";
import {
  searchRestaurants,
  type Restaurant,
  type SearchResult,
} from "@/lib/api";
import {
  CUISINE_GENRES,
  DINING_STYLES,
  METRO_DETROIT_CITIES,
  PRICE_RANGES,
} from "@shared/schema";

type Source = "osm" | "yelp" | "google";
type Sort = "value" | "rating" | "distance";

const KEY_STORAGE = {
  yelp: "yartedeats_yelp_key",
  google: "yartedeats_google_key",
} as const;

function readStoredKey(key: string): string {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function writeStoredKey(key: string, value: string): void {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // Storage can be unavailable in privacy-restricted browsers.
  }
}

function SourcePill({ source }: { source: Source }) {
  const labels = { osm: "OpenStreetMap", yelp: "Yelp", google: "Google Places" };
  return <span className={`source-pill source-${source}`}>{labels[source]}</span>;
}

function Rating({ value, count }: { value: number; count: number }) {
  if (!value) return <span className="text-xs text-muted-foreground">No ratings yet</span>;
  return (
    <span className="flex items-center gap-1.5 text-sm font-bold">
      <Star className="h-4 w-4 fill-current text-amber-500" />
      {value.toFixed(1)}
      <span className="font-normal text-muted-foreground">({count.toLocaleString()})</span>
    </span>
  );
}

function RestaurantCard({ restaurant }: { restaurant: Restaurant }) {
  const r = restaurant;
  const links = [
    r.mapsLink && { href: r.mapsLink, label: "Map" },
    r.website && { href: r.website, label: "Website" },
    r.yelpUrl && { href: r.yelpUrl, label: "Yelp" },
    r.googleMapsUrl && { href: r.googleMapsUrl, label: "Google Maps" },
  ].filter(Boolean) as Array<{ href: string; label: string }>;

  return (
    <article className="food-card" data-testid={`card-restaurant-${r.id}`}>
      <div className="food-card__visual">
        {r.imageUrl ? (
          <img src={r.imageUrl} alt="" loading="lazy" />
        ) : (
          <div className="food-card__placeholder"><Utensils /></div>
        )}
        <div className="food-card__visual-overlay" />
        <div className="food-card__badges">
          {r.price && <span className="price-badge">{r.price}</span>}
          {r.isHalal && <span className="diet-badge">☪ Halal</span>}
          {r.isVegetarian && <span className="diet-badge"><Leaf /> Veg</span>}
        </div>
        {r.isOpen !== null && (
          <span className={`open-badge ${r.isOpen ? "is-open" : "is-closed"}`}>
            {r.isOpen ? "Open now" : "Closed"}
          </span>
        )}
        <span className="card-source"><SourcePill source={r.source} /></span>
      </div>
      <div className="food-card__body">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-base font-extrabold tracking-tight">{r.name}</h3>
            <p className="mt-1 truncate text-sm capitalize text-muted-foreground">
              {r.cuisine || "Local favorite"}
            </p>
          </div>
          <Rating value={r.rating} count={r.reviewCount} />
        </div>
        <div className="food-card__meta">
          {r.distance && <span><Navigation /> {r.distance}</span>}
          {r.address && <span className="truncate"><MapPin /> {r.address}</span>}
          {r.openingHours && <span className="truncate"><Clock3 /> {r.openingHours}</span>}
        </div>
        {links.length > 0 && (
          <div className="food-card__links">
            {links.slice(0, 2).map((link) => (
              <a key={link.href} href={link.href} target="_blank" rel="noreferrer">
                {link.label} <ExternalLink />
              </a>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

function SettingsPanel({
  open,
  onClose,
  yelpKey,
  googleKey,
  setYelpKey,
  setGoogleKey,
}: {
  open: boolean;
  onClose: () => void;
  yelpKey: string;
  googleKey: string;
  setYelpKey: (value: string) => void;
  setGoogleKey: (value: string) => void;
}) {
  const firstInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    firstInputRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div><p className="eyebrow">Optional connections</p><h2 id="settings-title">Bring your own keys</h2></div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close settings"><X /></button>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          OpenStreetMap is always free. Keys stay in this browser and are only used when you choose a paid-data source.
        </p>
        <label className="field-label" htmlFor="yelp-api-key">Yelp Fusion API key<input ref={firstInputRef} id="yelp-api-key" type="password" value={yelpKey} onChange={(e) => setYelpKey(e.target.value)} placeholder="Optional" /></label>
        <label className="field-label" htmlFor="google-api-key">Google Places API key<input id="google-api-key" type="password" value={googleKey} onChange={(e) => setGoogleKey(e.target.value)} placeholder="Optional" /></label>
        <button type="button" className="button button-primary w-full" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}

export default function Home() {
  const { theme, toggle } = useTheme();
  const [city, setCity] = useState("Dearborn, MI");
  const [genre, setGenre] = useState("any");
  const [diningStyle, setDiningStyle] = useState("restaurants");
  const [groupSize, setGroupSize] = useState(2);
  const [priceRange, setPriceRange] = useState<string[]>([]);
  const [source, setSource] = useState<Source>("osm");
  const [sort, setSort] = useState<Sort>("value");
  const [halal, setHalal] = useState(false);
  const [openNow, setOpenNow] = useState(false);
  const [showFilters, setShowFilters] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [yelpKey, setYelpKey] = useState("");
  const [googleKey, setGoogleKey] = useState("");
  const [results, setResults] = useState<Restaurant[]>([]);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");
  const [checks, setChecks] = useState<number | null>(null);
  const [location, setLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationMessage, setLocationMessage] = useState("");

  useEffect(() => {
    setYelpKey(readStoredKey(KEY_STORAGE.yelp));
    setGoogleKey(readStoredKey(KEY_STORAGE.google));
  }, []);
  useEffect(() => { writeStoredKey(KEY_STORAGE.yelp, yelpKey); }, [yelpKey]);
  useEffect(() => { writeStoredKey(KEY_STORAGE.google, googleKey); }, [googleKey]);

  const sortedResults = useMemo(() => [...results].sort((a, b) => {
    if (sort === "value") {
      const priceA = a.price ? a.price.length : 99;
      const priceB = b.price ? b.price.length : 99;
      return priceA - priceB || (b.rating || 0) - (a.rating || 0);
    }
    if (sort === "rating") return (b.rating || 0) - (a.rating || 0);
    const distanceA = parseFloat(a.distance) || 99;
    const distanceB = parseFloat(b.distance) || 99;
    return distanceA - distanceB;
  }), [results, sort]);

  const search = useMutation({
    mutationFn: (): Promise<SearchResult> => searchRestaurants({
      city, genre, diningStyle, groupSize,
      priceRange: priceRange.length ? priceRange.join(",") : "all",
      halal, openNow, sortBy: sort, dataSource: source,
      userLat: location?.lat,
      userLon: location?.lon,
      yelpApiKey: source === "yelp" ? yelpKey : undefined,
      googleApiKey: source === "google" ? googleKey : undefined,
    }),
    onSuccess: (data) => {
      setResults(data.results || []);
      setError(data.error || "");
      setChecks(typeof data.checksPerSearch === "number" ? data.checksPerSearch : null);
      setSearched(true);
      setShowFilters(false);
    },
    onError: () => { setError("We could not reach the food sources. Try again in a moment."); setSearched(true); },
  });

  const runSearch = () => search.mutate();
  const togglePrice = (id: string) => setPriceRange((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setLocationMessage("Location is not available in this browser.");
      return;
    }
    setLocating(true);
    setLocationMessage("");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocation({ lat: coords.latitude, lon: coords.longitude });
        setLocationMessage("Using your location for distance sorting.");
        setLocating(false);
      },
      () => {
        setLocationMessage("Location permission was denied; using the city center.");
        setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 },
    );
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <a href="#" className="brand"><span className="brand-mark"><Utensils /></span><span>fork<span className="brand-accent">finder</span></span></a>
        <div className="topbar-actions">
          <span className="hidden text-xs font-semibold text-muted-foreground sm:inline">Metro Detroit food scout</span>
          <button type="button" className="icon-button" onClick={toggle} aria-label="Toggle color theme" aria-pressed={theme === "dark"}>{theme === "dark" ? <Sun /> : <Moon />}</button>
          <button type="button" className="button button-ghost" onClick={() => setSettingsOpen(true)} aria-label="Open source settings"><Settings2 /> <span className="hidden sm:inline">Sources</span></button>
        </div>
      </header>

      <main>
        <section className="hero-section">
          <div className="hero-copy">
            <p className="eyebrow hero-eyebrow"><Sparkles /> Find the good stuff for less</p>
            <h1>Great food,<br /><em>without the guesswork.</em></h1>
            <p className="hero-subtitle">Search independent spots, fast bites, and hidden gems across Metro Detroit — ranked around what matters most to you.</p>
          </div>
          <div className="hero-orbit"><span>🍜</span><span>🥙</span><span>🍕</span><span>🌮</span></div>
        </section>

        <section className="search-board">
          <div className="search-board__top">
            <div><p className="eyebrow">Start exploring</p><h2>What are you craving?</h2></div>
            <button type="button" className="filter-toggle" onClick={() => setShowFilters(!showFilters)} aria-expanded={showFilters}><Filter /> {showFilters ? "Hide filters" : "Show filters"} <ChevronDown className={showFilters ? "rotate-180" : ""} /></button>
          </div>
          <div className="quick-search">
            <label className="search-field"><MapPin /><select value={city} onChange={(e) => setCity(e.target.value)}>{METRO_DETROIT_CITIES.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown /></label>
            <label className="search-field"><Utensils /><select value={genre} onChange={(e) => setGenre(e.target.value)}>{CUISINE_GENRES.map((item) => <option key={item.id} value={item.id}>{item.icon} {item.label}</option>)}</select><ChevronDown /></label>
            <button type="button" className="button button-primary search-button" onClick={runSearch} disabled={search.isPending}><Search /> {search.isPending ? "Searching…" : "Search food"}</button>
          </div>
          {showFilters && <div className="filter-grid">
            <div><p className="filter-label">How do you want it?</p><div className="chip-row">{DINING_STYLES.map((item) => <button type="button" key={item.id} className={`filter-chip ${diningStyle === item.id ? "selected" : ""}`} onClick={() => setDiningStyle(item.id)} aria-pressed={diningStyle === item.id}>{item.icon} {item.label}</button>)}</div></div>
            <div><p className="filter-label">Budget</p><div className="chip-row">{PRICE_RANGES.map((item) => <button type="button" key={item.id} className={`filter-chip ${priceRange.includes(item.id) ? "selected" : ""}`} onClick={() => togglePrice(item.id)} aria-pressed={priceRange.includes(item.id)} title={item.desc}>{item.label}</button>)}</div></div>
            <div className="filter-grid__toggles"><button type="button" className={`toggle-chip ${halal ? "selected" : ""}`} onClick={() => setHalal(!halal)} aria-pressed={halal}>☪ Halal friendly</button><button type="button" className={`toggle-chip ${openNow ? "selected" : ""}`} onClick={() => setOpenNow(!openNow)} aria-pressed={openNow}><Clock3 /> Open now</button><label className="group-size"><span>Party</span><select value={groupSize} onChange={(e) => setGroupSize(Number(e.target.value))}><option value={1}>1 person</option><option value={2}>2 people</option><option value={4}>4 people</option><option value={6}>6+ people</option><option value={10}>10+ people</option></select></label></div>
          </div>}
          <div className="source-row"><span className="filter-label">Search source</span>{(["osm", "yelp", "google"] as Source[]).map((item) => <button type="button" key={item} className={`source-select ${source === item ? "selected" : ""}`} onClick={() => setSource(item)} aria-pressed={source === item}><SourcePill source={item} /></button>)}<button type="button" className="location-button" onClick={useMyLocation} disabled={locating}><Navigation /> {locating ? "Locating…" : location ? "Location on" : "Use my location"}</button><span className="source-note">{locationMessage || "OSM is free and needs no key"}</span></div>
        </section>

        <section className="results-section">
          <div className="results-heading">
            <div><p className="eyebrow">{searched ? "Your shortlist" : "Built for Metro Detroit"}</p><h2>{searched ? `${results.length} places worth a look` : "Start with a neighborhood"}</h2></div>
            <div className="results-controls">{searched && <span className="results-location"><MapPin /> {city}</span>}<label className="sort-select"><span>Sort</span><select value={sort} onChange={(e) => setSort(e.target.value as Sort)}><option value="value">Best value</option><option value="rating">Top rated</option><option value="distance">Closest</option></select></label></div>
          </div>
          {search.isPending && <div className="loading-state"><div className="loading-spinner" /><p>Checking menus and local listings around {city}…</p></div>}
          {!search.isPending && error && <div className="error-state"><p>{error}</p><button type="button" className="button button-secondary" onClick={runSearch}>Try again</button></div>}
          {!search.isPending && !error && searched && results.length === 0 && <div className="empty-state"><Compass /><h3>No matches yet</h3><p>Try a wider cuisine, another neighborhood, or remove a filter.</p></div>}
          {!search.isPending && !error && sortedResults.length > 0 && <div className="results-grid">{sortedResults.map((restaurant) => <RestaurantCard key={`${restaurant.source}-${restaurant.id}`} restaurant={restaurant} />)}</div>}
          {!search.isPending && !searched && <div className="welcome-grid"><div><span>01</span><h3>Pick a place</h3><p>Search Canton, Ann Arbor, Detroit, Dearborn, and more.</p></div><div><span>02</span><h3>Set your budget</h3><p>Keep the search focused on meals that fit your day.</p></div><div><span>03</span><h3>Compare sources</h3><p>Start free with OSM, then add richer listings when you need them.</p></div></div>}
          {checks !== null && <p className="source-footnote">OpenStreetMap checked {checks.toLocaleString()} map features for this search.</p>}
        </section>
      </main>
      <footer className="site-footer"><span>Made for hungry people in Metro Detroit.</span><span>Data from public sources · Always verify hours and pricing before heading out.</span></footer>
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} yelpKey={yelpKey} googleKey={googleKey} setYelpKey={setYelpKey} setGoogleKey={setGoogleKey} />
    </div>
  );
}
