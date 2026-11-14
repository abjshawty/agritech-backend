// Runs the real app against an in-memory Postgres (PGlite), for throwaway
// probes. Real SQL means real constraints, cascades, WHERE-dependent logic,
// counts and query plans — the things a hand-written mock silently gets wrong.
//
//   import { start } from "../.claude/skills/api-module/scripts/pglite";
//   const { req, client } = await start();
//   console.log(await req("POST", "/post/", { title: "hi" }));
import { mock } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { join } from "node:path";

const root = join(import.meta.dir, "../../../..");

export async function start() {
  // Bun loads .env, which may point at a real database. The client is mocked
  // below, but if that ever failed, this makes a query fail instead of landing.
  process.env.DATABASE_URL = "postgres://pglite-only@127.0.0.1:1/none";

  // The schema as DDL, straight from src/db/schema.ts. `export` is offline.
  const ddl = Bun.spawnSync(["bunx", "drizzle-kit", "export"], {
    cwd: root,
    env: { ...process.env },
  });
  if (!ddl.success) throw new Error(`drizzle-kit export failed:\n${ddl.stderr}`);

  const client = new PGlite();
  await client.exec(ddl.stdout.toString());
  mock.module("@/db/client", () => ({ default: drizzle({ client }) }));

  // Imported only after the mock, so every service gets the PGlite client.
  const app = (await import("@/modules")).default;

  /** Sends a request through the app; `body` is parsed JSON when possible. */
  const req = async (method: string, path: string, body?: unknown) => {
    const response = await app.handle(
      new Request("http://localhost" + path, {
        method,
        ...(body !== undefined && {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
      }),
    );
    const text = await response.text();
    let parsed: any = text;
    try {
      parsed = JSON.parse(text);
    } catch {}
    return { status: response.status, body: parsed };
  };

  return { app, client, req, ddl: ddl.stdout.toString() };
}
