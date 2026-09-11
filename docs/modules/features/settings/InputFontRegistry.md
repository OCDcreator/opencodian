# InputFontRegistry

> Source: `src/features/settings/InputFontRegistry.ts`

2026-09-11：修复 CDN 字体（霞鹜文楷、cdnfonts 系列）在 Obsidian 里加载失败的问题。Obsidian 渲染进程 CSP 只允许 `fonts.googleapis.com` 的外联样式表（`style-src 'unsafe-inline' 'self' https://fonts.googleapis.com`），其它主机的 `<link>` 会被拦截。`InputFontLoader` 现在按 origin 分流：Google Fonts 仍走 `<link>`；其余 CDN 改用 `requestUrl` 抓取 CSS 文本（不受渲染进程 CSP 约束），递归展平 `@import`（如 lxgw-wenkai 的 6 个子表）、把相对 `url(...)` 改写为绝对地址后注入内联 `<style>`（'unsafe-inline' 放行）。字体二进制不受 CSP `font-src` 限制，仍由浏览器按需直链下载。

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
| `InputFontLoader` | Class | Dynamic CDN font loader — `<link>` for CSP-allowed origins, `requestUrl` + inline `<style>` otherwise |

## Consumers

- `src/features/chat/chatAppearance.ts` — uses `resolveComposerFontFamily` and `InputFontLoader` to apply the font CSS variable
- `src/features/settings/SettingsStyleInputPanelSection.ts` — uses the option arrays and loader for the font dropdown UI

## Font Loading Strategy

- **system** fonts (Helvetica, Arial, Avenir): No loading needed, always available
- **local bundled** fonts (Newsreader): No `<link>` injection; `@font-face` is declared in `chat-assistant.css` and `dist/assets/fonts/newsreader/` is copied with plugin assets
- **google-fonts** (Poppins, Montserrat, Noto Sans SC): Loaded from Google Fonts CDN via `<link>` (origin is whitelisted by Obsidian's CSP)
- **cdn** fonts (Gotham, Futura, LXGW WenKai, etc.): Fetched with `requestUrl`, `@import`-flattened, URL-absolutized, injected as inline `<style>`; failures log a warning and leave the font unloadable-flagged so a later selection retries
- **local** fonts (Microsoft YaHei, PingFang SC): Referenced by name, requires local installation

`resolveComposerFontFamily()` extracts the first concrete family from each selected option, dedupes repeated selections, and preserves a `serif` generic fallback for registered serif options such as `newsreader`; otherwise it falls back to `sans-serif`. CJK fonts use unicode-range subsetting so only the character chunks actually rendered are downloaded.
