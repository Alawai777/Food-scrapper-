import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@shared/schema";
import path from "path";

const dbPath = path.resolve(process.cwd(), "food_finder.db");
const sqlite = new Database(dbPath);
export const db = drizzle(sqlite, { schema });

// Create tables if they don't exist
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS searches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    city TEXT NOT NULL,
    genre TEXT NOT NULL,
    dining_style TEXT NOT NULL,
    group_size INTEGER NOT NULL,
    price_range TEXT NOT NULL,
    halal INTEGER NOT NULL DEFAULT 0,
    results_json TEXT NOT NULL DEFAULT '[]'
  )
`);
