import type { DefaultProps, Layer, LayersList } from '@deck.gl/core';
import {
  GeoArrowPathLayer as UpstreamGeoArrowPathLayer,
  GeoArrowScatterplotLayer as UpstreamGeoArrowScatterplotLayer,
  GeoArrowPolygonLayer as UpstreamGeoArrowPolygonLayer,
} from '@geoarrow/deck.gl-geoarrow';
import type {
  GeoArrowPathLayerProps,
  GeoArrowPolygonLayerProps,
  GeoArrowScatterplotLayerProps,
} from '@geoarrow/deck.gl-geoarrow';
import type * as arrow from 'apache-arrow';

import { GeoParquetLoader } from '../loaders/geoparquet-loader.js';

type RenderLayersReturn = Layer | LayersList | null;

interface LayerLike {
  id?: string;
  props: Record<string, unknown>;
  constructor: { defaultProps?: Record<string, unknown> };
}

export function isRecordBatch(value: unknown): value is arrow.RecordBatch {
  if (typeof value !== 'object' || value === null) return false;
  // Distinguish from arrow.Table: Table has a `batches` array, RecordBatch
  // does not. Both share schema + getChild.
  return (
    'schema' in value &&
    'getChild' in value &&
    typeof (value as { getChild: unknown }).getChild === 'function' &&
    !('batches' in value)
  );
}

export function isArrowTable(value: unknown): value is arrow.Table {
  if (typeof value !== 'object' || value === null) return false;
  return (
    'schema' in value &&
    'batches' in value &&
    Array.isArray((value as { batches: unknown }).batches)
  );
}

/**
 * Walk every `get*` accessor declared in the layer class's `defaultProps`
 * (a closed set — we don't speculate over arbitrary `for...in` props) and
 * build a propName → arrow.Data map for those whose value is a bare string
 * column name. Functions are left alone for upstream's per-row evaluation.
 *
 * The supported shape is `getFillColor: "column_name"` — not
 * `getFillColor: "@@=column_name"`. We don't try to peer into JSON-lowered
 * expression closures: `@deck.gl/json` lowers expressions to opaque
 * evaluator wrappers (`n => Jae(n, ast)`) whose column refs live in a
 * captured AST, not in the function body, and the runtime probe needed to
 * extract them silently mis-resolves on any non-trivial expression. The
 * pydeck side should emit bare strings for column references on these
 * layers; everything else passes through to upstream as-is.
 *
 * Returns null when nothing needed resolution.
 */
export function resolveAccessors(
  layer: LayerLike,
  batch: arrow.RecordBatch,
): Map<string, unknown> | null {
  const accessorNames = Object.keys(layer.constructor.defaultProps ?? {})
    .filter(name => name.startsWith('get'));
  let map: Map<string, unknown> | null = null;
  for (const propName of accessorNames) {
    const value = layer.props[propName];
    if (typeof value !== 'string') continue;
    const vector = batch.getChild(value);
    if (vector && vector.data.length > 0) {
      map ??= new Map();
      map.set(propName, vector.data[0]);
    } else {
      console.warn(
        `[${layer.id ?? 'GeoArrow layer'}] prop '${propName}' references column ` +
          `'${value}', but the record batch has no such column.`,
      );
    }
  }
  return map;
}

/**
 * Run `super.renderLayers` with the layer's props extended — never mutated —
 * so the upstream layer reads our resolved column-reference accessors.
 *
 * Constraints stacked against us:
 *
 * - Mutation is impossible: deck.gl freezes the props instance per render
 *   cycle (see `Object.freeze(propsInstance)` in
 *   `modules/core/src/lifecycle/create-props.ts`).
 * - Proxy substitution is forbidden by the language for frozen own data
 *   properties: the Proxy `get` invariant requires the actual value be
 *   reported. So we can't return a different `getFillColor` value through
 *   a Proxy over the real props.
 * - The `Object.create(realProps)` prototype-shadowing pattern deck.gl
 *   itself uses for uniform transitions doesn't work here either: the
 *   upstream geoarrow layer iterates props via `Object.entries` (in
 *   `extractAccessorsFromProps`), which returns *own* properties only.
 *
 * So we build a flat shadow: copy every enumerable prop from the real
 * props as an own property on a fresh object, applying our resolved
 * overrides on top. Reading `layer.props[key]` during the copy triggers
 * inherited async accessors (e.g. the resolved `data` getter) so we
 * capture the already-resolved values rather than the prototype machinery.
 */
export function renderWithResolvedAccessors<T extends LayerLike>(
  layer: T,
  superRenderLayers: () => RenderLayersReturn,
): RenderLayersReturn {
  const batch = layer.props.data;
  if (!isRecordBatch(batch)) return superRenderLayers.call(layer);
  const resolved = resolveAccessors(layer, batch);
  if (resolved === null) return superRenderLayers.call(layer);

  const shadowProps: Record<string, unknown> = {};
  for (const key in layer.props) {
    shadowProps[key] = resolved.has(key) ? resolved.get(key) : layer.props[key];
  }

  const thisProxy = new Proxy(layer, {
    get(target, key) {
      if (key === 'props') return shadowProps;
      // Forward everything else with the real layer as receiver so methods
      // reached via the proxy still bind internal `this` against the real
      // instance — but the `this` of super.renderLayers itself stays the
      // proxy, which is what makes `this.props` see shadowProps.
      return Reflect.get(target as object, key, target);
    },
  });

  return superRenderLayers.call(thisProxy);
}

/**
 * Multi-batch path: when `data` is an arrow.Table, instantiate one upstream
 * layer per RecordBatch, each with per-batch accessor resolution and a
 * derived id (so sub-layer ids don't collide across batches). Direct
 * instantiation rather than the proxy trick because we also need a distinct
 * `this.id` per batch — upstream's `getSubLayerProps` reads the instance
 * property, not `props.id`, so shadowing props alone wouldn't be enough.
 */
function renderTableBatches(
  LayerClass: new (props: Record<string, unknown>) => Layer,
  layer: LayerLike,
  table: arrow.Table,
): LayersList {
  const sublayers: Layer[] = [];
  for (let i = 0; i < table.batches.length; i++) {
    const batch = table.batches[i];
    const resolved = resolveAccessors(layer, batch);
    const subProps: Record<string, unknown> = {};
    for (const key in layer.props) {
      subProps[key] = resolved?.has(key) ? resolved.get(key) : layer.props[key];
    }
    subProps.data = batch;
    subProps.id = `${layer.id ?? 'GeoArrowLayer'}-batch-${i}`;
    sublayers.push(new LayerClass(subProps));
  }
  return sublayers;
}

// Thin subclasses that (a) inject our GeoParquet loader via defaultProps —
// the loaders.gl 4.x per-layer convention, not the deprecated global
// `registerLoaders` — and (b) route renderLayers through the column-
// reference resolver so pydeck's `@@=column` sugar and bare column-name
// strings both work as accessor sources for GeoArrow layers. Multi-batch
// arrow.Table inputs are split into one upstream sub-layer per batch.

export class GeoArrowPathLayer<ExtraProps extends object = object> extends UpstreamGeoArrowPathLayer<ExtraProps> {
  static layerName = 'GeoArrowPathLayer';
  // Explicit annotation avoids tsc TS2883 ("inferred type ... cannot be named")
  // when emitting declarations — the upstream defaultProps inferred type pulls
  // in private types from @geoarrow/geoarrow-js/dist/data.
  static defaultProps: DefaultProps<GeoArrowPathLayerProps> = {
    ...UpstreamGeoArrowPathLayer.defaultProps,
    loaders: [GeoParquetLoader],
  };

  renderLayers(): RenderLayersReturn {
    const data = this.props.data;
    if (isArrowTable(data)) {
      return renderTableBatches(
        UpstreamGeoArrowPathLayer as unknown as new (p: Record<string, unknown>) => Layer,
        this as unknown as LayerLike,
        data,
      );
    }
    return renderWithResolvedAccessors(this as unknown as LayerLike, super.renderLayers);
  }
}

export class GeoArrowScatterplotLayer<ExtraProps extends object = object> extends UpstreamGeoArrowScatterplotLayer<ExtraProps> {
  static layerName = 'GeoArrowScatterplotLayer';
  static defaultProps: DefaultProps<GeoArrowScatterplotLayerProps> = {
    ...UpstreamGeoArrowScatterplotLayer.defaultProps,
    loaders: [GeoParquetLoader],
  };

  renderLayers(): RenderLayersReturn {
    const data = this.props.data;
    if (isArrowTable(data)) {
      return renderTableBatches(
        UpstreamGeoArrowScatterplotLayer as unknown as new (p: Record<string, unknown>) => Layer,
        this as unknown as LayerLike,
        data,
      );
    }
    return renderWithResolvedAccessors(this as unknown as LayerLike, super.renderLayers);
  }
}

export class GeoArrowPolygonLayer<ExtraProps extends object = object> extends UpstreamGeoArrowPolygonLayer<ExtraProps> {
  static layerName = 'GeoArrowPolygonLayer';
  static defaultProps: DefaultProps<GeoArrowPolygonLayerProps> = {
    ...UpstreamGeoArrowPolygonLayer.defaultProps,
    loaders: [GeoParquetLoader],
  };

  renderLayers(): RenderLayersReturn {
    const data = this.props.data;
    if (isArrowTable(data)) {
      return renderTableBatches(
        UpstreamGeoArrowPolygonLayer as unknown as new (p: Record<string, unknown>) => Layer,
        this as unknown as LayerLike,
        data,
      );
    }
    return renderWithResolvedAccessors(this as unknown as LayerLike, super.renderLayers);
  }
}
