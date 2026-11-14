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
 * Without this, Elysia's default is `context.response = error.message`, so any
 * unhandled throw (an upstream API's error text included) echoes internals to
 * the caller.
 *
 * Deny by default: everything is masked except the handful of codes whose
 * bodies the routes deliberately document. Elysia derives `code` from
 * `error.code` when the error carries one, so allow-listing the failures
 * instead would let arbitrary library codes slip straight through.
 */
const PASS_THROUGH = new Set<string | number>([
  "NOT_FOUND", // thrown by the services, and raised by unmatched routes
  "VALIDATION",
  "PARSE",
  // `throw status(…)` from the services; their code is the number
  400,
  503, // NASA POWER or SoilGrids unavailable and no snapshot nearby
]);

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
