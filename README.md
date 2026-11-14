# agritech-backend

The API behind AGRITECH, Team AKOMA's entry for the NASA Space Apps Challenge (*Field Shift — Adapting Farms with NASA Data*). It tells farmers in Côte d'Ivoire which crops suit their field, scored against recent NASA POWER climate data and SoilGrids soil data.

Built with [Bun](https://bun.com) and [Elysia](https://elysiajs.com), from the [`http`](https://github.com/abjshawty/http) template with the database removed. The frontend is [`agritech-web`](https://github.com/abjshawty/agritech-web).

> **Status: mock data.** `/recommend` runs the real scorer, but every location gets the same Bouaké sample site (`source: "snapshot"`). Live NASA POWER and SoilGrids fetching is next.

## Getting started

You need Bun 1.3.10 or later.

```bash
bun install
cp .env.example .env
bun dev        # http://localhost:3000/api, reloads on change
bun test       # scorer tests
bun check      # type-check
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

`data/crops.json` holds one profile per crop: optimal and absolute ranges for temperature (°C), rainfall (mm over the cycle, or per year for perennials) and pH, dry-season months for perennials, and the soil textures it suits.

> The current values are **first-draft approximations** in the spirit of FAO ECOCROP. The agronomy lead replaces them with sourced figures (ECOCROP, CNRA, ANADER). Change only the numbers; the shape is the API contract.

## Deployment

The `Dockerfile` builds a container that listens on port 3000 under `/api`. In production it sits on an internal Docker network behind the `agritech-web` container, which serves the frontend and proxies `/api`; it never publishes a port of its own. See `agritech-web` for the compose file.

## License

MIT
