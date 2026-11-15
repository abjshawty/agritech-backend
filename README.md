# agritech-backend

The API behind AGRITECH, Team AKOMA's entry for the NASA Space Apps Challenge (*Field Shift — Adapting Farms with NASA Data*). It tells farmers in Côte d'Ivoire which crops suit their field, scored against recent NASA POWER climate data and SoilGrids soil data.

Built with [Bun](https://bun.com) and [Elysia](https://elysiajs.com), from the [`http`](https://github.com/abjshawty/http) template with the database removed. The frontend is [`agritech-web`](https://github.com/abjshawty/agritech-web).

## Data

- **Climate:** [NASA POWER](https://power.larc.nasa.gov) monthly rainfall (`PRECTOTCORR_SUM`) and temperature (`T2M`), fetched live in one call for 1984–2023. Scoring uses the 2014–2023 monthly means; the Field Shift badge compares them with 1984–1993. Results are cached per 0.1° cell for the life of the process.
- **Soil:** [SoilGrids 2.0](https://soilgrids.org) pH, sand, clay and organic carbon, averaged over 0–30 cm. Its point API is too slow and too often empty to call per request, so `bun soil:build` downloads the maps for the whole country once into `data/soil-grid.json` (0.05° grid, about 5.5 km), and lookups are local.
- **Soil moisture:** NASA POWER root-zone soil wetness (`GWETROOT`, 0 dry to 1 saturated) comes in the same call. Each crop gets the mean over its months as `moisture`; it's shown, not scored.
- **Second opinion:** [FAO GAEZ v4](https://gaez.fao.org) crop suitability (1981–2010, rain-fed, low input), downloaded once by `bun gaez:build` into `data/gaez-grid.json`. Each crop gets `gaez` (0–100) beside our own `score`; GAEZ has no cashew or rubber, and banana stands in for plantain.
- **Fallback:** if NASA POWER fails or takes over 8 s, points within 25 km of Abidjan, Bouaké, Korhogo, San-Pédro or Man get that town's saved climate from `data/snapshots.json` (`source: "snapshot"`). Anywhere else gets a 503. Rebuild the snapshots with `bun snapshots:build`.

## Getting started

You need Bun 1.3.10 or later.

```bash
bun install
cp .env.example .env
bun dev        # http://localhost:3000/api, reloads on change
bun test       # scorer tests
bun check      # type-check
bun soil:build       # rebuild data/soil-grid.json from SoilGrids
bun snapshots:build  # rebuild data/snapshots.json from NASA POWER
bun gaez:build       # rebuild data/gaez-grid.json from FAO GAEZ
bun crops:build      # rebuild data/crops.json from FAO ECOCROP
bun gaez:compare     # compare our verdicts with GAEZ → docs/gaez-comparison.md
bun e2e [base-url]   # end-to-end checks against a running server (default http://localhost:3000/api)
```

`http://localhost:3000/api` redirects to the API docs. The OpenAPI spec the frontend generates its types from is at `/api/docs/json`.

| Variable      | Default | Purpose                                 |
| ------------- | ------- | --------------------------------------- |
| `PORT`        | `3000`  | Port to listen on                       |
| `SERVER_PATH` | `""`    | Prefix in front of every route (`/api`) |

## API

| Method | Path             | Description                                                                 |
| ------ | ---------------- | --------------------------------------------------------------------------- |
| `GET`  | `/api/crops`     | The 12 crop profiles                                                        |
| `GET`  | `/api/recommend` | `?lat&lon` (within Côte d'Ivoire), optional `plantingMonth` (1–12) and `irrigated` |

A point with no mapped soil nearby (the sea, a lagoon) is a 400, and a NASA POWER failure away from a demo town is a 503.

`/recommend` returns the site's climate, soil and climate shift, the planting month used, and every crop ranked by score with its verdict, factor scores and reason keys. The full schema is in the docs. The API never sends display text: reasons are keys such as `rain.tooLow` with parameters, translated by the frontend.

## How scoring works

All of it lives in `src/lib/scorer.ts`, a pure function covered by `src/lib/scorer.test.ts`.

- **Each factor** (rainfall, temperature, soil pH, and dry-season months for perennials) scores 1 inside the crop's optimal range, falling linearly to 0 at its absolute limit. Soil texture scores 1 if the crop suits it and 0.4 otherwise.
- **Overall score** = 100 × the geometric mean of the factor scores, so one weak factor drags it down and any 0 makes the crop unsuitable. Good is 70 and up, possible 40–69, poor below 40.
- **Annual crops** are scored on rainfall and mean temperature over their growing cycle, starting at the planting month. When none is given, it's the next rainy-season onset: the first month with at least 100 mm after a month with less.
- **Perennials** are scored on the whole year, plus the number of months under 50 mm of rain.
- **Water deficit** is the rain short of the crop's optimal minimum. With `irrigated=true` the shortfall counts as met, and the deficit is reported as irrigation to plan.
- **Reasons** are the weakest factor, then the strongest.

## Crop profiles

`data/crops.json` is generated by `bun crops:build` from the FAO ECOCROP database ([OpenCLIM's copy](https://github.com/openclim/ecocrop), pinned to one commit; FAO no longer serves the original). Each crop's `source` names the ECOCROP species used.

- **From ECOCROP:** optimal and absolute ranges for temperature (°C), rainfall and pH, and the optimal soil texture. Rainfall ranges are compared with rain over the growing cycle for annual crops and over the year for perennials, as in the standard ECOCROP model ([`dismo`'s `ecocrop.R`](https://rdrr.io/cran/dismo/src/R/ecocrop.R)).
- **Species choices:** upland rice uses *Oryza glaberrima* (ECOCROP's *O. sativa* is irrigated paddy), yam uses *Dioscorea rotundata* (white yam), plantain uses *Musa acuminata × balbisiana*.
- **Set in `scripts/build-crops.ts`, not from ECOCROP:** cycle length for annual crops, and dry-season months for perennials. These need an agronomic source.
- **Texture mapping:** ECOCROP light → sand, sandy loam; medium → sandy loam, loam, clay loam; heavy → clay loam, clay.

To change a profile, edit `scripts/build-crops.ts` and rerun it; don't edit `crops.json` by hand. Then run `bun gaez:compare` to regenerate [`docs/gaez-comparison.md`](docs/gaez-comparison.md), which sets our verdicts beside FAO GAEZ in the five demo towns and flags strong disagreements.

## Deployment

The `Dockerfile` builds a container that listens on port 3000 under `/api`. In production it sits on an internal Docker network behind the `agritech-web` container, which serves the frontend and proxies `/api`; it never publishes a port of its own. See `agritech-web` for the compose file.

## License

MIT
