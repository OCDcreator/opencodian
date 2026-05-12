# InputFontRegistry

> Source: `src/features/settings/InputFontRegistry.ts`

## Purpose

Curated font option registry and dynamic CDN loader for the input area (composer) font settings. Provides predefined English and Chinese font lists, CSS font-family resolution, and on-demand font stylesheet loading.

## Exports

| Export | Type | Purpose |
|---|---|---|
| `InputFontOption` | Interface | Font option definition (id, displayName, cssFamily, loadType, loadUrl) |
| `EN_FONT_OPTIONS` | `readonly InputFontOption[]` | 16 predefined English font options |
| `CN_FONT_OPTIONS` | `readonly InputFontOption[]` | 5 predefined Chinese font options |
| `CUSTOM_FONT_ID` | `string` | Sentinel `'__custom__'` for the custom dropdown option |
| `findFontOptionById(id)` | Function | Lookup a font option by id across both arrays |
| `resolveFontCssFamily(rawValue, options)` | Function | Resolve a settings value to a CSS font-family string |
| `resolveComposerFontFamily(en, cn)` | Function | Combine English + Chinese font settings into a single font-family value |
| `InputFontLoader` | Class | Dynamic CDN font loader — injects `<link>` elements on demand |

## Consumers

- `src/features/chat/chatAppearance.ts` — uses `resolveComposerFontFamily` and `InputFontLoader` to apply the font CSS variable
- `src/features/settings/SettingsStyleInputPanelSection.ts` — uses the option arrays and loader for the font dropdown UI

## Font Loading Strategy

- **system** fonts (Helvetica, Arial, Avenir): No loading needed, always available
- **google-fonts** (Poppins, Montserrat, Noto Sans SC): Loaded from Google Fonts CDN
- **cdn** fonts (Gotham, Futura, etc.): Loaded from cdnfonts.com or onlinewebfonts.com CDN
- **local** fonts (Microsoft YaHei, PingFang SC): Referenced by name, requires local installation

CJK fonts use unicode-range subsetting so only the character chunks actually rendered are downloaded.
