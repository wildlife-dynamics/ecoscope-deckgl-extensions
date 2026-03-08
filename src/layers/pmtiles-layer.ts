import {MVTLayer, MVTLayerProps} from '@deck.gl/geo-layers';
import {PMTiles, FetchSource} from 'pmtiles';

type _PMTilesLayerProps = {
  headers?: Record<string, string>;
}

export type PMTilesLayerProps = MVTLayerProps & _PMTilesLayerProps;

export default class PMTilesLayer extends MVTLayer<PMTilesLayerProps> {
  static layerName = 'PMTilesLayer';
  static defaultProps = {
    ...MVTLayer.defaultProps,
    getFillColor: {type: 'accessor' as const, value: [200, 0, 80, 180] as [number, number, number, number]},
    getLineColor: {type: 'accessor' as const, value: [0, 0, 0, 255] as [number, number, number, number]},
    getLineWidth: {type: 'accessor' as const, value: 1},
    getPointRadius: {type: 'accessor' as const, value: 4},
    lineWidthUnits: 'pixels' as const,
    pointRadiusUnits: 'pixels' as const,
    stroked: true,
    filled: true,
    lineWidthMinPixels: 1,
    pointRadiusMinPixels: 2,
    binary: false,
    headers: {type: 'object' as const, value: {}},
  };

  private _pmtiles: PMTiles | null = null;
  private _source: FetchSource | null = null;

  initializeState() {
    super.initializeState();
    this._initPMTiles();
  }

  updateState(params: any) {
    if (params.changeFlags.dataChanged) {
      this._initPMTiles();
    }
    super.updateState(params);
  }

  _initPMTiles() {
    const props = this.props as any;
    const {data, headers} = props;
    if (typeof data !== 'string') return;
    const h = new Headers(headers || {});
    this._source = new FetchSource(data, h);
    this._pmtiles = new PMTiles(this._source);
  }

  setAuthHeaders(headers: Record<string, string>) {
    if (this._source) {
      this._source.setHeaders(new Headers(headers));
    }
  }

  async getTileData(tile: any): Promise<any> {
    if (!this._pmtiles) return null;
    const {x, y, z} = tile.index;
    try {
      const result = await this._pmtiles.getZxy(z, x, y);
      if (!result?.data) return null;
      return result.data;
    } catch (err) {
      console.error(`[PMTilesLayer] Failed to load tile z=${z} x=${x} y=${y}:`, err);
      return null;
    }
  }
}
