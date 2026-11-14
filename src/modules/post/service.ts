import { is_unique_violation } from "@/lib/error";
import { postsTable } from "@/db/schema";
import { NotFoundError, status } from "elysia";
import { count, desc, eq } from "drizzle-orm";
import { Model } from "./model";
import db from "@/db/client";

export abstract class Service {
  static async list({
    page = Model.default_page,
    size = Model.default_size,
  }: Model.list_query): Promise<Model.list_response> {
    const [data, [counted]] = await Promise.all([
      db
        .select()
        .from(postsTable)
        // `id` breaks ties, so rows created in the same instant keep a stable
        // order and never straddle two pages. Served by posts_created_at_id_idx.
        .orderBy(desc(postsTable.created_at), postsTable.id)
        .limit(size)
        .offset((page - 1) * size),
      db.select({ total: count() }).from(postsTable),
    ]);
    return { data, page, size, total: counted?.total ?? 0 };
  }

  static async find(id: string): Promise<Model.found_response> {
    const result = await db
      .select()
      .from(postsTable)
      .where(eq(postsTable.id, id))
      .limit(1);
    if (result[0]) return result[0];
    throw new NotFoundError(Model.not_found_id.const);
  }

  static async create({
    title: raw_title,
    body,
  }: Model.create_body): Promise<Model.created_response> {
    const title = Service.title(raw_title);
    try {
      const result = await db
        .insert(postsTable)
        .values({ title, body })
        .returning();
      return result[0]!;
    } catch (error) {
      throw Service.conflict(error);
    }
  }

  static async update(
    id: string,
    { title: raw_title, body, archived }: Model.update_body,
  ): Promise<Model.updated_response> {
    const title = raw_title === undefined ? undefined : Service.title(raw_title);
    let result;
    try {
      // Drizzle leaves undefined fields out of the SET, so absent keys are untouched.
      result = await db
        .update(postsTable)
        .set({ title, body, archived, updated_at: new Date() })
        .where(eq(postsTable.id, id))
        .returning();
    } catch (error) {
      throw Service.conflict(error);
    }
    if (result[0]) return result[0];
    throw new NotFoundError(Model.not_found_id.const);
  }

  static async delete(id: string): Promise<void> {
    const result = await db
      .delete(postsTable)
      .where(eq(postsTable.id, id))
      .returning({ id: postsTable.id });
    if (!result[0]) throw new NotFoundError(Model.not_found_id.const);
  }

  /** Stored trimmed too, so "a" and "a " cannot both pass the unique check. */
  private static title(raw: string) {
    const title = raw.trim();
    if (!title) throw status(400, Model.invalid_data.const);
    return title;
  }

  /** `title` is the only unique column a caller controls. */
  private static conflict(error: unknown) {
    return is_unique_violation(error)
      ? status(409, Model.title_taken.const)
      : error;
  }
}
