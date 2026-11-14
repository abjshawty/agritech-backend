import { Elysia } from "elysia";
import { Service } from "./service";
import { Model } from "./model";

export const tag = {
  name: "Recommend",
  description: "Rank crops for a location in Côte d'Ivoire.",
};

export default new Elysia({ prefix: "/recommend", tags: [tag.name] }).get(
  "/",
  ({ query }) => Service.recommend(query),
  {
    query: Model.recommend_query,
    response: {
      200: Model.recommend_response,
      400: Model.no_soil,
      503: Model.climate_unavailable,
      500: Model.error_response,
    },
    detail: {
      summary: "Recommend crops for a location",
      description:
        "Scores every crop profile against the site's climate (NASA POWER, 2014–2023 monthly averages, compared with 1984–1993) and topsoil (SoilGrids, 0–30 cm) and returns them highest score first, each with a verdict (good ≥70, possible 40–69, poor <40), its factor scores and translation keys for the reasons. A `lat` or `lon` outside Côte d'Ivoire, or a `plantingMonth` outside 1–12, is a 422. A point with no mapped soil within about 15 km, such as the sea, is a 400. Climate is cached per 0.1° cell; when NASA POWER fails or takes over 8 s, a point within 25 km of a demo town (Abidjan, Bouaké, Korhogo, San-Pédro, Man) gets that town's saved climate with `source: \"snapshot\"`, and anywhere else is a 503.",
    },
  },
);
