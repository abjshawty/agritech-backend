import crops from "@/../data/crops.json";
import type { Model } from "./model";

export namespace Service {
  // Profiles are hand-written data, loaded once at startup.
  const all = crops as Model.entity[];

  export const list = () => all;
}
