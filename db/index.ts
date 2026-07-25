import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";
import { getBindings } from "@/lib/server/runtime";

export function getDb() {
  const database = getBindings().DB;
  if (!database) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Configure the DB binding in wrangler.jsonc before using the database."
    );
  }

  return drizzle(database, { schema });
}

export function getDbOptional() {
  const database = getBindings().DB;
  return database ? drizzle(database, { schema }) : null;
}
