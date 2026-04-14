import {
  Deck,
  Widget,
  WidgetPlacement,
} from '@deck.gl/core';
import './style.css'

export type TitleWidgetProps = {
  id: string;
  title: string;
  placement?: WidgetPlacement;
  style?: Partial<CSSStyleDeclaration>;
  placementX?: string;
  placementY?: string;
}

export default class TitleWidget extends Widget<TitleWidgetProps> {
  id = 'title';
  placement: WidgetPlacement = 'fill';
  className: string = "ecoscope-title-widget";

  constructor(props: TitleWidgetProps) {
    props.style = {
      position: "absolute",
      transform: "translate(-50%, -50%)",
      left: "50%",
      top: "1%",
      ...props.style ?? {},
    };
    super(props);
    this.setProps(props);
  }

  onRenderHTML(_rootElement: HTMLElement): void {}

  onAdd({ deck: _deck }: { deck: Deck }): HTMLDivElement {
    const element = document.createElement('div');
    element.classList.add('deck-widget', this.className);
    Object.entries(this.props.style).map(([key, value]) => {
      element.style.setProperty(key, value as string);
    });
    const titleElement = document.createElement('div');
    titleElement.innerText = this.props.title;
    element.appendChild(titleElement);
    return element;
  }
}