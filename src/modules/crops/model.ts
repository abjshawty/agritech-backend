import { error_response as shared_error_response } from "@/lib/error";
import { t } from "elysia";

export namespace Model {
  const limits = t.Object({
    optimal: t.Tuple([t.Number(), t.Number()], {
      description: "Range where the crop does best; scores 1.",
    }),
    absolute: t.Tuple([t.Number(), t.Number()], {
      description: "Outside this range the crop fails; scores 0.",
    }),
  });

  export const texture = t.Union(
    [
      t.Literal("sand"),
      t.Literal("sandy_loam"),
      t.Literal("loam"),
      t.Literal("clay_loam"),
      t.Literal("clay"),
    ],
    { description: "Simplified soil texture class." },
  );

  export const entity = t.Object({
    id: t.String(),
    name: t.Object({ fr: t.String(), en: t.String() }),
    kind: t.Union([t.Literal("annual"), t.Literal("perennial")]),
    cycleMonths: t.Optional(
      t.Number({
        minimum: 1,
        maximum: 12,
        description: "Annual crops only: months from planting to harvest.",
      }),
    ),
    temp: t.Object(limits.properties, {
      description:
        "Mean temperature in °C, over the cycle for annual crops and over the year for perennials.",
    }),
    rain: t.Object(limits.properties, {
      description:
        "Rainfall in mm, total over the cycle for annual crops and per year for perennials.",
    }),
    ph: t.Object(limits.properties, { description: "Soil pH in water." }),
    dryMonths: t.Optional(
      t.Object(limits.properties, {
        description:
          "Perennials only: months per year with under 50 mm of rain.",
      }),
    ),
    textures: t.Array(texture, {
      description: "Soil textures the crop is suited to.",
    }),
    source: t.String({
      description:
        "Where the ranges come from, e.g. `FAO ECOCROP: Zea mays ssp. mays`.",
    }),
  });

  // Responses
  export const list_response = t.Array(entity);
  export const error_response = shared_error_response;

  // Types
  export type texture = typeof texture.static;
  export type entity = typeof entity.static;
  export type list_response = typeof list_response.static;
  export type error_response = typeof error_response.static;
}
