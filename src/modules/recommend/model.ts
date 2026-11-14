import { error_response as shared_error_response } from "@/lib/error";
import { Model as Crops } from "@/modules/crops/model";
import { t } from "elysia";

export namespace Model {
  // Côte d'Ivoire's bounding box, with a little margin.
  export const bounds = { lat: [4.3, 10.8], lon: [-8.7, -2.4] } as const;

  export const default_irrigated = false;

  export const recommend_query = t.Object({
    lat: t.Number({
      minimum: bounds.lat[0],
      maximum: bounds.lat[1],
      description: "Latitude in degrees, within Côte d'Ivoire.",
    }),
    lon: t.Number({
      minimum: bounds.lon[0],
      maximum: bounds.lon[1],
      description: "Longitude in degrees, within Côte d'Ivoire.",
    }),
    plantingMonth: t.Optional(
      t.Integer({
        minimum: 1,
        maximum: 12,
        description:
          "Planting month for annual crops, 1–12. Defaults to the next rainy-season onset at this site.",
      }),
    ),
    irrigated: t.Optional(
      t.Boolean({
        default: default_irrigated,
        description:
          "Whether the field can be irrigated. A rainfall shortfall then counts as met, and is reported as irrigation to plan.",
      }),
    ),
  });

  const months = (description: string) =>
    t.Array(t.Number(), { minItems: 12, maxItems: 12, description });

  export const site = t.Object({
    lat: t.Number(),
    lon: t.Number(),
    nearestTown: t.String(),
    climate: t.Object(
      {
        rain: months("Mean rainfall per month in mm, January first."),
        tmean: months("Mean temperature per month in °C, January first."),
        annualRain: t.Number({ description: "Total of `rain`, in mm." }),
        dryMonths: t.Integer({
          description: "Months with under 50 mm of rain.",
        }),
      },
      { description: "Averages over 2014–2023, from NASA POWER." },
    ),
    soil: t.Object(
      {
        ph: t.Number(),
        sand: t.Number({ description: "Percent." }),
        clay: t.Number({ description: "Percent." }),
        soc: t.Number({ description: "Soil organic carbon, percent." }),
        texture: Crops.texture,
      },
      { description: "Topsoil (0–30 cm), from SoilGrids." },
    ),
    shift: t.Object(
      {
        rainPct: t.Number({
          description: "Change in annual rainfall, percent.",
        }),
        tempDelta: t.Number({ description: "Change in mean temperature, °C." }),
      },
      { description: "2014–2023 compared with 1984–1993." },
    ),
  });

  const range = t.Tuple([t.Number(), t.Number()]);

  export const result = t.Object({
    cropId: t.String(),
    kind: t.Union([t.Literal("annual"), t.Literal("perennial")]),
    score: t.Integer({ minimum: 0, maximum: 100 }),
    verdict: t.Union([
      t.Literal("good"),
      t.Literal("possible"),
      t.Literal("poor"),
    ]),
    waterDeficitMm: t.Number({
      description:
        "Rain short of the crop's optimal minimum, in mm; 0 when there is enough.",
    }),
    factors: t.Array(
      t.Object({
        key: t.Union([
          t.Literal("rain"),
          t.Literal("temp"),
          t.Literal("ph"),
          t.Literal("texture"),
          t.Literal("dryMonths"),
        ]),
        value: t.Union([t.Number(), t.String()]),
        optimal: t.Nullable(range),
        absolute: t.Nullable(range),
        score: t.Number({ minimum: 0, maximum: 1 }),
      }),
    ),
    reasons: t.Array(
      t.Object({
        key: t.String({
          description:
            "Translation key, such as `rain.tooLow` or `texture.unsuited`.",
        }),
        params: t.Record(t.String(), t.Union([t.Number(), t.String()])),
      }),
      { description: "Weakest factor first, then the strongest." },
    ),
  });

  // Responses
  export const recommend_response = t.Object({
    site,
    plantingMonth: t.Integer({
      minimum: 1,
      maximum: 12,
      description: "The planting month used, after applying the default.",
    }),
    irrigated: t.Boolean(),
    source: t.Union(
      [t.Literal("live"), t.Literal("cache"), t.Literal("snapshot")],
      {
        description:
          "Where the site data came from: fetched now, from the cache, or from a saved demo-town snapshot.",
      },
    ),
    results: t.Array(result, { description: "Highest score first." }),
  });
  export const error_response = shared_error_response;

  // Types
  export type recommend_query = typeof recommend_query.static;
  export type site = typeof site.static;
  export type result = typeof result.static;
  export type recommend_response = typeof recommend_response.static;
  export type error_response = typeof error_response.static;
}
