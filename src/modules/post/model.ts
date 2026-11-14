import { error_response as shared_error_response } from "@/lib/error";
import { t } from "elysia";

export namespace Model {
  export const entity = t.Object({
    id: t.String(),
    title: t.String(),
    body: t.Nullable(t.String()),
    archived: t.Boolean(),
    created_at: t.Date(),
    updated_at: t.Date(),
  });

  export const id_params = t.Object({ id: t.String({ format: "uuid" }) });

  // Shared with the service: `t.Optional` keeps the params optional in the
  // docs, but also types them `number | undefined`.
  export const default_page = 1;
  export const default_size = 20;

  // Out-of-range or non-integer values are a 422; a page past the end is an empty `data`.
  export const list_query = t.Object({
    page: t.Optional(
      t.Integer({ minimum: 1, default: default_page, description: "1-based page number." }),
    ),
    size: t.Optional(
      t.Integer({ minimum: 1, maximum: 100, default: default_size, description: "Posts per page, at most 100." }),
    ),
  });

  export const create_body = t.Object({
    title: t.String(),
    body: t.Optional(t.Nullable(t.String())),
  });

  export const update_body = t.Object(
    {
      title: t.Optional(t.String()),
      body: t.Optional(t.Nullable(t.String())),
      archived: t.Optional(t.Boolean()),
    },
    { minProperties: 1 },
  );

  // Errors
  export const not_found_id = t.Literal(
    "The post associated to this ID does not exist.",
  );
  export const invalid_data = t.Literal("Invalid post data");
  export const title_taken = t.Literal(
    "A post with this title already exists.",
  );

  // Responses
  export const list_response = t.Object({
    data: t.Array(entity),
    page: t.Integer(),
    size: t.Integer(),
    total: t.Integer({ description: "Number of posts across all pages." }),
  });
  export const found_response = entity;
  export const created_response = entity;
  export const updated_response = entity;
  export const error_response = shared_error_response;

  // Types
  export type entity = typeof entity.static;
  export type id_params = typeof id_params.static;
  export type list_query = typeof list_query.static;
  export type create_body = typeof create_body.static;
  export type update_body = typeof update_body.static;
  export type not_found_id = typeof not_found_id.static;
  export type invalid_data = typeof invalid_data.static;
  export type title_taken = typeof title_taken.static;
  export type list_response = typeof list_response.static;
  export type found_response = typeof found_response.static;
  export type created_response = typeof created_response.static;
  export type updated_response = typeof updated_response.static;
  export type error_response = typeof error_response.static;
}
