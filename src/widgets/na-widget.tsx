import {
  _GlobeViewport,
  Deck,
  Viewport,
  WebMercatorViewport,
  Widget,
  WidgetPlacement,
} from '@deck.gl/core';
import {render} from 'preact';

export type NorthArrowWidgetProps = {
  id?: string;
  placement?: WidgetPlacement;
  viewId?: string | null;
  style?: Partial<CSSStyleDeclaration>;
};


export default class NorthArrowWidget extends Widget<NorthArrowWidgetProps>  {
  id = 'na-widget';
  placement: WidgetPlacement = 'top-left';
  viewports: {[id: string]: Viewport} = {};
  className: string = "ecoscope-north-arrow-widget";

  constructor(props: NorthArrowWidgetProps) {
    super(props);
    this.setProps(props);
  }

  onAdd({deck}: {deck: Deck}) {
    const element = document.createElement('div');
    element.classList.add('deck-widget', this.className);
    Object.entries(this.props.style).map(([key, value]) => {
        element.style.setProperty(key, value as string);
    });
    this.deck = deck;
    this.updateHTML();
    return element;
  }

  setProps(props: Partial<NorthArrowWidgetProps>) {
    this.placement = props.placement ?? this.placement;
    this.viewId = props.viewId ?? this.viewId;
    super.setProps(props);
  }

  onRedraw() {    
    this.updateHTML();
  }

  onViewportChange(viewport: Viewport) {    
    // no need to update if viewport is the same
    if (!viewport.equals(this.viewports[viewport.id])) {
      this.viewports[viewport.id] = viewport;
      this.updateHTML();
    }
  }

  onRenderHTML(rootElement: HTMLElement): void {
    const viewId = this.viewId || Object.values(this.viewports)[0]?.id || 'default-view';
    const viewport = this.viewports[viewId];

    const [rz, rx] = this.getRotation(viewport);    
    const ui = (
      <div style={{ transform: `rotateX(${rx}deg)` }}>
        <svg
          transform={`rotate(${rz})`}
          width="100px"
          height="100px"
          viewBox="0 0 773 798"
        >
          <path
            transform={`translate(0 798) scale(1 -1)`}
            d="m674 403-161 48q-17 48-66 70l-46 166-46-167q-22-9-38-25t-29-45l-159-47 159-49q15-44 67-68l46-164 48 164q39 17 64 69zm-163 0q0-49-32-81-33-34-78-34-46 0-77 34-31 31-31 81 0 46 31 80t77 34q45 0 78-34 32-34 32-80zm-12 1q-5 7-7.5 17.5t-4 21.5-4.5 21-9 16q-7 6-17 9.5t-20.5 6-20 6-15.5 9.5v-107h98zm-98-108v108h-99l3-3 23-75q6-6 16.5-9.5t21-5.5 20-5.5 15.5-9.5zm-280 152h-26v-2q5 0 6-1 3-3 3-6 0-2-0.5-4t-1.5-7l-18-48-16 47q-3 9-3 12 0 7 7 7h2v2h-34v-2q2 0 3-1l3-3q2 0 2-2 2-1 4-5l5-15-12-42-17 50q-3 9-3 11 0 7 6 7h2v2h-33v-2q8 0 10-6 1-2 3-9l27-74h5l15 53 19-53h2l27 71q2 10 3 11 5 7 10 7v2zm325 350h-29v-3q7 0 10-4 1-1 1-11v-35l-42 53h-32v-3q7-2 12-6l2-3v-62q0-13-12-13v-2h29v2h-2q-4 0-7 2.5t-3 10.5v55l58-72h3v73q0 9 1 10.5t8 3.5l3 1v3zm207-395h-130q0 16-6 42zm-212-119-40-141v135q9 0 19 1t21 5zm-154 78-137 41h130q0-10 2-19.5t5-21.5zm114 168q-25 0-39-8l39 142v-134zm372-148h-3q-3-4-5-7.5t-4-5.5q-5-5-17-5h-19q-3 0-3 5v35h20q8 0 10-6 1-1 1-3 0-3 1-4h3v30h-3q-2-9-4-11t-8-2h-20v35h24q7 0 8-1 4-1 9-14h3l-1 20h-69v-2h3q7 0 8-4 2-2 2-9v-58q0-11-4-12-1-1-6-1h-3v-3h68zm-340-358q0 9-5.5 14.5t-20.5 14.5q-9 5-13 9l-5 5q-3 10-3 7 0 14 14 14 18 0 24-26h2v31h-2q-2-6-5-6-4 0-5 1-8 5-15 5-11 0-17.5-7t-6.5-17q0-13 9-19 6-4 16.5-10.5t12.5-8.5q8-7 8-13 0-14-18-14-13 0-18 5.5t-7 20.5h-2v-30h2q0 5 3 5l16-5h8q12 0 20 7t8 17z"
          />
        </svg>
      </div>
    );
    render(ui, rootElement);
  }


  getRotation(viewport?: Viewport) {
    if (viewport instanceof WebMercatorViewport) {
      return [-viewport.bearing, viewport.pitch];
    } else if (viewport instanceof _GlobeViewport) {
      return [0, Math.max(-80, Math.min(80, viewport.latitude))];
    }
    return [0, 0];
  }
}