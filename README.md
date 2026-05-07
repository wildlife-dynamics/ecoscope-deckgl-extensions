# ecoscope-deckgl-extensions

Custom [deck.gl](https://deck.gl/) widgets and layers used by [Ecoscope](https://github.com/wildlife-dynamics/ecoscope). Built on `@deck.gl/core` 9.x and rendered with Preact. Bundled to a single UMD file (`dist/bundle.js`) that also attaches each export to `window` for embedding in non-bundled environments (e.g. notebook widgets).

## Install

```bash
npm install @ecoscope/ecoscope-deckgl-extensions
```

```ts
import {
  NorthArrowWidget,
  TitleWidget,
  ScaleWidget,
  LegendWidget,
  SaveImageWidget,
  TooltipWidget,
  TiledBitmapLayer,
} from '@ecoscope/ecoscope-deckgl-extensions';
```

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

## Development

```bash
npm run build-webpack   # bundle to dist/
npm run typecheck
npm run lint
```
