import { drizzle } from "drizzle-orm/node-postgres";
import { env } from "bun";

if (!env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not defined.");
}

const db = drizzle(env.DATABASE_URL);
export default db;
