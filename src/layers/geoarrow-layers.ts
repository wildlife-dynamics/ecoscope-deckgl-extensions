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

import { GeoParquetLoader } from '../loaders/geoparquet-loader.js';

type RenderLayersReturn = Layer | LayersList | null;

interface ArrowVectorLike {
  data?: unknown[];
}

interface ArrowBatchLike {
  schema?: { fields?: unknown[] };
  getChild?: (name: string) => ArrowVectorLike | null;
}

interface LayerLike {
  id?: string;
  props: Record<string, unknown>;
  constructor: { defaultProps?: Record<string, unknown> };
}

export function isRecordBatch(value: unknown): value is ArrowBatchLike {
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
 * — see https://deck.gl/docs/api-reference/json/conversion-reference. We probe
 * the function with a recording Proxy: if it reads exactly one *distinct* key
 * during a single invocation, that key is the column name. Repeated reads of
 * the same key (e.g. `row.x * row.x`) still resolve. Multi-key reads
 * (`row.a + row.b`), nested paths (`row.a.b`, which throws via undefined),
 * and zero-key reads (the `@@=-` identity) return null — the caller is
 * expected to warn and fall through.
 */
export function inferColumnReferenceFromFn(fn: (row: unknown) => unknown): string | null {
  const accessed = new Set<string>();
  const probe = new Proxy(
    {},
    {
      get(_target, key) {
        if (typeof key === 'string') accessed.add(key);
        return undefined;
      },
    },
  );
  try {
    fn(probe);
  } catch {
    return null;
  }
  if (accessed.size !== 1) return null;
  return accessed.values().next().value as string;
}

// Per-layer, per-prop warning dedupe so a hot render path doesn't spam.
const WARNED = new WeakMap<object, Set<string>>();

function warnOnce(layer: LayerLike, propName: string, message: string): void {
  let seen = WARNED.get(layer);
  if (!seen) {
    seen = new Set();
    WARNED.set(layer, seen);
  }
  if (seen.has(propName)) return;
  seen.add(propName);
  console.warn(`[${layer.id ?? 'GeoArrow layer'}] ${message}`);
}

/**
 * Walk every `get*` accessor declared in the layer class's `defaultProps`
 * (a closed set — we don't speculate over arbitrary `for...in` props) and
 * build a propName → arrow.Data map for those whose value is a column
 * reference: a literal string column name, or a function lowered from
 * `@@=column`. Returns null when nothing needed resolution.
 *
 * For function accessors that look like an `@@=` lowering but don't
 * resolve to a single column, warn once so users don't stare at a blank
 * layer with no diagnostic.
 */
export function resolveAccessors(
  layer: LayerLike,
  batch: ArrowBatchLike,
): Map<string, unknown> | null {
  if (typeof batch.getChild !== 'function') return null;
  const accessorNames = Object.keys(layer.constructor.defaultProps ?? {})
    .filter(name => name.startsWith('get'));
  let map: Map<string, unknown> | null = null;
  for (const propName of accessorNames) {
    const value = layer.props[propName];
    let columnName: string | null = null;
    if (typeof value === 'string') {
      columnName = value;
    } else if (typeof value === 'function') {
      columnName = inferColumnReferenceFromFn(value as (row: unknown) => unknown);
      if (columnName === null) {
        // Could be a hand-written row accessor that genuinely needs per-row
        // evaluation — that's fine, upstream handles it. But a pydeck user
        // who wrote `@@=row.foo + row.bar` will silently get the per-row
        // path with no hint why their layer is slow. Surface it once.
        if (isLikelyExpressionAccessor(value as (row: unknown) => unknown)) {
          warnOnce(
            layer,
            propName,
            `prop '${propName}' is a function accessor that doesn't resolve to a single ` +
              `column. Falling back to per-row evaluation, which is slow on GeoArrow ` +
              `layers. Use a single column reference (e.g. "@@=col_name") for best perf.`,
          );
        }
        continue;
      }
    }
    if (columnName === null) continue;
    const vector = batch.getChild(columnName);
    if (vector && Array.isArray(vector.data) && vector.data.length > 0) {
      map ??= new Map();
      map.set(propName, vector.data[0]);
    } else if (typeof value === 'string') {
      warnOnce(
        layer,
        propName,
        `prop '${propName}' references column '${columnName}', but the loaded ` +
          `record batch has no such column.`,
      );
    }
  }
  return map;
}

/**
 * Heuristic: looks like a pydeck-generated `@@=` lowering rather than a
 * user-supplied row accessor. The JSON converter produces small arrow
 * functions; user-written accessors tend to be longer / multi-arg. Used
 * only to decide whether to emit a "per-row fallback" warning — false
 * negatives are fine, false positives just produce a one-time warning.
 */
function isLikelyExpressionAccessor(fn: (row: unknown) => unknown): boolean {
  return fn.length <= 1;
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

// Thin subclasses that (a) inject our GeoParquet loader via defaultProps —
// the loaders.gl 4.x per-layer convention, not the deprecated global
// `registerLoaders` — and (b) route renderLayers through the column-
// reference resolver so pydeck's `@@=column` sugar and bare column-name
// strings both work as accessor sources for GeoArrow layers.

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
    return renderWithResolvedAccessors(this as unknown as LayerLike, super.renderLayers);
  }
}
