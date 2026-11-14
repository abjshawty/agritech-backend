import { gaez_at } from "@/lib/gaez";
import { cycle_months, next_onset, score } from "@/lib/scorer";
import { Service as Crops } from "@/modules/crops/service";
import { Model } from "./model";
import { get_site } from "./site";

export namespace Service {
  export const recommend = async ({
    lat,
    lon,
    plantingMonth,
    irrigated = Model.default_irrigated,
  }: Model.recommend_query): Promise<Model.recommend_response> => {
    const { site, source } = await get_site(lat, lon);
    const planting =
      plantingMonth ?? next_onset(site.climate.rain, new Date().getMonth() + 1);

    const results = Crops.list()
      .map((crop) => {
        const months =
          crop.kind === "annual"
            ? cycle_months(planting, crop.cycleMonths ?? 4)
            : cycle_months(1, 12);
        const moisture =
          months.reduce((sum, m) => sum + site.climate.wetness[m]!, 0) /
          months.length;
        return {
          ...score(
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
          moisture: Math.round(moisture * 100) / 100,
          gaez: gaez_at(crop.id, lat, lon),
        };
      })
      .sort((a, b) => b.score - a.score);

    return {
      site,
      plantingMonth: planting,
      irrigated,
      source,
      results,
    };
  };
}
