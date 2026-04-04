import { getDefaultInputPanelLiquidGlassSettings } from '../../../../src/core/types';
import { adapter, __testing } from '../../../../src/utils/glass/adapters/shuding';
import type { GlassMountContext, GlassAdapterSettingsValue } from '../../../../src/utils/glass/types';

class ResizeObserverMock {
  observe = jest.fn();
  unobserve = jest.fn();
  disconnect = jest.fn();

  constructor(_callback: ResizeObserverCallback) {}
}

function createCanvasContextMock(): CanvasRenderingContext2D {
  return {
    createImageData: (width: number, height: number) => ({
      data: new Uint8ClampedArray(width * height * 4),
      width,
      height,
    } as ImageData),
    putImageData: jest.fn(),
  } as unknown as CanvasRenderingContext2D;
}

function roundedRectSdf(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): number {
  const qx = Math.abs(x) - width + radius;
  const qy = Math.abs(y) - height + radius;

  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - radius;
}

function smoothStep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) {
    return value < edge0 ? 0 : 1;
  }

  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function createMountContext(
  overrides: Partial<{ width: number; height: number; borderRadius: string }> = {},
): GlassMountContext {
  const width = overrides.width ?? 420;
  const height = overrides.height ?? 76;
  const borderRadius = overrides.borderRadius ?? '18px';
  const shellEl = document.body.createDiv({ cls: 'opencodian-composer-shell' });
  shellEl.style.width = `${width}px`;
  shellEl.style.height = `${height}px`;
  shellEl.style.borderRadius = borderRadius;
  Object.defineProperty(shellEl, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: width,
      bottom: height,
      width,
      height,
      toJSON: () => ({}),
    } as DOMRect),
  });

  const contentEl = shellEl.createDiv({ cls: 'opencodian-input-wrapper' });
  const filterLayerEl = shellEl.createDiv({ cls: 'opencodian-composer-svg-filter-layer' });
  const svgRootEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  document.body.appendChild(svgRootEl);

  return {
    shellEl,
    contentEl,
    filterLayerEl,
    svgRootEl,
  };
}

function createSettings(
  overrides: Record<string, GlassAdapterSettingsValue> = {},
): Record<string, GlassAdapterSettingsValue> {
  return {
    ...getDefaultInputPanelLiquidGlassSettings().shuding,
    ...overrides,
  };
}

function installStylePropertyRecorder(style: CSSStyleDeclaration): void {
  const recordedValues = new Map<string, string>();
  const originalSetProperty = style.setProperty.bind(style);
  const originalGetPropertyValue = style.getPropertyValue.bind(style);
  const originalRemoveProperty = style.removeProperty.bind(style);

  jest.spyOn(style, 'setProperty').mockImplementation((property: string, value: string | null, priority?: string) => {
    const normalizedValue = value ?? '';
    recordedValues.set(property, normalizedValue);
    originalSetProperty(property, normalizedValue, priority);
  });

  jest.spyOn(style, 'getPropertyValue').mockImplementation((property: string) => {
    if (recordedValues.has(property)) {
      return recordedValues.get(property) ?? '';
    }

    return originalGetPropertyValue(property);
  });

  jest.spyOn(style, 'removeProperty').mockImplementation((property: string) => {
    const previousValue = recordedValues.get(property) ?? originalGetPropertyValue(property);
    recordedValues.delete(property);
    originalRemoveProperty(property);
    return previousValue;
  });
}

describe('shuding liquid glass adapter', () => {
  const originalCss = globalThis.CSS;
  const originalResizeObserver = globalThis.ResizeObserver;
  const originalDevicePixelRatio = window.devicePixelRatio;

  beforeEach(() => {
    document.body.innerHTML = '';
    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(createCanvasContextMock());
    jest.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,shuding-map');
    Object.defineProperty(globalThis, 'CSS', {
      configurable: true,
      value: {
        supports: jest.fn().mockReturnValue(true),
      },
    });
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      value: ResizeObserverMock,
    });
    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      value: 2,
    });
    __testing.resetCachedBackdropFilterUrlSupport();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    jest.restoreAllMocks();
    Object.defineProperty(globalThis, 'CSS', {
      configurable: true,
      value: originalCss,
    });
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      value: originalResizeObserver,
    });
    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      value: originalDevicePixelRatio,
    });
    __testing.resetCachedBackdropFilterUrlSupport();
  });

  it('locks the default settings to the upstream-style path and keeps enhancements off', () => {
    expect(__testing.resolveSettings(createSettings())).toMatchObject({
      displacementScale: 10,
      blurAmount: 0.25,
      contrastBoost: 1.2,
      brightnessBoost: 1.05,
      saturateBoost: 1.1,
      adaptiveSdf: false,
      adaptiveSdfMix: 0,
      rectEdgeRefraction: false,
      rectEdgeRefractionStrength: 0,
      cornerEnhancement: false,
      cornerEnhancementStrength: 0,
      edgeBandWidth: 0,
      barrelDistortion: false,
      barrelStrength: 0,
      topHighlight: false,
      innerBorder: false,
      bottomShadow: false,
      insetDepthShadow: false,
    });
  });

  it('uses the strict upstream displacement formula by default', () => {
    const ix = 0.14;
    const iy = -0.09;
    const sample = __testing.resolveDisplacementTextureSample(
      ix,
      iy,
      { ...__testing.upstreamPanelGeometry },
      __testing.resolveSettings(createSettings()),
    );
    const distanceToEdge = roundedRectSdf(ix, iy, 0.3, 0.2, 0.6);
    const displacement = smoothStep(0.8, 0, distanceToEdge - 0.15);
    const scaled = smoothStep(0, 1, displacement);

    expect(sample.path).toBe('strict-upstream');
    expect(sample.sampleX).toBeCloseTo(ix * scaled + 0.5, 6);
    expect(sample.sampleY).toBeCloseTo(iy * scaled + 0.5, 6);
  });

  it('switches away from the strict upstream branch only when a non-default enhancement is enabled', () => {
    const sample = __testing.resolveDisplacementTextureSample(
      0.14,
      -0.09,
      { ...__testing.upstreamPanelGeometry },
      __testing.resolveSettings(createSettings({
        rectEdgeRefraction: true,
        rectEdgeRefractionStrength: 1,
        edgeBandWidth: 0.08,
      })),
    );

    expect(sample.path).toBe('enhanced');
  });

  it('builds the upstream filter string for the URL-backed path', () => {
    const filterValue = __testing.buildBackdropFilterValue(
      'test-filter',
      __testing.resolveSettings(createSettings()),
    );

    expect(filterValue).toContain('url(#test-filter)');
    expect(filterValue).toContain('blur(0.25px)');
    expect(filterValue).toContain('contrast(1.2)');
    expect(filterValue).toContain('brightness(1.05)');
    expect(filterValue).toContain('saturate(1.1)');
  });

  it('keeps canvas DPI fixed at 1 instead of following devicePixelRatio', () => {
    const ctx = createMountContext({ width: 360, height: 92 });
    const size = __testing.measureShell(ctx.shellEl);

    expect(window.devicePixelRatio).toBe(2);
    expect(size).toMatchObject({
      cssWidth: 360,
      cssHeight: 92,
      pixelWidth: 360,
      pixelHeight: 92,
      dpi: 1,
    });
  });

  it('mounts feImage and feDisplacementMap with the upstream default backdrop filter and shadow', () => {
    const ctx = createMountContext();
    const setPropertySpy = jest.spyOn(ctx.filterLayerEl.style, 'setProperty');

    adapter.mount(ctx, createSettings());

    const filterEl = ctx.svgRootEl.querySelector('filter');
    const feImageEl = ctx.svgRootEl.querySelector('feImage');
    const feDisplacementMapEl = ctx.svgRootEl.querySelector('feDisplacementMap');
    const filterId = filterEl?.getAttribute('id') ?? '';
    const expectedBackdropFilterValue =
      `url(#${filterId}) blur(0.25px) contrast(1.2) brightness(1.05) saturate(1.1)`;

    expect(filterId.startsWith('opencodian-lg-shuding-')).toBe(true);
    expect(feImageEl).not.toBeNull();
    expect(feImageEl?.getAttribute('href')).toBe('data:image/png;base64,shuding-map');
    expect(feDisplacementMapEl).not.toBeNull();
    expect(feDisplacementMapEl?.getAttribute('scale')).not.toBeNull();
    expect(Number(feDisplacementMapEl?.getAttribute('scale'))).toBeGreaterThan(0);
    expect(setPropertySpy).toHaveBeenCalledWith('backdrop-filter', expectedBackdropFilterValue);
    expect(setPropertySpy).toHaveBeenCalledWith('-webkit-backdrop-filter', expectedBackdropFilterValue);
    expect(setPropertySpy).toHaveBeenCalledWith('box-shadow', __testing.upstreamBoxShadow);

    adapter.unmount(ctx);
  });

  it('applies the expected final shell and filter-layer style values after mount', () => {
    const ctx = createMountContext();
    installStylePropertyRecorder(ctx.shellEl.style);
    installStylePropertyRecorder(ctx.filterLayerEl.style);

    adapter.mount(ctx, createSettings());

    const filterId = ctx.filterLayerEl.dataset.opencodianLgShudingOwner ?? '';
    expect(filterId.startsWith('opencodian-lg-shuding-')).toBe(true);
    expect(ctx.shellEl.style.getPropertyValue('background')).toBe('transparent');
    expect(ctx.shellEl.style.getPropertyValue('backdrop-filter')).toBe('none');
    expect(ctx.shellEl.style.getPropertyValue('-webkit-backdrop-filter')).toBe('none');
    expect(ctx.shellEl.style.getPropertyValue('transform-origin')).toBe('center center');
    expect(ctx.shellEl.style.getPropertyValue('will-change')).toBe('transform');
    expect(ctx.filterLayerEl.style.getPropertyValue('opacity')).toBe('1');
    expect(ctx.filterLayerEl.style.getPropertyValue('background')).toBe('transparent');
    expect(ctx.filterLayerEl.style.getPropertyValue('backdrop-filter')).toBe(
      `url(#${filterId}) blur(0.25px) contrast(1.2) brightness(1.05) saturate(1.1)`,
    );
    expect(ctx.filterLayerEl.style.getPropertyValue('-webkit-backdrop-filter')).toBe(
      `url(#${filterId}) blur(0.25px) contrast(1.2) brightness(1.05) saturate(1.1)`,
    );
    expect(ctx.filterLayerEl.style.getPropertyValue('box-shadow')).toBe(__testing.upstreamBoxShadow);
    expect(ctx.filterLayerEl.style.getPropertyValue('transform-origin')).toBe('center center');
    expect(ctx.filterLayerEl.style.getPropertyValue('will-change')).toBe('backdrop-filter, opacity');

    adapter.unmount(ctx);
  });

  it('restores the original styles and datasets after unmount', () => {
    const ctx = createMountContext();
    installStylePropertyRecorder(ctx.shellEl.style);
    installStylePropertyRecorder(ctx.filterLayerEl.style);

    ctx.shellEl.dataset.opencodianLgShuding = 'legacy-shell';
    ctx.shellEl.style.setProperty('background', 'rgba(1, 2, 3, 0.4)');
    ctx.shellEl.style.setProperty('backdrop-filter', 'blur(7px)');
    ctx.shellEl.style.setProperty('-webkit-backdrop-filter', 'blur(7px)');
    ctx.shellEl.style.setProperty('transform-origin', 'top left');
    ctx.shellEl.style.setProperty('will-change', 'opacity');

    ctx.filterLayerEl.dataset.opencodianLgShudingOwner = 'legacy-owner';
    ctx.filterLayerEl.dataset.opencodianLgShudingUrlSupported = 'legacy-supported';
    ctx.filterLayerEl.style.setProperty('opacity', '0.35');
    ctx.filterLayerEl.style.setProperty('background', 'rgba(4, 5, 6, 0.7)');
    ctx.filterLayerEl.style.setProperty('backdrop-filter', 'blur(5px)');
    ctx.filterLayerEl.style.setProperty('-webkit-backdrop-filter', 'blur(5px)');
    ctx.filterLayerEl.style.setProperty('box-shadow', '1px 2px 3px rgba(0, 0, 0, 0.2)');
    ctx.filterLayerEl.style.setProperty('transform-origin', 'bottom right');
    ctx.filterLayerEl.style.setProperty('will-change', 'opacity, transform');

    adapter.mount(ctx, createSettings());
    adapter.unmount(ctx);

    expect(ctx.shellEl.dataset.opencodianLgShuding).toBe('legacy-shell');
    expect(ctx.shellEl.style.getPropertyValue('background')).toBe('rgba(1, 2, 3, 0.4)');
    expect(ctx.shellEl.style.getPropertyValue('backdrop-filter')).toBe('blur(7px)');
    expect(ctx.shellEl.style.getPropertyValue('-webkit-backdrop-filter')).toBe('blur(7px)');
    expect(ctx.shellEl.style.getPropertyValue('transform-origin')).toBe('top left');
    expect(ctx.shellEl.style.getPropertyValue('will-change')).toBe('opacity');

    expect(ctx.filterLayerEl.dataset.opencodianLgShudingOwner).toBe('legacy-owner');
    expect(ctx.filterLayerEl.dataset.opencodianLgShudingUrlSupported).toBe('legacy-supported');
    expect(ctx.filterLayerEl.style.getPropertyValue('opacity')).toBe('0.35');
    expect(ctx.filterLayerEl.style.getPropertyValue('background')).toBe('rgba(4, 5, 6, 0.7)');
    expect(ctx.filterLayerEl.style.getPropertyValue('backdrop-filter')).toBe('blur(5px)');
    expect(ctx.filterLayerEl.style.getPropertyValue('-webkit-backdrop-filter')).toBe('blur(5px)');
    expect(ctx.filterLayerEl.style.getPropertyValue('box-shadow')).toBe('1px 2px 3px rgba(0, 0, 0, 0.2)');
    expect(ctx.filterLayerEl.style.getPropertyValue('transform-origin')).toBe('bottom right');
    expect(ctx.filterLayerEl.style.getPropertyValue('will-change')).toBe('opacity, transform');
    expect(ctx.svgRootEl.querySelector('defs')).toBeNull();
  });

  it('does not rewrite the shell width, height, or border-radius to demo values', () => {
    const ctx = createMountContext({ width: 444, height: 78, borderRadius: '22px' });

    adapter.mount(ctx, createSettings());

    expect(ctx.shellEl.style.width).toBe('444px');
    expect(ctx.shellEl.style.height).toBe('78px');
    expect(ctx.shellEl.style.borderRadius).toBe('22px');
    expect(ctx.shellEl.style.width).not.toBe('300px');
    expect(ctx.shellEl.style.height).not.toBe('200px');
    expect(ctx.shellEl.style.borderRadius).not.toBe('150px');

    adapter.unmount(ctx);
  });
});
