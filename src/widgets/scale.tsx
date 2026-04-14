import {
  Viewport,
  WebMercatorViewport,
  Widget,
  WidgetPlacement,
} from '@deck.gl/core';
import {render} from 'preact';

export type ScaleWidgetProps = {
  id?: string;
  placement?: WidgetPlacement;
  viewId?: string | null;
  maxWidth?: number;
  useImperial?: boolean;
}

export default class ScaleWidget extends Widget<ScaleWidgetProps> {
  id = 'scale';
  placement: WidgetPlacement = 'bottom-left';
  viewId?: string | null = null;
  viewport?: Viewport;
  className: string = "ecoscope-scale-widget";

  constructor(props: ScaleWidgetProps) {
    super(props);
    this.setProps(props);
  }

  setProps(props: Partial<ScaleWidgetProps>) {
    props.maxWidth = props.maxWidth ?? 300;
    props.useImperial = props.useImperial ?? false;
    super.setProps(props);
  }

  onViewportChange(viewport: Viewport) {
    this.viewport = viewport;
    this.updateHTML();
  }

  onRenderHTML(rootElement: HTMLElement): void {
    if (this.viewport instanceof WebMercatorViewport) {
      const meters = this.viewport.metersPerPixel * this.props.maxWidth;
      let distance: number
      let label: string;

      if (this.props.useImperial) {
        const feet = meters * 3.2808399;
        if (feet > 5280) {
          distance = feet / 5280;
          label = 'mi';
        } else {
          distance = feet;
          label = 'ft';
        }
      } else {
        distance = meters < 1000 ? meters : meters / 1000;
        label = meters < 1000 ? 'm' : 'km';
      }

      const ratio = this.roundNumber(distance) / distance;
      distance = this.roundNumber(distance);
      const width = `${Math.round(this.props.maxWidth * ratio * (4 / 3))}px`;

      const ui = (
        <div>
          <svg id="test" style={{ width: width, height: "40px" }}>
            <rect
              id="border"
              style={{ stroke: "#000", fill: "#FFF" }}
              height="40%"
              width="75%"
              x="5%"
              y="2%"
            />
            <rect
              id="first_block"
              style={{ fill: "#000" }}
              height="20%"
              width="37.5%"
              x="5%"
              y="2%"
            />
            <rect
              id="second_block"
              style={{ fill: "#000" }}
              height="20%"
              width="37.5%"
              x="42.5%"
              y="22%"
            />
            <text id="zero" textAnchor="middle" fontSize="20" x="5%" y="95%">
              0
            </text>
            <text
              id="half_scale"
              fontSize="20"
              textAnchor="middle"
              x="42.5%"
              y="95%"
            >
              {distance / 2}
            </text>
            <text id="scale" fontSize="20" textAnchor="middle" x="80%" y="95%">
              {distance}
            </text>
            <text id="unit" fontSize="20" x="82%" y="42%">
              {label}
            </text>
          </svg>
        </div>
      );

      render(ui, rootElement);
    }
  }

  roundNumber(number: number) {
    const pow10 = Math.pow(10, `${Math.floor(number)}`.length - 1);
    let d = number / pow10;

    d = d >= 10 ? 10 : d >= 5 ? 5 : d >= 3 ? 3 : d >= 2 ? 2 : 1;

    return pow10 * d;
  }
}
