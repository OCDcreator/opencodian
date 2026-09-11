import { requestUrl, type RequestUrlResponse } from 'obsidian';

import { DEFAULT_SETTINGS } from '../../../../src/core/types';
import {
  findFontOptionById,
  InputFontLoader,
  resolveComposerFontFamily,
  resolveFontCssFamily,
  UNIFIED_FONT_OPTIONS,
} from '../../../../src/features/settings/InputFontRegistry';

const mockRequestUrl = requestUrl as jest.MockedFunction<typeof requestUrl>;

function cssResponse(text: string): RequestUrlResponse {
  return {
    status: 200,
    text,
    headers: {},
    arrayBuffer: new ArrayBuffer(0),
    json: null,
  } as unknown as RequestUrlResponse;
}

const LXGW_ROOT_URL = 'https://cdn.jsdelivr.net/npm/lxgw-wenkai-webfont@1.1.0/style.css';
const LXGW_ROOT_CSS = [
  "@import url('./lxgwwenkai-light.css');",
  "@import url('./lxgwwenkai-regular.css');",
  '',
].join('\n');
const LXGW_CHILD_CSS = [
  '@font-face {',
  "  font-family: 'LXGW WenKai';",
  '  font-weight: 400;',
  "  src: url('./files/lxgwwenkai-regular-subset-4.woff2') format('woff2');",
  '}',
  '',
].join('\n');

function mockLxgwStylesheets(): void {
  mockRequestUrl.mockImplementation(async (request) => {
    const url = typeof request === 'string' ? request : request.url;
    if (url === LXGW_ROOT_URL) return cssResponse(LXGW_ROOT_CSS);
    if (url.includes('lxgwwenkai-')) return cssResponse(LXGW_CHILD_CSS);
    throw new Error(`unexpected requestUrl: ${url}`);
  });
}

describe('InputFontRegistry', () => {
  it('uses bundled Newsreader as the default composer primary font', () => {
    expect(DEFAULT_SETTINGS.chatAppearance.input.enFontFamily).toBe('newsreader');
  });

  describe('resolveFontCssFamily', () => {
    it('returns empty string for empty input', () => {
      expect(resolveFontCssFamily('', UNIFIED_FONT_OPTIONS)).toBe('');
    });

    it("returns matching option's cssFamily for a known id", () => {
      expect(resolveFontCssFamily('poppins', UNIFIED_FONT_OPTIONS)).toBe("'Poppins', sans-serif");
    });

    it('returns raw value as-is for unknown ids', () => {
      expect(resolveFontCssFamily("'Custom Font', serif", UNIFIED_FONT_OPTIONS)).toBe("'Custom Font', serif");
    });

    it("returns empty string for the 'inherit' id", () => {
      expect(resolveFontCssFamily('inherit', UNIFIED_FONT_OPTIONS)).toBe('');
    });

    it('registers bundled Newsreader as the elegant local serif option', () => {
      expect(resolveFontCssFamily('newsreader', UNIFIED_FONT_OPTIONS)).toBe(
        "'OpenCodian Newsreader', 'Newsreader', serif",
      );
      expect(findFontOptionById('newsreader')).toMatchObject({
        displayName: 'Newsreader',
        loadType: 'local',
        category: 'serif',
      });
    });
  });

  describe('resolveComposerFontFamily', () => {
    it('returns empty string for raw empty or explicit inherit values before settings normalization', () => {
      expect(resolveComposerFontFamily('', '')).toBe('');
      expect(resolveComposerFontFamily('inherit', 'inherit')).toBe('');
    });

    it('returns primary en name + sans-serif when only en is set', () => {
      expect(resolveComposerFontFamily('poppins', '')).toBe("'Poppins', sans-serif");
    });

    it('returns primary cn name + sans-serif when only cn is set', () => {
      expect(resolveComposerFontFamily('', 'lxgw-wenkai')).toBe("'LXGW WenKai', sans-serif");
    });

    it('returns combined primary names + single sans-serif when both are set', () => {
      // EN primary first, then CN primary, then ONE trailing sans-serif.
      // This avoids sans-serif between en and cn fonts, which would
      // prevent the CN font from being selected for CJK characters.
      expect(resolveComposerFontFamily('poppins', 'lxgw-wenkai')).toBe(
        "'Poppins', 'LXGW WenKai', sans-serif",
      );
    });

    it('handles custom font strings by extracting primary name', () => {
      expect(resolveComposerFontFamily("'Custom EN', serif", "'Custom CN', sans-serif")).toBe(
        "'Custom EN', 'Custom CN', sans-serif",
      );
    });

    it('handles bare (unquoted) font names', () => {
      // Helvetica's cssFamily is "'Helvetica Neue', Helvetica, sans-serif"
      // Primary = "'Helvetica Neue'" (first before comma)
      expect(resolveComposerFontFamily('helvetica', '')).toBe(
        "'Helvetica Neue', sans-serif",
      );
    });

    it('allows CJK font in primary slot', () => {
      // A CJK font like 霞鹜文楷 can be the primary font
      expect(resolveComposerFontFamily('lxgw-wenkai', '')).toBe(
        "'LXGW WenKai', sans-serif",
      );
    });

    it('allows Latin font in CJK fallback slot', () => {
      expect(resolveComposerFontFamily('', 'poppins')).toBe(
        "'Poppins', sans-serif",
      );
    });

    it('preserves the serif generic fallback for the bundled Newsreader default', () => {
      expect(resolveComposerFontFamily('newsreader', '')).toBe(
        "'OpenCodian Newsreader', serif",
      );
    });

    it('same font in both slots deduplicates', () => {
      expect(resolveComposerFontFamily('poppins', 'poppins')).toBe(
        "'Poppins', sans-serif",
      );
    });
  });

  describe('findFontOptionById', () => {
    it('finds an EN font by id', () => {
      expect(findFontOptionById('poppins')).toMatchObject({
        id: 'poppins',
        cssFamily: "'Poppins', sans-serif",
      });
    });

    it('finds a CN font by id', () => {
      expect(findFontOptionById('lxgw-wenkai')).toMatchObject({
        id: 'lxgw-wenkai',
        cssFamily: "'LXGW WenKai', sans-serif",
      });
    });

    it('returns undefined for unknown id', () => {
      expect(findFontOptionById('unknown-font')).toBeUndefined();
    });
  });

  describe('InputFontLoader', () => {
    let createElementSpy: jest.SpiedFunction<typeof document.createElement>;
    let appendChildSpy: jest.SpiedFunction<typeof document.head.appendChild>;

    beforeEach(() => {
      document.head.replaceChildren();
      mockRequestUrl.mockReset();
      const originalCreateElement = document.createElement.bind(document);
      createElementSpy = jest.spyOn(document, 'createElement').mockImplementation((tagName, options) => {
        return originalCreateElement(tagName, options);
      });
      appendChildSpy = jest.spyOn(document.head, 'appendChild');
    });

    afterEach(() => {
      document.head.replaceChildren();
      jest.restoreAllMocks();
    });

    it("ensureLoaded is a no-op for system fonts", () => {
      const loader = new InputFontLoader();

      loader.ensureLoaded('poppins');
      createElementSpy.mockClear();
      appendChildSpy.mockClear();

      loader.ensureLoaded('arial');

      expect(createElementSpy).not.toHaveBeenCalled();
      expect(appendChildSpy).not.toHaveBeenCalled();
    });

    it('ensureLoaded is a no-op for local fonts', () => {
      const loader = new InputFontLoader();

      loader.ensureLoaded('newsreader');

      expect(createElementSpy).not.toHaveBeenCalled();
      expect(appendChildSpy).not.toHaveBeenCalled();
    });

    it('ensureLoaded injects a link element for Google Fonts stylesheets', () => {
      const loader = new InputFontLoader();

      loader.ensureLoaded('poppins');

      const linkEl = document.head.querySelector<HTMLLinkElement>('link[data-opencodian-font="poppins"]');
      expect(createElementSpy).toHaveBeenCalledWith('link');
      expect(appendChildSpy).toHaveBeenCalledTimes(1);
      expect(linkEl?.rel).toBe('stylesheet');
      expect(linkEl?.href).toContain('https://fonts.googleapis.com/');
      expect(mockRequestUrl).not.toHaveBeenCalled();
    });

    it('ensureLoaded fetches CSP-blocked CDN stylesheets and inlines them as <style>', async () => {
      mockLxgwStylesheets();
      const loader = new InputFontLoader();

      await loader.ensureLoaded('lxgw-wenkai');

      expect(document.head.querySelector('link[data-opencodian-font="lxgw-wenkai"]')).toBeNull();
      const styleEl = document.head.querySelector<HTMLStyleElement>('style[data-opencodian-font="lxgw-wenkai"]');
      expect(styleEl).toBeTruthy();
      // @import graph flattened, relative font binaries absolutized against the CDN URL.
      expect(styleEl?.textContent).not.toContain('@import');
      expect(styleEl?.textContent).toContain(
        'https://cdn.jsdelivr.net/npm/lxgw-wenkai-webfont@1.1.0/files/lxgwwenkai-regular-subset-4.woff2',
      );
      expect(loader.isLoaded('lxgw-wenkai')).toBe(true);
    });

    it('ensureLoaded only injects once per font id, including in-flight loads', async () => {
      mockLxgwStylesheets();
      const loader = new InputFontLoader();

      const first = loader.ensureLoaded('lxgw-wenkai');
      const second = loader.ensureLoaded('lxgw-wenkai');
      expect(second).toBeUndefined();
      await first;
      await loader.ensureLoaded('lxgw-wenkai');

      expect(appendChildSpy).toHaveBeenCalledTimes(1);
      expect(document.head.querySelectorAll('style[data-opencodian-font="lxgw-wenkai"]')).toHaveLength(1);
    });

    it('ensureLoaded warns and stays unloaded when the CDN fetch fails', async () => {
      mockRequestUrl.mockRejectedValue(new Error('network down'));
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      const loader = new InputFontLoader();

      await loader.ensureLoaded('gotham');

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('gotham'),
        expect.any(Error),
      );
      expect(loader.isLoaded('gotham')).toBe(false);
      expect(document.head.querySelector('[data-opencodian-font="gotham"]')).toBeNull();

      // A later retry is allowed because the in-flight marker was cleared.
      mockRequestUrl.mockResolvedValue(cssResponse('/* gotham */'));
      await loader.ensureLoaded('gotham');
      expect(loader.isLoaded('gotham')).toBe(true);
    });

    it('ensureBothLoaded loads both en and cn fonts', async () => {
      mockLxgwStylesheets();
      const loader = new InputFontLoader();

      loader.ensureBothLoaded('poppins', 'lxgw-wenkai');
      // ensureBothLoaded is fire-and-forget; flush the inline-load microtask chain.
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(document.head.querySelector('link[data-opencodian-font="poppins"]')).toBeTruthy();
      expect(document.head.querySelector('style[data-opencodian-font="lxgw-wenkai"]')).toBeTruthy();
    });

    it('isLoaded returns true for system and local fonts without injection', () => {
      const loader = new InputFontLoader();

      expect(loader.isLoaded('arial')).toBe(true);
      expect(loader.isLoaded('newsreader')).toBe(true);
      expect(createElementSpy).not.toHaveBeenCalled();
      expect(appendChildSpy).not.toHaveBeenCalled();
    });
  });
});
