import type { RdevMode } from './displacementMaps';

export interface RdevFilterSettings {
  mode: RdevMode;
  displacementScale: number;
  aberrationIntensity: number;
  mapUrl: string;
}

export interface RdevFilterRefs {
  defsEl: SVGDefsElement;
  displacementImageEl: SVGElement;
  edgeMaskAlphaEl: SVGElement;
  redDisplacementEl: SVGElement;
  greenDisplacementEl: SVGElement;
  blueDisplacementEl: SVGElement;
  blurEl: SVGElement;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';

function createSvgElement<K extends keyof SVGElementTagNameMap>(
  tagName: K,
  attributes: Record<string, string> = {},
): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG_NS, tagName);
  Object.entries(attributes).forEach(([key, value]) => {
    element.setAttribute(key, value);
  });
  return element;
}

function setHref(element: SVGElement, url: string): void {
  element.setAttribute('href', url);
  element.setAttributeNS(XLINK_NS, 'xlink:href', url);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function createRdevFilter(
  svgRootEl: SVGSVGElement,
  filterId: string,
  settings: RdevFilterSettings,
): RdevFilterRefs {
  const defsEl = createSvgElement('defs');
  const filterEl = createSvgElement('filter', {
    id: filterId,
    x: '-35%',
    y: '-35%',
    width: '170%',
    height: '170%',
    'color-interpolation-filters': 'sRGB',
  });

  const displacementImageEl = createSvgElement('feImage', {
    x: '0',
    y: '0',
    width: '100%',
    height: '100%',
    result: 'DISPLACEMENT_MAP',
    preserveAspectRatio: 'xMidYMid slice',
  });

  const edgeIntensityEl = createSvgElement('feColorMatrix', {
    in: 'DISPLACEMENT_MAP',
    type: 'matrix',
    values: '0.3 0.3 0.3 0 0 0.3 0.3 0.3 0 0 0.3 0.3 0.3 0 0 0 0 0 1 0',
    result: 'EDGE_INTENSITY',
  });

  const edgeMaskEl = createSvgElement('feComponentTransfer', {
    in: 'EDGE_INTENSITY',
    result: 'EDGE_MASK',
  });
  const edgeMaskAlphaEl = createSvgElement('feFuncA', {
    type: 'discrete',
  });
  edgeMaskEl.append(edgeMaskAlphaEl);

  const centerOriginalEl = createSvgElement('feOffset', {
    in: 'SourceGraphic',
    dx: '0',
    dy: '0',
    result: 'CENTER_ORIGINAL',
  });

  const redDisplacementEl = createSvgElement('feDisplacementMap', {
    in: 'SourceGraphic',
    in2: 'DISPLACEMENT_MAP',
    xChannelSelector: 'R',
    yChannelSelector: 'B',
    result: 'RED_DISPLACED',
  });
  const redChannelEl = createSvgElement('feColorMatrix', {
    in: 'RED_DISPLACED',
    type: 'matrix',
    values: '1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0',
    result: 'RED_CHANNEL',
  });

  const greenDisplacementEl = createSvgElement('feDisplacementMap', {
    in: 'SourceGraphic',
    in2: 'DISPLACEMENT_MAP',
    xChannelSelector: 'R',
    yChannelSelector: 'B',
    result: 'GREEN_DISPLACED',
  });
  const greenChannelEl = createSvgElement('feColorMatrix', {
    in: 'GREEN_DISPLACED',
    type: 'matrix',
    values: '0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0',
    result: 'GREEN_CHANNEL',
  });

  const blueDisplacementEl = createSvgElement('feDisplacementMap', {
    in: 'SourceGraphic',
    in2: 'DISPLACEMENT_MAP',
    xChannelSelector: 'R',
    yChannelSelector: 'B',
    result: 'BLUE_DISPLACED',
  });
  const blueChannelEl = createSvgElement('feColorMatrix', {
    in: 'BLUE_DISPLACED',
    type: 'matrix',
    values: '0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0',
    result: 'BLUE_CHANNEL',
  });

  const greenBlueBlendEl = createSvgElement('feBlend', {
    in: 'GREEN_CHANNEL',
    in2: 'BLUE_CHANNEL',
    mode: 'screen',
    result: 'GB_COMBINED',
  });
  const rgbBlendEl = createSvgElement('feBlend', {
    in: 'RED_CHANNEL',
    in2: 'GB_COMBINED',
    mode: 'screen',
    result: 'RGB_COMBINED',
  });

  const blurEl = createSvgElement('feGaussianBlur', {
    in: 'RGB_COMBINED',
    result: 'ABERRATED_BLURRED',
  });
  const edgeCompositeEl = createSvgElement('feComposite', {
    in: 'ABERRATED_BLURRED',
    in2: 'EDGE_MASK',
    operator: 'in',
    result: 'EDGE_ABERRATION',
  });

  const invertedMaskEl = createSvgElement('feComponentTransfer', {
    in: 'EDGE_MASK',
    result: 'INVERTED_MASK',
  });
  invertedMaskEl.append(
    createSvgElement('feFuncA', {
      type: 'table',
      tableValues: '1 0',
    }),
  );

  const cleanCenterEl = createSvgElement('feComposite', {
    in: 'CENTER_ORIGINAL',
    in2: 'INVERTED_MASK',
    operator: 'in',
    result: 'CENTER_CLEAN',
  });
  const outputCompositeEl = createSvgElement('feComposite', {
    in: 'EDGE_ABERRATION',
    in2: 'CENTER_CLEAN',
    operator: 'over',
  });

  filterEl.append(
    displacementImageEl,
    edgeIntensityEl,
    edgeMaskEl,
    centerOriginalEl,
    redDisplacementEl,
    redChannelEl,
    greenDisplacementEl,
    greenChannelEl,
    blueDisplacementEl,
    blueChannelEl,
    greenBlueBlendEl,
    rgbBlendEl,
    blurEl,
    edgeCompositeEl,
    invertedMaskEl,
    cleanCenterEl,
    outputCompositeEl,
  );
  defsEl.append(filterEl);
  svgRootEl.append(defsEl);

  const refs: RdevFilterRefs = {
    defsEl,
    displacementImageEl,
    edgeMaskAlphaEl,
    redDisplacementEl,
    greenDisplacementEl,
    blueDisplacementEl,
    blurEl,
  };

  updateRdevFilter(refs, settings);
  return refs;
}

export function updateRdevFilter(
  refs: RdevFilterRefs,
  settings: RdevFilterSettings,
): void {
  const baseScale = settings.mode === 'shader' ? settings.displacementScale : -settings.displacementScale;
  const greenScale = baseScale - settings.displacementScale * settings.aberrationIntensity * 0.05;
  const blueScale = baseScale - settings.displacementScale * settings.aberrationIntensity * 0.1;
  const blurAmount = Math.max(0.1, 0.5 - settings.aberrationIntensity * 0.1);
  const edgeMaskAlpha = clamp(settings.aberrationIntensity * 0.05, 0, 1);

  setHref(refs.displacementImageEl, settings.mapUrl);
  refs.edgeMaskAlphaEl.setAttribute('tableValues', `0 ${edgeMaskAlpha.toFixed(3)} 1`);
  refs.redDisplacementEl.setAttribute('scale', baseScale.toFixed(3));
  refs.greenDisplacementEl.setAttribute('scale', greenScale.toFixed(3));
  refs.blueDisplacementEl.setAttribute('scale', blueScale.toFixed(3));
  refs.blurEl.setAttribute('stdDeviation', blurAmount.toFixed(3));
}

export function removeRdevFilter(refs: RdevFilterRefs): void {
  refs.defsEl.remove();
}
