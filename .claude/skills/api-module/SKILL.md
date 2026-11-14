---
name: api-module
description: Conventions for adding or changing API resources in this Elysia + Drizzle + Postgres server — the model/service/index module layout under src/modules, how errors become status codes (and why anything undocumented is masked as a 500), how routes are documented in OpenAPI, and how to verify a change against an in-memory Postgres. Use this whenever the task touches an endpoint, route, resource, module, table, request validation, status code or route documentation in this repo — "add a comments endpoint", "let users archive X", "make the list filterable", "return 409 on duplicates", "add CRUD for tags" — even when the user doesn't say "module".
---

# Adding and changing API modules

Every resource is meant to look like `src/modules/post` (`model.ts` schemas and messages, `service.ts` database access, `index.ts` routes and docs). Read it first and match it; it is the reference implementation. This file covers only what the code doesn't make obvious.

## Errors: anything undocumented becomes a 500

`src/lib/error.ts` masks every error as a 500 with a support reference, except codes in `PASS_THROUGH`. This is deliberate (driver messages contain SQL), so keep it deny-by-default.

- `throw status(n, Model.x.const)` reaches `onError` with the **number** `n` as its code. Only the numbers in `PASS_THROUGH` get through (currently 400, 401, 403, 409 and 410). A new one (404 aside, 422, …) must be added there, or it silently becomes a 500. The type-checker won't catch this.
- Not found is `throw new NotFoundError(Model.x.const)`.
- Drizzle wraps driver errors, so the SQLSTATE is on `error.cause.code`. Translate it with a helper in `src/lib/error.ts` (like `is_unique_violation`, 23505), not inline in a service. Catch narrowly and rethrow the rest.
- A uuid in params or a body needs `t.String({ format: "uuid" })`. Otherwise a malformed value fails the cast in Postgres (22P02) and comes back as a 500.

## Rules the code doesn't spell out

- **Nullable vs optional:** in `entity`, a nullable column is `t.Nullable`, not `t.Optional`, because Drizzle returns `null`. In bodies, a nullable field the caller may omit is `t.Optional(t.Nullable(…))`. `update_body` uses `{ minProperties: 1 }`.
- **Messages:** one `t.Literal` per client-facing message. Services throw `.const`, and routes document the schema under the status. Every schema const in `model.ts` has a matching `typeof x.static` type.
- **Updates:** set `updated_at: new Date()` yourself, since the default only fires on insert. Drizzle drops `undefined` keys from `SET` and keeps `null`, so optional body fields can be passed straight through.
- **Not found after a write:** an empty `.returning()` is the 404. Keep that check outside the `try` that translates constraint errors.
- **Lists:** order by a meaningful key plus a unique tiebreaker (`id`).
- **Routes:**
  - `response` lists every status the route can return, including `500: Model.error_response`. The validation 422 is implied.
  - A new status needs both the `response` entry and, for a `status()` throw, a `PASS_THROUGH` entry.
  - Return 201 with `status(201, …)`, and 204 with `status(204)` and `t.Void()`.
  - The tag goes once on the module's `new Elysia({ tags })`, not on each route.
  - A query param with a `default` still needs `t.Optional(...)`. Otherwise the docs mark it required. `Optional` also types it `number | undefined`, so keep the default in a `Model` const and use it in the service too.
  - Nested routes reuse the parent's param name: `/post/:id/comment`, not `/post/:post_id/comment`. Elysia's router refuses two different names in the same position and fails at startup.
- **Descriptions are the contract:** `detail.description` states each input-to-status outcome. Update it in the same edit as any behaviour change.
- **New module:**
  - Export `tag` from its `index.ts`.
  - In `src/modules/index.ts`, import the module, add its tag to `documentation.tags`, and `.use()` it.
  - Update `info.description` if it lists resources.
- **Schema:**
  - Foreign keys choose `onDelete` explicitly.
  - An index for an `ORDER BY x DESC` needs `table.x.desc().nullsFirst()`. Plain `.desc()` makes Drizzle emit `DESC NULLS LAST`, which doesn't match Postgres's `DESC` (nulls first), so the planner sorts instead of using the index. Confirm with `explain` (see below).
  - `bun db:push` writes to the real `DATABASE_URL`. Tell the user to run it rather than running it yourself.

## Verify before reporting

Verify against real SQL, not a mock. `scripts/pglite.ts` (next to this file) starts the real app on an in-memory Postgres (PGlite, a dev dependency). It builds the tables from `src/db/schema.ts` with `drizzle-kit export`, so it always matches the schema you just edited, and it never touches `DATABASE_URL`.

A hand-written mock is not enough. It returns whatever you tell it to, so it can't check constraints, cascades, counts, offsets, or any rule enforced in a `WHERE` clause (e.g. `update … where id = $1 and locked = false`). It will report a 200 where Postgres would refuse.

1. **Types:** `bunx tsc --noEmit -p .` from the repo root must exit 0. The README mentions `bun check`, but that script doesn't exist.
2. **Behaviour:** write a throwaway `src/__probe.ts`, run it with `bun src/__probe.ts`, then delete it. A stray probe gets type-checked with everything else.

```ts
import { start } from "../.claude/skills/api-module/scripts/pglite";
const { req, client } = await start();   // req(method, path, body?) -> { status, body }
const show = (label: string, r: { status: number; body: unknown }) =>
  console.log(label, "->", r.status, JSON.stringify(r.body).slice(0, 120));

const a = await req("POST", "/post/", { title: "hello" });
show("create", a);
show("duplicate", await req("POST", "/post/", { title: "hello" }));   // a real 23505
show("malformed id", await req("GET", "/post/abc"));
// …one request per status in each new or changed route's `response` map.

// Seed or inspect directly when the API can't (bulk rows, timestamps, checking a cascade):
await client.exec("insert into posts (title) select 'p' || i from generate_series(1, 50) i");
console.log((await client.query("select count(*)::int as n from posts")).rows);

// Last: confirm an undocumented failure is still masked as a 500.
await client.exec("drop table posts");
show("undocumented failure", await req("GET", "/post/"));
```

   - Exercise every status the route documents, and check the database state behind the response, not just the status code. For example, after a refused write, check the row is unchanged.
   - For a new list order or index, check the plan with `client.query("explain …")`. On a few rows the planner may prefer a sort anyway, so seed a few thousand rows first.
   - A masked 500 also prints the full error in the server log. That's expected.
   - To see a query's SQL without running it: `drizzle("postgres://x/x").select()….toSQL()`.

3. **Report:**
   - what changed in each file;
   - the probe output;
   - that it ran on PGlite, not the user's database;
   - anything the user must do: `bun db:push` for schema changes, a new `PASS_THROUGH` entry they should know about, behaviour changes clients will see.
