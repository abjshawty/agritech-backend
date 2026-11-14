import { next_onset, score } from "@/lib/scorer";
import { Service as Crops } from "@/modules/crops/service";
import { Model } from "./model";
import { sample_site } from "./site";

export namespace Service {
  export const recommend = ({
    lat,
    lon,
    plantingMonth,
    irrigated = Model.default_irrigated,
  }: Model.recommend_query): Model.recommend_response => {
    const site = sample_site(lat, lon);
    const planting =
      plantingMonth ?? next_onset(site.climate.rain, new Date().getMonth() + 1);

    const results = Crops.list()
      .map((crop) =>
        score(
          crop,
          {
            rain: site.climate.rain,
            tmean: site.climate.tmean,
            ph: site.soil.ph,
            texture: site.soil.texture,
          },
          planting,
          irrigated,
        ),
      )
      .sort((a, b) => b.score - a.score);

    return {
      site,
      plantingMonth: planting,
      irrigated,
      source: "snapshot",
      results,
    };
  };
}
