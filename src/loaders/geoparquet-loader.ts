import type { LoaderContext, LoaderWithParser } from '@loaders.gl/loader-utils';
import type * as arrow from 'apache-arrow';

import { VERSION } from '../version';

const PARQUET_MAGIC = [0x50, 0x41, 0x52, 0x31]; // "PAR1"

/**
 * loaders.gl Loader for GeoParquet files. Intended specifically 
 * for use with the GeoArrowLayer wrappers in this package.
 *
 * Returns an arrow.Table (not a single RecordBatch) so the layer subclasses
 * can render multi-row-group files as one upstream sub-layer per batch.
 */
export const GeoParquetLoader: LoaderWithParser<arrow.Table> = {
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

export async function parseGeoParquet(
  arrayBuffer: ArrayBuffer,
  _options?: unknown,
  context?: LoaderContext,
): Promise<arrow.Table> {
  try {
    return await parseGeoParquetInner(arrayBuffer);
  } catch (e) {
    // Wrap so the source URL (or filename) is in the message — wasm/arrow
    // errors on their own give no hint which file they came from.
    const source = context?.url ?? context?.filename;
    const detail = e instanceof Error ? e.message : String(e);
    throw new Error(
      source ? `Failed to parse GeoParquet from ${source}: ${detail}` : `Failed to parse GeoParquet: ${detail}`,
      { cause: e },
    );
  }
}

async function parseGeoParquetInner(arrayBuffer: ArrayBuffer): Promise<arrow.Table> {
  const [{ readGeoParquet }, arrowMod] = await Promise.all([
    import('@geoarrow/geoparquet-wasm'),
    import('apache-arrow'),
  ]);
  const buffer = new Uint8Array(arrayBuffer);
  const ipc = readGeoParquet(buffer).intoIPCStream();
  const table = arrowMod.tableFromIPC(ipc);
  if (table.batches.length === 0) {
    throw new Error('GeoParquet file contained no record batches');
  }
  return table;
}
