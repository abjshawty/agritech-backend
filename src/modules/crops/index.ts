import { Elysia } from "elysia";
import { Service } from "./service";
import { Model } from "./model";

export const tag = {
  name: "Crops",
  description: "The crop profiles the scorer compares each site against.",
};

export default new Elysia({ prefix: "/crops", tags: [tag.name] }).get(
  "/",
  () => Service.list(),
  {
    response: {
      200: Model.list_response,
      500: Model.error_response,
    },
    detail: {
      summary: "List crop profiles",
      description:
        "Returns every crop profile from `data/crops.json`: names in French and English, whether the crop is annual or perennial, and its optimal and absolute ranges for temperature, rainfall, soil pH and (perennials) dry-season length, plus the soil textures it suits.",
    },
  },
);
