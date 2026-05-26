import type { Layer, LayersList } from '@deck.gl/core';
import {
  GeoArrowPathLayer as UpstreamGeoArrowPathLayer,
  GeoArrowScatterplotLayer as UpstreamGeoArrowScatterplotLayer,
  GeoArrowPolygonLayer as UpstreamGeoArrowPolygonLayer,
} from '@geoarrow/deck.gl-geoarrow';

import { GeoParquetLoader } from '../loaders/geoparquet-loader';

type RenderLayersReturn = Layer | LayersList | null;

interface ArrowVectorLike {
  data?: unknown[];
}

interface ArrowBatchLike {
  schema?: { fields?: unknown[] };
  getChild?: (name: string) => ArrowVectorLike | null;
}

function isRecordBatch(value: unknown): value is ArrowBatchLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    'schema' in value &&
    'getChild' in value &&
    typeof (value as ArrowBatchLike).getChild === 'function'
  );
}

/**
 * deck.gl's JSON converter lowers `"@@=column"` into `row => get(row, "column")`
 * — see https://deck.gl/docs/api-reference/json/conversion-reference and
 * `modules/json/src/helpers/parse-expression-string.ts`. We probe the
 * function with a recording Proxy: if it reads exactly one key during a
 * single invocation, that key is the column name. Multi-key reads (e.g.
 * `@@=a + b`) and zero-key reads (the `@@=-` identity, etc.) fall through
 * to the upstream per-row `wrapAccessorFunction` path.
 */
function inferColumnReferenceFromFn(fn: (row: unknown) => unknown): string | null {
  const accessed: string[] = [];
  const probe = new Proxy(
    {},
    {
      get(_target, key) {
        if (typeof key === 'string') accessed.push(key);
        return undefined;
      },
    },
  );
  try {
    fn(probe);
  } catch {
    return null;
  }
  return accessed.length === 1 ? accessed[0] : null;
}

/**
 * Walk every `get*` accessor on `props` and build a key→arrow.Data map for
 * those whose value is a column reference — either a literal string column
 * name or a function lowered from `@@=column`. Returns null when nothing
 * needed resolution, so the render path can fast-path past the proxies.
 *
 * Iterates dynamically so we don't carry a hardcoded accessor list.
 */
function resolveAccessors(
  props: Record<string, unknown>,
  batch: ArrowBatchLike,
): Map<string, unknown> | null {
  if (typeof batch.getChild !== 'function') return null;
  let map: Map<string, unknown> | null = null;
  // `for...in` covers both own (sync) props on the props instance and
  // inherited (async) accessors on its prototype. The startsWith filter
  // means we never reach for async props like `data`.
  for (const propName in props) {
    if (!propName.startsWith('get')) continue;
    const value = props[propName];
    let columnName: string | null = null;
    if (typeof value === 'string') {
      columnName = value;
    } else if (typeof value === 'function') {
      columnName = inferColumnReferenceFromFn(value as (row: unknown) => unknown);
    }
    if (columnName === null) continue;
    const vector = batch.getChild(columnName);
    // arrow.Vector exposes its chunks as `data: Data[]`; for a single
    // RecordBatch the geometry/data column has exactly one chunk.
    if (vector && Array.isArray(vector.data) && vector.data.length > 0) {
      map ??= new Map();
      map.set(propName, vector.data[0]);
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
 *   Inherited prototype props would be invisible to it.
 *
 * So we build a flat shadow: copy every enumerable prop from the real
 * props as an own property on a fresh object, applying our resolved
 * overrides on top. `Object.entries(shadowProps)` then returns the full
 * picture. Reading `layer.props[key]` during the copy triggers any
 * inherited accessors (e.g. the async `data` getter), so we capture the
 * already-resolved values rather than the prototype machinery.
 *
 * `this.props` itself is a writable instance field on Layer, so a
 * `this`-Proxy that returns the shadow for the `props` key doesn't run
 * into any invariant trouble.
 */
function renderWithResolvedAccessors<T extends { props: Record<string, unknown> }>(
  layer: T,
  superRenderLayers: () => RenderLayersReturn,
): RenderLayersReturn {
  const batch = layer.props.data;
  if (!isRecordBatch(batch)) return superRenderLayers.call(layer);
  const resolved = resolveAccessors(layer.props, batch);
  if (resolved === null) return superRenderLayers.call(layer);

  const shadowProps: Record<string, unknown> = {};
  for (const key in layer.props) {
    shadowProps[key] = resolved.has(key) ? resolved.get(key) : layer.props[key];
  }

  const thisProxy = new Proxy(layer, {
    get(target, key, _receiver) {
      if (key === 'props') return shadowProps;
      // Forward everything else to the real layer with the layer as the
      // receiver, so methods reached via the proxy still bind their own
      // internal `this` accesses against the real instance.
      return Reflect.get(target as object, key, target);
    },
  });

  return superRenderLayers.call(thisProxy);
}

// Thin subclasses that (a) inject our GeoParquet loader into defaultProps —
// the loaders.gl 4.x recommendation, vs the deprecated `registerLoaders`
// global — and (b) route renderLayers through the column-reference
// resolver so pydeck's `@@=column` sugar and bare column-name strings both
// work as accessor sources for GeoArrow layers.

export class GeoArrowPathLayer extends UpstreamGeoArrowPathLayer {
  static layerName = 'GeoArrowPathLayer';
  static defaultProps = {
    ...UpstreamGeoArrowPathLayer.defaultProps,
    loaders: [GeoParquetLoader],
  };

  renderLayers() {
    return renderWithResolvedAccessors(this, super.renderLayers);
  }
}

export class GeoArrowScatterplotLayer extends UpstreamGeoArrowScatterplotLayer {
  static layerName = 'GeoArrowScatterplotLayer';
  static defaultProps = {
    ...UpstreamGeoArrowScatterplotLayer.defaultProps,
    loaders: [GeoParquetLoader],
  };

  renderLayers() {
    return renderWithResolvedAccessors(this, super.renderLayers);
  }
}

export class GeoArrowPolygonLayer extends UpstreamGeoArrowPolygonLayer {
  static layerName = 'GeoArrowPolygonLayer';
  static defaultProps = {
    ...UpstreamGeoArrowPolygonLayer.defaultProps,
    loaders: [GeoParquetLoader],
  };

  renderLayers() {
    return renderWithResolvedAccessors(this, super.renderLayers);
  }
}
