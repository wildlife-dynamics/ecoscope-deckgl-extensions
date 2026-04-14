import NorthArrowWidget from './widgets/na-widget';
import TitleWidget from './widgets/title';
import ScaleWidget from './widgets/scale';
import LegendWidget from './widgets/legend';
import SaveImageWidget from './widgets/save-image';
import TiledBitmapLayer from './layers/tiled-bitmap-layer';

export {default as NorthArrowWidget} from './widgets/na-widget'
export {default as TitleWidget} from './widgets/title'
export {default as ScaleWidget} from './widgets/scale'
export {default as LegendWidget} from './widgets/legend'
export {default as SaveImageWidget} from './widgets/save-image';
export {default as TiledBitmapLayer} from './layers/tiled-bitmap-layer';

const _global = (typeof window === 'undefined' ? global : window) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
_global.NorthArrowWidget = {NorthArrowWidget};
_global.TitleWidget = {TitleWidget};
_global.ScaleWidget = {ScaleWidget};
_global.LegendWidget = {LegendWidget};
_global.SaveImageWidget = {SaveImageWidget};
_global.TiledBitmapLayer = {TiledBitmapLayer};
