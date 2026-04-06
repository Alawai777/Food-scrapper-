import { useState, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useTheme } from "@/components/ThemeProvider";
import {
  METRO_DETROIT_CITIES, CUISINE_GENRES, DINING_STYLES,
  PRICE_RANGES, SORT_OPTIONS,
} from "@shared/schema";
import {
  MapPin, Users, Sun, Moon, Search, Phone, Globe, Clock,
  CheckCircle2, XCircle, Navigation, SlidersHorizontal,
  ExternalLink, Leaf, Filter,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

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
  mapsLink: string;
}

// ── Badges ──────────────────────────────────────────────────────────────────
function HalalBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full"
      style={{ background:"hsl(var(--halal-bg))", color:"hsl(var(--halal-text))", border:"1px solid hsl(var(--halal-border))" }}>
      ☪️ Halal
    </span>
  );
}
function VegBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full"
      style={{ background:"hsl(var(--veg-bg))", color:"hsl(var(--veg-text))" }}>
      <Leaf className="w-2.5 h-2.5" /> Veg
    </span>
  );
}
function OpenBadge({ isOpen }: { isOpen: boolean | null }) {
  if (isOpen === null) return null;
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isOpen ? "bg-green-600/90 text-white" : "bg-black/55 text-white/75"}`}>
      {isOpen ? "Open" : "Closed"}
    </span>
  );
}

// ── Restaurant Card ───────────────────────────────────────────────────────
function RestaurantCard({ r }: { r: Restaurant }) {
  const amenityLabel: Record<string, string> = {
    restaurant: "🍽️ Dine In",
    fast_food:  "🥡 Pick Up",
    food_truck: "🚚 Food Truck",
    cafe:       "☕ Café",
  };

  return (
    <div className="result-card bg-card border border-border rounded-2xl overflow-hidden" data-testid={`card-restaurant-${r.id}`}>
      {/* Map preview header */}
      <div className="h-40 bg-muted relative overflow-hidden flex items-center justify-center">
        {r.lat && r.lon ? (
          <img
            src={`https://static-maps.yandex.ru/1.x/?lang=en_US&ll=${r.lon},${r.lat}&z=16&l=map&size=450,180`}
            alt="Map"
            className="w-full h-full object-cover opacity-80"
            loading="lazy"
            onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <span className="text-5xl">🍽️</span>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
        {/* Badges overlay */}
        <div className="absolute top-2 left-2 flex flex-wrap gap-1">
          {r.isHalal && <HalalBadge />}
          {r.isVegetarian && <VegBadge />}
        </div>
        <div className="absolute top-2 right-2 flex gap-1 items-center">
          <OpenBadge isOpen={r.isOpen} />
        </div>
        {/* Amenity label bottom-left */}
        <div className="absolute bottom-2 left-2">
          <span className="text-xs font-semibold bg-black/60 text-white px-2 py-0.5 rounded-full">
            {amenityLabel[r.amenity] || "🍽️ Restaurant"}
          </span>
        </div>
      </div>

      <div className="p-4 space-y-2">
        <div>
          <h3 className="font-bold text-foreground text-sm leading-snug">{r.name}</h3>
          {r.cuisine && (
            <p className="text-muted-foreground text-xs mt-0.5 capitalize line-clamp-1">{r.cuisine}</p>
          )}
        </div>

        <div className="space-y-1 text-xs text-muted-foreground">
          {r.address && (
            <div className="flex items-start gap-1.5">
              <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary" />
              <span className="line-clamp-1">{r.address}</span>
            </div>
          )}
          {r.distance && (
            <div className="flex items-center gap-1.5">
              <Navigation className="w-3.5 h-3.5 shrink-0 text-primary" />
              <span>{r.distance} away</span>
            </div>
          )}
          {r.phone && (
            <div className="flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 shrink-0 text-primary" />
              <a href={`tel:${r.phone}`} className="hover:text-primary hover:underline">{r.phone}</a>
            </div>
          )}
          {r.openingHours && (
            <div className="flex items-start gap-1.5">
              <Clock className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary" />
              <span className="line-clamp-1">{r.openingHours}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 pt-1">
          {r.mapsLink && (
            <a href={r.mapsLink} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-primary font-semibold hover:underline">
              <MapPin className="w-3 h-3" /> Maps
            </a>
          )}
          {r.website && (
            <a href={r.website} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-primary font-semibold hover:underline">
              <Globe className="w-3 h-3" /> Website
            </a>
          )}
          <span className="ml-auto osm-badge">OSM</span>
        </div>
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <Skeleton className="h-40 w-full rounded-none" />
      <div className="p-4 space-y-2">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    </div>
  );
}

// ── Label helper ─────────────────────────────────────────────────────────────
function FilterLabel({ children }: { children: React.ReactNode }) {
  return <p className="label-xs mb-2">{children}</p>;
}

// ─────────────────────────────────────────────────────────────────────────────
export default function Home() {
  const { theme, toggle } = useTheme();

  // Filter state
  const [city, setCity]             = useState("Dearborn, MI");
  const [genre, setGenre]           = useState("middle_eastern");
  const [diningStyle, setDining]    = useState("restaurants");
  const [groupSize, setGroupSize]   = useState(2);
  const [priceRange, setPriceRange] = useState<string[]>([]);
  const [halal, setHalal]           = useState(false);
  const [openNow, setOpenNow]       = useState(false);
  const [sortBy, setSortBy]         = useState("default");
  const [userLat, setUserLat]       = useState<number | null>(null);
  const [userLon, setUserLon]       = useState<number | null>(null);
  const [locating, setLocating]     = useState(false);

  // Results state
  const [results, setResults]       = useState<Restaurant[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [errorMsg, setErrorMsg]     = useState("");
  const [showFilters, setShowFilters] = useState(true);

  const togglePrice = (id: string) =>
    setPriceRange(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  // Geolocation
  const handleLocate = useCallback(() => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setUserLat(pos.coords.latitude);
        setUserLon(pos.coords.longitude);
        setLocating(false);
      },
      () => setLocating(false),
      { timeout: 8000 }
    );
  }, []);

  const searchMutation = useMutation({
    mutationFn: async () => {
      setErrorMsg("");
      const res = await apiRequest("POST", "/api/search", {
        city, genre, diningStyle, groupSize,
        priceRange: priceRange.length ? priceRange.join(",") : "all",
        halal, openNow, sortBy,
        userLat, userLon,
      });
      return res.json();
    },
    onSuccess: data => {
      if (data.error) setErrorMsg(data.error);
      setResults(data.results || []);
      setHasSearched(true);
      setShowFilters(false);
    },
    onError: () => {
      setErrorMsg("Connection error. Please try again.");
      setHasSearched(true);
    },
  });

  const selectedGenre  = CUISINE_GENRES.find(g => g.id === genre);
  const selectedDining = DINING_STYLES.find(d => d.id === diningStyle);

  return (
    <div className="min-h-screen bg-background">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {/* Logo */}
            <svg width="34" height="34" viewBox="0 0 34 34" fill="none" aria-label="YartedEats logo">
              <rect width="34" height="34" rx="9" fill="hsl(24 88% 40%)"/>
              <path d="M17 6 L22 14 L30 15.5 L24 21.5 L25.5 30 L17 25.5 L8.5 30 L10 21.5 L4 15.5 L12 14 Z" stroke="white" strokeWidth="1.5" fill="none" opacity="0.5"/>
              <circle cx="17" cy="17" r="6" fill="white" opacity="0.15"/>
              <path d="M13 17 Q15 14 17 17 Q19 20 21 17" stroke="white" strokeWidth="2" strokeLinecap="round" fill="none"/>
              <circle cx="17" cy="22" r="2" fill="white" opacity="0.8"/>
            </svg>
            <div className="brand-font leading-none">
              <span className="text-foreground text-base font-bold">Yarted</span>
              <span className="text-primary text-base font-bold">Eats</span>
              <span className="text-muted-foreground text-xs font-medium ml-1.5">by Ali</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {hasSearched && (
              <button onClick={() => setShowFilters(f => !f)}
                data-testid="button-toggle-filters"
                className="hidden sm:flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg hover:bg-secondary transition-colors">
                <Filter className="w-3.5 h-3.5" />
                {showFilters ? "Hide" : "Filters"}
              </button>
            )}
            <span className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
              <MapPin className="w-3.5 h-3.5 text-primary" />Metro Detroit
            </span>
            <button onClick={toggle} data-testid="button-theme-toggle"
              className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <div className="hero-bg text-white px-4 py-10 md:py-12">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="brand-font text-3xl md:text-4xl font-extrabold mb-2 leading-tight">
            Find Your Next Meal<br/>in Metro Detroit
          </h1>
          <p className="text-white/75 text-sm">
            Dine In · Pick Up · Food Trucks · Halal · Powered by OpenStreetMap — <strong>no API key needed</strong>
          </p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">

        {/* ── Filter Panel ───────────────────────────────────────────────────── */}
        {showFilters && (
          <div className="bg-card border border-border rounded-2xl p-5 md:p-6 space-y-5 shadow-sm">

            {/* Row 1: City + Group Size */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FilterLabel><MapPin className="w-3 h-3 inline mr-1"/>City / Neighborhood</FilterLabel>
                <Select value={city} onValueChange={setCity}>
                  <SelectTrigger data-testid="select-city" className="bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {METRO_DETROIT_CITIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <FilterLabel>
                  <Users className="w-3 h-3 inline mr-1"/>
                  Group Size — <span className="text-primary normal-case">{groupSize} {groupSize === 1 ? "person" : "people"}</span>
                </FilterLabel>
                <div className="flex items-center gap-3 mt-2">
                  <button onClick={() => setGroupSize(s => Math.max(1, s-1))} data-testid="btn-dec"
                    className="w-8 h-8 rounded-full bg-secondary hover:bg-primary hover:text-white transition-colors flex items-center justify-center font-bold text-lg">−</button>
                  <Slider value={[groupSize]} min={1} max={20} step={1} onValueChange={([v]) => setGroupSize(v)} className="flex-1"/>
                  <button onClick={() => setGroupSize(s => Math.min(20, s+1))} data-testid="btn-inc"
                    className="w-8 h-8 rounded-full bg-secondary hover:bg-primary hover:text-white transition-colors flex items-center justify-center font-bold text-lg">+</button>
                </div>
              </div>
            </div>

            {/* Dining Style */}
            <div>
              <FilterLabel>Dining Style</FilterLabel>
              <div className="flex flex-wrap gap-2">
                {DINING_STYLES.map(d => (
                  <button key={d.id} data-testid={`chip-dining-${d.id}`} onClick={() => setDining(d.id)}
                    className={`chip ${diningStyle === d.id ? "active-accent" : ""}`}>
                    <span className="text-base">{d.icon}</span>{d.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Cuisine Genre */}
            <div>
              <FilterLabel>Cuisine Genre</FilterLabel>
              <div className="flex flex-wrap gap-2">
                {CUISINE_GENRES.map(g => (
                  <button key={g.id} data-testid={`chip-genre-${g.id}`} onClick={() => setGenre(g.id)}
                    className={`chip ${genre === g.id ? "active-primary" : ""}`}>
                    <span>{g.icon}</span>{g.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Price + Halal + Open Now row */}
            <div className="flex flex-col sm:flex-row gap-3 sm:items-end flex-wrap">
              <div>
                <FilterLabel>Price Range</FilterLabel>
                <div className="flex gap-2">
                  {PRICE_RANGES.map(p => (
                    <button key={p.id} title={p.desc} data-testid={`chip-price-${p.id}`}
                      onClick={() => togglePrice(p.id)}
                      className={`chip px-4 font-bold ${priceRange.includes(p.id) ? "active-dark" : ""}`}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <FilterLabel>Sort By</FilterLabel>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger data-testid="select-sort" className="bg-background w-36">
                    <SlidersHorizontal className="w-3.5 h-3.5 mr-1.5 opacity-60" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Default</SelectItem>
                    {SORT_OPTIONS.map(s => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Halal toggle */}
              <button data-testid="button-halal" onClick={() => setHalal(h => !h)}
                className={`chip halal-chip ${halal ? "on" : "off"}`}>
                <span className="text-base">☪️</span>
                Halal Only
                {halal ? <CheckCircle2 className="w-4 h-4"/> : <XCircle className="w-4 h-4 opacity-35"/>}
              </button>

              {/* Open Now toggle */}
              <button data-testid="button-open-now" onClick={() => setOpenNow(o => !o)}
                className={`chip open-chip ${openNow ? "on" : ""}`}>
                <Clock className="w-4 h-4"/>
                Open Now
                {openNow ? <CheckCircle2 className="w-4 h-4"/> : <XCircle className="w-4 h-4 opacity-35"/>}
              </button>

              {/* Near Me */}
              <button data-testid="button-near-me" onClick={handleLocate}
                className={`chip ${userLat ? "active-accent" : ""} ${locating ? "opacity-60" : ""}`}
                disabled={locating}>
                <Navigation className="w-4 h-4"/>
                {locating ? "Locating…" : userLat ? "Located ✓" : "Near Me"}
              </button>
            </div>

            {/* Search CTA */}
            <Button data-testid="button-search" onClick={() => searchMutation.mutate()}
              disabled={searchMutation.isPending}
              className="w-full h-12 text-base font-bold bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl" size="lg">
              {searchMutation.isPending ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Searching OpenStreetMap…
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Search className="w-4.5 h-4.5"/>
                  Find {selectedDining?.icon} {selectedDining?.label} · {selectedGenre?.icon} {selectedGenre?.label}
                  {halal && " · ☪️ Halal"}
                  {openNow && " · Open Now"}
                </span>
              )}
            </Button>
          </div>
        )}

        {/* Re-show filters button when hidden */}
        {!showFilters && (
          <button onClick={() => setShowFilters(true)}
            className="w-full py-3 rounded-xl border border-border bg-card text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors flex items-center justify-center gap-2">
            <Filter className="w-4 h-4"/> Edit Filters
          </button>
        )}

        {/* ── Error ───────────────────────────────────────────────────────── */}
        {errorMsg && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/8 px-4 py-3 text-sm text-destructive font-medium">
            ⚠️ {errorMsg}
          </div>
        )}

        {/* ── Loading skeletons ───────────────────────────────────────────── */}
        {searchMutation.isPending && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array(6).fill(0).map((_, i) => <SkeletonCard key={i}/>)}
          </div>
        )}

        {/* ── Results ────────────────────────────────────────────────────── */}
        {!searchMutation.isPending && hasSearched && results.length > 0 && (
          <>
            <div className="flex flex-wrap items-center gap-2 justify-between">
              <h2 className="font-bold text-foreground text-lg">
                {results.length} spots
                <span className="text-muted-foreground font-normal text-sm ml-2">in {city}</span>
              </h2>
              <div className="flex flex-wrap gap-1.5 text-xs">
                {halal    && <span style={{background:"hsl(var(--halal-bg))",color:"hsl(var(--halal-text))"}} className="px-2.5 py-1 rounded-full font-semibold">☪️ Halal</span>}
                {openNow  && <span className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2.5 py-1 rounded-full font-semibold">🟢 Open Now</span>}
                <span className="bg-secondary text-foreground px-2.5 py-1 rounded-full font-semibold">{selectedDining?.icon} {selectedDining?.label}</span>
                <span className="bg-secondary text-foreground px-2.5 py-1 rounded-full font-semibold">{selectedGenre?.icon} {selectedGenre?.label}</span>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {results.map(r => <RestaurantCard key={r.id} r={r}/>)}
            </div>
          </>
        )}

        {/* ── Empty state ─────────────────────────────────────────────────── */}
        {!searchMutation.isPending && hasSearched && results.length === 0 && !errorMsg && (
          <div className="text-center py-16">
            <div className="text-5xl mb-3">🔍</div>
            <p className="font-semibold text-foreground">No results in OpenStreetMap</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
              OSM data varies by area. Try <strong>Any Food</strong> genre, a different city, or removing the Open Now filter.
            </p>
          </div>
        )}

        {/* ── Idle state ───────────────────────────────────────────────────── */}
        {!hasSearched && !searchMutation.isPending && (
          <div className="text-center py-14 text-muted-foreground">
            <div className="text-6xl mb-4">🍽️</div>
            <p className="font-bold text-foreground text-lg brand-font">Ready to eat?</p>
            <p className="text-sm mt-1">Set your filters and hit <strong>Find</strong> to discover real spots in Metro Detroit</p>
          </div>
        )}
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="border-t border-border mt-12 px-4 py-6 text-center text-xs text-muted-foreground space-y-1">
        <p className="brand-font font-bold text-sm text-foreground">YartedEats by Ali 🚗</p>
        <p>Metro Detroit food finder · Data from <a href="https://www.openstreetmap.org" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">OpenStreetMap</a> — no API key required</p>
      </footer>
    </div>
  );
}
