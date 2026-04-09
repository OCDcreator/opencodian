import { createLogger } from '../../shared';
import {
  buildGlassOctahedronBackdropFilterValue,
  buildGlassOctahedronLightBackdropFilterValue,
  detectGlassOctahedronBackdropSupport,
  type GlassOctahedronBackdropSupport,
  type GlassOctahedronProjectionContext,
  type GlassOctahedronQualityTier,
  type GlassOctahedronRenderQuality,
  type GlassOctahedronStageSize,
  renderGlassOctahedronDisplacementSnapshot,
} from './glassOctahedronDemoRefraction';
import type { GlassOctahedronThreeRenderer } from './glassOctahedronDemoThree';

const logger = createLogger('GlassOctahedronDemo');

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';
const FILTER_ID_PREFIX = 'opencodian-glass-octahedron-demo-';

export const GLASS_OCTAHEDRON_DEMO_STAGE_SIZE = 220;

const STAGE_SIZE: GlassOctahedronStageSize = {
  cssHeight: GLASS_OCTAHEDRON_DEMO_STAGE_SIZE,
  cssWidth: GLASS_OCTAHEDRON_DEMO_STAGE_SIZE,
};

const INTERACTIVE_DPR = 0.72;
const SETTLED_DPR = 1;
const SETTLED_RENDER_DELAY_MS = 320;
const IDLE_RENDER_INTERVAL_MS = 180;
const DEEP_IDLE_TIMEOUT_MS = 60_000;
const INTERACTIVE_DISPLACEMENT_INTERVAL_MS = 33;
const SETTLED_DISPLACEMENT_INTERVAL_MS = 540;
const SETTLED_DISPLACEMENT_DELTA_THRESHOLD = 2.8;
const IDLE_GROW_IN_MS = 1100;
const IDLE_PHASE_SPEED = 0.0028;
const DRAG_ELASTIC = 0.16;
const VELOCITY_DAMPING = 0.94;
const BOUND_SPRING = 0.014;
const BOUND_DAMPING = 0.82;
const VELOCITY_EPSILON = 0.01;
const REST_PITCH = -0.34;
const REST_YAW = 0.38;
const REST_ROLL = 0.08;
const DRAG_PITCH_RANGE = 0.26;
const DRAG_YAW_RANGE = 0.34;
const DRAG_ROLL_RANGE = 0.14;
const SLOW_FRAME_THRESHOLD_MS = 96;
const SLOW_RENDER_THRESHOLD_MS = 26;
const VERY_SLOW_RENDER_THRESHOLD_MS = 72;
const SLOW_FRAME_WINDOW = 5;
const MIN_SLOW_FRAMES_TO_DEGRADE = 4;

type RenderQuality = GlassOctahedronRenderQuality;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
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

function generateFilterId(): string {
  const entropy =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  return `${FILTER_ID_PREFIX}${entropy}`;
}

function createStageLayerElement(role: string): HTMLDivElement {
  const element = document.createElement('div');
  element.className = `opencodian-glass-octahedron-demo-${role}`;
  element.setAttribute('data-opencodian-glass-octahedron-demo-role', role);
  return element;
}

function createSvgElement<K extends keyof SVGElementTagNameMap>(
  tagName: K,
): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tagName);
}

function estimateProjectionDelta(
  previous: GlassOctahedronProjectionContext | null,
  next: GlassOctahedronProjectionContext,
): number {
  if (!previous) {
    return Number.POSITIVE_INFINITY;
  }

  const centerDelta = Math.hypot(
    next.center.x - previous.center.x,
    next.center.y - previous.center.y,
  );
  const boundsDelta = Math.abs(next.bounds.width - previous.bounds.width)
    + Math.abs(next.bounds.height - previous.bounds.height);
  const hullLength = Math.min(previous.hull.length, next.hull.length);
  let hullDelta = 0;

  for (let index = 0; index < hullLength; index += 1) {
    hullDelta += Math.hypot(
      next.hull[index].x - previous.hull[index].x,
      next.hull[index].y - previous.hull[index].y,
    );
  }

  const normalizedHullDelta = hullLength > 0 ? hullDelta / hullLength : 0;
  return centerDelta + boundsDelta * 0.18 + normalizedHullDelta;
}

export class GlassOctahedronDemoController {
  private parentEl: HTMLElement;

  private overlayEl: HTMLDivElement | null = null;

  private interactionLayerEl: HTMLDivElement | null = null;

  private hostEl: HTMLDivElement | null = null;

  private stageEl: HTMLDivElement | null = null;

  private refractionEl: HTMLDivElement | null = null;

  private causticEl: HTMLDivElement | null = null;

  private canvasEl: HTMLCanvasElement | null = null;

  private displacementCanvasEl: HTMLCanvasElement | null = null;

  private svgDefsEl: SVGSVGElement | null = null;

  private filterEl: SVGFilterElement | null = null;

  private feImageEl: SVGFEImageElement | null = null;

  private feDisplacementMapEl: SVGFEDisplacementMapElement | null = null;

  private currentDisplacementUrl = '';

  private renderer: GlassOctahedronThreeRenderer | null = null;

  private backdropSupport: GlassOctahedronBackdropSupport = {
    basic: false,
    url: false,
  };

  private qualityTier: GlassOctahedronQualityTier = 'mesh-only';

  private currentProjection: GlassOctahedronProjectionContext | null = null;

  private lastDisplacementProjection: GlassOctahedronProjectionContext | null = null;

  private lastDisplacementTime = 0;

  private lastDisplacementQuality: RenderQuality | null = null;

  private x = 0;

  private y = 0;

  private vx = 0;

  private vy = 0;

  private dragging = false;

  private pointerId: number | null = null;

  private dragStartX = 0;

  private dragStartY = 0;

  private dragOriginX = 0;

  private dragOriginY = 0;

  private lastPointerX = 0;

  private lastPointerY = 0;

  private lastPointerTime = 0;

  private renderFrameId: number | null = null;

  private inertiaFrameId: number | null = null;

  private idleTimerId: number | null = null;

  private settledTimerId: number | null = null;

  private pendingRenderQuality: RenderQuality | null = null;

  private slowFrameSamples: number[] = [];

  private lastInteractiveFrameAt: number | null = null;

  private lastInteractionAt = 0;

  private idleStartedAt = 0;

  private deepIdle = false;

  private destroyRequested = false;

  private resizeHandler = (): void => {
    this.markInteraction();
    this.scheduleRender('settled');
  };

  private pointerDownHandler = (event: PointerEvent): void => {
    if (!this.hostEl || this.destroyRequested) {
      return;
    }

    this.wakeFromDeepIdle();
    this.dragging = true;
    this.pointerId = event.pointerId;
    this.dragStartX = event.clientX;
    this.dragStartY = event.clientY;
    this.dragOriginX = this.x;
    this.dragOriginY = this.y;
    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;
    this.lastPointerTime = performance.now();
    this.vx = 0;
    this.vy = 0;
    this.hostEl.classList.add('is-dragging');

    try {
      this.hostEl.setPointerCapture?.(event.pointerId);
    } catch {
      // Ignore pointer-capture failures in unsupported environments.
    }

    this.markInteraction();
    this.cancelInertia();
    this.cancelIdleTimer();
    this.cancelSettledTimer();
    this.scheduleRender('interactive');
  };

  private pointerMoveHandler = (event: PointerEvent): void => {
    if (!this.dragging || this.pointerId !== event.pointerId) {
      return;
    }

    const now = performance.now();
    const bounds = this.getBounds();
    const nextX = this.dragOriginX + (event.clientX - this.dragStartX);
    const nextY = this.dragOriginY + (event.clientY - this.dragStartY);

    this.x = elasticPosition(nextX, bounds.minX, bounds.maxX);
    this.y = elasticPosition(nextY, bounds.minY, bounds.maxY);

    const dt = Math.max(1, now - this.lastPointerTime);
    this.vx = ((event.clientX - this.lastPointerX) / dt) * 16;
    this.vy = ((event.clientY - this.lastPointerY) / dt) * 16;
    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;
    this.lastPointerTime = now;

    this.applyHostTransform();
    this.markInteraction();
    this.scheduleRender('interactive');
  };

  private pointerUpHandler = (event: PointerEvent): void => {
    if (this.pointerId !== event.pointerId) {
      return;
    }

    this.releasePointerCapture(this.pointerId);
    this.pointerId = null;
    this.dragging = false;
    this.hostEl?.classList.remove('is-dragging');
    this.markInteraction();
    this.scheduleRender('interactive');
    this.scheduleInertiaTick();
  };

  private pointerEnterHandler = (): void => {
    if (!this.deepIdle) {
      return;
    }

    this.wakeFromDeepIdle();
    this.scheduleRender('settled');
  };

  public constructor(parentEl: HTMLElement) {
    this.parentEl = parentEl;
  }

  public isVisible(): boolean {
    return !!this.overlayEl && !this.destroyRequested;
  }

  public async show(): Promise<void> {
    if (this.isVisible()) {
      return;
    }

    this.destroyRequested = false;
    this.backdropSupport = detectGlassOctahedronBackdropSupport();
    this.qualityTier = this.backdropSupport.url
      ? 'full-v3'
      : this.backdropSupport.basic
        ? 'light-v3'
        : 'mesh-only';
    this.displacementCanvasEl = document.createElement('canvas');

    const overlayEl = document.createElement('div');
    overlayEl.className = 'opencodian-glass-octahedron-demo-overlay';
    overlayEl.setAttribute('data-opencodian-glass-octahedron-demo-role', 'overlay');

    const interactionLayerEl = document.createElement('div');
    interactionLayerEl.className = 'opencodian-glass-octahedron-demo-layer';
    interactionLayerEl.setAttribute(
      'data-opencodian-glass-octahedron-demo-role',
      'interaction-layer',
    );
    overlayEl.appendChild(interactionLayerEl);

    const hostEl = document.createElement('div');
    hostEl.className = 'opencodian-glass-octahedron-demo-host';
    hostEl.setAttribute('data-opencodian-glass-octahedron-demo-role', 'host');
    hostEl.style.width = `${GLASS_OCTAHEDRON_DEMO_STAGE_SIZE}px`;
    hostEl.style.height = `${GLASS_OCTAHEDRON_DEMO_STAGE_SIZE}px`;
    interactionLayerEl.appendChild(hostEl);

    const stageEl = document.createElement('div');
    stageEl.className = 'opencodian-glass-octahedron-demo-stage';
    stageEl.setAttribute('data-opencodian-glass-octahedron-demo-role', 'stage');
    hostEl.appendChild(stageEl);

    const causticEl = createStageLayerElement('caustic');
    const refractionEl = createStageLayerElement('refraction');
    const canvasEl = document.createElement('canvas');
    canvasEl.className = 'opencodian-glass-octahedron-demo-canvas';
    canvasEl.setAttribute('data-opencodian-glass-octahedron-demo-role', 'canvas');
    stageEl.append(causticEl, refractionEl, canvasEl);

    this.overlayEl = overlayEl;
    this.interactionLayerEl = interactionLayerEl;
    this.hostEl = hostEl;
    this.stageEl = stageEl;
    this.causticEl = causticEl;
    this.refractionEl = refractionEl;
    this.canvasEl = canvasEl;

    if (this.qualityTier === 'full-v3') {
      this.mountSvgFilter(hostEl);
      if (!this.filterEl || !this.feImageEl || !this.feDisplacementMapEl) {
        this.qualityTier = 'light-v3';
      }
    }

    const { createGlassOctahedronThreeRenderer } = await import(
      './glassOctahedronDemoThree'
    );
    this.renderer = createGlassOctahedronThreeRenderer(
      canvasEl,
      GLASS_OCTAHEDRON_DEMO_STAGE_SIZE,
    );

    this.parentEl.appendChild(overlayEl);
    hostEl.addEventListener('pointerdown', this.pointerDownHandler);
    hostEl.addEventListener('pointerenter', this.pointerEnterHandler);
    window.addEventListener('pointermove', this.pointerMoveHandler);
    window.addEventListener('pointerup', this.pointerUpHandler);
    window.addEventListener('pointercancel', this.pointerUpHandler);
    window.addEventListener('resize', this.resizeHandler);

    const now = performance.now();
    this.lastInteractionAt = now;
    this.idleStartedAt = now;
    this.applyHostTransform();
    this.applyQualityTierClasses();
    this.scheduleRender('interactive');
    this.scheduleSettledRender();
  }

  public destroy(): void {
    if (this.destroyRequested) {
      return;
    }

    this.destroyRequested = true;
    this.cancelRender();
    this.cancelInertia();
    this.cancelIdleTimer();
    this.cancelSettledTimer();
    this.releasePointerCapture(this.pointerId);
    this.pointerId = null;
    this.hostEl?.removeEventListener('pointerdown', this.pointerDownHandler);
    this.hostEl?.removeEventListener('pointerenter', this.pointerEnterHandler);
    window.removeEventListener('pointermove', this.pointerMoveHandler);
    window.removeEventListener('pointerup', this.pointerUpHandler);
    window.removeEventListener('pointercancel', this.pointerUpHandler);
    window.removeEventListener('resize', this.resizeHandler);
    this.clearDisplacementSnapshot();
    this.renderer?.destroy();
    this.renderer = null;
    this.overlayEl?.remove();
    this.overlayEl = null;
    this.interactionLayerEl = null;
    this.hostEl = null;
    this.stageEl = null;
    this.refractionEl = null;
    this.causticEl = null;
    this.canvasEl = null;
    this.displacementCanvasEl = null;
    this.svgDefsEl = null;
    this.filterEl = null;
    this.feImageEl = null;
    this.feDisplacementMapEl = null;
    this.currentProjection = null;
    this.lastDisplacementProjection = null;
    this.pendingRenderQuality = null;
    this.slowFrameSamples = [];
    this.lastInteractiveFrameAt = null;
  }

  private mountSvgFilter(hostEl: HTMLElement): void {
    const svgEl = createSvgElement('svg');
    svgEl.classList.add('opencodian-glass-octahedron-demo-filter-defs');
    svgEl.setAttribute('data-opencodian-glass-octahedron-demo-role', 'svg-defs');
    svgEl.setAttribute('width', '0');
    svgEl.setAttribute('height', '0');
    svgEl.setAttribute('aria-hidden', 'true');

    const defsEl = createSvgElement('defs');
    const filterEl = createSvgElement('filter');
    filterEl.setAttribute('id', `${generateFilterId()}-filter`);
    filterEl.setAttribute('filterUnits', 'userSpaceOnUse');
    filterEl.setAttribute('primitiveUnits', 'userSpaceOnUse');
    filterEl.setAttribute('color-interpolation-filters', 'sRGB');

    const feImageEl = createSvgElement('feImage');
    feImageEl.setAttribute('result', 'glass-octahedron-map');
    feImageEl.setAttribute('preserveAspectRatio', 'none');

    const feDisplacementMapEl = createSvgElement('feDisplacementMap');
    feDisplacementMapEl.setAttribute('in', 'SourceGraphic');
    feDisplacementMapEl.setAttribute('in2', 'glass-octahedron-map');
    feDisplacementMapEl.setAttribute('xChannelSelector', 'R');
    feDisplacementMapEl.setAttribute('yChannelSelector', 'G');

    filterEl.append(feImageEl, feDisplacementMapEl);
    defsEl.appendChild(filterEl);
    svgEl.appendChild(defsEl);
    hostEl.appendChild(svgEl);

    this.svgDefsEl = svgEl;
    this.filterEl = filterEl;
    this.feImageEl = feImageEl;
    this.feDisplacementMapEl = feDisplacementMapEl;
  }

  private cancelRender(): void {
    if (this.renderFrameId === null) {
      return;
    }

    window.cancelAnimationFrame(this.renderFrameId);
    this.renderFrameId = null;
  }

  private cancelInertia(): void {
    if (this.inertiaFrameId === null) {
      return;
    }

    window.cancelAnimationFrame(this.inertiaFrameId);
    this.inertiaFrameId = null;
  }

  private cancelIdleTimer(): void {
    if (this.idleTimerId === null) {
      return;
    }

    window.clearTimeout(this.idleTimerId);
    this.idleTimerId = null;
  }

  private cancelSettledTimer(): void {
    if (this.settledTimerId === null) {
      return;
    }

    window.clearTimeout(this.settledTimerId);
    this.settledTimerId = null;
  }

  private releasePointerCapture(pointerId: number | null): void {
    if (pointerId === null || !this.hostEl) {
      return;
    }

    try {
      this.hostEl.releasePointerCapture?.(pointerId);
    } catch {
      // Ignore pointer-capture failures in unsupported environments.
    }
  }

  private markInteraction(): void {
    const now = performance.now();
    this.lastInteractionAt = now;
    this.idleStartedAt = now;
    this.deepIdle = false;
  }

  private wakeFromDeepIdle(): void {
    if (!this.deepIdle) {
      return;
    }

    const now = performance.now();
    this.deepIdle = false;
    this.lastInteractionAt = now;
    this.idleStartedAt = now;
    this.slowFrameSamples = [];
    this.lastInteractiveFrameAt = null;
    this.cancelIdleTimer();
  }

  private getBounds(): {
    maxX: number;
    maxY: number;
    minX: number;
    minY: number;
  } {
    const width = this.interactionLayerEl?.clientWidth
      || this.parentEl.clientWidth
      || GLASS_OCTAHEDRON_DEMO_STAGE_SIZE;
    const height = this.interactionLayerEl?.clientHeight
      || this.parentEl.clientHeight
      || GLASS_OCTAHEDRON_DEMO_STAGE_SIZE;
    const extentX = Math.max(0, (width - GLASS_OCTAHEDRON_DEMO_STAGE_SIZE) / 2);
    const extentY = Math.max(0, (height - GLASS_OCTAHEDRON_DEMO_STAGE_SIZE) / 2);

    return {
      maxX: extentX,
      maxY: extentY,
      minX: -extentX,
      minY: -extentY,
    };
  }

  private applyHostTransform(): void {
    if (!this.hostEl) {
      return;
    }

    this.hostEl.style.transform =
      `translate(-50%, -50%) translate3d(${this.x.toFixed(2)}px, ${this.y.toFixed(2)}px, 0)`;
  }

  private scheduleRender(quality: RenderQuality): void {
    if (this.destroyRequested || !this.renderer) {
      return;
    }

    this.pendingRenderQuality = maxRenderQuality(this.pendingRenderQuality, quality);
    if (this.renderFrameId !== null) {
      return;
    }

    this.renderFrameId = window.requestAnimationFrame((timestamp) => {
      this.renderFrameId = null;
      const nextQuality = this.pendingRenderQuality ?? 'interactive';
      this.pendingRenderQuality = null;
      this.renderScene(nextQuality, timestamp);
    });
  }

  private scheduleSettledRender(): void {
    this.cancelSettledTimer();
    this.settledTimerId = window.setTimeout(() => {
      this.settledTimerId = null;
      if (this.destroyRequested || this.dragging || this.inertiaFrameId !== null) {
        return;
      }

      this.scheduleRender('settled');
    }, SETTLED_RENDER_DELAY_MS);
  }

  private scheduleIdleRender(): void {
    this.cancelIdleTimer();
    if (this.deepIdle || this.dragging || this.inertiaFrameId !== null) {
      return;
    }

    this.idleTimerId = window.setTimeout(() => {
      this.idleTimerId = null;
      if (this.destroyRequested || this.dragging || this.inertiaFrameId !== null) {
        return;
      }

      this.scheduleRender('settled');
    }, IDLE_RENDER_INTERVAL_MS);
  }

  private scheduleInertiaTick(): void {
    if (this.inertiaFrameId !== null || this.destroyRequested) {
      return;
    }

    this.inertiaFrameId = window.requestAnimationFrame(() => {
      this.inertiaFrameId = null;
      this.tickInertia();
    });
  }

  private tickInertia(): void {
    if (this.destroyRequested || this.dragging) {
      return;
    }

    const bounds = this.getBounds();
    this.x += this.vx;
    this.y += this.vy;
    this.vx *= VELOCITY_DAMPING;
    this.vy *= VELOCITY_DAMPING;

    if (this.x < bounds.minX) {
      this.vx += (bounds.minX - this.x) * BOUND_SPRING;
      this.vx *= BOUND_DAMPING;
    } else if (this.x > bounds.maxX) {
      this.vx += (bounds.maxX - this.x) * BOUND_SPRING;
      this.vx *= BOUND_DAMPING;
    }

    if (this.y < bounds.minY) {
      this.vy += (bounds.minY - this.y) * BOUND_SPRING;
      this.vy *= BOUND_DAMPING;
    } else if (this.y > bounds.maxY) {
      this.vy += (bounds.maxY - this.y) * BOUND_SPRING;
      this.vy *= BOUND_DAMPING;
    }

    this.applyHostTransform();
    this.scheduleRender('interactive');

    if (
      Math.abs(this.vx) < VELOCITY_EPSILON
      && Math.abs(this.vy) < VELOCITY_EPSILON
    ) {
      this.x = clamp(this.x, bounds.minX, bounds.maxX);
      this.y = clamp(this.y, bounds.minY, bounds.maxY);
      this.vx = 0;
      this.vy = 0;
      this.applyHostTransform();
      this.scheduleSettledRender();
      this.scheduleRender('settled');
      return;
    }

    this.scheduleInertiaTick();
  }

  private buildPose(
    quality: RenderQuality,
    timestamp: number,
  ): {
    dpr: number;
    idleAmount: number;
    idlePhase: number;
    pitch: number;
    quality: RenderQuality;
    qualityTier: GlassOctahedronQualityTier;
    roll: number;
    yaw: number;
  } {
    const bounds = this.getBounds();
    const extentX = Math.max(1, bounds.maxX || 1);
    const extentY = Math.max(1, bounds.maxY || 1);
    const normalizedX = clamp(this.x / extentX, -1, 1);
    const normalizedY = clamp(this.y / extentY, -1, 1);
    const idleElapsed = Math.max(0, timestamp - this.idleStartedAt);
    const idleAmount = quality === 'settled'
      ? clamp(idleElapsed / IDLE_GROW_IN_MS, 0, 1)
      : 0;
    const idlePhase = quality === 'settled' ? idleElapsed * IDLE_PHASE_SPEED : 0;

    return {
      dpr: quality === 'interactive' ? INTERACTIVE_DPR : SETTLED_DPR,
      idleAmount,
      idlePhase,
      pitch: REST_PITCH + normalizedY * -DRAG_PITCH_RANGE - this.vy * 0.0018,
      quality,
      qualityTier: this.qualityTier,
      roll: REST_ROLL + normalizedX * DRAG_ROLL_RANGE + this.vx * 0.0012,
      yaw: REST_YAW + normalizedX * DRAG_YAW_RANGE + this.vx * 0.0016,
    };
  }

  private renderScene(quality: RenderQuality, timestamp: number): void {
    if (this.destroyRequested || !this.renderer) {
      return;
    }

    const start = performance.now();
    const pose = this.buildPose(quality, timestamp);
    const projection = this.renderer.render(pose);
    const renderDuration = performance.now() - start;

    this.observePerformance(quality, timestamp, renderDuration);

    const effectiveProjection: GlassOctahedronProjectionContext = {
      ...projection,
      displacementStrength: this.qualityTier === 'full-v3'
        ? projection.displacementStrength
        : 0,
      qualityTier: this.qualityTier,
    };

    this.currentProjection = effectiveProjection;
    this.applyProjection(effectiveProjection, quality, timestamp);

    if (quality === 'interactive') {
      this.cancelIdleTimer();
      this.scheduleSettledRender();
      return;
    }

    if (timestamp - this.lastInteractionAt >= DEEP_IDLE_TIMEOUT_MS) {
      this.deepIdle = true;
      this.cancelIdleTimer();
      return;
    }

    this.scheduleIdleRender();
  }

  private observePerformance(
    quality: RenderQuality,
    timestamp: number,
    renderDuration: number,
  ): void {
    if (quality !== 'interactive') {
      this.lastInteractiveFrameAt = null;
      this.slowFrameSamples = [];
      return;
    }

    if (this.lastInteractiveFrameAt !== null) {
      const frameDelta = timestamp - this.lastInteractiveFrameAt;
      const countsAsSlow =
        renderDuration >= VERY_SLOW_RENDER_THRESHOLD_MS
        || (
          frameDelta >= SLOW_FRAME_THRESHOLD_MS
          && renderDuration >= SLOW_RENDER_THRESHOLD_MS
        );
      this.slowFrameSamples.push(countsAsSlow ? 1 : 0);
      if (this.slowFrameSamples.length > SLOW_FRAME_WINDOW) {
        this.slowFrameSamples.shift();
      }

      const slowFrames = this.slowFrameSamples
        .filter((sample) => sample === 1)
        .length;
      if (slowFrames >= MIN_SLOW_FRAMES_TO_DEGRADE) {
        this.degradeQualityTier();
        this.slowFrameSamples = [];
      }
    }

    this.lastInteractiveFrameAt = timestamp;
  }

  private degradeQualityTier(): void {
    if (this.qualityTier === 'mesh-only') {
      return;
    }

    this.qualityTier = this.qualityTier === 'full-v3' ? 'light-v3' : 'mesh-only';
    logger.debug('Degrading glass octahedron quality tier', this.qualityTier);
    this.clearDisplacementSnapshot();
    this.applyQualityTierClasses();
  }

  private applyProjection(
    projection: GlassOctahedronProjectionContext,
    quality: RenderQuality,
    timestamp: number,
  ): void {
    this.syncRefractionLayer(projection);
    this.syncCausticLayer(projection);
    this.syncDisplacementMap(projection, quality, timestamp);
  }

  private syncRefractionLayer(projection: GlassOctahedronProjectionContext): void {
    if (!this.refractionEl) {
      return;
    }

    this.refractionEl.style.clipPath = projection.clipPath;
    if (this.qualityTier === 'mesh-only' || !this.backdropSupport.basic) {
      this.refractionEl.classList.add('is-disabled');
      this.refractionEl.style.opacity = '0';
      this.refractionEl.style.removeProperty('backdrop-filter');
      this.refractionEl.style.removeProperty('-webkit-backdrop-filter');
      return;
    }

    this.refractionEl.classList.remove('is-disabled');
    this.refractionEl.style.opacity = this.qualityTier === 'full-v3' ? '0.28' : '0.2';
    const filterValue = this.qualityTier === 'full-v3' && this.filterEl
      ? buildGlassOctahedronBackdropFilterValue(this.filterEl.id)
      : buildGlassOctahedronLightBackdropFilterValue();
    this.refractionEl.style.setProperty('backdrop-filter', filterValue);
    this.refractionEl.style.setProperty('-webkit-backdrop-filter', filterValue);
  }

  private syncCausticLayer(projection: GlassOctahedronProjectionContext): void {
    if (!this.causticEl) {
      return;
    }

    if (this.qualityTier === 'mesh-only') {
      this.causticEl.classList.add('is-disabled');
      this.causticEl.style.opacity = '0';
      return;
    }

    this.causticEl.classList.remove('is-disabled');
    const width = clamp(projection.bounds.width * 0.84, 84, 146);
    const height = clamp(projection.bounds.height * 0.34, 30, 68);
    const left = projection.center.x;
    const top = clamp(
      projection.bounds.maxY - height * 0.08 + 10,
      projection.center.y + 18,
      STAGE_SIZE.cssHeight - height * 0.18,
    );
    const opacity = this.qualityTier === 'full-v3' ? 0.26 : 0.18;

    this.causticEl.style.width = `${width.toFixed(2)}px`;
    this.causticEl.style.height = `${height.toFixed(2)}px`;
    this.causticEl.style.left = `${left.toFixed(2)}px`;
    this.causticEl.style.top = `${top.toFixed(2)}px`;
    this.causticEl.style.opacity = formatNumber(opacity);
    this.causticEl.style.transform =
      `translate(-50%, -50%) rotate(${formatNumber(projection.transform.roll * 18)}deg)`;
  }

  private syncDisplacementMap(
    projection: GlassOctahedronProjectionContext,
    quality: RenderQuality,
    timestamp: number,
  ): void {
    if (
      this.qualityTier !== 'full-v3'
      || !this.displacementCanvasEl
      || !this.feImageEl
      || !this.feDisplacementMapEl
    ) {
      return;
    }

    const projectionDelta = estimateProjectionDelta(
      this.lastDisplacementProjection,
      projection,
    );
    const timeSinceLastUpdate = timestamp - this.lastDisplacementTime;
    const shouldUpdate = quality === 'interactive'
      ? timeSinceLastUpdate >= INTERACTIVE_DISPLACEMENT_INTERVAL_MS
      : !this.lastDisplacementProjection
        || this.lastDisplacementQuality !== 'settled'
        || (
          timeSinceLastUpdate >= SETTLED_DISPLACEMENT_INTERVAL_MS
          && projectionDelta >= SETTLED_DISPLACEMENT_DELTA_THRESHOLD
        );

    if (!shouldUpdate) {
      return;
    }

    const snapshot = renderGlassOctahedronDisplacementSnapshot({
      canvasEl: this.displacementCanvasEl,
      projection,
      quality,
      size: STAGE_SIZE,
    });
    if (!snapshot) {
      this.qualityTier = this.backdropSupport.basic ? 'light-v3' : 'mesh-only';
      this.applyQualityTierClasses();
      return;
    }

    this.clearDisplacementSnapshot();
    this.currentDisplacementUrl = snapshot.dataUrl;
    this.setFeImageHref(snapshot.dataUrl);
    this.feDisplacementMapEl.setAttribute('scale', formatNumber(snapshot.filterScale));
    this.lastDisplacementProjection = projection;
    this.lastDisplacementTime = timestamp;
    this.lastDisplacementQuality = quality;
  }

  private setFeImageHref(value: string): void {
    if (!this.feImageEl) {
      return;
    }

    if (value) {
      this.feImageEl.setAttribute('href', value);
      this.feImageEl.setAttributeNS(XLINK_NS, 'href', value);
      return;
    }

    this.feImageEl.removeAttribute('href');
    this.feImageEl.removeAttributeNS(XLINK_NS, 'href');
  }

  private clearDisplacementSnapshot(): void {
    if (
      this.currentDisplacementUrl.startsWith('blob:')
      && typeof URL !== 'undefined'
      && typeof URL.revokeObjectURL === 'function'
    ) {
      URL.revokeObjectURL(this.currentDisplacementUrl);
    }

    this.currentDisplacementUrl = '';
    this.setFeImageHref('');
    this.lastDisplacementProjection = null;
    this.lastDisplacementTime = 0;
    this.lastDisplacementQuality = null;
  }

  private applyQualityTierClasses(): void {
    this.overlayEl?.setAttribute(
      'data-opencodian-glass-octahedron-quality-tier',
      this.qualityTier,
    );
    if (this.qualityTier === 'mesh-only') {
      this.refractionEl?.classList.add('is-disabled');
      this.causticEl?.classList.add('is-disabled');
      return;
    }

    this.refractionEl?.classList.remove('is-disabled');
    this.causticEl?.classList.remove('is-disabled');
  }
}
