import { TooltipLayerController } from '../../../src/shared/TooltipLayerController';

function setViewportSize(width: number, height: number): void {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: width,
  });
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    value: height,
  });
}

function createTrigger(options: {
  tooltip: string;
  rect: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  position?: 'top' | 'bottom' | 'right';
  align?: 'left' | 'right';
}): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = 'opencodian-tooltip-trigger';
  button.dataset.tooltip = options.tooltip;
  button.type = 'button';
  if (options.position) {
    button.dataset.tooltipPosition = options.position;
  }
  if (options.align) {
    button.dataset.tooltipAlign = options.align;
  }
  Object.defineProperty(button, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      left: options.rect.left,
      top: options.rect.top,
      width: options.rect.width,
      height: options.rect.height,
      right: options.rect.left + options.rect.width,
      bottom: options.rect.top + options.rect.height,
      x: options.rect.left,
      y: options.rect.top,
      toJSON: () => '',
    }),
  });
  document.body.appendChild(button);
  return button;
}

describe('TooltipLayerController', () => {
  let controller: TooltipLayerController;

  beforeEach(() => {
    document.body.innerHTML = '';
    setViewportSize(420, 300);
    controller = TooltipLayerController.ensureForDocument(document);
  });

  afterEach(() => {
    controller.destroy();
    document.body.innerHTML = '';
  });

  it('renders shared tooltip content in a body-level overlay on hover', () => {
    const button = createTrigger({
      tooltip: 'Start a new conversation in the current tab',
      rect: { left: 180, top: 180, width: 34, height: 34 },
    });

    button.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

    const overlay = document.body.querySelector<HTMLElement>('.opencodian-tooltip-layer');
    expect(overlay).not.toBeNull();
    expect(overlay?.textContent).toContain('Start a new conversation in the current tab');
    expect(button.contains(overlay)).toBe(false);
    expect(overlay?.dataset.placement).toBe('top');
  });

  it('flips a top tooltip to bottom when there is not enough room above the trigger', () => {
    const button = createTrigger({
      tooltip: 'Send message',
      rect: { left: 180, top: 6, width: 34, height: 34 },
    });

    button.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

    const overlay = document.body.querySelector<HTMLElement>('.opencodian-tooltip-layer');
    expect(overlay?.dataset.placement).toBe('bottom');
  });

  it('clamps tooltip overlays inside the viewport instead of letting them overflow past the left edge', () => {
    const button = createTrigger({
      tooltip: '让这条消息按固定结构返回结果，方便复制到其他工具继续处理。',
      rect: { left: 4, top: 180, width: 34, height: 34 },
    });

    button.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

    const overlay = document.body.querySelector<HTMLElement>('.opencodian-tooltip-layer');
    expect(overlay).not.toBeNull();
    expect(Number.parseFloat(overlay?.style.left ?? '0')).toBeGreaterThanOrEqual(12);
  });

  it('honors right-side alignment hints but flips them when the viewport edge would clip the tooltip', () => {
    const button = createTrigger({
      tooltip: 'Jump to top',
      rect: { left: 390, top: 160, width: 24, height: 24 },
      align: 'right',
    });

    button.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

    const overlay = document.body.querySelector<HTMLElement>('.opencodian-tooltip-layer');
    expect(overlay?.dataset.placement).toBe('left');
  });
});
