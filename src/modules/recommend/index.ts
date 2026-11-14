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
      500: Model.error_response,
    },
    detail: {
      summary: "Recommend crops for a location",
      description:
        "Scores every crop profile against the site's climate and soil and returns them highest score first, each with a verdict (good ≥70, possible 40–69, poor <40), its factor scores and translation keys for the reasons. A `lat` or `lon` outside Côte d'Ivoire, or a `plantingMonth` outside 1–12, is a 422. **Currently a mock:** every location gets the same Bouaké sample site, with `source: \"snapshot\"`; the scoring itself is real.",
    },
  },
);
