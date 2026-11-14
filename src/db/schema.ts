import {
  uuid,
  pgTable,
  text,
  varchar,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

export const postsTable = pgTable("posts", {
  id: uuid().primaryKey().defaultRandom(),
  title: varchar({ length: 255 }).notNull().unique(),
  body: text(),
  archived: boolean().default(false).notNull(),
  created_at: timestamp().defaultNow().notNull(),
  updated_at: timestamp().defaultNow().notNull(),
}, (table) => [
  // Matches the list's ORDER BY, so a page is an index scan, not a sort.
  // `nullsFirst()` because that is what Postgres means by plain `DESC`; Drizzle
  // otherwise emits `DESC NULLS LAST`, which the planner cannot use for it.
  index("posts_created_at_id_idx").on(table.created_at.desc().nullsFirst(), table.id),
]);
