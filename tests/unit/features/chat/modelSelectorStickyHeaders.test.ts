import {
  bindModelSelectorStickyHeaders,
  syncModelSelectorStickyHeaders,
} from '../../../../src/features/chat/ui/modelSelectorStickyHeaders';

function setRect(element: HTMLElement, rectFactory: () => Partial<DOMRect>): void {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => {
      const rect = rectFactory();
      return {
        x: 0,
        y: rect.top ?? 0,
        width: rect.width ?? 0,
        height: rect.height ?? Math.max(0, (rect.bottom ?? 0) - (rect.top ?? 0)),
        top: rect.top ?? 0,
        right: rect.right ?? 0,
        bottom: rect.bottom ?? 0,
        left: rect.left ?? 0,
        toJSON: () => ({}),
      };
    },
  });
}

describe('modelSelectorStickyHeaders', () => {
  it('marks headers as stuck only after the list has scrolled', () => {
    const scrollContainer = document.createElement('div');
    const stuckHeader = document.createElement('div');
    const freeHeader = document.createElement('div');

    Object.defineProperty(scrollContainer, 'scrollTop', {
      configurable: true,
      value: 24,
      writable: true,
    });
    setRect(scrollContainer, () => ({ top: 100, bottom: 320 }));
    setRect(stuckHeader, () => ({ top: 100, bottom: 128 }));
    setRect(freeHeader, () => ({ top: 144, bottom: 172 }));

    syncModelSelectorStickyHeaders(scrollContainer, [stuckHeader, freeHeader]);

    expect(stuckHeader.getAttribute('data-stuck')).toBe('true');
    expect(freeHeader.getAttribute('data-stuck')).toBe('false');
  });

  it('returns a cleanup function that stops future scroll updates', () => {
    const scrollContainer = document.createElement('div');
    const header = document.createElement('div');
    let scrollTop = 0;
    let headerTop = 120;

    Object.defineProperty(scrollContainer, 'scrollTop', {
      configurable: true,
      get: () => scrollTop,
    });
    setRect(scrollContainer, () => ({ top: 100, bottom: 320 }));
    setRect(header, () => ({ top: headerTop, bottom: headerTop + 24 }));

    const dispose = bindModelSelectorStickyHeaders(scrollContainer, [header]);

    expect(header.getAttribute('data-stuck')).toBe('false');

    scrollTop = 40;
    headerTop = 100;
    scrollContainer.dispatchEvent(new Event('scroll'));
    expect(header.getAttribute('data-stuck')).toBe('true');

    dispose();

    scrollTop = 0;
    headerTop = 140;
    scrollContainer.dispatchEvent(new Event('scroll'));
    expect(header.getAttribute('data-stuck')).toBe('true');
  });
});
