# CLAUDE.md

Personal academic website of Dorian Spaet (spaetd96.github.io), built with Hugo and the Hugo Blox academic CV theme. Pushes to `main` deploy to GitHub Pages (`.github/workflows/publish.yaml`, Hugo 0.135.0).

## Git workflow

- Work directly on `main`.
- After making and checking a change, **always commit it**, then tell the user to run `git push`. Do not push yourself: pushing to `main` publishes the live site, and the SSH key has a passphrase that is not available in Claude's shell.
- Commit only the files you changed for the task. Keep commits focused, with an imperative subject line (e.g. "Add monthly climate and snow views to the Past tab") and a short body explaining why when it is not obvious.
- Do not amend or force-push.

## Testing

Hugo and Node are not installed in the Claude environment, so changes cannot be built or viewed there. For `static/js` files, a syntax check is possible with JavaScriptCore:

    osascript -l JavaScript -e 'ObjC.import("Foundation"); const s=$.NSString.stringWithContentsOfFileEncodingError("static/js/forecasts.js",4,null).js; try{new Function(s); "syntax ok"}catch(e){"ERR "+e}'

In the final message, say plainly what was verified and what was not (usually: syntax checked, not viewed in a browser). The user previews with `hugo server`.

## Layout

- `content/`: site pages in Markdown (`cv.md`, `teaching.md`, `publication/`, `talks/`, `events/`, `forecasts/`).
- `publications.bib`: source for publications. A GitHub Action converts it to pages on push, so edit the `.bib` file, not generated pages.
- `config/_default/`: Hugo and theme settings (`hugo.yaml`, `params.yaml`, `menus.yaml`).
- `layouts/`: template overrides. `layouts/forecasts/single.html` is the forecasts page.
- `static/`: served as-is (`css/forecasts.css`, `js/forecasts.js`, `js/forecasts-past.js`, `uploads/`).
- `netlify.toml`: Netlify build config; JS/CSS are served with `max-age=0, must-revalidate`.

## Forecasts page

A client-side weather viewer (Leaflet map plus a bottom panel), with no build step and no dependencies beyond Leaflet from unpkg. Data comes from the GeoSphere Austria data hub API (`https://dataset.api.hub.geosphere.at/v1`), plus SIAG (South Tyrol) and Meteotrentino stations.

- `static/js/forecasts.js` (~2900 lines): model definitions (`MODELS`), map, tabs (Now / Forecast / Past), forecast table, C-LAEF ensemble charts (`renderEnsembleCharts`, `makeEnsembleChart`), TAWES station history charts.
- `static/js/forecasts-past.js`: Past tab (SPARTACUS, SNOWGRID, climate context). Loaded after `forecasts.js` and uses its globals.
- `static/css/forecasts.css`: all styling. The template adds `?v={{ now.Unix }}` to the CSS/JS URLs, so no manual cache-busting is needed.
- Charts are hand-written inline SVG. Reuse `makeEnsembleChart` or the helpers in `forecasts-past.js` rather than adding a charting library.
- Panel layout: `#fc-panel-body` is the single vertical scroll container and its children (table, ensemble, history, compare) must not become scroll containers themselves. Use `overflow: clip` or `visible`, never `overflow: hidden` or `auto` on them, or only that section scrolls while the rest stays fixed.
- Responsive rules are in the `@media (max-width: 640px)` block of the CSS. Check changes against it.
- Check available API parameters before using a new one, e.g. `curl -s https://dataset.api.hub.geosphere.at/v1/timeseries/forecast/<resource>/metadata`.

## Style

Match the surrounding code: plain ES (`'use strict'`), no framework, 2-space indent, section banners like `// ── Title ───`, and comments only where the reason is not obvious.
