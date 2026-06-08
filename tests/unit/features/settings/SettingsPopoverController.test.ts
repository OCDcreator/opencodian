import { SettingsPopoverController } from '../../../../src/features/settings/SettingsPopoverController';

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

function showPopover(
  controller: SettingsPopoverController,
  input: HTMLInputElement,
  popover: HTMLElement,
  options?: { preferredPlacement?: 'bottom-start' | 'top-start' },
): void {
  mockRect(input, { left: 24, top: 40, width: 180, height: 32 });
  mockRect(popover, { left: 0, top: 0, width: 120, height: 96 });
  controller.show({
    anchorEl: input,
    popoverEl: popover,
    matchAnchorWidth: true,
    preferredPlacement: options?.preferredPlacement ?? 'bottom-start',
  });
}

describe('SettingsPopoverController', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 360 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 220 });
  });

  afterEach(() => {
    SettingsPopoverController.ensureForDocument(document).destroy();
    document.body.innerHTML = '';
  });

  describe('positioning', () => {
    it('moves the active popover to document.body and matches anchor width', () => {
      const controller = SettingsPopoverController.ensureForDocument(document);
      const host = document.createElement('div');
      const input = document.createElement('input');
      const popover = document.createElement('div');
      host.append(input, popover);
      document.body.appendChild(host);

      mockRect(input, { left: 24, top: 40, width: 180, height: 32 });
      mockRect(popover, { left: 0, top: 0, width: 120, height: 96 });
      controller.show({ anchorEl: input, popoverEl: popover, matchAnchorWidth: true });

      expect(popover.parentElement).toBe(document.body);
      expect(popover.hidden).toBe(false);
      expect(popover.style.minWidth).toBe('180px');
    });

    it('flips above the anchor when there is not enough space below', () => {
      const controller = SettingsPopoverController.ensureForDocument(document);
      const input = document.createElement('input');
      const popover = document.createElement('div');
      document.body.append(input, popover);

      mockRect(input, { left: 18, top: 184, width: 140, height: 28 });
      mockRect(popover, { left: 0, top: 0, width: 140, height: 88 });
      controller.show({ anchorEl: input, popoverEl: popover });

      expect(popover.dataset.placement).toBe('top-start');
      expect(Number.parseFloat(popover.style.top)).toBeLessThan(184);
    });

    it('repositions on window resize without closing', () => {
      const controller = SettingsPopoverController.ensureForDocument(document);
      const input = document.createElement('input');
      const popover = document.createElement('div');
      document.body.append(input, popover);
      showPopover(controller, input, popover);

      expect(popover.hidden).toBe(false);
      window.dispatchEvent(new Event('resize'));
      expect(popover.hidden).toBe(false);
    });
  });

  describe('scroll close', () => {
    it('closes on any scroll fired on the window capture phase', () => {
      const controller = SettingsPopoverController.ensureForDocument(document);
      const input = document.createElement('input');
      const popover = document.createElement('div');
      document.body.append(input, popover);
      showPopover(controller, input, popover);

      const scrollContainer = document.createElement('div');
      scrollContainer.appendChild(input);
      document.body.prepend(scrollContainer);
      scrollContainer.dispatchEvent(new Event('scroll', { bubbles: true }));

      expect(popover.hasAttribute('hidden')).toBe(true);
    });

    it('closes when a nested outer scroll container scrolls', () => {
      const controller = SettingsPopoverController.ensureForDocument(document);
      const outerScroll = document.createElement('div');
      outerScroll.className = 'vertical-tab-content-container';
      const innerScroll = document.createElement('div');
      Object.defineProperty(innerScroll, 'scrollHeight', { value: 2000, configurable: true });
      Object.defineProperty(innerScroll, 'clientHeight', { value: 400, configurable: true });
      const input = document.createElement('input');
      const popover = document.createElement('div');
      innerScroll.appendChild(input);
      outerScroll.appendChild(innerScroll);
      document.body.appendChild(outerScroll);
      document.body.appendChild(popover);
      showPopover(controller, input, popover);

      outerScroll.dispatchEvent(new Event('scroll', { bubbles: true }));

      expect(popover.hasAttribute('hidden')).toBe(true);
    });
  });

  describe('wheel close', () => {
    it('closes on wheel events outside the popover', () => {
      const controller = SettingsPopoverController.ensureForDocument(document);
      const input = document.createElement('input');
      const popover = document.createElement('div');
      document.body.append(input, popover);
      showPopover(controller, input, popover);

      input.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: 120 }));

      expect(popover.hasAttribute('hidden')).toBe(true);
    });

    it('preserves wheel events inside the popover', () => {
      const controller = SettingsPopoverController.ensureForDocument(document);
      const input = document.createElement('input');
      const popover = document.createElement('div');
      const scrollChild = document.createElement('div');
      popover.appendChild(scrollChild);
      document.body.append(input, popover);
      showPopover(controller, input, popover);

      scrollChild.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: 40 }));

      expect(popover.hidden).toBe(false);
    });
  });

  describe('keyboard scroll-intent close', () => {
    it('closes on PageDown key', () => {
      const controller = SettingsPopoverController.ensureForDocument(document);
      const input = document.createElement('input');
      const popover = document.createElement('div');
      document.body.append(input, popover);
      showPopover(controller, input, popover);

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true }));

      expect(popover.hasAttribute('hidden')).toBe(true);
    });

    it('closes on ArrowDown key outside the popover', () => {
      const controller = SettingsPopoverController.ensureForDocument(document);
      const input = document.createElement('input');
      const popover = document.createElement('div');
      document.body.append(input, popover);
      showPopover(controller, input, popover);

      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

      expect(popover.hasAttribute('hidden')).toBe(true);
    });

    it('preserves ArrowDown key inside the popover', () => {
      const controller = SettingsPopoverController.ensureForDocument(document);
      const input = document.createElement('input');
      const popover = document.createElement('div');
      const focusableChild = document.createElement('div');
      popover.appendChild(focusableChild);
      document.body.append(input, popover);
      showPopover(controller, input, popover);

      focusableChild.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

      expect(popover.hidden).toBe(false);
    });

    it('does not close on regular typing keys', () => {
      const controller = SettingsPopoverController.ensureForDocument(document);
      const input = document.createElement('input');
      const popover = document.createElement('div');
      document.body.append(input, popover);
      showPopover(controller, input, popover);

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));

      expect(popover.hidden).toBe(false);
    });
  });
});

describe('SettingsPopoverController boundary-constrained positioning', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 360 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 220 });
  });

  afterEach(() => {
    SettingsPopoverController.ensureForDocument(document).destroy();
    document.body.innerHTML = '';
  });

  it('clamps popover within boundaryEl bounds, not just viewport', () => {
      const controller = SettingsPopoverController.ensureForDocument(document);

      // Settings panel: narrow container at x=100..280, y=50..250
      const panel = document.createElement('div');
      panel.className = 'opencodian-settings';
      mockRect(panel, { left: 100, top: 50, width: 180, height: 200 });

      // Input near the right edge of the panel (left=250)
      const input = document.createElement('input');
      mockRect(input, { left: 250, top: 80, width: 24, height: 28 });
      panel.appendChild(input);

      const popover = document.createElement('div');
      document.body.appendChild(panel);
      document.body.appendChild(popover);
      mockRect(popover, { left: 0, top: 0, width: 120, height: 80 });

      controller.show({
        anchorEl: input,
        popoverEl: popover,
        matchAnchorWidth: false,
        preferredPlacement: 'bottom-start',
        boundaryEl: panel,
      });

      const popoverLeft = Number.parseFloat(popover.style.left);
      const popoverTop = Number.parseFloat(popover.style.top);
      const panelRight = 100 + 180; // 280
      const panelBottom = 50 + 200; // 250

      // Without boundary, popover would be placed at left=250 (anchor left),
      // which means right edge at 250+120=370 > panelRight=280.
      // With boundary, it must be clamped so right edge <= panelRight.
      expect(popoverLeft + 120).toBeLessThanOrEqual(panelRight);
      // Left edge must not go below panel left
      expect(popoverLeft).toBeGreaterThanOrEqual(100);
      // Bottom edge must not exceed panel bottom
      expect(popoverTop + 80).toBeLessThanOrEqual(panelBottom);
    });

    it('clamps popover top within boundaryEl when anchor is near bottom', () => {
      const controller = SettingsPopoverController.ensureForDocument(document);

      // Panel: y=50..250
      const panel = document.createElement('div');
      panel.className = 'opencodian-settings';
      mockRect(panel, { left: 100, top: 50, width: 180, height: 200 });

      // Input near the bottom of the panel (top=210)
      const input = document.createElement('input');
      mockRect(input, { left: 120, top: 210, width: 100, height: 28 });
      panel.appendChild(input);

      const popover = document.createElement('div');
      document.body.appendChild(panel);
      document.body.appendChild(popover);
      mockRect(popover, { left: 0, top: 0, width: 100, height: 80 });

      controller.show({
        anchorEl: input,
        popoverEl: popover,
        matchAnchorWidth: false,
        preferredPlacement: 'bottom-start',
        boundaryEl: panel,
      });

      const popoverTop = Number.parseFloat(popover.style.top);
      const panelBottom = 50 + 200; // 250

      // Without boundary, bottom-start placement at 210+28+8=246 would still
      // be within viewport (220 height + margin) but the popover bottom at
      // 246+80=326 > panelBottom=250.
      // With boundary, it must flip or clamp so bottom <= panelBottom.
      expect(popoverTop + 80).toBeLessThanOrEqual(panelBottom);
    });

    it('uses viewport clamp when no boundaryEl is provided', () => {
      const controller = SettingsPopoverController.ensureForDocument(document);
      const input = document.createElement('input');
      const popover = document.createElement('div');
      document.body.append(input, popover);

      mockRect(input, { left: 340, top: 40, width: 16, height: 28 });
      mockRect(popover, { left: 0, top: 0, width: 120, height: 80 });

      controller.show({
        anchorEl: input,
        popoverEl: popover,
        matchAnchorWidth: false,
        preferredPlacement: 'bottom-start',
      });

      const popoverLeft = Number.parseFloat(popover.style.left);
      // 360 viewport - 12 margin - 120 popover = 228 max left
      expect(popoverLeft).toBeLessThanOrEqual(228);
    });
  });
