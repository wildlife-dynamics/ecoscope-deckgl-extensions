import {
  Deck,
  PickingInfo,
  Widget,
  WidgetPlacement,
} from '@deck.gl/core';
import './style.css';

type LayerColumns = Record<string, string[] | null | undefined>;

export type TooltipWidgetProps = {
  id?: string;
  // layer id → tooltip column names. A missing key (or null)
  // means "show all properties" for that layer.
  layerColumns?: LayerColumns;
};

const TOOLTIP_CLASS_NAME = 'ecoscope-tooltip';
const TOOLTIP_STYLE: Partial<CSSStyleDeclaration> = {
  backgroundColor: '#fff',
  boxShadow: '0 0 15px rgba(0, 0, 0, 0.1)',
  color: '#000',
  padding: '6px',
};

export default class TooltipWidget extends Widget<TooltipWidgetProps> {
  id = 'TooltipWidget';
  // The widget API requires a placement but is superfluous here
  placement: WidgetPlacement = 'fill';
  className: string = "ecoscope-tooltip-widget";
  private _installed = false;

  constructor(props: TooltipWidgetProps) {
    super(props);
    this.setProps(props);
  }

  onRenderHTML(_rootElement: HTMLElement): void {}

  onAdd({ deck }: { deck: Deck }): HTMLDivElement {
    this.deck = deck;
    const element = document.createElement('div');
    element.classList.add('deck-widget', this.className);
    element.style.display = 'none';

    if (!this._installed && this.deck) {
      this._installed = true;
      this.deck.setProps({
        getTooltip: (info: PickingInfo) => buildTooltip(info, this.props.layerColumns),
      });
    }
    return element;
  }
}

type TooltipResult = {
  className: string;
  html: string;
  style: Partial<CSSStyleDeclaration>;
} | null;

function buildTooltip(info: PickingInfo, layerColumns: LayerColumns): TooltipResult {
  if (!info.object) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const properties: Record<string, any> | undefined =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (info.object as any).properties ?? (info.object as Record<string, any>);
  if (!properties || typeof properties !== 'object') return null;

  const layerId = info.layer?.id;
  const allowed = layerId ? layerColumns?.[layerId] : null;
  const filterByAllowed = Array.isArray(allowed);

  // Enumerate keys defensively: for GeoArrow-backed layers, `properties`
  // is an apache-arrow row proxy whose property accessors can throw (e.g.
  // BigInt-vs-Number mixing in offset arithmetic for some column types).
  // We isolate the read for each field so one problematic column doesn't
  // take out the whole tooltip.
  let keys: string[] = [];
  try {
    keys = Object.keys(properties);
  } catch {
    return null;
  }

  const rows: Array<[string, string]> = [];
  for (const key of keys) {
    if (filterByAllowed && !allowed!.includes(key)) continue;
    let value: unknown;
    try {
      value = properties[key];
    } catch {
      continue;
    }
    if (value === null || value === undefined || value === '') continue;
    rows.push([key, formatValue(value)]);
  }

  if (rows.length === 0) return null;

  const html = `<table><tbody>${rows
    .map(
      ([k, v]) =>
        `<tr><td>${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`,
    )
    .join('')}</tbody></table>`;

  return {
    className: TOOLTIP_CLASS_NAME,
    html,
    style: TOOLTIP_STYLE,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatValue(value: any): string {
  // Int64 columns surface as BigInt from apache-arrow row proxies; cast to
  // string. Timestamp columns are converted to ISO strings upstream in
  // `persist_arrow`, so we don't reach for the batch schema here. Parquets
  // not produced by `persist_arrow` whose timestamps come through as raw
  // BigInt nanoseconds render as integer strings — a known limitation.
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, (_k, v) =>
        typeof v === 'bigint' ? v.toString() : v,
      );
    } catch {
      try {
        return String(value);
      } catch {
        return '';
      }
    }
  }
  try {
    return String(value);
  } catch {
    return '';
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
