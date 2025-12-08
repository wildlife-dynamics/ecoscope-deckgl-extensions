import {
  Deck,
  Widget,
  WidgetPlacement,
} from '@deck.gl/core';
import './style.css'

export type LegendValue = {
  label: string;
  color: string;
}

export type LegendSegment = {
  title: string;
  values: Array<LegendValue>;
}

export type LegendWidgetProps = {
  id: string;
  legendValues: Array<LegendSegment>;
  placement: WidgetPlacement;
  style?: Partial<CSSStyleDeclaration>;
}

export default class LegendWidget extends Widget<LegendWidgetProps> {
  id = 'legend';
  placement: WidgetPlacement = 'bottom-right';
  className: string = "ecoscope-legend-widget";

  constructor(props: LegendWidgetProps) {
    super(props);
    this.setProps(props);
  }

  onRenderHTML(rootElement: HTMLElement): void {}

  onAdd({ deck }: { deck: Deck }): HTMLDivElement {
    const element = document.createElement('div');
    element.classList.add('deck-widget', this.className);
    Object.entries(this.props.style).map(([key, value]) => {
      element.style.setProperty(key, value as string);
    });
  
    this.props.legendValues.forEach(({title, values})=> {       
      const titleElement = document.createElement('div');
      titleElement.innerText = title;
      titleElement.classList.add('legend-title');

      const legendElement = document.createElement('div');
      legendElement.classList.add('legend-scale');

      const ul = document.createElement('ul');
      ul.classList.add('legend-labels');

      values.forEach(({label, color})=> {        
        const li = document.createElement('li');
        const span = document.createElement('span');

        span.style.setProperty('background', color);
        li.innerText = label;

        li.appendChild(span);
        ul.appendChild(li);
      });

      legendElement.appendChild(ul);
      element.appendChild(titleElement);
      element.appendChild(legendElement);
    });
    return element;
  }
}