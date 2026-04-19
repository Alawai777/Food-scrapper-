import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const searches = sqliteTable("searches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  city: text("city").notNull(),
  genre: text("genre").notNull(),
  diningStyle: text("dining_style").notNull(),
  groupSize: integer("group_size").notNull(),
  priceRange: text("price_range").notNull(),
  halal: integer("halal", { mode: "boolean" }).notNull().default(false),
  openNow: integer("open_now", { mode: "boolean" }).notNull().default(false),
  dataSource: text("data_source").notNull().default("osm"),
  resultsJson: text("results_json").notNull().default("[]"),
});

export const insertSearchSchema = createInsertSchema(searches).omit({ id: true, resultsJson: true });
export type InsertSearch = z.infer<typeof insertSearchSchema>;
export type Search = typeof searches.$inferSelect;

// Metro Detroit city bounding boxes [south, west, north, east]
export const CITY_BBOXES: Record<string, [number, number, number, number]> = {
  "Dearborn, MI":         [42.28, -83.26, 42.36, -83.13],
  "Dearborn Heights, MI": [42.32, -83.32, 42.40, -83.22],
  "Detroit, MI":          [42.26, -83.32, 42.46, -82.90],
  "Livonia, MI":          [42.36, -83.43, 42.44, -83.32],
  "Warren, MI":           [42.45, -83.12, 42.56, -82.99],
  "Sterling Heights, MI": [42.52, -83.13, 42.63, -82.97],
  "Troy, MI":             [42.53, -83.20, 42.63, -83.08],
  "Southfield, MI":       [42.44, -83.30, 42.53, -83.17],
  "Ann Arbor, MI":        [42.22, -83.84, 42.34, -83.68],
  "Westland, MI":         [42.31, -83.44, 42.39, -83.34],
  "Taylor, MI":           [42.19, -83.30, 42.27, -83.22],
  "Hamtramck, MI":        [42.38, -83.08, 42.42, -83.04],
  "Inkster, MI":          [42.27, -83.35, 42.32, -83.30],
  "Garden City, MI":      [42.32, -83.37, 42.36, -83.33],
  "Allen Park, MI":       [42.25, -83.23, 42.30, -83.18],
  "Canton Township, MI":  [42.29, -83.57, 42.38, -83.43],
  "Farmington Hills, MI": [42.46, -83.44, 42.55, -83.30],
};

export const METRO_DETROIT_CITIES = Object.keys(CITY_BBOXES);

export const CUISINE_GENRES = [
  { id: "any",            label: "Any Food",       icon: "🍽️", osm: "",                                                                                       yelp: "",                                              google: "" },
  { id: "middle_eastern", label: "Middle Eastern",  icon: "🧆", osm: "middle_eastern|arabic|lebanese|turkish|persian|iranian|syrian|iraqi|jordanian|yemeni",   yelp: "mideastern,arabic,lebanese,turkish,persian",    google: "middle eastern restaurant" },
  { id: "american",       label: "American",        icon: "🍔", osm: "american|burger|hot_dog|chicken|diner|steak",                                           yelp: "newamerican,tradamerican,burgers",              google: "american restaurant" },
  { id: "italian",        label: "Italian",         icon: "🍝", osm: "italian|pasta",                                                                          yelp: "italian",                                       google: "italian restaurant" },
  { id: "mexican",        label: "Mexican",         icon: "🌮", osm: "mexican|tex-mex|tacos",                                                                  yelp: "mexican,tex-mex",                               google: "mexican restaurant" },
  { id: "asian",          label: "Asian",           icon: "🍜", osm: "chinese|japanese|korean|thai|vietnamese|sushi|ramen|asian",                               yelp: "asianfusion,chinese,japanese,korean,thai,vietnamese", google: "asian restaurant" },
  { id: "pizza",          label: "Pizza",           icon: "🍕", osm: "pizza",                                                                                  yelp: "pizza",                                         google: "pizza" },
  { id: "seafood",        label: "Seafood",         icon: "🦞", osm: "seafood|fish|fish_and_chips",                                                            yelp: "seafood",                                       google: "seafood restaurant" },
  { id: "mediterranean",  label: "Mediterranean",   icon: "🥙", osm: "mediterranean|greek",                                                                    yelp: "mediterranean,greek",                           google: "mediterranean restaurant" },
  { id: "indian",         label: "Indian",          icon: "🍛", osm: "indian|pakistani",                                                                       yelp: "indpak",                                        google: "indian restaurant" },
  { id: "bbq",            label: "BBQ",             icon: "🍖", osm: "barbecue|bbq",                                                                           yelp: "bbq",                                           google: "bbq" },
  { id: "breakfast",      label: "Breakfast",       icon: "🍳", osm: "breakfast|brunch",                                                                        yelp: "breakfast_brunch",                              google: "breakfast restaurant" },
  { id: "desserts",       label: "Desserts",        icon: "🧁", osm: "ice_cream|dessert|cake|bakery|donut",                                                    yelp: "desserts,icecream,bakeries",                    google: "dessert" },
];

export const DINING_STYLES = [
  { id: "restaurants", label: "Dine In",    icon: "🍽️", osm: ["restaurant"],                 yelp: "restaurants",  google: "restaurant" },
  { id: "order_food",  label: "Pick Up",    icon: "🥡", osm: ["fast_food", "restaurant"],    yelp: "food",         google: "restaurant" },
  { id: "food_trucks", label: "Food Truck", icon: "🚚", osm: ["food_truck", "fast_food"],    yelp: "foodtrucks",   google: "restaurant" },
];

export const PRICE_RANGES = [
  { id: "1", label: "$",    desc: "Under $15" },
  { id: "2", label: "$$",   desc: "$15–$30" },
  { id: "3", label: "$$$",  desc: "$30–$60" },
  { id: "4", label: "$$$$", desc: "Over $60" },
];

export const SORT_OPTIONS = [
  { id: "name",     label: "Name" },
  { id: "rating",   label: "Rating" },
  { id: "distance", label: "Distance" },
];
