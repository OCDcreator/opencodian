import {
  applyEdgeBulge,
  createDiamondContext,
  traceDiamondRay,
  type DiamondContext,
  type DiamondProjectedFace,
  type DiamondSize,
} from '../../utils/glass/adapters/shudingDiamond';

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';
const FILTER_ID_PREFIX = 'opencodian-liquid-diamond-demo-';

export const LIQUID_DIAMOND_DEMO_STAGE_SIZE = 220;

const INTERACTIVE_CANVAS_DPI = 0.55;
const SETTLED_CANVAS_DPI = 1;
const DEFAULT_THETA = 0.64;
const DEFAULT_PHI = -0.42;
const DRAG_ELASTIC = 0.16;
const VELOCITY_DAMPING = 0.94;
const BOUND_SPRING = 0.014;
const BOUND_DAMPING = 0.82;
const THETA_PER_PX = 0.0125;
const PHI_PER_PX = 0.01;
const PHI_MIN = -1.35;
const PHI_MAX = 1.35;

type RenderQuality = 'interactive' | 'settled';

type DemoState = {
  parentEl: HTMLElement;
  overlayEl: HTMLDivElement;
  interactionLayerEl: HTMLDivElement;
  hostEl: HTMLDivElement;
  svgEl: SVGSVGElement;
  defsEl: SVGDefsElement;
  filterEl: SVGFilterElement;
  feImageEl: SVGFEImageElement;
  feDisplacementMapEl: SVGFEDisplacementMapElement;
  stageEl: HTMLDivElement;
  crystalEl: HTMLDivElement;
  bloomEl: HTMLDivElement;
  rimEl: HTMLDivElement;
  faceSvgEl: SVGSVGElement;
  canvasEl: HTMLCanvasElement;
  canvasCtx: CanvasRenderingContext2D;
  size: DiamondSize;
  imageData: ImageData | null;
  rawValues: Float32Array | null;
  supportsBackdropFilterUrl: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  dragging: boolean;
  pointerId: number | null;
  dragStartX: number;
  dragStartY: number;
  dragOriginX: number;
  dragOriginY: number;
  lastPointerX: number;
  lastPointerY: number;
  lastPointerTime: number;
  inertiaFrameId: number | null;
  renderFrameId: number | null;
  pendingRenderQuality: RenderQuality | null;
  resizeHandler: () => void;
  pointerDownHandler: (event: PointerEvent) => void;
  pointerMoveHandler: (event: PointerEvent) => void;
  pointerUpHandler: (event: PointerEvent) => void;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function formatNumber(value: number): string {
  return Number(value.toFixed(3)).toString();
}

function maxRenderQuality(
  a: RenderQuality | null,
  b: RenderQuality,
): RenderQuality {
  if (a === 'settled' || b === 'settled') {
    return 'settled';
  }

  return 'interactive';
}

function getCanvasDpiForQuality(quality: RenderQuality): number {
  return quality === 'interactive' ? INTERACTIVE_CANVAS_DPI : SETTLED_CANVAS_DPI;
}

function generateFilterId(): string {
  const entropy =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  return `${FILTER_ID_PREFIX}${entropy}`;
}

function detectCssSupport(property: string, value: string): boolean {
  return typeof CSS !== 'undefined' && typeof CSS.supports === 'function'
    ? CSS.supports(property, value)
    : false;
}

function normalizeFilterValue(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function styleAcceptsBackdropValue(value: string, prefixed: boolean): boolean {
  const probe = document.createElement('div');
  if (prefixed) {
    probe.style.setProperty('-webkit-backdrop-filter', value);
    return normalizeFilterValue(probe.style.getPropertyValue('-webkit-backdrop-filter')).includes('url(');
  }

  probe.style.setProperty('backdrop-filter', value);
  return normalizeFilterValue(probe.style.getPropertyValue('backdrop-filter')).includes('url(');
}

function supportsBackdropFilterUrl(): boolean {
  const quotedValue = 'url("#opencodian-liquid-diamond-demo-support")';
  const plainValue = 'url(#opencodian-liquid-diamond-demo-support)';

  return (
    detectCssSupport('backdrop-filter', quotedValue)
    || detectCssSupport('-webkit-backdrop-filter', quotedValue)
    || detectCssSupport('backdrop-filter', plainValue)
    || detectCssSupport('-webkit-backdrop-filter', plainValue)
    || styleAcceptsBackdropValue(quotedValue, false)
    || styleAcceptsBackdropValue(quotedValue, true)
    || styleAcceptsBackdropValue(plainValue, false)
    || styleAcceptsBackdropValue(plainValue, true)
  );
}

function buildBackdropFilterValue(filterId: string): string {
  return `url(#${filterId}) contrast(1.08) brightness(1.2) saturate(1.08)`;
}

function buildFallbackBackdropFilterValue(): string {
  return 'blur(10px) contrast(1.02) brightness(1.06) saturate(1.08)';
}

function createSvgElement<K extends keyof SVGElementTagNameMap>(
  tagName: K,
): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tagName);
}

function createStageLayerElement(role: string): HTMLDivElement {
  const element = document.createElement('div');
  element.className = `opencodian-liquid-diamond-demo-${role}`;
  element.setAttribute('data-opencodian-liquid-diamond-demo-role', role);
  element.style.position = 'absolute';
  element.style.inset = '0';
  element.style.pointerEvents = 'none';
  return element;
}

function createFaceSvgElement(): SVGSVGElement {
  const element = createSvgElement('svg');
  element.classList.add('opencodian-liquid-diamond-demo-face-overlay');
  element.setAttribute('data-opencodian-liquid-diamond-demo-role', 'face-overlay');
  element.style.position = 'absolute';
  element.style.inset = '0';
  element.style.overflow = 'visible';
  element.style.pointerEvents = 'none';
  return element;
}

function getBounds(state: DemoState): { minX: number; maxX: number; minY: number; maxY: number } {
  const width = state.interactionLayerEl.clientWidth || state.parentEl.clientWidth || LIQUID_DIAMOND_DEMO_STAGE_SIZE;
  const height = state.interactionLayerEl.clientHeight || state.parentEl.clientHeight || LIQUID_DIAMOND_DEMO_STAGE_SIZE;
  const extentX = Math.max(0, (width - LIQUID_DIAMOND_DEMO_STAGE_SIZE) / 2);
  const extentY = Math.max(0, (height - LIQUID_DIAMOND_DEMO_STAGE_SIZE) / 2);

  return {
    minX: -extentX,
    maxX: extentX,
    minY: -extentY,
    maxY: extentY,
  };
}

function elasticPosition(value: number, min: number, max: number): number {
  if (value < min) {
    return min + (value - min) * DRAG_ELASTIC;
  }

  if (value > max) {
    return max + (value - max) * DRAG_ELASTIC;
  }

  return value;
}

function renderFaceOverlay(state: DemoState, faces: DiamondProjectedFace[], context: DiamondContext): void {
  state.faceSvgEl.setAttribute('width', `${state.size.cssWidth}`);
  state.faceSvgEl.setAttribute('height', `${state.size.cssHeight}`);
  state.faceSvgEl.setAttribute('viewBox', `0 0 ${state.size.cssWidth} ${state.size.cssHeight}`);
  state.faceSvgEl.replaceChildren();

  for (let index = 0; index < faces.length; index += 1) {
    const face = faces[index];
    const polygon = createSvgElement('polygon');
    polygon.setAttribute('data-opencodian-liquid-diamond-demo-role', 'face');
    polygon.setAttribute('data-opencodian-liquid-diamond-demo-face-index', `${index}`);
    polygon.setAttribute(
      'points',
      face.points
        .map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`)
        .join(' '),
    );
    polygon.setAttribute('fill', `rgba(188, 232, 247, ${face.fillOpacity.toFixed(3)})`);
    polygon.setAttribute('stroke', `rgba(126, 176, 198, ${face.strokeOpacity.toFixed(3)})`);
    polygon.setAttribute('stroke-width', '1');
    polygon.setAttribute('stroke-linejoin', 'round');
    polygon.setAttribute('vector-effect', 'non-scaling-stroke');
    state.faceSvgEl.appendChild(polygon);
  }

  const hullOutline = createSvgElement('polygon');
  hullOutline.setAttribute('data-opencodian-liquid-diamond-demo-role', 'facet-outline');
  hullOutline.setAttribute(
    'points',
    context.hull
      .map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`)
      .join(' '),
  );
  hullOutline.setAttribute('fill', 'none');
  hullOutline.setAttribute('stroke', 'rgba(220, 248, 255, 0.34)');
  hullOutline.setAttribute('stroke-width', '1.1');
  hullOutline.setAttribute('stroke-linejoin', 'round');
  hullOutline.setAttribute('vector-effect', 'non-scaling-stroke');
  state.faceSvgEl.appendChild(hullOutline);
}

function renderDisplacementMapAtQuality(
  state: DemoState,
  context: DiamondContext,
  quality: RenderQuality,
): number {
  const dpi = getCanvasDpiForQuality(quality);
  const pixelWidth = Math.max(1, Math.round(state.size.cssWidth * dpi));
  const pixelHeight = Math.max(1, Math.round(state.size.cssHeight * dpi));

  if (state.canvasEl.width !== pixelWidth) {
    state.canvasEl.width = pixelWidth;
  }
  if (state.canvasEl.height !== pixelHeight) {
    state.canvasEl.height = pixelHeight;
  }

  if (
    !state.imageData
    || state.imageData.width !== pixelWidth
    || state.imageData.height !== pixelHeight
  ) {
    state.imageData = state.canvasCtx.createImageData(pixelWidth, pixelHeight);
  }
  if (!state.rawValues || state.rawValues.length !== pixelWidth * pixelHeight * 2) {
    state.rawValues = new Float32Array(pixelWidth * pixelHeight * 2);
  }

  const data = state.imageData.data;
  const rawValues = state.rawValues;
  let maxScale = 0;
  let rawIndex = 0;

  for (let y = 0; y < pixelHeight; y += 1) {
    for (let x = 0; x < pixelWidth; x += 1) {
      const uv = {
        x: x / pixelWidth,
        y: y / pixelHeight,
      };
      const trace = traceDiamondRay(uv, context, state.size);
      const displaced = trace ? applyEdgeBulge(trace, uv, context, state.size) : {
        displacedUv: uv,
      };
      const dx = displaced.displacedUv.x * pixelWidth - x;
      const dy = displaced.displacedUv.y * pixelHeight - y;
      maxScale = Math.max(maxScale, Math.abs(dx), Math.abs(dy));
      rawValues[rawIndex] = dx;
      rawValues[rawIndex + 1] = dy;
      rawIndex += 2;
    }
  }

  maxScale = Math.max(maxScale, 1);
  rawIndex = 0;

  for (let index = 0; index < data.length; index += 4) {
    const r = rawValues[rawIndex] / (maxScale * 2) + 0.5;
    const g = rawValues[rawIndex + 1] / (maxScale * 2) + 0.5;
    data[index] = Math.round(clamp(r, 0, 1) * 255);
    data[index + 1] = Math.round(clamp(g, 0, 1) * 255);
    data[index + 2] = 0;
    data[index + 3] = 255;
    rawIndex += 2;
  }

  state.canvasCtx.putImageData(state.imageData, 0, 0);
  const dataUrl = state.canvasEl.toDataURL();
  state.feImageEl.setAttribute('href', dataUrl);
  state.feImageEl.setAttributeNS(XLINK_NS, 'href', dataUrl);
  return (maxScale * 2) / dpi;
}

function renderVisualLayers(state: DemoState, context: DiamondContext): void {
  const centerX = (context.hullCenter.x / state.size.cssWidth) * 100;
  const centerY = (context.hullCenter.y / state.size.cssHeight) * 100;
  const topX = (context.bloomAnchors.top.x / state.size.cssWidth) * 100;
  const topY = (context.bloomAnchors.top.y / state.size.cssHeight) * 100;
  const leftX = (context.bloomAnchors.lowerLeft.x / state.size.cssWidth) * 100;
  const leftY = (context.bloomAnchors.lowerLeft.y / state.size.cssHeight) * 100;
  const rightX = (context.bloomAnchors.lowerRight.x / state.size.cssWidth) * 100;
  const rightY = (context.bloomAnchors.lowerRight.y / state.size.cssHeight) * 100;
  const bloomScaleX = Math.max((context.hullBounds.width / state.size.cssWidth) * 100, 68);
  const bloomScaleY = Math.max((context.hullBounds.height / state.size.cssHeight) * 100, 78);

  state.bloomEl.style.setProperty('clip-path', context.clipPath);
  state.bloomEl.style.opacity = '1';
  state.bloomEl.style.transform = 'scale(1.03)';
  state.bloomEl.style.transformOrigin = `${centerX}% ${centerY}%`;
  state.bloomEl.style.filter = 'blur(30px) saturate(1.3) brightness(1.22)';
  state.bloomEl.style.background = [
    `radial-gradient(${bloomScaleX * 0.2}% ${bloomScaleY * 0.24}% at ${topX}% ${topY}%, rgba(255, 255, 255, 0.98), rgba(186, 244, 255, 0.68) 34%, rgba(108, 224, 255, 0.2) 62%, rgba(108, 224, 255, 0) 100%)`,
    `radial-gradient(${bloomScaleX * 0.18}% ${bloomScaleY * 0.2}% at ${leftX}% ${leftY}%, rgba(214, 247, 255, 0.58), rgba(110, 221, 255, 0.24) 48%, rgba(110, 221, 255, 0) 100%)`,
    `radial-gradient(${bloomScaleX * 0.16}% ${bloomScaleY * 0.18}% at ${rightX}% ${rightY}%, rgba(208, 244, 255, 0.34), rgba(110, 221, 255, 0.14) 50%, rgba(110, 221, 255, 0) 100%)`,
    `radial-gradient(${bloomScaleX * 0.44}% ${bloomScaleY * 0.32}% at ${centerX}% ${Math.max(centerY - 8, 12)}%, rgba(160, 236, 255, 0.22), rgba(160, 236, 255, 0.08) 54%, rgba(160, 236, 255, 0) 100%)`,
  ].join(', ');

  state.crystalEl.style.setProperty('clip-path', context.clipPath);
  state.crystalEl.style.background = [
    'linear-gradient(140deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.03) 38%, rgba(255, 255, 255, 0.10) 68%, rgba(255, 255, 255, 0.18))',
    'linear-gradient(180deg, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0.05))',
  ].join(', ');
  state.crystalEl.style.boxShadow = 'inset 0 0 0 1px rgba(224, 248, 255, 0.08)';
  const filterValue = state.supportsBackdropFilterUrl
    ? buildBackdropFilterValue(state.filterEl.id)
    : buildFallbackBackdropFilterValue();
  state.crystalEl.style.setProperty('backdrop-filter', filterValue);
  state.crystalEl.style.setProperty('-webkit-backdrop-filter', filterValue);

  state.rimEl.style.setProperty('clip-path', context.clipPath);
  state.rimEl.style.opacity = '0.45';
  state.rimEl.style.background =
    'linear-gradient(145deg, rgba(255, 255, 255, 0.72), rgba(205, 246, 255, 0.18) 42%, rgba(255, 255, 255, 0.04) 78%, rgba(255, 255, 255, 0.24))';
  state.rimEl.style.filter =
    'drop-shadow(0 0 6px rgba(170, 240, 255, 0.45)) drop-shadow(0 0 14px rgba(122, 225, 255, 0.18))';

  renderFaceOverlay(state, context.projectedFaces, context);
}

function applyHostTransform(state: DemoState): void {
  state.hostEl.style.transform =
    `translate(-50%, -50%) translate3d(${state.x.toFixed(2)}px, ${state.y.toFixed(2)}px, 0)`;
}

function renderScene(state: DemoState, quality: RenderQuality): void {
  applyHostTransform(state);

  state.filterEl.setAttribute('x', '0');
  state.filterEl.setAttribute('y', '0');
  state.filterEl.setAttribute('width', `${state.size.cssWidth}`);
  state.filterEl.setAttribute('height', `${state.size.cssHeight}`);
  state.feImageEl.setAttribute('x', '0');
  state.feImageEl.setAttribute('y', '0');
  state.feImageEl.setAttribute('width', `${state.size.cssWidth}`);
  state.feImageEl.setAttribute('height', `${state.size.cssHeight}`);

  const theta = DEFAULT_THETA + state.x * THETA_PER_PX;
  const phi = clamp(DEFAULT_PHI - state.y * PHI_PER_PX, PHI_MIN, PHI_MAX);
  const context = createDiamondContext(theta, phi, state.size);
  const displacementScale = renderDisplacementMapAtQuality(state, context, quality);
  state.feDisplacementMapEl.setAttribute('scale', formatNumber(displacementScale));
  renderVisualLayers(state, context);
}

function scheduleRender(state: DemoState, quality: RenderQuality): void {
  state.pendingRenderQuality = maxRenderQuality(state.pendingRenderQuality, quality);
  if (state.renderFrameId !== null) {
    return;
  }

  state.renderFrameId = window.requestAnimationFrame(() => {
    state.renderFrameId = null;
    const nextQuality = state.pendingRenderQuality ?? 'interactive';
    state.pendingRenderQuality = null;
    renderScene(state, nextQuality);
  });
}

function tickInertia(state: DemoState): void {
  state.inertiaFrameId = null;
  if (!state.dragging) {
    const bounds = getBounds(state);
    state.x += state.vx;
    state.y += state.vy;
    state.vx *= VELOCITY_DAMPING;
    state.vy *= VELOCITY_DAMPING;

    if (state.x < bounds.minX) {
      state.vx += (bounds.minX - state.x) * BOUND_SPRING;
      state.vx *= BOUND_DAMPING;
    } else if (state.x > bounds.maxX) {
      state.vx += (bounds.maxX - state.x) * BOUND_SPRING;
      state.vx *= BOUND_DAMPING;
    }

    if (state.y < bounds.minY) {
      state.vy += (bounds.minY - state.y) * BOUND_SPRING;
      state.vy *= BOUND_DAMPING;
    } else if (state.y > bounds.maxY) {
      state.vy += (bounds.maxY - state.y) * BOUND_SPRING;
      state.vy *= BOUND_DAMPING;
    }

    if (Math.abs(state.vx) < 0.01 && Math.abs(state.vy) < 0.01) {
      state.x = clamp(state.x, bounds.minX, bounds.maxX);
      state.y = clamp(state.y, bounds.minY, bounds.maxY);
      state.vx = 0;
      state.vy = 0;
      applyHostTransform(state);
      scheduleRender(state, 'settled');
    } else {
      applyHostTransform(state);
      scheduleRender(state, 'interactive');
      state.inertiaFrameId = window.requestAnimationFrame(() => {
        tickInertia(state);
      });
    }
  }
}

function scheduleInertiaTick(state: DemoState): void {
  if (state.inertiaFrameId !== null) {
    return;
  }

  state.inertiaFrameId = window.requestAnimationFrame(() => {
    tickInertia(state);
  });
}

function releasePointerCaptureIfNeeded(state: DemoState, pointerId: number | null): void {
  if (pointerId === null || typeof state.hostEl.releasePointerCapture !== 'function') {
    return;
  }

  try {
    state.hostEl.releasePointerCapture(pointerId);
  } catch {
    // Ignore environments that do not emulate pointer capture.
  }
}

function createState(parentEl: HTMLElement): DemoState {
  const overlayEl = document.createElement('div');
  overlayEl.className = 'opencodian-liquid-diamond-demo-overlay';
  overlayEl.setAttribute('data-opencodian-liquid-diamond-demo-role', 'overlay');

  const interactionLayerEl = document.createElement('div');
  interactionLayerEl.className = 'opencodian-liquid-diamond-demo-layer';
  interactionLayerEl.setAttribute('data-opencodian-liquid-diamond-demo-role', 'interaction-layer');
  overlayEl.appendChild(interactionLayerEl);

  const hostEl = document.createElement('div');
  hostEl.className = 'opencodian-liquid-diamond-demo-host';
  hostEl.setAttribute('data-opencodian-liquid-diamond-demo-role', 'host');
  hostEl.style.width = `${LIQUID_DIAMOND_DEMO_STAGE_SIZE}px`;
  hostEl.style.height = `${LIQUID_DIAMOND_DEMO_STAGE_SIZE}px`;
  hostEl.style.pointerEvents = 'auto';
  hostEl.style.cursor = 'grab';
  hostEl.style.touchAction = 'none';
  interactionLayerEl.appendChild(hostEl);

  const svgEl = createSvgElement('svg');
  svgEl.classList.add('opencodian-liquid-diamond-demo-filter-defs');
  svgEl.setAttribute('data-opencodian-liquid-diamond-demo-role', 'svg-defs');
  svgEl.setAttribute('xmlns', SVG_NS);
  svgEl.setAttribute('width', '0');
  svgEl.setAttribute('height', '0');
  hostEl.appendChild(svgEl);

  const defsEl = createSvgElement('defs');
  defsEl.setAttribute('data-opencodian-liquid-diamond-demo-role', 'defs');
  const filterEl = createSvgElement('filter');
  const filterId = generateFilterId();
  filterEl.setAttribute('id', `${filterId}-filter`);
  filterEl.setAttribute('filterUnits', 'userSpaceOnUse');
  filterEl.setAttribute('primitiveUnits', 'userSpaceOnUse');
  filterEl.setAttribute('color-interpolation-filters', 'sRGB');
  const feImageEl = createSvgElement('feImage');
  feImageEl.setAttribute('result', 'diamond-demo-map');
  feImageEl.setAttribute('preserveAspectRatio', 'none');
  const feDisplacementMapEl = createSvgElement('feDisplacementMap');
  feDisplacementMapEl.setAttribute('in', 'SourceGraphic');
  feDisplacementMapEl.setAttribute('in2', 'diamond-demo-map');
  feDisplacementMapEl.setAttribute('xChannelSelector', 'R');
  feDisplacementMapEl.setAttribute('yChannelSelector', 'G');
  filterEl.append(feImageEl, feDisplacementMapEl);
  defsEl.appendChild(filterEl);
  svgEl.appendChild(defsEl);

  const stageEl = document.createElement('div');
  stageEl.className = 'opencodian-liquid-diamond-demo-stage';
  stageEl.setAttribute('data-opencodian-liquid-diamond-demo-role', 'stage');
  hostEl.appendChild(stageEl);

  const bloomEl = createStageLayerElement('bloom');
  const rimEl = createStageLayerElement('rim');
  const crystalEl = createStageLayerElement('crystal');
  const faceSvgEl = createFaceSvgElement();
  stageEl.append(bloomEl, rimEl, crystalEl, faceSvgEl);

  const canvasEl = document.createElement('canvas');
  const canvasCtx = canvasEl.getContext('2d');
  if (!canvasCtx) {
    throw new Error('[OpenCodian] Unable to create a 2D canvas context for the floating diamond demo.');
  }
  canvasEl.style.display = 'none';
  hostEl.appendChild(canvasEl);

  const size: DiamondSize = {
    cssWidth: LIQUID_DIAMOND_DEMO_STAGE_SIZE,
    cssHeight: LIQUID_DIAMOND_DEMO_STAGE_SIZE,
    pixelWidth: Math.round(LIQUID_DIAMOND_DEMO_STAGE_SIZE * SETTLED_CANVAS_DPI),
    pixelHeight: Math.round(LIQUID_DIAMOND_DEMO_STAGE_SIZE * SETTLED_CANVAS_DPI),
    dpi: SETTLED_CANVAS_DPI,
  };

  parentEl.appendChild(overlayEl);

  const state: DemoState = {
    parentEl,
    overlayEl,
    interactionLayerEl,
    hostEl,
    svgEl,
    defsEl,
    filterEl,
    feImageEl,
    feDisplacementMapEl,
    stageEl,
    crystalEl,
    bloomEl,
    rimEl,
    faceSvgEl,
    canvasEl,
    canvasCtx,
    size,
    imageData: null,
    rawValues: null,
    supportsBackdropFilterUrl: supportsBackdropFilterUrl(),
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    dragging: false,
    pointerId: null,
    dragStartX: 0,
    dragStartY: 0,
    dragOriginX: 0,
    dragOriginY: 0,
    lastPointerX: 0,
    lastPointerY: 0,
    lastPointerTime: 0,
    inertiaFrameId: null,
    renderFrameId: null,
    pendingRenderQuality: null,
    resizeHandler: () => {
      const bounds = getBounds(state);
      state.x = clamp(state.x, bounds.minX, bounds.maxX);
      state.y = clamp(state.y, bounds.minY, bounds.maxY);
      applyHostTransform(state);
      scheduleRender(state, 'settled');
    },
    pointerDownHandler: (event: PointerEvent) => {
      event.preventDefault();
      state.dragging = true;
      state.pointerId = event.pointerId;
      state.hostEl.classList.add('is-dragging');
      state.hostEl.style.cursor = 'grabbing';
      state.hostEl.setAttribute('data-opencodian-liquid-diamond-demo-dragging', 'true');
      if (state.inertiaFrameId !== null) {
        window.cancelAnimationFrame(state.inertiaFrameId);
        state.inertiaFrameId = null;
      }
      if (typeof state.hostEl.setPointerCapture === 'function') {
        try {
          state.hostEl.setPointerCapture(event.pointerId);
        } catch {
          // Ignore environments that do not emulate pointer capture.
        }
      }
      state.dragStartX = event.clientX;
      state.dragStartY = event.clientY;
      state.dragOriginX = state.x;
      state.dragOriginY = state.y;
      state.lastPointerX = event.clientX;
      state.lastPointerY = event.clientY;
      state.lastPointerTime = performance.now();
      state.vx = 0;
      state.vy = 0;
    },
    pointerMoveHandler: (event: PointerEvent) => {
      if (!state.dragging || event.pointerId !== state.pointerId) {
        return;
      }

      event.preventDefault();
      const bounds = getBounds(state);
      state.x = elasticPosition(
        state.dragOriginX + (event.clientX - state.dragStartX),
        bounds.minX,
        bounds.maxX,
      );
      state.y = elasticPosition(
        state.dragOriginY + (event.clientY - state.dragStartY),
        bounds.minY,
        bounds.maxY,
      );

      const now = performance.now();
      const dt = Math.max(1, now - state.lastPointerTime);
      state.vx = ((event.clientX - state.lastPointerX) / dt) * 16;
      state.vy = ((event.clientY - state.lastPointerY) / dt) * 16;
      state.lastPointerX = event.clientX;
      state.lastPointerY = event.clientY;
      state.lastPointerTime = now;
      applyHostTransform(state);
      scheduleRender(state, 'interactive');
    },
    pointerUpHandler: (event: PointerEvent) => {
      if (!state.dragging || event.pointerId !== state.pointerId) {
        return;
      }

      event.preventDefault();
      const activePointerId = state.pointerId;
      state.dragging = false;
      state.pointerId = null;
      state.hostEl.classList.remove('is-dragging');
      state.hostEl.style.cursor = 'grab';
      state.hostEl.removeAttribute('data-opencodian-liquid-diamond-demo-dragging');
      releasePointerCaptureIfNeeded(state, activePointerId);
      if (Math.abs(state.vx) < 0.01 && Math.abs(state.vy) < 0.01) {
        scheduleRender(state, 'settled');
        return;
      }
      scheduleInertiaTick(state);
    },
  };

  hostEl.addEventListener('pointerdown', state.pointerDownHandler);
  hostEl.addEventListener('pointermove', state.pointerMoveHandler);
  hostEl.addEventListener('pointerup', state.pointerUpHandler);
  hostEl.addEventListener('pointercancel', state.pointerUpHandler);
  window.addEventListener('resize', state.resizeHandler);

  renderScene(state, 'settled');
  return state;
}

function destroyState(state: DemoState): void {
  if (state.inertiaFrameId !== null) {
    window.cancelAnimationFrame(state.inertiaFrameId);
  }
  if (state.renderFrameId !== null) {
    window.cancelAnimationFrame(state.renderFrameId);
  }

  releasePointerCaptureIfNeeded(state, state.pointerId);
  state.hostEl.removeEventListener('pointerdown', state.pointerDownHandler);
  state.hostEl.removeEventListener('pointermove', state.pointerMoveHandler);
  state.hostEl.removeEventListener('pointerup', state.pointerUpHandler);
  state.hostEl.removeEventListener('pointercancel', state.pointerUpHandler);
  window.removeEventListener('resize', state.resizeHandler);
  state.canvasEl.width = 0;
  state.canvasEl.height = 0;
  state.overlayEl.remove();
}

export class LiquidDiamondDemoController {
  private state: DemoState | null = null;

  constructor(private readonly parentEl: HTMLElement) {}

  isVisible(): boolean {
    return this.state !== null;
  }

  show(): void {
    if (this.state) {
      return;
    }

    this.state = createState(this.parentEl);
  }

  hide(): void {
    if (!this.state) {
      return;
    }

    destroyState(this.state);
    this.state = null;
  }

  toggle(): void {
    if (this.state) {
      this.hide();
      return;
    }

    this.show();
  }

  destroy(): void {
    this.hide();
  }
}
