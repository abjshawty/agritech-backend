import openapi from "@elysia/openapi";
import { errors } from "@/lib/error";
import { Elysia } from "elysia";
import { env } from "bun";

// Import modules here
import post, { tag as post_tag } from "./post";
import { name, version } from "@/../package.json";

// Central Elysia instance
export default new Elysia({ prefix: env.SERVER_PATH ?? "" })
  .use(errors)
  .use(
    openapi({
      path: "/docs",
      provider: "scalar",
      scalar: {
        theme: 'deepSpace',
      },
      documentation: {
        info: {
          title: `${name} API Documentation`,
          version,
          description:
            "HTTP API for posts. Every error response is documented per route; any failure not listed there is a 500 carrying a support reference, with the detail kept in the server log.",
        },
        // Each module owns its tag; add a new module's here alongside its `.use()`.
        tags: [post_tag],
        // No `servers`: the spec then defaults to the origin it is served
        // from, so "Try it out" targets this deployment, not localhost.
      },
    }),
  )
  .use(post)
  .get("/", ({ redirect }) => redirect(`${env.SERVER_PATH ?? ""}/docs`), {
    detail: { hide: true },
  });
