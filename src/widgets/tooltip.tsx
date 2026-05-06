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

  const rows: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(properties)) {
    if (value === null || value === undefined || value === '') continue;
    if (filterByAllowed && !allowed!.includes(key)) continue;
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
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
