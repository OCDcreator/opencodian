import { __testing,adapter } from '../../../../src/utils/glass/adapters/shudingDiamond';
import { registerBuiltinGlassAdapters } from '../../../../src/utils/glass/builtin-adapters';
import { getGlassAdapter } from '../../../../src/utils/glass/registry';
import type { GlassAdapterSettingsValue, GlassMountContext } from '../../../../src/utils/glass/types';

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

function normalize3(x: number, y: number, z: number): [number, number, number] {
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
}

function createMountContext(
  overrides: Partial<{ width: number; height: number; borderRadius: string }> = {},
): GlassMountContext {
  const width = overrides.width ?? 444;
  const height = overrides.height ?? 78;
  const borderRadius = overrides.borderRadius ?? '22px';
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
  contentEl.createEl('textarea', { cls: 'opencodian-input' });
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
    displacementScale: 10,
    bloomOpacity: 1,
    rimOpacity: 0.45,
    faceOverlayOpacity: 1,
    supportOpacity: 0.88,
    pointerTracking: true,
    pointerTilt: 1,
    ...overrides,
  };
}

describe('shuding diamond liquid adapter', () => {
  const originalCss = globalThis.CSS;
  const originalResizeObserver = globalThis.ResizeObserver;

  beforeEach(() => {
    document.body.innerHTML = '';
    registerBuiltinGlassAdapters();
    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(createCanvasContextMock());
    jest.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,diamond-map');
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
    __testing.resetCachedBackdropFilterUrlSupport();
  });

  it('keeps the standalone diamond adapter out of builtin composer registration while leaving shuding and nikdelvin intact', () => {
    expect(getGlassAdapter('shudingDiamond')).toBeUndefined();
    expect(getGlassAdapter('shuding')?.id).toBe('shuding');
    expect(getGlassAdapter('nikdelvin')?.id).toBe('nikdelvin');
    expect(adapter.id).toBe('shudingDiamond');
  });

  it('keeps IOR and internal bounce limits aligned with the upstream diamond core', () => {
    expect(__testing.IOR).toBe(1.18);
    expect(__testing.MAX_INTERNAL_BOUNCES).toBe(8);
  });

  it('refracts forward rays and bends them toward the normal', () => {
    const incident = normalize3(0.28, 0, -0.96);
    const refracted = __testing.refractVector(incident, [0, 0, 1], 1 / __testing.IOR);

    expect(refracted).not.toBeNull();
    expect(Math.abs(refracted?.[0] ?? 1)).toBeLessThan(Math.abs(incident[0]));
    expect(refracted?.[2] ?? 0).toBeLessThan(0);
  });

  it('falls back to the reflection path when total internal reflection occurs', () => {
    const incident = normalize3(0.95, 0, 0.312);
    const reflected = __testing.reflectVector(incident, [0, 0, 1]);
    const transmission = __testing.resolveTransmissionDirection(incident, [0, 0, 1], __testing.IOR);

    expect(__testing.refractVector(incident, [0, 0, 1], __testing.IOR)).toBeNull();
    expect(transmission.kind).toBe('reflected');
    expect(transmission.direction[0]).toBeCloseTo(reflected[0], 6);
    expect(transmission.direction[2]).toBeCloseTo(reflected[2], 6);
  });

  it('builds deterministic convex hulls and a polygon clip-path for the projected crystal', () => {
    const hull = __testing.convexHull([
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 2 },
      { x: 2, y: 2 },
      { x: 1, y: 0.5 },
    ]);
    const context = __testing.createDiamondContext(0.64, -0.42, {
      cssWidth: 420,
      cssHeight: 76,
      pixelWidth: 420,
      pixelHeight: 76,
      dpi: 1,
    });

    expect(hull).toEqual([
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
      { x: 0, y: 2 },
    ]);
    expect(context.hull.length).toBeGreaterThanOrEqual(4);
    expect(context.clipPath.startsWith('polygon(')).toBe(true);
    expect(context.clipPath).toContain('px');
  });

  it('mounts diamond bloom, rim, face overlay, and displacement filter nodes without rewriting shell shape', () => {
    const ctx = createMountContext();

    adapter.mount(ctx, createSettings());

    const bloomEl = ctx.filterLayerEl.querySelector<HTMLElement>('[data-opencodian-lg-shuding-diamond-role="bloom"]');
    const rimEl = ctx.filterLayerEl.querySelector<HTMLElement>('[data-opencodian-lg-shuding-diamond-role="rim"]');
    const crystalEl = ctx.filterLayerEl.querySelector<HTMLElement>('[data-opencodian-lg-shuding-diamond-role="crystal"]');
    const faceSvgEl = ctx.filterLayerEl.querySelector<SVGSVGElement>('[data-opencodian-lg-shuding-diamond-role="face-overlay"]');
    const facePolygonEl = ctx.filterLayerEl.querySelector<SVGPolygonElement>('[data-opencodian-lg-shuding-diamond-role="face"]');
    const outlineEl = ctx.filterLayerEl.querySelector<SVGPolygonElement>('[data-opencodian-lg-shuding-diamond-role="facet-outline"]');
    const filterEl = ctx.svgRootEl.querySelector('filter');
    const feImageEl = ctx.svgRootEl.querySelector('feImage');
    const feDisplacementMapEl = ctx.svgRootEl.querySelector('feDisplacementMap');

    expect(ctx.shellEl.dataset.opencodianLgShudingDiamond).toBe('mounted');
    expect(ctx.filterLayerEl.dataset.opencodianLgShudingDiamondUrlSupported).toBe('true');
    expect(bloomEl?.style.filter).toContain('blur(30px)');
    expect(bloomEl?.style.opacity).toBe('1');
    expect(bloomEl?.style.getPropertyValue('clip-path')).toContain('polygon(');
    expect(rimEl?.style.filter).toContain('drop-shadow');
    expect(rimEl?.style.opacity).toBe('0.45');
    expect(crystalEl?.style.getPropertyValue('clip-path')).toContain('polygon(');
    expect(crystalEl?.style.boxShadow).toContain('inset');
    expect(faceSvgEl?.getAttribute('viewBox')).toBe('0 0 444 78');
    expect(facePolygonEl?.getAttribute('fill')).toContain('rgba(');
    expect(outlineEl?.getAttribute('stroke')).toBe('rgba(220, 248, 255, 0.34)');
    expect(filterEl?.getAttribute('id')).toContain('opencodian-lg-shuding-diamond-');
    expect(feImageEl?.getAttribute('href')).toBe('data:image/png;base64,diamond-map');
    expect(Number(feDisplacementMapEl?.getAttribute('scale'))).toBeGreaterThan(0);

    expect(ctx.shellEl.style.width).toBe('444px');
    expect(ctx.shellEl.style.height).toBe('78px');
    expect(ctx.shellEl.style.borderRadius).toBe('22px');
    expect(ctx.shellEl.style.width).not.toBe('220px');
    expect(ctx.shellEl.style.height).not.toBe('220px');
    expect(ctx.shellEl.style.borderRadius).not.toBe('16px');
    expect(ctx.contentEl.querySelector('.opencodian-input')).not.toBeNull();
    expect(ctx.shellEl.dataset.opencodianLgShuding).toBeUndefined();
    expect(ctx.filterLayerEl.querySelector('[data-opencodian-lg-nikdelvin-role]')).toBeNull();

    adapter.unmount(ctx);

    expect(ctx.filterLayerEl.querySelector('[data-opencodian-lg-shuding-diamond-role]')).toBeNull();
    expect(ctx.svgRootEl.querySelector('[data-opencodian-lg-shuding-diamond-role="defs"]')).toBeNull();
    expect(ctx.shellEl.dataset.opencodianLgShudingDiamond).toBeUndefined();
  });
});
