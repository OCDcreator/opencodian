import {
  isValidRangeStr,
  pageNumberOfSelectionNode,
  resolvePdfIntegrationLevel,
} from '../../../../src/core/pdf/pdfViewProbe';

function probe(overrides: Partial<Parameters<typeof resolvePdfIntegrationLevel>[0]> = {}) {
  return {
    hasPdfViewer: true,
    hasToolbar: true,
    hasNativeRangeSerializer: true,
    nativeRangeStrWorks: true,
    hasDomSelection: true,
    ...overrides,
  };
}

describe('resolvePdfIntegrationLevel (degradation ladder)', () => {
  it('reaches level A when every internal interface feature-detects', () => {
    const decision = resolvePdfIntegrationLevel(probe());
    expect(decision.level).toBe('A');
    expect(decision.reasons).toEqual([]);
  });

  it('drops to B when the native serializer is absent', () => {
    const decision = resolvePdfIntegrationLevel(probe({ hasNativeRangeSerializer: false }));
    expect(decision.level).toBe('B');
    expect(decision.reasons.join(' ')).toContain('serializer absent');
  });

  it('drops to B when the native serializer fails the live call', () => {
    const decision = resolvePdfIntegrationLevel(probe({ nativeRangeStrWorks: false }));
    expect(decision.level).toBe('B');
    expect(decision.reasons.join(' ')).toContain('failed');
  });

  it('drops to C when the viewer internals are gone (e.g. after an Obsidian update)', () => {
    const decision = resolvePdfIntegrationLevel(probe({ hasPdfViewer: false }));
    expect(decision.level).toBe('C');
    expect(decision.reasons.join(' ')).toContain('pdfViewer missing');
  });

  it('drops to C when DOM selection is unreadable even with everything else', () => {
    const decision = resolvePdfIntegrationLevel(probe({ hasDomSelection: false }));
    expect(decision.level).toBe('C');
  });

  it('reports every missing capability at once, not just the first', () => {
    const decision = resolvePdfIntegrationLevel(probe({
      hasPdfViewer: false,
      hasToolbar: false,
      hasDomSelection: false,
    }));
    expect(decision.level).toBe('C');
    expect(decision.reasons).toHaveLength(3);
  });
});

describe('isValidRangeStr', () => {
  it('accepts Obsidian native "startIdx,startOffset,endIdx,endOffset"', () => {
    expect(isValidRangeStr('0,12,45,88')).toBe(true);
  });

  it('rejects malformed or absent serialization', () => {
    expect(isValidRangeStr('')).toBe(false);
    expect(isValidRangeStr('1,2,3')).toBe(false);
    expect(isValidRangeStr('a,b,c,d')).toBe(false);
    expect(isValidRangeStr(undefined)).toBe(false);
    expect(isValidRangeStr(null)).toBe(false);
  });
});

describe('pageNumberOfSelectionNode', () => {
  function elementWithPage(page: string): HTMLElement {
    const el = document.createElement('div');
    el.setAttribute('data-page-number', page);
    const inner = document.createElement('span');
    inner.textContent = 'selected text';
    el.appendChild(inner);
    return el;
  }

  it('finds the page attribute walking up from the anchor node', () => {
    const el = elementWithPage('3');
    const text = el.querySelector('span')?.firstChild ?? null;
    expect(pageNumberOfSelectionNode(text)).toBe(3);
  });

  it('returns null when no page container exists', () => {
    const orphan = document.createElement('span');
    expect(pageNumberOfSelectionNode(orphan)).toBeNull();
  });

  it('returns null for null input', () => {
    expect(pageNumberOfSelectionNode(null)).toBeNull();
  });
});
