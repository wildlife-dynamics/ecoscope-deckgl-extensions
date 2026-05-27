# ecoscope-deckgl-extensions

Custom [deck.gl](https://deck.gl/) widgets and layers used by [Ecoscope](https://github.com/wildlife-dynamics/ecoscope). Built on `@deck.gl/core` 9.x and rendered with Preact.

Ships two artifacts from one source tree:

- **ESM library** (`dist/index.js` + type declarations) — entry for bundler-based apps (ie Next.js).
- **UMD bundle** (`dist/bundle.js`) — single-file build intended for pydeck's `customLibraries` script-tag loading. Attaches all exports to `window.EcoscopeDeckglExtensions`.

## Install

```bash
npm install @ecoscope/ecoscope-deckgl-extensions
```

`@deck.gl/*`, `@geoarrow/deck.gl-geoarrow`, and `apache-arrow` are peer dependencies — the consuming app provides them. `@geoarrow/geoparquet-wasm` is an optional peer (only needed if you load `.parquet` data through the GeoArrow layers).

```ts
import {
  NorthArrowWidget,
  TitleWidget,
  ScaleWidget,
  LegendWidget,
  SaveImageWidget,
  TooltipWidget,
  TiledBitmapLayer,
  GeoArrowPathLayer,
  GeoArrowScatterplotLayer,
  GeoArrowPolygonLayer,
} from '@ecoscope/ecoscope-deckgl-extensions';
```

deck.gl is browser-only, so any component that constructs layers/widgets from this package must live behind a `'use client'` boundary (App Router) or be imported dynamically with `ssr: false`.

## Widgets

### `NorthArrowWidget`
Compass SVG that rotates to match the current viewport. Reads `bearing`/`pitch` on a `WebMercatorViewport`.

```ts
new NorthArrowWidget({ placement: 'top-left' });
```

### `TitleWidget`
Static title rendered as an absolutely-positioned overlay on the deck (this is to enable centering and positional overrides above the standard widget-placement quadrants).

```ts
new TitleWidget({ id: 'title', title: 'My Map' });
```

### `ScaleWidget`
Two-block map scale bar. Computes distance from the viewport's `metersPerPixel`, and renders either as metric (`m`/`km`) or imperial (`ft`/`mi`) units.

```ts
new ScaleWidget({ maxWidth: 300, useImperial: false });
```

### `LegendWidget`
Renders one or more legend segments, each with a title and a list of `{ label, color }` swatches.

```ts
new LegendWidget({
  id: 'legend',
  placement: 'bottom-right',
  legendValues: [
    { title: 'Species', values: [{ label: 'Elephant', color: '#aa3' }] },
  ],
});
```

### `SaveImageWidget`
Toolbar button that snapshots the deck canvas and surrounding overlays (inclusive of other widgets) to PNG via `html-to-image` and triggers a `map.png` download. The button itself is filtered out of the capture.

```ts
new SaveImageWidget({ label: 'Save as Image' });
```

### `TooltipWidget`
Installs a `getTooltip` handler on the deck that renders a feature's `properties` as an HTML table on hover. Pass `layerColumns` to whitelist which property keys to show per layer. This will override any existing tooltip on the deck it's added to. Exists to allow per layer definition of tooltip data via deck.gl json / Pydeck.

```ts
new TooltipWidget({
  layerColumns: { 'subjects-layer': ['name', 'species'] },
});
```

## Layers

### `TiledBitmapLayer`
A `TileLayer` that renders each tile as a `BitmapLayer`. When a tile finishes loading and a `widgetId` prop is set, it posts a `{ type: 'TileLoaded', widgetId }` message to `window.parent` — used to signal load completion to a host (e.g. a Jupyter widget iframe).
Allows configuration of a simple tiled raster layer via deck.gl json / Pydeck.

```ts
new TiledBitmapLayer({
  id: 'basemap',
  data: 'https://tiles.example.com/{z}/{x}/{y}.png',
  widgetId: 'map-1',
});
```

### `GeoArrowPathLayer`, `GeoArrowScatterplotLayer`, `GeoArrowPolygonLayer`
Thin subclasses of the corresponding [`@geoarrow/deck.gl-geoarrow`](https://github.com/geoarrow/deck.gl-geoarrow) layers that add:

- A bundled GeoParquet loader (`.parquet` URLs in `data` are parsed in-browser via `@geoarrow/geoparquet-wasm`, wired in via `defaultProps.loaders` — no global `registerLoaders` call needed).
- Bare-string column references on `get*` accessors.** Set `getFillColor: "color_column"` and the named column is bound directly as a vectorized arrow attribute on the upstream layer. Allows defining accessors in terms of columns via Pydeck.

```ts
new GeoArrowScatterplotLayer({
  id: 'events',
  data: 'https://example.com/events.parquet',
  getFillColor: 'fill_color',   // column of FixedSizeList<Uint8>
  getRadius: 'radius',          // column of Float
});
```

## Development

```bash
npm run build           # ESM library + UMD bundle to dist/
npm run build:lib       # ESM library only (dist/index.js + .d.ts tree)
npm run build:bundle    # UMD bundle only (dist/bundle.js) — for pydeck
npm run build-webpack   # legacy alias for build:bundle
npm run typecheck
npm run lint
```
