import { WorkspaceLeaf } from 'obsidian';

jest.mock('../../../../src/core/opencode', () => ({
  OpenCodeService: class OpenCodeService {},
}));

import {
  getDefaultChatAppearanceSettings,
  getDefaultInputPanelGlassRefractionSettings,
  getDefaultInputPanelGlassRefractionSvgFilterSettings,
  getDefaultInputPanelLiquidGlassSettings,
  getDefaultThemeSettings,
} from '../../../../src/core/types';
import { OpenCodianView } from '../../../../src/features/chat/OpenCodianView';
import { LIQUID_DIAMOND_DEMO_STAGE_SIZE } from '../../../../src/features/chat/liquidDiamondDemo';

type DemoViewHarness = OpenCodianView & {
  chatContainerEl: HTMLElement | null;
  messagesShellEl: HTMLElement | null;
  inputContainer: HTMLElement | null;
  composerShellEl: HTMLElement | null;
  inputWrapperEl: HTMLElement | null;
  inputTextarea: HTMLTextAreaElement | null;
  toggleLiquidDiamondDemo: () => void;
};

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

function createView(): DemoViewHarness {
  return new OpenCodianView(new WorkspaceLeaf(), {
    settings: {
      effortLevel: 'medium',
      thinkingBudget: 0,
      locale: 'en',
      theme: getDefaultThemeSettings(),
      chatAppearance: getDefaultChatAppearanceSettings(),
      inputPanelTheme: 'preset',
      inputPanelGlassRefraction: getDefaultInputPanelGlassRefractionSettings(),
      inputPanelGlassRefractionSvgFilter: getDefaultInputPanelGlassRefractionSvgFilterSettings(),
      inputPanelLiquidGlass: getDefaultInputPanelLiquidGlassSettings(),
    },
    openCodeService: {},
    storage: {},
  } as never) as DemoViewHarness;
}

function mountViewChrome(view: DemoViewHarness): {
  chatContainerEl: HTMLElement;
  messagesShellEl: HTMLElement;
  composerShellEl: HTMLElement;
  inputEl: HTMLTextAreaElement;
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
    messagesShellEl,
    composerShellEl,
    inputEl,
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

describe('OpenCodianView floating liquid diamond demo', () => {
  let toDataUrlSpy: jest.SpyInstance<string, []>;

  beforeEach(() => {
    document.body.innerHTML = '';
    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(createCanvasContextMock());
    toDataUrlSpy = jest
      .spyOn(HTMLCanvasElement.prototype, 'toDataURL')
      .mockReturnValue('data:image/png;base64,diamond-demo');
    Object.defineProperty(globalThis, 'CSS', {
      configurable: true,
      value: {
        supports: jest.fn().mockReturnValue(true),
      },
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('mounts the floating demo in messages shell instead of composer shell and keeps the composer geometry untouched', () => {
    const view = createView();
    const { messagesShellEl, composerShellEl, inputEl } = mountViewChrome(view);

    view.toggleLiquidDiamondDemo();

    const overlayEl = messagesShellEl.querySelector<HTMLElement>('[data-opencodian-liquid-diamond-demo-role="overlay"]');
    const hostEl = messagesShellEl.querySelector<HTMLElement>('[data-opencodian-liquid-diamond-demo-role="host"]');
    const bloomEl = messagesShellEl.querySelector<HTMLElement>('[data-opencodian-liquid-diamond-demo-role="bloom"]');
    const rimEl = messagesShellEl.querySelector<HTMLElement>('[data-opencodian-liquid-diamond-demo-role="rim"]');
    const crystalEl = messagesShellEl.querySelector<HTMLElement>('[data-opencodian-liquid-diamond-demo-role="crystal"]');
    const faceOverlayEl = messagesShellEl.querySelector<SVGSVGElement>('[data-opencodian-liquid-diamond-demo-role="face-overlay"]');
    const defsEl = messagesShellEl.querySelector<SVGDefsElement>('[data-opencodian-liquid-diamond-demo-role="defs"]');
    const feImageEl = messagesShellEl.querySelector<SVGFEImageElement>('feImage');

    expect(overlayEl).not.toBeNull();
    expect(hostEl).not.toBeNull();
    expect(composerShellEl.contains(hostEl)).toBe(false);
    expect(hostEl?.closest('.opencodian-composer-shell')).toBeNull();
    expect(hostEl?.style.width).toBe(`${LIQUID_DIAMOND_DEMO_STAGE_SIZE}px`);
    expect(hostEl?.style.height).toBe(`${LIQUID_DIAMOND_DEMO_STAGE_SIZE}px`);
    expect(hostEl?.style.pointerEvents).toBe('auto');
    expect(hostEl?.style.cursor).toBe('grab');
    expect(hostEl?.style.touchAction).toBe('none');
    expect(bloomEl?.style.clipPath).toContain('polygon(');
    expect(rimEl?.style.filter).toContain('drop-shadow');
    expect(crystalEl?.style.clipPath).toContain('polygon(');
    expect(faceOverlayEl?.getAttribute('viewBox')).toBe('0 0 220 220');
    expect(defsEl).not.toBeNull();
    expect(feImageEl?.getAttribute('href')).toBe('data:image/png;base64,diamond-demo');
    expect(composerShellEl.style.width).toBe('432px');
    expect(composerShellEl.style.height).toBe('74px');
    expect(composerShellEl.style.borderRadius).toBe('20px');
    expect(inputEl.isConnected).toBe(true);

    view.toggleLiquidDiamondDemo();

    expect(messagesShellEl.querySelector('[data-opencodian-liquid-diamond-demo-role="overlay"]')).toBeNull();
    expect(composerShellEl.style.width).toBe('432px');
    expect(composerShellEl.style.height).toBe('74px');
    expect(composerShellEl.style.borderRadius).toBe('20px');
    expect(composerShellEl.querySelector('.opencodian-input')).not.toBeNull();
  });

  it('enters grabbing state on pointerdown and restores grab while scheduling inertial rebound on pointerup', () => {
    const originalRequestAnimationFrame = window.requestAnimationFrame;
    const originalCancelAnimationFrame = window.cancelAnimationFrame;
    const rafCallbacks: FrameRequestCallback[] = [];
    let now = 100;
    jest.spyOn(performance, 'now').mockImplementation(() => now);
    const requestAnimationFrameMock = jest.fn((callback: FrameRequestCallback): number => {
      rafCallbacks.push(callback);
      return rafCallbacks.length;
    });
    window.requestAnimationFrame = requestAnimationFrameMock as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame = jest.fn();

    try {
      const view = createView();
      const { messagesShellEl } = mountViewChrome(view);
      view.toggleLiquidDiamondDemo();

      const hostEl = messagesShellEl.querySelector<HTMLElement>('[data-opencodian-liquid-diamond-demo-role="host"]');
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
        pointerId: 7,
        clientX: 340,
        clientY: 210,
      });
      expect(setPointerCapture).toHaveBeenCalledWith(7);
      expect(hostEl?.classList.contains('is-dragging')).toBe(true);
      expect(hostEl?.style.cursor).toBe('grabbing');
      expect(hostEl?.dataset.opencodianLiquidDiamondDemoDragging).toBe('true');

      now = 116;
      dispatchPointerEvent(hostEl as HTMLElement, 'pointermove', {
        pointerId: 7,
        clientX: 392,
        clientY: 248,
      });
      expect(toDataUrlSpy).toHaveBeenCalledTimes(1);

      now = 132;
      dispatchPointerEvent(hostEl as HTMLElement, 'pointerup', {
        pointerId: 7,
        clientX: 392,
        clientY: 248,
      });

      expect(releasePointerCapture).toHaveBeenCalledWith(7);
      expect(hostEl?.classList.contains('is-dragging')).toBe(false);
      expect(hostEl?.style.cursor).toBe('grab');
      expect(hostEl?.dataset.opencodianLiquidDiamondDemoDragging).toBeUndefined();
      expect(rafCallbacks.length).toBeGreaterThanOrEqual(2);
      expect(toDataUrlSpy).toHaveBeenCalledTimes(1);

      rafCallbacks[0](132);

      expect(toDataUrlSpy).toHaveBeenCalledTimes(2);
      expect(requestAnimationFrameMock).toHaveBeenCalledTimes(2);
    } finally {
      window.requestAnimationFrame = originalRequestAnimationFrame;
      window.cancelAnimationFrame = originalCancelAnimationFrame;
    }
  });
});
