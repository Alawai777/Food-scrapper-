import type { Express } from "express";
import type { Server } from "http";
import axios from "axios";
import { storage } from "./storage";

const YELP_API_KEY = process.env.YELP_API_KEY || "";
const YELP_BASE = "https://api.yelp.com/v3";

// Yelp category mapping
const GENRE_TO_YELP: Record<string, string> = {
  middle_eastern: "mideastern",
  american: "newamerican,tradamerican",
  italian: "italian",
  mexican: "mexican",
  asian: "asianfusion,chinese,japanese,korean,thai,vietnamese",
  pizza: "pizza",
  seafood: "seafood",
  mediterranean: "mediterranean",
  indian: "indpak",
  bbq: "bbq",
  breakfast: "breakfast_brunch",
  desserts: "desserts,icecream,bakeries",
};

export function registerRoutes(httpServer: Server, app: Express) {
  // Search restaurants via Yelp
  app.post("/api/search", async (req, res) => {
    const { city, genre, diningStyle, groupSize, priceRange, halal } = req.body;

    if (!city || !genre || !diningStyle) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    try {
      let categories = GENRE_TO_YELP[genre] || genre;

      // Add halal category if requested
      if (halal) {
        categories = categories + ",halal";
      }

      // Add dining style category
      const diningCategories: Record<string, string> = {
        restaurants: "restaurants",
        order_food: "food",
        food_trucks: "foodtrucks",
      };
      const diningCat = diningCategories[diningStyle] || "restaurants";

      // If food truck, replace categories entirely
      const finalCategories =
        diningStyle === "food_trucks"
          ? `foodtrucks,${halal ? "halal," : ""}${categories}`
          : `${diningCat},${categories}`;

      const params: Record<string, string | number> = {
        location: city,
        categories: finalCategories,
        limit: 20,
        sort_by: "rating",
      };

      if (priceRange && priceRange !== "all") {
        params.price = priceRange;
      }

      // Group size attribute
      if (groupSize >= 6) {
        params.attributes = "good_for_groups";
      }

      let results = [];
      let usedMock = false;

      if (!YELP_API_KEY) {
        // Mock data when no API key
        usedMock = true;
        results = getMockResults(city, genre, diningStyle, halal, priceRange);
      } else {
        const response = await axios.get(`${YELP_BASE}/businesses/search`, {
          headers: { Authorization: `Bearer ${YELP_API_KEY}` },
          params,
        });
        results = response.data.businesses.map((b: any) => ({
          id: b.id,
          name: b.name,
          rating: b.rating,
          reviewCount: b.review_count,
          price: b.price || "N/A",
          address: b.location?.display_address?.join(", ") || "",
          phone: b.display_phone || "",
          imageUrl: b.image_url || "",
          url: b.url || "",
          categories: b.categories?.map((c: any) => c.title).join(", ") || "",
          isOpen: !b.is_closed,
          distance: b.distance ? (b.distance * 0.000621371).toFixed(1) + " mi" : "",
          coordinates: b.coordinates,
        }));
      }

      // Save search to DB
      await storage.saveSearch({
        city,
        genre,
        diningStyle,
        groupSize: Number(groupSize),
        priceRange: priceRange || "all",
        halal: Boolean(halal),
        resultsJson: JSON.stringify(results),
      });

      res.json({ results, usedMock });
    } catch (err: any) {
      console.error("Yelp API error:", err?.response?.data || err.message);
      // Fallback to mock on error
      const results = getMockResults(city, genre, diningStyle, halal, priceRange);
      res.json({ results, usedMock: true, error: "Using demo data — add a Yelp API key for live results" });
    }
  });

  // Recent searches
  app.get("/api/recent", async (_req, res) => {
    const recent = await storage.getRecentSearches(6);
    res.json(recent);
  });
}

function getMockResults(city: string, genre: string, diningStyle: string, halal: boolean, priceRange: string) {
  const mockPlaces = [
    {
      id: "1",
      name: halal ? "Al-Ameer Restaurant" : "Detroit Coney Island",
      rating: 4.5,
      reviewCount: 1243,
      price: "$$",
      address: `${city}`,
      phone: "(313) 555-0101",
      imageUrl: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400&h=300&fit=crop",
      url: "#",
      categories: halal ? "Middle Eastern, Halal" : "American, Comfort Food",
      isOpen: true,
      distance: "0.8 mi",
    },
    {
      id: "2",
      name: diningStyle === "food_trucks" ? "Metro Eats Food Truck" : "Beirut Restaurant",
      rating: 4.3,
      reviewCount: 892,
      price: priceRange === "1" ? "$" : "$$",
      address: `${city}`,
      phone: "(313) 555-0202",
      imageUrl: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=400&h=300&fit=crop",
      url: "#",
      categories: halal ? "Lebanese, Halal" : "Mediterranean",
      isOpen: true,
      distance: "1.2 mi",
    },
    {
      id: "3",
      name: "Shatila Bakery",
      rating: 4.7,
      reviewCount: 2100,
      price: "$",
      address: `${city}`,
      phone: "(313) 555-0303",
      imageUrl: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=400&h=300&fit=crop",
      url: "#",
      categories: "Bakery, Desserts, Middle Eastern",
      isOpen: true,
      distance: "2.1 mi",
    },
    {
      id: "4",
      name: "La Paloma Mexican Grill",
      rating: 4.1,
      reviewCount: 645,
      price: "$$",
      address: `${city}`,
      phone: "(313) 555-0404",
      imageUrl: "https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=400&h=300&fit=crop",
      url: "#",
      categories: "Mexican, Tacos",
      isOpen: false,
      distance: "3.4 mi",
    },
    {
      id: "5",
      name: "Motor City BBQ",
      rating: 4.4,
      reviewCount: 987,
      price: "$$",
      address: `${city}`,
      phone: "(313) 555-0505",
      imageUrl: "https://images.unsplash.com/photo-1544025162-d76694265947?w=400&h=300&fit=crop",
      url: "#",
      categories: halal ? "BBQ, Halal" : "BBQ, American",
      isOpen: true,
      distance: "1.9 mi",
    },
    {
      id: "6",
      name: "Kabob Village",
      rating: 4.6,
      reviewCount: 1567,
      price: "$$",
      address: `${city}`,
      phone: "(313) 555-0606",
      imageUrl: "https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=400&h=300&fit=crop",
      url: "#",
      categories: "Middle Eastern, Halal, Kabob",
      isOpen: true,
      distance: "0.5 mi",
    },
  ];
  return mockPlaces;
}
