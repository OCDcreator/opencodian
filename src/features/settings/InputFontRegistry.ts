/**
 * Input area font registry — categorized font lists and dynamic CDN loader
 * for the composer input area font settings.
 */

export type FontCategory =
  | 'system'
  | 'serif'
  | 'sans-serif'
  | 'display'
  | 'cjk';

export interface InputFontOption {
  /** Unique identifier stored in settings. */
  id: string;
  /** Display name shown in UI dropdown. */
  displayName: string;
  /** CSS font-family value (may be comma-separated fallback stack). */
  cssFamily: string;
  /** How this font is loaded. */
  loadType: 'system' | 'google-fonts' | 'cdn' | 'local';
  /** URL for @import/<link> when loadType is google-fonts or cdn. */
  loadUrl?: string;
  /** UI category for grouping in the dropdown. */
  category: FontCategory;
}

// ── Category definitions (used to label dropdown groups) ────────

export const FONT_CATEGORY_ORDER: readonly FontCategory[] = [
  'system',
  'serif',
  'sans-serif',
  'display',
  'cjk',
];

export const FONT_CATEGORY_LABELS: Record<FontCategory, string> = {
  system: 'settings.style.input.font.category.system',
  serif: 'settings.style.input.font.category.serif',
  'sans-serif': 'settings.style.input.font.category.sans-serif',
  display: 'settings.style.input.font.category.display',
  cjk: 'settings.style.input.font.category.cjk',
};

// ── Font definitions ────────────────────────────────────────────

const INHERIT_OPTION: InputFontOption = {
  id: 'inherit',
  displayName: 'Obsidian 默认',
  cssFamily: '',
  loadType: 'system',
  category: 'system',
};

const FONT_DEFINITIONS: readonly InputFontOption[] = [
  // ── System ──────────────────────────────
  INHERIT_OPTION,
  {
    id: 'helvetica',
    displayName: 'Helvetica',
    cssFamily: "'Helvetica Neue', Helvetica, sans-serif",
    loadType: 'system',
    category: 'system',
  },
  {
    id: 'arial',
    displayName: 'Arial',
    cssFamily: 'Arial, Helvetica, sans-serif',
    loadType: 'system',
    category: 'system',
  },
  {
    id: 'avenir',
    displayName: 'Avenir',
    cssFamily: "Avenir, 'Avenir Next', sans-serif",
    loadType: 'system',
    category: 'system',
  },

  // ── Serif / 衬线体 ──────────────────────
  {
    id: 'newsreader',
    displayName: 'Newsreader',
    cssFamily: "'OpenCodian Newsreader', 'Newsreader', serif",
    loadType: 'local',
    category: 'serif',
  },
  {
    id: 'cormorant-garamond',
    displayName: 'Cormorant Garamond',
    cssFamily: "'Cormorant Garamond', serif",
    loadType: 'google-fonts',
    loadUrl: 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&display=swap',
    category: 'serif',
  },
  {
    id: 'libre-baskerville',
    displayName: 'Libre Baskerville',
    cssFamily: "'Libre Baskerville', serif",
    loadType: 'google-fonts',
    loadUrl: 'https://fonts.googleapis.com/css2?family=Libre+Baskerville:wght@400;700&display=swap',
    category: 'serif',
  },

  // ── Sans-serif / 无衬线体 ───────────────
  {
    id: 'syne',
    displayName: 'Syne',
    cssFamily: "'Syne', sans-serif",
    loadType: 'google-fonts',
    loadUrl: 'https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&display=swap',
    category: 'sans-serif',
  },
  {
    id: 'inter',
    displayName: 'Inter',
    cssFamily: "'Inter', sans-serif",
    loadType: 'google-fonts',
    loadUrl: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
    category: 'sans-serif',
  },
  {
    id: 'poppins',
    displayName: 'Poppins',
    cssFamily: "'Poppins', sans-serif",
    loadType: 'google-fonts',
    loadUrl: 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap',
    category: 'sans-serif',
  },
  {
    id: 'montserrat',
    displayName: 'Montserrat',
    cssFamily: "'Montserrat', sans-serif",
    loadType: 'google-fonts',
    loadUrl: 'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap',
    category: 'sans-serif',
  },

  // ── Display / 艺术字体 ──────────────────
  {
    id: 'gotham',
    displayName: 'Gotham',
    cssFamily: "'Gotham', sans-serif",
    loadType: 'cdn',
    loadUrl: 'https://fonts.cdnfonts.com/css/gotham-9',
    category: 'display',
  },
  {
    id: 'futura',
    displayName: 'Futura',
    cssFamily: "'Futura Std', Futura, 'Century Gothic', sans-serif",
    loadType: 'cdn',
    loadUrl: 'https://fonts.cdnfonts.com/css/futura-std-4',
    category: 'display',
  },
  {
    id: 'avant-garde',
    displayName: 'Avant Garde',
    cssFamily: "'AvantGarde Md BT', 'ITC Avant Garde Gothic', sans-serif",
    loadType: 'cdn',
    loadUrl: 'https://fonts.cdnfonts.com/css/avantgarde-md-bt',
    category: 'display',
  },
  {
    id: 'univers',
    displayName: 'Univers',
    cssFamily: "'Univers', sans-serif",
    loadType: 'cdn',
    loadUrl: 'https://fonts.cdnfonts.com/css/univers',
    category: 'display',
  },
  {
    id: 'myriad',
    displayName: 'Myriad Pro',
    cssFamily: "'Myriad Pro', sans-serif",
    loadType: 'cdn',
    loadUrl: 'https://fonts.cdnfonts.com/css/myriad-pro',
    category: 'display',
  },
  {
    id: 'nandia',
    displayName: 'Nandia',
    cssFamily: "'Nandia', sans-serif",
    loadType: 'cdn',
    loadUrl: 'https://fonts.cdnfonts.com/css/nandia',
    category: 'display',
  },
  {
    id: 'dinpro',
    displayName: 'DINPro',
    cssFamily: "'DINPro', 'DIN Alternate', sans-serif",
    loadType: 'cdn',
    loadUrl: 'https://fonts.cdnfonts.com/css/dinpro-medium',
    category: 'display',
  },
  {
    id: '077-cai978',
    displayName: '077-CAI978',
    cssFamily: "'F077-CAI978', '077-CAI978', sans-serif",
    loadType: 'cdn',
    loadUrl: 'https://db.onlinewebfonts.com/c/2bc816bbd43e0e6e79595a107ac7e1c5?family=F077-CAI978',
    category: 'display',
  },
  {
    id: 'zurich-black',
    displayName: 'Zurich Black',
    cssFamily: "'Zurich Black BT', 'Zurich Black', sans-serif",
    loadType: 'cdn',
    loadUrl: 'https://db.onlinewebfonts.com/c/16ca90abfc0f2d747bead6b1b4dff782?family=Zurich+Black+BT',
    category: 'display',
  },
  {
    id: 'diskoteque',
    displayName: 'Diskoteque',
    cssFamily: "'Diskoteque', sans-serif",
    loadType: 'cdn',
    loadUrl: 'https://fonts.cdnfonts.com/css/diskoteque',
    category: 'display',
  },

  // ── CJK / 中日韩 ────────────────────────
  {
    id: 'lxgw-wenkai',
    displayName: '霞鹜文楷',
    cssFamily: "'LXGW WenKai', sans-serif",
    loadType: 'cdn',
    loadUrl: 'https://cdn.jsdelivr.net/npm/lxgw-wenkai-webfont@1.1.0/style.css',
    category: 'cjk',
  },
  {
    id: 'noto-sans-sc',
    displayName: '思源黑体',
    cssFamily: "'Noto Sans SC', 'Source Han Sans SC', sans-serif",
    loadType: 'google-fonts',
    loadUrl: 'https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;600;700&display=swap',
    category: 'cjk',
  },
  {
    id: 'microsoft-yahei',
    displayName: '微软雅黑',
    cssFamily: "'Microsoft YaHei', sans-serif",
    loadType: 'local',
    category: 'cjk',
  },
  {
    id: 'pingfang-sc',
    displayName: '苹方',
    cssFamily: "'PingFang SC', sans-serif",
    loadType: 'local',
    category: 'cjk',
  },
];

// ── Legacy exports (backward compat) ────────────────────────────

/** @deprecated Use UNIFIED_FONT_OPTIONS or FONT_DEFINITIONS instead. */
export const EN_FONT_OPTIONS: readonly InputFontOption[] = FONT_DEFINITIONS.filter(
  o => o.category !== 'cjk',
);

/** @deprecated Use UNIFIED_FONT_OPTIONS or FONT_DEFINITIONS instead. */
export const CN_FONT_OPTIONS: readonly InputFontOption[] = [
  INHERIT_OPTION,
  ...FONT_DEFINITIONS.filter(o => o.category === 'cjk'),
];

// ── Unified list & lookup ───────────────────────────────────────

// Sentinel id for the "custom" dropdown option.
export const CUSTOM_FONT_ID = '__custom__';

/** All font options in definition order (for lookup). */
const ALL_FONT_OPTIONS = FONT_DEFINITIONS;

/**
 * Unified font list for UI dropdowns.
 * Both "Primary" and "CJK fallback" dropdowns use this list so users can
 * pick any font for either role.
 */
export const UNIFIED_FONT_OPTIONS: readonly InputFontOption[] = FONT_DEFINITIONS;

/**
 * Find a font option by id. Returns undefined if not found.
 */
export function findFontOptionById(id: string): InputFontOption | undefined {
  return ALL_FONT_OPTIONS.find(o => o.id === id);
}

/**
 * Resolve the raw settings value (an id or custom string) to a CSS font-family value.
 * Returns empty string for inherit/unknown.
 */
export function resolveFontCssFamily(
  rawValue: string,
  options: readonly InputFontOption[],
): string {
  if (!rawValue) return '';
  const match = options.find(o => o.id === rawValue);
  if (match) return match.cssFamily;
  // If no match, treat rawValue as a custom font-family string.
  return rawValue;
}

/**
 * Extract the primary font-family name from a cssFamily string.
 * Takes only the first font name (before any comma/fallback), preserving quotes.
 * For example "'Poppins', sans-serif" → "'Poppins'".
 */
function extractPrimaryFontName(cssFamily: string): string {
  const trimmed = cssFamily.trim();
  if (!trimmed) return '';
  // Match a quoted name like 'Poppins' or "Poppins", or a bare name like Helvetica
  const match = trimmed.match(/^(['"]).+?\1|^[^,]+/);
  return match ? match[0].trim() : trimmed.split(',')[0].trim();
}

function resolveGenericFallback(primaryFontId: string, fallbackFontId: string): 'serif' | 'sans-serif' {
  const primaryOption = findFontOptionById(primaryFontId) ?? findFontOptionById(fallbackFontId);
  if (primaryOption?.category === 'serif' && primaryOption.cssFamily.includes('serif')) {
    return 'serif';
  }
  return 'sans-serif';
}

/**
 * Combine primary and CJK fallback font settings into a single CSS font-family value.
 * Returns empty string when both are inherit (no override needed).
 *
 * IMPORTANT: We extract only the primary font name from each selection and
 * build a single ordered stack with one trailing `sans-serif`.  If we naively
 * concatenate the per-font cssFamily values (which each include `, sans-serif`),
 * the first `sans-serif` fallback would match all characters — including CJK —
 * and prevent the CJK font from ever being selected.
 */
export function resolveComposerFontFamily(
  enFontFamily: string,
  cnFontFamily: string,
): string {
  const enCss = resolveFontCssFamily(enFontFamily, ALL_FONT_OPTIONS);
  const cnCss = resolveFontCssFamily(cnFontFamily, ALL_FONT_OPTIONS);
  const parts: string[] = [];
  const appendUnique = (fontName: string): void => {
    if (fontName && !parts.includes(fontName)) {
      parts.push(fontName);
    }
  };
  appendUnique(extractPrimaryFontName(enCss));
  appendUnique(extractPrimaryFontName(cnCss));
  if (parts.length === 0) return '';
  const fallback = resolveGenericFallback(enFontFamily, cnFontFamily);
  return parts.join(', ') + `, ${fallback}`;
}

// ── Dynamic Font Loader ─────────────────────────────────────────

/**
 * Loads font CSS on-demand by injecting <link> elements into the document head.
 * Each font is loaded at most once per session.
 */
export class InputFontLoader {
  private loaded = new Set<string>();

  /**
   * Ensure a font's CDN stylesheet is loaded.
   * No-op for system/local fonts or already-loaded fonts.
   */
  ensureLoaded(fontId: string): void {
    if (this.loaded.has(fontId)) return;

    const option = ALL_FONT_OPTIONS.find(o => o.id === fontId);
    if (!option || !option.loadUrl) return;

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = option.loadUrl;
    link.setAttribute('data-opencodian-font', fontId);
    document.head.appendChild(link);

    this.loaded.add(fontId);
  }

  /**
   * Ensure both selected fonts are loaded.
   */
  ensureBothLoaded(enFontFamily: string, cnFontFamily: string): void {
    this.ensureLoaded(enFontFamily);
    this.ensureLoaded(cnFontFamily);
  }

  /**
   * Check if a font has been loaded (or is system/local, which needs no loading).
   */
  isLoaded(fontId: string): boolean {
    const option = ALL_FONT_OPTIONS.find(o => o.id === fontId);
    if (!option || option.loadType === 'system' || option.loadType === 'local') return true;
    return this.loaded.has(fontId);
  }
}
