import { Elysia, status, t } from "elysia";
import { Service } from "./service";
import { Model } from "./model";

export const tag = { name: "Post", description: "Create, list and read posts." };

export default new Elysia({ prefix: "/post", tags: [tag.name] })
  .post("/", async ({ body }) => status(201, await Service.create(body)), {
    body: Model.create_body,
    response: {
      201: Model.created_response,
      400: Model.invalid_data,
      409: Model.title_taken,
      500: Model.error_response,
    },
    detail: {
      summary: "Create a post",
      description:
        "Creates a post and returns it as stored. `title` is trimmed before it is checked and saved; one that is empty after trimming is a 400, and one already used by another post is a 409. `body` may be omitted or `null`.",
    },
  })
  .get("/", ({ query }) => Service.list(query), {
    query: Model.list_query,
    response: {
      200: Model.list_response,
      500: Model.error_response,
    },
    detail: {
      summary: "List posts",
      description:
        "Returns one page of posts, newest first by `created_at`, as `{ data, page, size, total }`. `page` defaults to 1 and `size` to 20 (at most 100); a `page` below 1, a `size` outside 1–100 or a non-integer is a 422. A page past the end returns an empty `data` with the real `total`.",
    },
  })
  .get("/:id", ({ params: { id } }) => Service.find(id), {
    params: Model.id_params,
    response: {
      200: Model.found_response,
      404: Model.not_found_id,
      500: Model.error_response,
    },
    detail: {
      summary: "Get a post",
      description:
        "Returns the post with this `id`, a UUID as returned by the list or by creation. A malformed `id` is a 422; a well-formed one that matches no post is a 404.",
    },
  })
  .patch("/:id", ({ params: { id }, body }) => Service.update(id, body), {
    params: Model.id_params,
    body: Model.update_body,
    response: {
      200: Model.updated_response,
      400: Model.invalid_data,
      404: Model.not_found_id,
      409: Model.title_taken,
      500: Model.error_response,
    },
    detail: {
      summary: "Update a post",
      description:
        "Changes only the fields sent, sets `updated_at`, and returns the post as stored. At least one of `title`, `body` or `archived` is required; an empty object is a 422. `title` follows the same rules as on creation: trimmed, a 400 if empty, a 409 if another post has it. Send `body: null` to clear it. Archive a post here rather than deleting it.",
    },
  })
  .delete(
    "/:id",
    async ({ params: { id } }) => {
      await Service.delete(id);
      return status(204);
    },
    {
      params: Model.id_params,
      response: {
        204: t.Void(),
        404: Model.not_found_id,
        500: Model.error_response,
      },
      detail: {
        summary: "Delete a post",
        description:
          "Permanently deletes the post and returns 204 with no body; a post that does not exist is a 404. To hide a post but keep it, update it with `archived: true` instead.",
      },
    },
  );
