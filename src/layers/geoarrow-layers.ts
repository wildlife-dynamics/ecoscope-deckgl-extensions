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

import { GeoParquetLoader } from '../loaders/geoparquet-loader';

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
 * Build per-batch props for an upstream layer instance: copy every enumerable
 * prop from the real layer (own + inherited — captures deck.gl's
 * async-resolved `data` getter), apply our resolved column → arrow.Data
 * overrides, and stamp in this batch as `data` plus a batch-suffixed id so
 * sub-layer ids stay unique across batches.
 */
function buildBatchProps(
  layer: LayerLike,
  batch: arrow.RecordBatch,
  batchIndex: number,
): Record<string, unknown> {
  const resolved = resolveAccessors(layer, batch);
  const subProps: Record<string, unknown> = {};
  for (const key in layer.props) {
    subProps[key] = resolved?.has(key) ? resolved.get(key) : layer.props[key];
  }
  subProps.data = batch;
  subProps.id = `${layer.id ?? 'GeoArrowLayer'}-batch-${batchIndex}`;
  return subProps;
}

/**
 * Always instantiate upstream layers directly: N per batch for arrow.Table,
 * one for a single arrow.RecordBatch. Returns null when `data` is neither
 * (e.g. URL still loading) so the caller can fall back to super.renderLayers.
 *
 * Direct construction rather than a proxy/shadow-props trick over upstream's
 * renderLayers because we need each sub-layer to have its own `this.id`
 * (upstream's `getSubLayerProps` reads the instance property, not
 * `props.id`), and one extra composite-layer hop is cheaper to reason about
 * than the proxy mechanics.
 */
function renderBatchedData(
  LayerClass: new (p: Record<string, unknown>) => Layer,
  layer: LayerLike,
): RenderLayersReturn {
  const data = layer.props.data;
  if (isArrowTable(data)) {
    return data.batches.map((b, i) => new LayerClass(buildBatchProps(layer, b, i)));
  }
  if (isRecordBatch(data)) {
    return new LayerClass(buildBatchProps(layer, data, 0));
  }
  return null;
}

// Thin subclasses that (a) inject our GeoParquet loader via defaultProps —
// the loaders.gl 4.x per-layer convention, not the deprecated global
// `registerLoaders` — and (b) re-emit one upstream layer per RecordBatch,
// applying bare-string column refs as vectorized arrow attributes on the way
// through. When `data` is still a URL (loader hasn't resolved yet),
// renderLayers falls back to upstream's own behavior.

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
    return renderBatchedData(
      UpstreamGeoArrowPathLayer as unknown as new (p: Record<string, unknown>) => Layer,
      this as unknown as LayerLike,
    ) ?? super.renderLayers();
  }
}

export class GeoArrowScatterplotLayer<ExtraProps extends object = object> extends UpstreamGeoArrowScatterplotLayer<ExtraProps> {
  static layerName = 'GeoArrowScatterplotLayer';
  static defaultProps: DefaultProps<GeoArrowScatterplotLayerProps> = {
    ...UpstreamGeoArrowScatterplotLayer.defaultProps,
    loaders: [GeoParquetLoader],
  };

  renderLayers(): RenderLayersReturn {
    return renderBatchedData(
      UpstreamGeoArrowScatterplotLayer as unknown as new (p: Record<string, unknown>) => Layer,
      this as unknown as LayerLike,
    ) ?? super.renderLayers();
  }
}

export class GeoArrowPolygonLayer<ExtraProps extends object = object> extends UpstreamGeoArrowPolygonLayer<ExtraProps> {
  static layerName = 'GeoArrowPolygonLayer';
  static defaultProps: DefaultProps<GeoArrowPolygonLayerProps> = {
    ...UpstreamGeoArrowPolygonLayer.defaultProps,
    loaders: [GeoParquetLoader],
  };

  renderLayers(): RenderLayersReturn {
    return renderBatchedData(
      UpstreamGeoArrowPolygonLayer as unknown as new (p: Record<string, unknown>) => Layer,
      this as unknown as LayerLike,
    ) ?? super.renderLayers();
  }
}
