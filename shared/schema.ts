import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Search history table
export const searches = sqliteTable("searches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  city: text("city").notNull(),
  genre: text("genre").notNull(),
  diningStyle: text("dining_style").notNull(),
  groupSize: integer("group_size").notNull(),
  priceRange: text("price_range").notNull(),
  halal: integer("halal", { mode: "boolean" }).notNull().default(false),
  resultsJson: text("results_json").notNull().default("[]"),
});

export const insertSearchSchema = createInsertSchema(searches).omit({ id: true, resultsJson: true });
export type InsertSearch = z.infer<typeof insertSearchSchema>;
export type Search = typeof searches.$inferSelect;

// Types used across the app
export const METRO_DETROIT_CITIES = [
  "Dearborn, MI",
  "Dearborn Heights, MI",
  "Detroit, MI",
  "Livonia, MI",
  "Warren, MI",
  "Sterling Heights, MI",
  "Troy, MI",
  "Southfield, MI",
  "Ann Arbor, MI",
  "Westland, MI",
  "Taylor, MI",
  "Hamtramck, MI",
  "Inkster, MI",
  "Garden City, MI",
  "Allen Park, MI",
];

export const CUISINE_GENRES = [
  { id: "middle_eastern", label: "Middle Eastern", icon: "🧆" },
  { id: "american", label: "American", icon: "🍔" },
  { id: "italian", label: "Italian", icon: "🍝" },
  { id: "mexican", label: "Mexican", icon: "🌮" },
  { id: "asian", label: "Asian", icon: "🍜" },
  { id: "pizza", label: "Pizza", icon: "🍕" },
  { id: "seafood", label: "Seafood", icon: "🦞" },
  { id: "mediterranean", label: "Mediterranean", icon: "🥙" },
  { id: "indian", label: "Indian", icon: "🍛" },
  { id: "bbq", label: "BBQ", icon: "🍖" },
  { id: "breakfast", label: "Breakfast", icon: "🍳" },
  { id: "desserts", label: "Desserts", icon: "🧁" },
];

export const DINING_STYLES = [
  { id: "restaurants", label: "Dine In", icon: "🍽️", yelpAttr: "restaurants" },
  { id: "order_food", label: "Pick Up", icon: "🥡", yelpAttr: "order_food" },
  { id: "food_trucks", label: "Food Truck", icon: "🚚", yelpAttr: "food_trucks" },
];

export const PRICE_RANGES = [
  { id: "1", label: "$", desc: "Under $15" },
  { id: "2", label: "$$", desc: "$15–$30" },
  { id: "3", label: "$$$", desc: "$30–$60" },
  { id: "4", label: "$$$$", desc: "Over $60" },
];
