import {
  InputFontLoader,
  UNIFIED_FONT_OPTIONS,
  findFontOptionById,
  resolveComposerFontFamily,
  resolveFontCssFamily,
} from '../../../../src/features/settings/InputFontRegistry';

describe('InputFontRegistry', () => {
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
  });

  describe('resolveComposerFontFamily', () => {
    it('returns empty string when both en and cn are empty or inherit', () => {
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

    it('same font in both slots deduplicates', () => {
      // Same font in both slots should still produce valid output
      expect(resolveComposerFontFamily('poppins', 'poppins')).toBe(
        "'Poppins', 'Poppins', sans-serif",
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

      loader.ensureLoaded('microsoft-yahei');

      expect(createElementSpy).not.toHaveBeenCalled();
      expect(appendChildSpy).not.toHaveBeenCalled();
    });

    it('ensureLoaded injects a link element for CDN fonts', () => {
      const loader = new InputFontLoader();

      loader.ensureLoaded('gotham');

      const linkEl = document.head.querySelector<HTMLLinkElement>('link[data-opencodian-font="gotham"]');
      expect(createElementSpy).toHaveBeenCalledWith('link');
      expect(appendChildSpy).toHaveBeenCalledTimes(1);
      expect(linkEl?.rel).toBe('stylesheet');
      expect(linkEl?.href).toBe('https://fonts.cdnfonts.com/css/gotham-9');
    });

    it('ensureLoaded only injects once per font id', () => {
      const loader = new InputFontLoader();

      loader.ensureLoaded('gotham');
      loader.ensureLoaded('gotham');

      expect(appendChildSpy).toHaveBeenCalledTimes(1);
      expect(document.head.querySelectorAll('link[data-opencodian-font="gotham"]')).toHaveLength(1);
    });

    it('ensureBothLoaded loads both en and cn fonts', () => {
      const loader = new InputFontLoader();

      loader.ensureBothLoaded('poppins', 'lxgw-wenkai');

      expect(appendChildSpy).toHaveBeenCalledTimes(2);
      expect(document.head.querySelector('link[data-opencodian-font="poppins"]')).toBeTruthy();
      expect(document.head.querySelector('link[data-opencodian-font="lxgw-wenkai"]')).toBeTruthy();
    });

    it('isLoaded returns true for system and local fonts without injection', () => {
      const loader = new InputFontLoader();

      expect(loader.isLoaded('arial')).toBe(true);
      expect(loader.isLoaded('microsoft-yahei')).toBe(true);
      expect(createElementSpy).not.toHaveBeenCalled();
      expect(appendChildSpy).not.toHaveBeenCalled();
    });
  });
});
