import { DrizzleQueryError } from "drizzle-orm";
import { Elysia, t } from "elysia";

/**
 * The one 500 body the app is allowed to emit. Shared rather than redeclared
 * per resource so the literal cannot drift between modules.
 */
export const SUPPORT_MESSAGE =
  "Sorry, an error has occurred in our product. Please relay this to our support.";

export const error_response = t.Object({
  message: t.Literal(SUPPORT_MESSAGE),
  error: t.String({
    description:
      "Opaque reference for this occurrence. Quote it to support; the detail is in the server log, never in this body.",
  }),
});

export type error_response = typeof error_response.static;

/**
 * Without this, Elysia's default is `context.response = error.message`, and a
 * driver error's message is the full SQL plus its parameters — so any
 * unhandled throw echoes the schema to the caller.
 *
 * Deny by default: everything is masked except the handful of codes whose
 * bodies the routes deliberately document. Allow-listing the failures instead
 * does not work, because Elysia derives `code` from `error.code` when the
 * error carries one — and Postgres driver errors carry the SQLSTATE, so a
 * missing relation that surfaces unwrapped arrives as `42P01` rather than
 * `UNKNOWN` and would slip straight through. Any driver behaves the same way.
 */
const PASS_THROUGH = new Set<string | number>([
  "NOT_FOUND", // thrown by the services, and raised by unmatched routes
  "VALIDATION",
  "PARSE",
  "INVALID_COOKIE_SIGNATURE",
  "INVALID_FILE_TYPE",
  // `throw status(…)` from the services; their code is the number
  400,
  401,
  403,
  409,
  410,
]);

/**
 * Postgres `unique_violation`. Drizzle wraps the driver error in a
 * `DrizzleQueryError`, so the SQLSTATE is on `cause`, not on the error itself.
 * Services catch this and rethrow their own documented 409.
 */
export const is_unique_violation = (error: unknown) =>
  error instanceof DrizzleQueryError &&
  (error.cause as { code?: unknown } | undefined)?.code === "23505";

export const errors = new Elysia({ name: "errors" }).onError(
  { as: "global" },
  ({ code, error, set }) => {
    if (PASS_THROUGH.has(code)) return;

    const reference = crypto.randomUUID().slice(0, 8);
    console.error(`[${reference}]`, error);

    set.status = 500;
    return { message: SUPPORT_MESSAGE, error: reference };
  },
);
