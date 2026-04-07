import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@shared/schema";
import path from "path";

const dbPath = path.resolve(process.cwd(), "yarted_eats.db");
const sqlite = new Database(dbPath);
export const db = drizzle(sqlite, { schema });

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS searches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    city TEXT NOT NULL,
    genre TEXT NOT NULL,
    dining_style TEXT NOT NULL,
    group_size INTEGER NOT NULL,
    price_range TEXT NOT NULL,
    halal INTEGER NOT NULL DEFAULT 0,
    open_now INTEGER NOT NULL DEFAULT 0,
    data_source TEXT NOT NULL DEFAULT 'osm',
    results_json TEXT NOT NULL DEFAULT '[]'
  )
`);
