import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useTheme } from "@/components/ThemeProvider";
import {
  METRO_DETROIT_CITIES,
  CUISINE_GENRES,
  DINING_STYLES,
  PRICE_RANGES,
} from "@shared/schema";
import {
  MapPin, Users, Star, Phone, ExternalLink, Sun, Moon,
  ChevronDown, Utensils, Search, Clock, CheckCircle2, XCircle,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface Restaurant {
  id: string;
  name: string;
  rating: number;
  reviewCount: number;
  price: string;
  address: string;
  phone: string;
  imageUrl: string;
  url: string;
  categories: string;
  isOpen: boolean;
  distance: string;
}

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <svg key={i} className={`w-3.5 h-3.5 ${i <= Math.round(rating) ? "star-fill" : "text-muted-foreground/30"}`}
          fill="currentColor" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </span>
  );
}

function RestaurantCard({ r }: { r: Restaurant }) {
  const isHalal = r.categories?.toLowerCase().includes("halal");
  return (
    <div className="result-card bg-card border border-border rounded-2xl overflow-hidden" data-testid={`card-restaurant-${r.id}`}>
      <div className="relative h-44 bg-muted overflow-hidden">
        {r.imageUrl ? (
          <img src={r.imageUrl} alt={r.name} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-5xl">🍽️</div>
        )}
        <div className="absolute top-2 left-2 flex gap-1.5 flex-wrap">
          {r.price && r.price !== "N/A" && (
            <span className="bg-black/70 text-white text-xs font-semibold px-2 py-0.5 rounded-full">{r.price}</span>
          )}
          {isHalal && (
            <span className="halal-badge text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
              ☪️ Halal
            </span>
          )}
        </div>
        <div className="absolute top-2 right-2">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${r.isOpen ? "bg-green-600/90 text-white" : "bg-black/60 text-white/80"}`}>
            {r.isOpen ? "Open" : "Closed"}
          </span>
        </div>
      </div>
      <div className="p-4 space-y-2">
        <div>
          <h3 className="font-bold text-foreground leading-tight text-base">{r.name}</h3>
          <p className="text-muted-foreground text-xs mt-0.5 line-clamp-1">{r.categories}</p>
        </div>
        <div className="flex items-center gap-2">
          <StarRating rating={r.rating} />
          <span className="text-sm font-semibold text-foreground">{r.rating.toFixed(1)}</span>
          <span className="text-xs text-muted-foreground">({r.reviewCount?.toLocaleString()})</span>
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
              <Clock className="w-3.5 h-3.5 shrink-0 text-primary" />
              <span>{r.distance} away</span>
            </div>
          )}
          {r.phone && (
            <div className="flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 shrink-0 text-primary" />
              <span>{r.phone}</span>
            </div>
          )}
        </div>
        {r.url && r.url !== "#" && (
          <a href={r.url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-primary font-semibold hover:underline mt-1">
            View on Yelp <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <Skeleton className="h-44 w-full rounded-none" />
      <div className="p-4 space-y-2">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    </div>
  );
}

export default function Home() {
  const { theme, toggle } = useTheme();
  const [city, setCity] = useState("Dearborn, MI");
  const [genre, setGenre] = useState("middle_eastern");
  const [diningStyle, setDiningStyle] = useState("restaurants");
  const [groupSize, setGroupSize] = useState(2);
  const [priceRange, setPriceRange] = useState<string[]>([]);
  const [halal, setHalal] = useState(false);
  const [results, setResults] = useState<Restaurant[]>([]);
  const [demoMode, setDemoMode] = useState(false);
  const [demoMsg, setDemoMsg] = useState("");
  const [hasSearched, setHasSearched] = useState(false);

  const togglePrice = (id: string) => {
    setPriceRange(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  };

  const searchMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/search", {
        city,
        genre,
        diningStyle,
        groupSize,
        priceRange: priceRange.length ? priceRange.join(",") : "all",
        halal,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setResults(data.results || []);
      setDemoMode(!!data.usedMock);
      setDemoMsg(data.error || "");
      setHasSearched(true);
    },
  });

  const selectedGenre = CUISINE_GENRES.find(g => g.id === genre);
  const selectedDining = DINING_STYLES.find(d => d.id === diningStyle);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {/* SVG Logo */}
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-label="DetroitEats logo">
              <rect width="32" height="32" rx="8" fill="hsl(28 85% 42%)" />
              <path d="M8 10 Q16 7 24 10 L22 22 Q16 25 10 22 Z" fill="white" opacity="0.15" />
              <circle cx="16" cy="16" r="7" stroke="white" strokeWidth="2" fill="none" />
              <path d="M16 10 L16 16 L20 19" stroke="white" strokeWidth="2" strokeLinecap="round" />
              <path d="M10 16 Q13 13 16 16 Q19 19 22 16" stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none" />
            </svg>
            <div>
              <span className="font-extrabold text-foreground text-base tracking-tight">Detroit</span>
              <span className="font-extrabold text-primary text-base tracking-tight">Eats</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
              <MapPin className="w-3.5 h-3.5 text-primary" />
              Metro Detroit
            </span>
            <button onClick={toggle} data-testid="button-theme-toggle"
              className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
              {theme === "dark" ? <Sun className="w-4.5 h-4.5" /> : <Moon className="w-4.5 h-4.5" />}
            </button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <div className="hero-gradient text-white px-4 py-10 md:py-14">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-3xl md:text-4xl font-extrabold mb-2 leading-tight" style={{ fontFamily: "'Lora', serif" }}>
            Find Your Next Meal<br />in Metro Detroit
          </h1>
          <p className="text-white/80 text-sm md:text-base">
            Dine in · Pick up · Food trucks · Halal options across the area
          </p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 md:py-8 space-y-6">

        {/* Filter Panel */}
        <div className="bg-card border border-border rounded-2xl p-5 md:p-6 space-y-6 shadow-sm">

          {/* Row 1: City + Group Size */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                <MapPin className="w-3.5 h-3.5 inline mr-1" />City / Neighborhood
              </label>
              <Select value={city} onValueChange={setCity}>
                <SelectTrigger data-testid="select-city" className="w-full bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METRO_DETROIT_CITIES.map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                <Users className="w-3.5 h-3.5 inline mr-1" />
                Group Size — <span className="text-primary font-bold">{groupSize} {groupSize === 1 ? "person" : "people"}</span>
              </label>
              <div className="flex items-center gap-3 mt-3">
                <button onClick={() => setGroupSize(s => Math.max(1, s - 1))}
                  data-testid="button-group-decrease"
                  className="w-8 h-8 rounded-full bg-secondary text-foreground font-bold hover:bg-primary hover:text-white transition-colors flex items-center justify-center text-lg">
                  −
                </button>
                <Slider
                  value={[groupSize]} min={1} max={20} step={1}
                  onValueChange={([v]) => setGroupSize(v)}
                  className="flex-1"
                  data-testid="slider-group-size"
                />
                <button onClick={() => setGroupSize(s => Math.min(20, s + 1))}
                  data-testid="button-group-increase"
                  className="w-8 h-8 rounded-full bg-secondary text-foreground font-bold hover:bg-primary hover:text-white transition-colors flex items-center justify-center text-lg">
                  +
                </button>
              </div>
            </div>
          </div>

          {/* Dining Style */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              <Utensils className="w-3.5 h-3.5 inline mr-1" />Dining Style
            </label>
            <div className="flex flex-wrap gap-2">
              {DINING_STYLES.map(d => (
                <button key={d.id}
                  data-testid={`chip-dining-${d.id}`}
                  onClick={() => setDiningStyle(d.id)}
                  className={`dining-chip flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold transition-all cursor-pointer ${diningStyle === d.id ? "active" : "border-border bg-background text-foreground"}`}>
                  <span className="text-base">{d.icon}</span>
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Cuisine Genre */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Cuisine Genre
            </label>
            <div className="flex flex-wrap gap-2">
              {CUISINE_GENRES.map(g => (
                <button key={g.id}
                  data-testid={`chip-genre-${g.id}`}
                  onClick={() => setGenre(g.id)}
                  className={`genre-chip flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border text-sm font-medium transition-all cursor-pointer ${genre === g.id ? "active" : "border-border bg-background text-foreground"}`}>
                  <span>{g.icon}</span>
                  {g.label}
                </button>
              ))}
            </div>
          </div>

          {/* Price Range + Halal Row */}
          <div className="flex flex-col sm:flex-row gap-4 sm:items-end">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                Price Range <span className="text-muted-foreground font-normal normal-case">(select any)</span>
              </label>
              <div className="flex gap-2">
                {PRICE_RANGES.map(p => (
                  <button key={p.id}
                    data-testid={`chip-price-${p.id}`}
                    onClick={() => togglePrice(p.id)}
                    title={p.desc}
                    className={`price-chip px-4 py-2 rounded-xl border text-sm font-bold transition-all cursor-pointer ${priceRange.includes(p.id) ? "active" : "border-border bg-background text-foreground"}`}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Halal Toggle */}
            <button
              data-testid="button-halal-toggle"
              onClick={() => setHalal(h => !h)}
              className={`flex items-center gap-3 px-5 py-3 rounded-xl border-2 font-bold text-sm transition-all cursor-pointer ${
                halal
                  ? "bg-[hsl(var(--halal-light))] border-[hsl(var(--halal))] text-[hsl(var(--halal-text))]"
                  : "border-border bg-background text-foreground hover:border-green-500"
              }`}>
              <span className="text-xl">☪️</span>
              <span>Halal Only</span>
              {halal ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4 opacity-40" />}
            </button>
          </div>

          {/* Search Button */}
          <Button
            data-testid="button-search"
            onClick={() => searchMutation.mutate()}
            disabled={searchMutation.isPending}
            className="w-full h-12 text-base font-bold bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl"
            size="lg">
            {searchMutation.isPending ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                Finding spots...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Search className="w-4.5 h-4.5" />
                Find {selectedDining?.label} · {selectedGenre?.icon} {selectedGenre?.label}
                {halal && " · Halal"}
              </span>
            )}
          </Button>
        </div>

        {/* Demo banner */}
        {demoMode && (
          <div className="demo-banner rounded-xl px-4 py-3 text-sm text-foreground flex items-start gap-2">
            <span className="text-primary font-bold shrink-0">ℹ️</span>
            <div>
              <span className="font-semibold">Demo Mode</span> — showing sample data.{" "}
              {demoMsg || "Add a Yelp API key (YELP_API_KEY env var) for live Metro Detroit results."}
            </div>
          </div>
        )}

        {/* Results */}
        {searchMutation.isPending && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array(6).fill(0).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        )}

        {!searchMutation.isPending && hasSearched && results.length > 0 && (
          <>
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-foreground text-lg">
                {results.length} spots found
                <span className="text-muted-foreground font-normal text-sm ml-2">in {city}</span>
              </h2>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {halal && <span className="halal-badge px-2 py-0.5 rounded-full font-semibold">☪️ Halal filter on</span>}
                <span className="bg-secondary px-2 py-0.5 rounded-full">{selectedDining?.icon} {selectedDining?.label}</span>
                <span className="bg-secondary px-2 py-0.5 rounded-full">{selectedGenre?.icon} {selectedGenre?.label}</span>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {results.map(r => <RestaurantCard key={r.id} r={r} />)}
            </div>
          </>
        )}

        {!searchMutation.isPending && hasSearched && results.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <div className="text-5xl mb-3">🔍</div>
            <p className="font-semibold text-foreground">No results found</p>
            <p className="text-sm mt-1">Try adjusting your filters or pick a different area</p>
          </div>
        )}

        {!hasSearched && (
          <div className="text-center py-12 text-muted-foreground">
            <div className="text-6xl mb-4">🍽️</div>
            <p className="font-semibold text-foreground text-lg">Ready to eat?</p>
            <p className="text-sm mt-1">Set your filters above and hit <strong>Find</strong> to discover places near you</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-border mt-12 px-4 py-6 text-center text-xs text-muted-foreground">
        <p>DetroitEats — Serving Metro Detroit 🚗</p>
        <p className="mt-1">Results powered by Yelp Fusion API · Add <code className="bg-secondary px-1 py-0.5 rounded">YELP_API_KEY</code> for live data</p>
      </footer>
    </div>
  );
}
