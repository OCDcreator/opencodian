import { WorkspaceLeaf } from 'obsidian';

const mockRender = jest.fn();
const mockDestroy = jest.fn();
const mockCreateRenderer = jest.fn(() => ({
  destroy: mockDestroy,
  render: mockRender,
}));
const mockDetectBackdropSupport = jest.fn(() => ({
  basic: true,
  url: true,
}));
const mockRenderDisplacementSnapshot = jest.fn(() => ({
  dataUrl: 'data:image/png;base64,glass-octahedron',
  filterScale: 22,
}));
const mockBuildBackdropFilterValue = jest.fn(
  (filterId: string) => `url(#${filterId}) blur(8px) saturate(1.08) brightness(1.05)`,
);
const mockBuildLightBackdropFilterValue = jest.fn(
  () => 'blur(9px) saturate(1.06) brightness(1.04)',
);

jest.mock('../../../../src/core/opencode', () => ({
  OpenCodeService: class OpenCodeService {},
}));

jest.mock('../../../../src/features/chat/glassOctahedronDemoThree', () => ({
  createGlassOctahedronThreeRenderer: mockCreateRenderer,
}));

jest.mock('../../../../src/features/chat/glassOctahedronDemoRefraction', () => ({
  buildGlassOctahedronBackdropFilterValue: mockBuildBackdropFilterValue,
  buildGlassOctahedronLightBackdropFilterValue: mockBuildLightBackdropFilterValue,
  detectGlassOctahedronBackdropSupport: mockDetectBackdropSupport,
  renderGlassOctahedronDisplacementSnapshot: mockRenderDisplacementSnapshot,
}));

import {
  getDefaultChatAppearanceSettings,
  getDefaultInputPanelGlassRefractionSettings,
  getDefaultInputPanelGlassRefractionSvgFilterSettings,
  getDefaultInputPanelLiquidGlassSettings,
  getDefaultThemeSettings,
} from '../../../../src/core/types';
import {
  GLASS_OCTAHEDRON_DEMO_STAGE_SIZE,
} from '../../../../src/features/chat/glassOctahedronDemo';
import { OpenCodianView } from '../../../../src/features/chat/OpenCodianView';

type GlassOctahedronViewHarness = OpenCodianView & {
  chatContainerEl: HTMLElement | null;
  composerShellEl: HTMLElement | null;
  inputContainer: HTMLElement | null;
  inputTextarea: HTMLTextAreaElement | null;
  inputWrapperEl: HTMLElement | null;
  messagesShellEl: HTMLElement | null;
  toggleGlassOctahedron: () => Promise<void>;
};

function createCanvasContextMock(): CanvasRenderingContext2D {
  return {
    createImageData: (width: number, height: number) => ({
      data: new Uint8ClampedArray(width * height * 4),
      height,
      width,
    } as ImageData),
    putImageData: jest.fn(),
  } as unknown as CanvasRenderingContext2D;
}

function createProjection(
  qualityTier: 'full-v3' | 'light-v3' | 'mesh-only' = 'full-v3',
): {
  bounds: {
    height: number;
    maxX: number;
    maxY: number;
    minX: number;
    minY: number;
    width: number;
  };
  center: { x: number; y: number };
  clipPath: string;
  displacementStrength: number;
  hull: Array<{ x: number; y: number }>;
  projectedFaces: Array<{
    facing: number;
    fillOpacity: number;
    points: Array<{ x: number; y: number }>;
    strokeOpacity: number;
  }>;
  qualityTier: 'full-v3' | 'light-v3' | 'mesh-only';
  transform: {
    offsetY: number;
    pitch: number;
    roll: number;
    yaw: number;
  };
} {
  const hull = [
    { x: 110, y: 18 },
    { x: 188, y: 110 },
    { x: 110, y: 198 },
    { x: 34, y: 110 },
  ];

  return {
    bounds: {
      height: 180,
      maxX: 188,
      maxY: 198,
      minX: 34,
      minY: 18,
      width: 154,
    },
    center: { x: 110, y: 110 },
    clipPath: 'polygon(50% 8%, 85% 50%, 50% 90%, 15% 50%)',
    displacementStrength: qualityTier === 'full-v3' ? 0.42 : 0,
    hull,
    projectedFaces: [
      {
        facing: 0.78,
        fillOpacity: 0.22,
        points: [hull[0], hull[1], hull[2]],
        strokeOpacity: 0.16,
      },
    ],
    qualityTier,
    transform: {
      offsetY: 0.05,
      pitch: -0.12,
      roll: 0.08,
      yaw: 0.18,
    },
  };
}

function createView(): GlassOctahedronViewHarness {
  return new OpenCodianView(new WorkspaceLeaf(), {
    settings: {
      chatAppearance: getDefaultChatAppearanceSettings(),
      effortLevel: 'medium',
      inputPanelGlassRefraction: getDefaultInputPanelGlassRefractionSettings(),
      inputPanelGlassRefractionSvgFilter: getDefaultInputPanelGlassRefractionSvgFilterSettings(),
      inputPanelLiquidGlass: getDefaultInputPanelLiquidGlassSettings(),
      inputPanelTheme: 'preset',
      locale: 'en',
      theme: getDefaultThemeSettings(),
      thinkingBudget: 0,
    },
    openCodeService: {},
    storage: {},
  } as never) as GlassOctahedronViewHarness;
}

function mountViewChrome(view: GlassOctahedronViewHarness): {
  chatContainerEl: HTMLElement;
  composerShellEl: HTMLElement;
  messagesShellEl: HTMLElement;
} {
  const chatContainerEl = document.body.createDiv({ cls: 'opencodian-container' });
  const messagesShellEl = chatContainerEl.createDiv({ cls: 'opencodian-messages-shell' });
  Object.defineProperty(messagesShellEl, 'clientWidth', {
    configurable: true,
    value: 680,
  });
  Object.defineProperty(messagesShellEl, 'clientHeight', {
    configurable: true,
    value: 420,
  });

  const inputContainer = chatContainerEl.createDiv({ cls: 'opencodian-input-area' });
  const composerShellEl = inputContainer.createDiv({ cls: 'opencodian-composer-shell' });
  composerShellEl.style.width = '432px';
  composerShellEl.style.height = '74px';
  composerShellEl.style.borderRadius = '20px';
  const inputWrapperEl = composerShellEl.createDiv({ cls: 'opencodian-input-wrapper' });
  const inputEl = inputWrapperEl.createEl('textarea', { cls: 'opencodian-input' });

  view.chatContainerEl = chatContainerEl;
  view.messagesShellEl = messagesShellEl;
  view.inputContainer = inputContainer;
  view.composerShellEl = composerShellEl;
  view.inputWrapperEl = inputWrapperEl;
  view.inputTextarea = inputEl;

  return {
    chatContainerEl,
    composerShellEl,
    messagesShellEl,
  };
}

function dispatchPointerEvent(
  target: EventTarget,
  type: string,
  init: { pointerId: number; clientX: number; clientY: number },
): void {
  const event = new Event(type, { bubbles: true, cancelable: true }) as PointerEvent;
  Object.assign(event, init);
  target.dispatchEvent(event);
}

function parseTranslate3d(transformValue: string): { x: number; y: number } {
  const match = transformValue.match(
    /translate3d\(([-\d.]+)px,\s*([-\d.]+)px,\s*0\)/,
  );
  if (!match) {
    return { x: 0, y: 0 };
  }

  return {
    x: Number(match[1]),
    y: Number(match[2]),
  };
}

function getLastRenderPose<T>(): T {
  return mockRender.mock.calls[mockRender.mock.calls.length - 1]?.[0] as T;
}

let activeView: GlassOctahedronViewHarness | null = null;

beforeEach(() => {
  document.body.innerHTML = '';
  mockCreateRenderer.mockClear();
  mockDestroy.mockClear();
  mockRender.mockReset();
  mockRender.mockReturnValue(createProjection());
  mockDetectBackdropSupport.mockReset();
  mockDetectBackdropSupport.mockReturnValue({
    basic: true,
    url: true,
  });
  mockBuildBackdropFilterValue.mockClear();
  mockBuildLightBackdropFilterValue.mockClear();
  mockRenderDisplacementSnapshot.mockReset();
  mockRenderDisplacementSnapshot.mockReturnValue({
    dataUrl: 'data:image/png;base64,glass-octahedron',
    filterScale: 22,
  });
  jest
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockReturnValue(createCanvasContextMock());
  jest
    .spyOn(HTMLCanvasElement.prototype, 'toDataURL')
    .mockReturnValue('data:image/png;base64,glass-octahedron');
});

afterEach(async () => {
  if (
    activeView
    && document.body.querySelector(
      '[data-opencodian-glass-octahedron-demo-role="overlay"]',
    )
  ) {
    await activeView.toggleGlassOctahedron();
  }

  activeView = null;
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('OpenCodianView glass octahedron mounting and fallback', () => {

  it('mounts the floating octahedron in messages shell, keeps composer geometry untouched, and applies polygon refraction', async () => {
    const originalRequestAnimationFrame = window.requestAnimationFrame;
    const originalCancelAnimationFrame = window.cancelAnimationFrame;
    jest.spyOn(performance, 'now').mockReturnValue(100);
    window.requestAnimationFrame = ((callback: FrameRequestCallback): number => {
      callback(100);
      return 1;
    }) as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame = jest.fn();

    try {
      const view = createView();
      activeView = view;
      const { composerShellEl, messagesShellEl } = mountViewChrome(view);

      await view.toggleGlassOctahedron();

      const overlayEl = messagesShellEl.querySelector<HTMLElement>(
        '[data-opencodian-glass-octahedron-demo-role="overlay"]',
      );
      const hostEl = messagesShellEl.querySelector<HTMLElement>(
        '[data-opencodian-glass-octahedron-demo-role="host"]',
      );
      const stageEl = messagesShellEl.querySelector<HTMLElement>(
        '[data-opencodian-glass-octahedron-demo-role="stage"]',
      );
      const causticEl = messagesShellEl.querySelector<HTMLElement>(
        '[data-opencodian-glass-octahedron-demo-role="caustic"]',
      );
      const refractionEl = messagesShellEl.querySelector<HTMLElement>(
        '[data-opencodian-glass-octahedron-demo-role="refraction"]',
      );
      const canvasEl = messagesShellEl.querySelector<HTMLCanvasElement>(
        '[data-opencodian-glass-octahedron-demo-role="canvas"]',
      );
      const svgDefsEl = messagesShellEl.querySelector<SVGSVGElement>(
        '[data-opencodian-glass-octahedron-demo-role="svg-defs"]',
      );
      const feImageEl = messagesShellEl.querySelector<SVGFEImageElement>('feImage');

      expect(overlayEl).not.toBeNull();
      expect(overlayEl?.getAttribute('data-opencodian-glass-octahedron-quality-tier')).toBe('full-v3');
      expect(hostEl).not.toBeNull();
      expect(stageEl).not.toBeNull();
      expect(causticEl?.style.opacity).not.toBe('0');
      expect(refractionEl?.style.clipPath).toContain('polygon(');
      expect(refractionEl?.classList.contains('is-disabled')).toBe(false);
      expect(mockBuildBackdropFilterValue).toHaveBeenCalled();
      expect(canvasEl).not.toBeNull();
      expect(svgDefsEl).not.toBeNull();
      expect(feImageEl?.getAttribute('href')).toBe('data:image/png;base64,glass-octahedron');
      expect(mockCreateRenderer).toHaveBeenCalledWith(
        canvasEl,
        GLASS_OCTAHEDRON_DEMO_STAGE_SIZE,
      );
      expect(mockRenderDisplacementSnapshot).toHaveBeenCalledTimes(1);
      expect(hostEl?.style.width).toBe(`${GLASS_OCTAHEDRON_DEMO_STAGE_SIZE}px`);
      expect(hostEl?.style.height).toBe(`${GLASS_OCTAHEDRON_DEMO_STAGE_SIZE}px`);
      expect(hostEl?.closest('.opencodian-composer-shell')).toBeNull();
      expect(composerShellEl.style.width).toBe('432px');
      expect(composerShellEl.style.height).toBe('74px');
      expect(composerShellEl.style.borderRadius).toBe('20px');

      await view.toggleGlassOctahedron();

      expect(
        messagesShellEl.querySelector(
          '[data-opencodian-glass-octahedron-demo-role="overlay"]',
        ),
      ).toBeNull();
      expect(mockDestroy).toHaveBeenCalledTimes(1);
    } finally {
      window.requestAnimationFrame = originalRequestAnimationFrame;
      window.cancelAnimationFrame = originalCancelAnimationFrame;
    }
  });

  it('falls back to light-v3 when URL backdrop filters are unavailable but basic backdrop blur still works', async () => {
    const originalRequestAnimationFrame = window.requestAnimationFrame;
    const originalCancelAnimationFrame = window.cancelAnimationFrame;
    jest.spyOn(performance, 'now').mockReturnValue(100);
    mockDetectBackdropSupport.mockReturnValue({
      basic: true,
      url: false,
    });
    window.requestAnimationFrame = ((callback: FrameRequestCallback): number => {
      callback(100);
      return 1;
    }) as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame = jest.fn();

    try {
      const view = createView();
      activeView = view;
      const { messagesShellEl } = mountViewChrome(view);

      await view.toggleGlassOctahedron();

      const overlayEl = messagesShellEl.querySelector<HTMLElement>(
        '[data-opencodian-glass-octahedron-demo-role="overlay"]',
      );
      const refractionEl = messagesShellEl.querySelector<HTMLElement>(
        '[data-opencodian-glass-octahedron-demo-role="refraction"]',
      );
      const svgDefsEl = messagesShellEl.querySelector<SVGSVGElement>(
        '[data-opencodian-glass-octahedron-demo-role="svg-defs"]',
      );

      expect(overlayEl?.getAttribute('data-opencodian-glass-octahedron-quality-tier')).toBe('light-v3');
      expect(refractionEl?.style.clipPath).toContain('polygon(');
      expect(refractionEl?.classList.contains('is-disabled')).toBe(false);
      expect(mockBuildLightBackdropFilterValue).toHaveBeenCalled();
      expect(svgDefsEl).toBeNull();
      expect(mockRenderDisplacementSnapshot).not.toHaveBeenCalled();
    } finally {
      window.requestAnimationFrame = originalRequestAnimationFrame;
      window.cancelAnimationFrame = originalCancelAnimationFrame;
    }
  });

  it('falls back to mesh-only when basic backdrop-filter is unavailable', async () => {
    const originalRequestAnimationFrame = window.requestAnimationFrame;
    const originalCancelAnimationFrame = window.cancelAnimationFrame;
    jest.spyOn(performance, 'now').mockReturnValue(100);
    mockDetectBackdropSupport.mockReturnValue({
      basic: false,
      url: false,
    });
    window.requestAnimationFrame = ((callback: FrameRequestCallback): number => {
      callback(100);
      return 1;
    }) as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame = jest.fn();

    try {
      const view = createView();
      activeView = view;
      const { messagesShellEl } = mountViewChrome(view);

      await view.toggleGlassOctahedron();

      const overlayEl = messagesShellEl.querySelector<HTMLElement>(
        '[data-opencodian-glass-octahedron-demo-role="overlay"]',
      );
      const refractionEl = messagesShellEl.querySelector<HTMLElement>(
        '[data-opencodian-glass-octahedron-demo-role="refraction"]',
      );
      const causticEl = messagesShellEl.querySelector<HTMLElement>(
        '[data-opencodian-glass-octahedron-demo-role="caustic"]',
      );

      expect(overlayEl?.getAttribute('data-opencodian-glass-octahedron-quality-tier')).toBe('mesh-only');
      expect(refractionEl?.classList.contains('is-disabled')).toBe(true);
      expect(refractionEl?.style.opacity).toBe('0');
      expect(causticEl?.classList.contains('is-disabled')).toBe(true);
      expect(causticEl?.style.opacity).toBe('0');
    } finally {
      window.requestAnimationFrame = originalRequestAnimationFrame;
      window.cancelAnimationFrame = originalCancelAnimationFrame;
    }
  });

});

describe('OpenCodianView glass octahedron motion', () => {
  it('enters inertial rebound on pointer release and settles back inside the chat bounds', async () => {
    const originalRequestAnimationFrame = window.requestAnimationFrame;
    const originalCancelAnimationFrame = window.cancelAnimationFrame;
    const rafCallbacks: FrameRequestCallback[] = [];
    let now = 100;
    jest.spyOn(performance, 'now').mockImplementation(() => now);
    window.requestAnimationFrame = ((callback: FrameRequestCallback): number => {
      rafCallbacks.push(callback);
      return rafCallbacks.length;
    }) as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame = jest.fn();

    try {
      const view = createView();
      activeView = view;
      const { messagesShellEl } = mountViewChrome(view);

      await view.toggleGlassOctahedron();
      rafCallbacks.shift()?.(100);

      const hostEl = messagesShellEl.querySelector<HTMLElement>(
        '[data-opencodian-glass-octahedron-demo-role="host"]',
      );
      expect(hostEl).not.toBeNull();

      const setPointerCapture = jest.fn();
      const releasePointerCapture = jest.fn();
      Object.defineProperty(hostEl as HTMLElement, 'setPointerCapture', {
        configurable: true,
        value: setPointerCapture,
      });
      Object.defineProperty(hostEl as HTMLElement, 'releasePointerCapture', {
        configurable: true,
        value: releasePointerCapture,
      });

      dispatchPointerEvent(hostEl as HTMLElement, 'pointerdown', {
        pointerId: 5,
        clientX: 340,
        clientY: 210,
      });

      now = 116;
      dispatchPointerEvent(window, 'pointermove', {
        pointerId: 5,
        clientX: 1080,
        clientY: 820,
      });
      rafCallbacks.shift()?.(116);

      dispatchPointerEvent(window, 'pointerup', {
        pointerId: 5,
        clientX: 1080,
        clientY: 820,
      });

      expect(setPointerCapture).toHaveBeenCalledWith(5);
      expect(releasePointerCapture).toHaveBeenCalledWith(5);
      expect(hostEl?.classList.contains('is-dragging')).toBe(false);

      let safety = 0;
      while (rafCallbacks.length > 0 && safety < 320) {
        safety += 1;
        now += 16;
        const next = rafCallbacks.shift();
        next?.(now);
      }

      const translated = parseTranslate3d(hostEl?.style.transform ?? '');
      expect(translated.x).toBeGreaterThanOrEqual(-230);
      expect(translated.x).toBeLessThanOrEqual(234);
      expect(translated.y).toBeGreaterThanOrEqual(-100);
      expect(translated.y).toBeLessThanOrEqual(104);
      expect(mockRender).toHaveBeenCalled();
    } finally {
      window.requestAnimationFrame = originalRequestAnimationFrame;
      window.cancelAnimationFrame = originalCancelAnimationFrame;
    }
  });

  it('degrades from full-v3 to light-v3 and then to mesh-only under repeated slow interactive frames', async () => {
    const originalRequestAnimationFrame = window.requestAnimationFrame;
    const originalCancelAnimationFrame = window.cancelAnimationFrame;
    const rafCallbacks: FrameRequestCallback[] = [];
    let now = 100;
    let injectedRenderDuration = 0;
    jest.spyOn(performance, 'now').mockImplementation(() => {
      const value = now;
      if (injectedRenderDuration > 0) {
        now += injectedRenderDuration;
        injectedRenderDuration = 0;
      }

      return value;
    });
    window.requestAnimationFrame = ((callback: FrameRequestCallback): number => {
      rafCallbacks.push(callback);
      return rafCallbacks.length;
    }) as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame = jest.fn();

    try {
      const view = createView();
      activeView = view;
      const { messagesShellEl } = mountViewChrome(view);

      await view.toggleGlassOctahedron();
      rafCallbacks.shift()?.(100);

      const overlayEl = messagesShellEl.querySelector<HTMLElement>(
        '[data-opencodian-glass-octahedron-demo-role="overlay"]',
      );
      const hostEl = messagesShellEl.querySelector<HTMLElement>(
        '[data-opencodian-glass-octahedron-demo-role="host"]',
      );
      const refractionEl = messagesShellEl.querySelector<HTMLElement>(
        '[data-opencodian-glass-octahedron-demo-role="refraction"]',
      );
      const causticEl = messagesShellEl.querySelector<HTMLElement>(
        '[data-opencodian-glass-octahedron-demo-role="caustic"]',
      );
      expect(hostEl).not.toBeNull();

      dispatchPointerEvent(hostEl as HTMLElement, 'pointerdown', {
        pointerId: 7,
        clientX: 340,
        clientY: 210,
      });

      for (const [x, y, ts] of [
        [378, 240, 220],
        [398, 252, 340],
        [418, 266, 460],
        [438, 280, 580],
      ] as const) {
        now = ts;
        dispatchPointerEvent(window, 'pointermove', {
          pointerId: 7,
          clientX: x,
          clientY: y,
        });
        injectedRenderDuration = 34;
        rafCallbacks.shift()?.(ts);
      }

      expect(overlayEl?.getAttribute('data-opencodian-glass-octahedron-quality-tier')).toBe('light-v3');
      expect(refractionEl?.style.clipPath).toContain('polygon(');
      expect(refractionEl?.classList.contains('is-disabled')).toBe(false);
      expect(mockBuildLightBackdropFilterValue).toHaveBeenCalled();

      for (const [x, y, ts] of [
        [462, 294, 700],
        [486, 310, 820],
        [510, 326, 940],
        [534, 342, 1060],
      ] as const) {
        now = ts;
        dispatchPointerEvent(window, 'pointermove', {
          pointerId: 7,
          clientX: x,
          clientY: y,
        });
        injectedRenderDuration = 34;
        rafCallbacks.shift()?.(ts);
      }

      expect(overlayEl?.getAttribute('data-opencodian-glass-octahedron-quality-tier')).toBe('mesh-only');
      expect(refractionEl?.classList.contains('is-disabled')).toBe(true);
      expect(refractionEl?.style.opacity).toBe('0');
      expect(causticEl?.classList.contains('is-disabled')).toBe(true);
      expect(causticEl?.style.opacity).toBe('0');
    } finally {
      window.requestAnimationFrame = originalRequestAnimationFrame;
      window.cancelAnimationFrame = originalCancelAnimationFrame;
    }
  });

});

describe('OpenCodianView glass octahedron idle lifecycle', () => {
  it('renders low-frequency idle breathing and freezes completely after deep idle timeout', async () => {
    jest.useFakeTimers();
    const originalRequestAnimationFrame = window.requestAnimationFrame;
    const originalCancelAnimationFrame = window.cancelAnimationFrame;
    const rafCallbacks: FrameRequestCallback[] = [];
    let now = 100;
    jest.spyOn(performance, 'now').mockImplementation(() => now);
    window.requestAnimationFrame = ((callback: FrameRequestCallback): number => {
      rafCallbacks.push(callback);
      return rafCallbacks.length;
    }) as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame = jest.fn();

    try {
      const view = createView();
      activeView = view;
      mountViewChrome(view);

      await view.toggleGlassOctahedron();
      rafCallbacks.shift()?.(100);

      const initialCallCount = mockRender.mock.calls.length;
      now = 420;
      jest.advanceTimersByTime(320);
      expect(rafCallbacks.length).toBe(1);
      rafCallbacks.shift()?.(420);

      expect(mockRender).toHaveBeenCalledTimes(initialCallCount + 1);
      const idlePose = getLastRenderPose<{
        idleAmount: number;
        idlePhase: number;
        quality: string;
      }>();
      expect(idlePose.quality).toBe('settled');
      expect(idlePose.idleAmount).toBeGreaterThan(0);
      expect(idlePose.idlePhase).toBeGreaterThan(0);

      now = 60100;
      jest.advanceTimersByTime(59680);
      expect(rafCallbacks.length).toBe(1);
      rafCallbacks.shift()?.(60100);

      const frozenPose = getLastRenderPose<{
        idleAmount: number;
        idlePhase: number;
      }>();
      expect(frozenPose.idleAmount).toBeGreaterThan(0);
      expect(frozenPose.idlePhase).toBeGreaterThan(0);

      jest.advanceTimersByTime(2000);
      expect(rafCallbacks.length).toBe(0);
    } finally {
      window.requestAnimationFrame = originalRequestAnimationFrame;
      window.cancelAnimationFrame = originalCancelAnimationFrame;
    }
  });

  it('wakes from deep idle when the pointer re-enters the octahedron', async () => {
    jest.useFakeTimers();
    const originalRequestAnimationFrame = window.requestAnimationFrame;
    const originalCancelAnimationFrame = window.cancelAnimationFrame;
    const rafCallbacks: FrameRequestCallback[] = [];
    let now = 100;
    jest.spyOn(performance, 'now').mockImplementation(() => now);
    window.requestAnimationFrame = ((callback: FrameRequestCallback): number => {
      rafCallbacks.push(callback);
      return rafCallbacks.length;
    }) as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame = jest.fn();

    try {
      const view = createView();
      activeView = view;
      const { messagesShellEl } = mountViewChrome(view);

      await view.toggleGlassOctahedron();
      rafCallbacks.shift()?.(100);

      now = 60100;
      jest.advanceTimersByTime(60000);
      expect(rafCallbacks.length).toBe(1);
      rafCallbacks.shift()?.(60100);

      const hostEl = messagesShellEl.querySelector<HTMLElement>(
        '[data-opencodian-glass-octahedron-demo-role="host"]',
      );
      expect(hostEl).not.toBeNull();

      now = 60200;
      dispatchPointerEvent(hostEl as HTMLElement, 'pointerenter', {
        pointerId: 11,
        clientX: 360,
        clientY: 220,
      });
      expect(rafCallbacks.length).toBe(1);
      rafCallbacks.shift()?.(60200);

      const wakePose = getLastRenderPose<{
        idleAmount: number;
        idlePhase: number;
        quality: string;
      }>();
      expect(wakePose.quality).toBe('settled');
      expect(wakePose.idleAmount).toBeCloseTo(0, 3);
      expect(wakePose.idlePhase).toBeCloseTo(0, 3);
    } finally {
      window.requestAnimationFrame = originalRequestAnimationFrame;
      window.cancelAnimationFrame = originalCancelAnimationFrame;
    }
  });
});
