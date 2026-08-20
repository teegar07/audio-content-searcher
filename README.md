# Audio Content Searcher

A GitHub Pages-ready dashboard that collects audio-product articles published during the last 7 days from What Hi-Fi?, TechRadar, SoundGuys and Tom's Guide.

## Run locally

```bash
npm install
npm run fetch
python3 -m http.server 8000
```

Then open http://localhost:8000.

## GitHub Pages

1. Repository Settings → Pages → Deploy from a branch → `main` / `(root)`.
2. Actions → `Update audio articles` → Run workflow once.
3. The workflow runs daily at 00:10 UTC (08:10 Taiwan time) and commits `data/articles.json`.

The scraper reads public listing/article metadata only. Website HTML can change over time, so adapters may occasionally require maintenance.
