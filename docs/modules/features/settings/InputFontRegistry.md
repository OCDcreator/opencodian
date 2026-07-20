# InputFontRegistry

> Source: `src/features/settings/InputFontRegistry.ts`

## Purpose

Curated font option registry and dynamic CDN loader for the input area (composer) font settings. Provides a unified predefined font list, CSS font-family resolution, and on-demand font stylesheet loading. The default composer text face is the bundled local `newsreader` option so the input text has an independent elegant serif voice without relying on runtime network loading.

## Exports

| Export | Type | Purpose |
|---|---|---|
| `InputFontOption` | Interface | Font option definition (id, displayName, cssFamily, loadType, loadUrl) |
| `UNIFIED_FONT_OPTIONS` | `readonly InputFontOption[]` | Unified predefined font options used by both primary and CJK fallback dropdowns |
| `CUSTOM_FONT_ID` | `string` | Sentinel `'__custom__'` for the custom dropdown option |
| `findFontOptionById(id)` | Function | Lookup a font option by id across both arrays |
| `resolveFontCssFamily(rawValue, options)` | Function | Resolve a settings value to a CSS font-family string |
| `resolveComposerFontFamily(en, cn)` | Function | Combine primary + fallback font settings into a single deduped font-family value |
| `InputFontLoader` | Class | Dynamic CDN font loader — injects `<link>` elements on demand |

## Consumers

- `src/features/chat/chatAppearance.ts` — uses `resolveComposerFontFamily` and `InputFontLoader` to apply the font CSS variable
- `src/features/settings/SettingsStyleInputPanelSection.ts` — uses the option arrays and loader for the font dropdown UI

## Font Loading Strategy

- **system** fonts (Helvetica, Arial, Avenir): No loading needed, always available
- **local bundled** fonts (Newsreader): No `<link>` injection; `@font-face` is declared in `chat-assistant.css` and `dist/assets/fonts/newsreader/` is copied with plugin assets
- **google-fonts** (Poppins, Montserrat, Noto Sans SC): Loaded from Google Fonts CDN
- **cdn** fonts (Gotham, Futura, etc.): Loaded from cdnfonts.com or onlinewebfonts.com CDN
- **local** fonts (Microsoft YaHei, PingFang SC): Referenced by name, requires local installation

`resolveComposerFontFamily()` extracts the first concrete family from each selected option, dedupes repeated selections, and preserves a `serif` generic fallback for registered serif options such as `newsreader`; otherwise it falls back to `sans-serif`. CJK fonts use unicode-range subsetting so only the character chunks actually rendered are downloaded.
