import { db } from "./db";
import { searches, type InsertSearch, type Search } from "@shared/schema";
import { desc } from "drizzle-orm";

export interface IStorage {
  saveSearch(search: InsertSearch & { resultsJson: string }): Promise<Search>;
  getRecentSearches(limit?: number): Promise<Search[]>;
}

export class DatabaseStorage implements IStorage {
  async saveSearch(data: InsertSearch & { resultsJson: string }): Promise<Search> {
    return db.insert(searches).values(data).returning().get();
  }

  async getRecentSearches(limit = 10): Promise<Search[]> {
    return db.select().from(searches).orderBy(desc(searches.id)).limit(limit).all();
  }
}

export const storage = new DatabaseStorage();
