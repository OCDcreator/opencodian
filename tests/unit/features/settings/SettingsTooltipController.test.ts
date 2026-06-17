import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { SettingsTooltipController } from '../../../../src/features/settings/SettingsTooltipController';

function mockRect(element: HTMLElement, rect: Partial<DOMRect>): void {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      x: rect.left ?? 0,
      y: rect.top ?? 0,
      left: rect.left ?? 0,
      top: rect.top ?? 0,
      right: rect.right ?? ((rect.left ?? 0) + (rect.width ?? 0)),
      bottom: rect.bottom ?? ((rect.top ?? 0) + (rect.height ?? 0)),
      width: rect.width ?? 0,
      height: rect.height ?? 0,
      toJSON: () => '',
    }),
  });
}

describe('SettingsTooltipController', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 320 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 240 });
  });

  afterEach(() => {
    SettingsTooltipController.ensureForDocument(document).destroy();
    document.body.innerHTML = '';
  });

  it('renders a body-level tooltip for data-settings-tooltip triggers', () => {
    const controller = SettingsTooltipController.ensureForDocument(document);
    const host = document.createElement('div');
    const button = document.createElement('button');
    host.appendChild(button);
    document.body.appendChild(host);

    button.dataset.settingsTooltip = 'Reset this value';
    mockRect(button, { left: 32, top: 72, width: 24, height: 24 });

    button.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

    const layer = document.body.querySelector<HTMLElement>('.opencodian-settings-tooltip-layer');
    expect(controller).toBeTruthy();
    expect(layer).not.toBeNull();
    expect(host.querySelector('.opencodian-settings-tooltip-layer')).toBeNull();
    expect(layer?.textContent).toContain('Reset this value');
  });

  it('clamps the tooltip within the viewport and cleans up on focusout', () => {
    SettingsTooltipController.ensureForDocument(document);
    const button = document.createElement('button');
    document.body.appendChild(button);
    button.dataset.settingsTooltip = 'Very long tooltip copy';
    mockRect(button, { left: 2, top: 18, width: 20, height: 20 });

    button.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    const layer = document.body.querySelector<HTMLElement>('.opencodian-settings-tooltip-layer');
    expect(Number.parseFloat(layer?.style.left ?? '0')).toBeGreaterThanOrEqual(12);

    button.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: document.body }));
    expect(document.body.querySelector('.opencodian-settings-tooltip-layer')).toBeNull();
  });

  it('adds is-visible class when showing and removes it when hiding', () => {
    SettingsTooltipController.ensureForDocument(document);
    const button = document.createElement('button');
    document.body.appendChild(button);
    button.dataset.settingsTooltip = 'Test tooltip';
    mockRect(button, { left: 100, top: 100, width: 40, height: 24 });

    button.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    const layer = document.body.querySelector<HTMLElement>('.opencodian-settings-tooltip-layer');
    expect(layer?.classList.contains('is-visible')).toBe(true);

    button.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));
    expect(document.body.querySelector('.opencodian-settings-tooltip-layer')).toBeNull();
  });

  it('clamps arrow offset so the arrow stays inside the bubble', () => {
    SettingsTooltipController.ensureForDocument(document);
    const button = document.createElement('button');
    document.body.appendChild(button);
    button.dataset.settingsTooltip = 'Tip';
    // Far-left button: anchor center at x=4, layer will clamp to left margin 12
    // so arrow offset (anchorCenterX - layerLeft) could go negative without clamping.
    mockRect(button, { left: 0, top: 100, width: 8, height: 24 });

    button.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    const layer = document.body.querySelector<HTMLElement>('.opencodian-settings-tooltip-layer');
    const arrowOffset = Number.parseInt(
      layer?.style.getPropertyValue('--opencodian-settings-tooltip-arrow-offset') ?? '0',
      10,
    );
    // Arrow offset must be at least TOOLTIP_ARROW_MIN_INSET_PX (10)
    expect(arrowOffset).toBeGreaterThanOrEqual(10);
  });

  it('keeps the default settings tooltip above or below central buttons', () => {
    SettingsTooltipController.ensureForDocument(document);
    const button = document.createElement('button');
    document.body.appendChild(button);
    button.dataset.settingsTooltip = 'Placement test';
    mockRect(button, { left: 100, top: 20, width: 40, height: 24 });

    button.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    const layer = document.body.querySelector<HTMLElement>('.opencodian-settings-tooltip-layer');
    const placement = layer?.dataset.placement;
    expect(placement === 'top' || placement === 'bottom').toBe(true);
  });

  it('chooses left or right placement for edge-adjacent setting buttons', () => {
    SettingsTooltipController.ensureForDocument(document);
    const leftButton = document.createElement('button');
    document.body.appendChild(leftButton);
    leftButton.dataset.settingsTooltip = 'Left edge setting';
    mockRect(leftButton, { left: 6, top: 96, width: 24, height: 24 });

    leftButton.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(document.body.querySelector<HTMLElement>('.opencodian-settings-tooltip-layer')?.dataset.placement)
      .toBe('right');

    leftButton.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));

    const rightButton = document.createElement('button');
    document.body.appendChild(rightButton);
    rightButton.dataset.settingsTooltip = 'Right edge setting';
    mockRect(rightButton, { left: 292, top: 96, width: 24, height: 24 });

    rightButton.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(document.body.querySelector<HTMLElement>('.opencodian-settings-tooltip-layer')?.dataset.placement)
      .toBe('left');
  });

  it('removes native title tooltip sources from custom settings tooltip triggers', () => {
    SettingsTooltipController.ensureForDocument(document);
    const button = document.createElement('button');
    button.dataset.settingsTooltip = 'Custom settings tooltip';
    button.title = 'Native duplicate';
    document.body.appendChild(button);
    mockRect(button, { left: 100, top: 96, width: 24, height: 24 });

    button.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

    expect(button.hasAttribute('title')).toBe(false);
    expect(document.body.querySelector<HTMLElement>('.opencodian-settings-tooltip-layer')?.textContent)
      .toContain('Custom settings tooltip');
  });

  it('keeps settings tooltip bubbles flat without shadows', () => {
    const css = readFileSync(
      join(process.cwd(), 'src/style/components/model-selector.css'),
      'utf8',
    );

    expect(css).toMatch(
      /\.opencodian-settings-tooltip-bubble\s*\{[\s\S]*box-shadow:\s*none;/,
    );
  });
});
