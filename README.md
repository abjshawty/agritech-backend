# http

A template for a backend HTTP server: [Bun](https://bun.com), [Elysia](https://elysiajs.com), [Drizzle](https://orm.drizzle.team) and Postgres. It ships one example resource, posts, with full CRUD, pagination, validation, OpenAPI docs and consistent error handling, meant to be copied for your own resources.

## Getting started

You need Bun 1.3.10 or later and a Postgres server.

```bash
bun install
cp .env.example .env    # then fill in DATABASE_URL
bun db:push             # creates the database if needed, then syncs the schema
bun dev                 # http://localhost:3000, reloads on change
```

Open `http://localhost:3000/` and you are redirected to the API docs at `/docs`. The raw OpenAPI spec is at `/docs/json`.

### Environment

| Variable       | Required | Default | Purpose                                                        |
| -------------- | -------- | ------- | -------------------------------------------------------------- |
| `DATABASE_URL` | yes      |         | `postgresql://<user>:<password>@<host>/<db>`                   |
| `PORT`         | no       | `3000`  | Port to listen on                                              |
| `SERVER_PATH`  | no       | `""`    | Prefix in front of every route, docs included (e.g. `/api/v1`) |

Bun loads `.env` automatically.

### Scripts

| Command          | What it does                                                                         |
| ---------------- | ------------------------------------------------------------------------------------ |
| `bun dev`        | Runs the server with hot reload                                                      |
| `bun start`      | Runs the server                                                                      |
| `bun db:ensure`  | Creates the database named in `DATABASE_URL` if it doesn't exist                     |
| `bun db:push`    | `db:ensure`, then pushes `src/db/schema.ts` to the database with drizzle-kit         |
| `bun format`     | Formats `src/` with Prettier                                                          |

To type-check, run `bunx tsc --noEmit`.

## API

All routes are documented, with request and response schemas, at `/docs`.

| Method   | Path        | Description                                                         | Success |
| -------- | ----------- | ------------------------------------------------------------------- | ------- |
| `POST`   | `/post`     | Create a post (`title` required and unique, `body` optional)        | 201     |
| `GET`    | `/post`     | List posts, newest first; `?page=1&size=20` (size at most 100)      | 200     |
| `GET`    | `/post/:id` | Get one post                                                        | 200     |
| `PATCH`  | `/post/:id` | Update any of `title`, `body`, `archived`                           | 200     |
| `DELETE` | `/post/:id` | Delete a post permanently                                           | 204     |

The list returns `{ data, page, size, total }`. Titles are trimmed; an empty title is a 400 and a duplicate one is a 409. A malformed id or invalid body is a 422, and an unknown id is a 404.

### Errors

Every status a route can return is listed in its docs. Anything else, such as a database failure, becomes a 500 with a generic message and a short reference:

```json
{ "message": "Sorry, an error has occurred in our product. Please relay this to our support.", "error": "3f9a1c2e" }
```

The full error is logged on the server under that reference. This is deliberate: driver errors can contain SQL and data, so only errors the code explicitly allows reach the client (see `PASS_THROUGH` in `src/lib/error.ts`).

## Project layout

```
src/
├── index.ts              # starts the server
├── db/
│   ├── client.ts         # Drizzle client
│   ├── schema.ts         # tables
│   └── ensure.ts         # creates the database (used by db:push)
├── lib/
│   └── error.ts          # error masking and Postgres error helpers
└── modules/
    ├── index.ts          # app: error handler, OpenAPI, module registration
    └── post/
        ├── model.ts      # request/response schemas and error messages
        ├── service.ts    # database access and business rules
        └── index.ts      # routes and their documentation
```

## Adding a resource

Copy `src/modules/post` and follow its shape: schemas and messages in `model.ts`, queries in `service.ts`, routes in `index.ts`. Then:

1. Add the table to `src/db/schema.ts` and run `bun db:push`.
2. Export the module's `tag` and, in `src/modules/index.ts`, add it to `documentation.tags` and `.use()` the module.
3. If a route returns a new error status through `status(…)` (anything beyond the 400, 401, 403, 409 and 410 already allowed, e.g. 422), add it to `PASS_THROUGH` in `src/lib/error.ts`, or it will reach the client as a 500.

If you use [Claude Code](https://claude.com/claude-code), the `api-module` skill in `.claude/skills/` covers these conventions and how to test a change against an in-memory Postgres ([PGlite](https://pglite.dev)) without touching your database.

## License

MIT
