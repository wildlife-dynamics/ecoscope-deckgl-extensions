import type { LoaderWithParser } from '@loaders.gl/loader-utils';
import type * as arrow from 'apache-arrow';

const PARQUET_MAGIC = [0x50, 0x41, 0x52, 0x31]; // "PAR1"

/**
 * loaders.gl Loader for GeoParquet files. Registered globally via
 * `registerLoaders` in `src/index.ts` so that any deck.gl layer can accept
 * `data: "<url>.parquet"` and get a parsed Arrow RecordBatch back without
 * the caller needing to know about the loader.
 *
 * The heavy wasm + arrow deps are dynamically imported so they live in a
 * code-split chunk and don't bloat the sync module graph — the main bundle
 * stays small and class registration happens immediately on script load.
 */
export const GeoParquetLoader: LoaderWithParser<arrow.RecordBatch> = {
  name: 'GeoParquet',
  id: 'geoparquet',
  module: 'ecoscope-deckgl-extensions',
  version: '0.0.8',
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
  parse: async (arrayBuffer: ArrayBuffer): Promise<arrow.RecordBatch> => {
    const [{ readGeoParquet }, arrowMod] = await Promise.all([
      import('@geoarrow/geoparquet-wasm'),
      import('apache-arrow'),
    ]);
    const buffer = new Uint8Array(arrayBuffer);
    const wasmTable = readGeoParquet(buffer);
    const ipc = wasmTable.intoIPCStream();
    const batches = arrowMod.tableFromIPC(ipc).batches;
    if (batches.length === 0) {
      throw new Error('GeoParquet file contained no record batches');
    }
    return batches[0];
  },
};
