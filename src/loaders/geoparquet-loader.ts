import type { LoaderWithParser } from '@loaders.gl/loader-utils';
import type * as arrow from 'apache-arrow';

import { VERSION } from '../version.js';

const PARQUET_MAGIC = [0x50, 0x41, 0x52, 0x31]; // "PAR1"

/**
 * loaders.gl Loader for GeoParquet files. Wired into the GeoArrow* layer
 * subclasses via `static defaultProps.loaders = [GeoParquetLoader]` in
 * `src/layers/geoarrow-layers.ts` — the loaders.gl 4.x per-layer injection
 * path, rather than the deprecated `registerLoaders` global.
 *
 * The wasm + arrow deps are dynamically imported so they live in a
 * code-split chunk and don't bloat the sync module graph.
 */
export const GeoParquetLoader: LoaderWithParser<arrow.RecordBatch> = {
  name: 'GeoParquet',
  id: 'geoparquet',
  module: 'ecoscope-deckgl-extensions',
  version: VERSION,
  extensions: ['parquet'],
  mimeTypes: ['application/parquet', 'application/vnd.apache.parquet', 'application/x-parquet'],
  category: 'table',
  binary: true,
  // Content-sniff against the parquet magic bytes so we still match when the
  // server sends generic MIME types like application/octet-stream.
  tests: [
    (arrayBuffer: ArrayBuffer): boolean => {
      if (arrayBuffer.byteLength < 4) return false;
      const head = new Uint8Array(arrayBuffer, 0, 4);
      return PARQUET_MAGIC.every((b, i) => head[i] === b);
    },
  ],
  options: {},
  parse: parseGeoParquet,
};

export async function parseGeoParquet(arrayBuffer: ArrayBuffer): Promise<arrow.RecordBatch> {
  const [{ readGeoParquet }, arrowMod] = await Promise.all([
    import('@geoarrow/geoparquet-wasm'),
    import('apache-arrow'),
  ]);
  const buffer = new Uint8Array(arrayBuffer);
  // `intoIPCStream` *consumes* the wasm-side Table (Rust `into` convention,
  // confirmed in @geoarrow/geoparquet-wasm's d.ts: "Consume this table and
  // convert to an Arrow IPC Stream buffer"). It drops the wasm allocation
  // for us — calling `.free()` afterward would be a double-free and produce
  // a "null pointer passed to rust" runtime error.
  const ipc = readGeoParquet(buffer).intoIPCStream();
  const batches = arrowMod.tableFromIPC(ipc).batches;
  if (batches.length === 0) {
    throw new Error('GeoParquet file contained no record batches');
  }
  if (batches.length > 1) {
    // Upstream @geoarrow/deck.gl-geoarrow accepts a single RecordBatch as
    // `data`. Combining N chunks into one Data per column means rewriting
    // every column's buffers per-type — a bigger change than belongs in
    // this loader. Surface loudly so the user can rewrite the file with
    // a single row group, e.g.
    //   pyarrow.parquet.write_table(t, path, row_group_size=len(t))
    throw new Error(
      `GeoParquet file produced ${batches.length} record batches but the GeoArrow layers ` +
      `accept exactly one. Re-pack the file with a single row group ` +
      `(e.g. write_table(table, path, row_group_size=len(table))).`,
    );
  }
  return batches[0];
}
