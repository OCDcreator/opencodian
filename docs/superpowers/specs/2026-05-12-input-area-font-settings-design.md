# Input Area Font Settings

## Summary

Add configurable English and Chinese font settings to the input area style section, allowing users to choose from a curated list of artistic/system fonts or enter custom font names. Fonts load on-demand via CDN so users do not need local installations.

## Motivation

The input area (composer) currently inherits Obsidian's default font for all text: toolbar labels (agent name, model name, thinking intensity), user input, and placeholder text. Users want to personalize the input area with artistic or distinctive fonts, especially for the English text in model names and thinking intensity labels, while keeping appropriate Chinese font rendering.

## Design

### Data Model

Add two fields to `ChatAppearanceInputSettings` in `src/core/types/settings.ts`:

```typescript
export interface ChatAppearanceInputSettings {
  // ... existing fields ...
  enFontFamily: string;  // English font identifier, default '' (inherit Obsidian default)
  cnFontFamily: string;  // Chinese font identifier, default '' (inherit Obsidian default)
}
```

- Default: `''` (empty string) — means "inherit Obsidian default", no font override applied.
- Stored value is the font's **id** from the predefined list, or a raw font-family string for custom input.

### Predefined Font Registry

A constant array `INPUT_FONT_OPTIONS` defines the curated list. Each entry:

```typescript
interface InputFontOption {
  id: string;           // unique identifier, stored in settings
  displayName: string;  // shown in UI (locale key or raw string)
  cssFamily: string;    // CSS font-family value (may be comma-separated fallback stack)
  loadType: 'system' | 'google-fonts' | 'cdn';
  loadUrl?: string;     // @import URL for google-fonts/cdn fonts
}
```

#### English Fonts

| id | Display Name | CSS font-family | Load Type | Load URL |
|---|---|---|---|---|
| `inherit` | Obsidian 默认 | _(empty)_ | system | — |
| `helvetica` | Helvetica | `'Helvetica Neue', Helvetica, sans-serif` | system | — |
| `arial` | Arial | `Arial, Helvetica, sans-serif` | system | — |
| `avenir` | Avenir | `Avenir, 'Avenir Next', sans-serif` | system | — |
| `poppins` | Poppins | `'Poppins', sans-serif` | google-fonts | `https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap` |
| `montserrat` | Montserrat | `'Montserrat', sans-serif` | google-fonts | `https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap` |
| `gotham` | Gotham | `'Gotham', sans-serif` | cdn | `https://fonts.cdnfonts.com/css/gotham-9` |
| `futura` | Futura | `'Futura Std', Futura, 'Century Gothic', sans-serif` | cdn | `https://fonts.cdnfonts.com/css/futura-std-4` |
| `avant-garde` | Avant Garde | `'AvantGarde Md BT', 'ITC Avant Garde Gothic', sans-serif` | cdn | `https://fonts.cdnfonts.com/css/avantgarde-md-bt` |
| `univers` | Univers | `'Univers', sans-serif` | cdn | `https://fonts.cdnfonts.com/css/univers` |
| `myriad` | Myriad Pro | `'Myriad Pro', sans-serif` | cdn | `https://fonts.cdnfonts.com/css/myriad-pro` |
| `nandia` | Nandia | `'Nandia', sans-serif` | cdn | `https://fonts.cdnfonts.com/css/nandia` |
| `dinpro` | DINPro | `'DINPro', 'DIN Alternate', sans-serif` | cdn | `https://fonts.cdnfonts.com/css/dinpro-medium` |
| `077-cai978` | 077-CAI978 | `'F077-CAI978', '077-CAI978', sans-serif` | cdn | `https://db.onlinewebfonts.com/c/2bc816bbd43e0e6e79595a107ac7e1c5?family=F077-CAI978` |
| `zurich-black` | Zurich Black | `'Zurich Black BT', 'Zurich Black', sans-serif` | cdn | `https://db.onlinewebfonts.com/c/16ca90abfc0f2d747bead6b1b4dff782?family=Zurich+Black+BT` |
| `diskoteque` | Diskoteque | `'Diskoteque', sans-serif` | cdn | `https://fonts.cdnfonts.com/css/diskoteque` |
| `custom` | 自定义… | _(user input)_ | local | — |

#### Chinese Fonts

| id | Display Name | CSS font-family | Load Type | Load URL |
|---|---|---|---|---|
| `inherit` | Obsidian 默认 | _(empty)_ | system | — |
| `lxgw-wenkai` | 霞鹜文楷 | `'LXGW WenKai', sans-serif` | google-fonts | `https://cdn.jsdelivr.net/npm/lxgw-wenkai-webfont@1.1.0/style.css` |
| `noto-sans-sc` | 思源黑体 | `'Noto Sans SC', 'Source Han Sans SC', sans-serif` | google-fonts | `https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;600;700&display=swap` |
| `microsoft-yahei` | 微软雅黑 | `'Microsoft YaHei', sans-serif` | local | — (Windows system font, proprietary) |
| `pingfang-sc` | 苹方 | `'PingFang SC', sans-serif` | local | — (macOS system font, proprietary) |
| `custom` | 自定义… | _(user input)_ | local | — |

**Remote-loadable CJK fonts** (霞鹜文楷, 思源黑体) use unicode-range subsetting — only the character chunks actually rendered get downloaded. For our use case (short labels), actual transfer is typically under 100 KB despite the full font being 10–20 MB.

**Local-only CJK fonts** (微软雅黑, 苹方) are proprietary system fonts with no legal CDN distribution. They rely on the user having them installed. On their native platform (Windows/macOS), they are always available. The UI will indicate platform availability.

### CSS Variable Application

In `src/features/chat/chatAppearance.ts`, compute the combined font-family:

```typescript
function resolveComposerFontFamily(input: ChatAppearanceInputSettings): string {
  const parts: string[] = [];
  const enOption = EN_FONT_OPTIONS.find(o => o.id === input.enFontFamily);
  const cnOption = CN_FONT_OPTIONS.find(o => o.id === input.cnFontFamily);
  if (enOption?.cssFamily) parts.push(enOption.cssFamily);
  if (cnOption?.cssFamily) parts.push(cnOption.cssFamily);
  if (parts.length === 0) return '';
  return parts.join(', ');
}
```

Set as CSS variable `--opencodian-composer-font-family` on `.opencodian-container`.

Apply in CSS:

```css
.opencodian-input-area {
  font-family: var(--opencodian-composer-font-family, inherit);
}
```

This cascades to the entire composer: toolbar controls, textarea, placeholder, highlight backdrop.

### Dynamic Font Loading

A new utility `src/features/settings/InputFontLoader.ts`:

1. Maintains a `Set<string>` of already-loaded font ids.
2. On font selection change, checks if the font needs CDN loading.
3. If yes and not yet loaded, dynamically creates a `<link rel="stylesheet">` or `<style @import>` element in the document `<head>`.
4. Font loads asynchronously — no UI blocking. The CSS fallback (`sans-serif`) renders immediately, then the real font replaces it once loaded.

```typescript
class InputFontLoader {
  private loaded = new Set<string>();

  async ensureLoaded(fontId: string): Promise<void> {
    if (this.loaded.has(fontId)) return;
    const option = [...EN_FONT_OPTIONS, ...CN_FONT_OPTIONS].find(o => o.id === fontId);
    if (!option || !option.loadUrl) return;
    // Add <link> to <head>
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = option.loadUrl;
    document.head.appendChild(link);
    this.loaded.add(fontId);
  }
}
```

### Settings UI

In `src/features/settings/SettingsStyleInputPanelSection.ts`, add a new "字体" (Font) subgroup with two controls:

**Each control is a dropdown** with:
1. Predefined options (each rendered in its own font for visual preview)
2. "自定义…" option at the bottom
3. When "自定义…" selected, a text input appears below for manual font-family entry
4. Real-time preview: the dropdown items themselves and the input area text update immediately

The dropdown reuses the existing `SettingsDropdown` pattern from the codebase.

### Locale Keys

Add to `src/i18n/locales/en.ts` and `zh.ts`:

```
settings.style.input.fontGroup.name    → 输入区字体 / Input Area Font
settings.style.input.enFont.name       → 英文字体 / English Font
settings.style.input.enFont.desc       → 输入区英文文字使用的字体 / Font for English text in input area
settings.style.input.cnFont.name       → 中文字体 / Chinese Font
settings.style.input.cnFont.desc       → 输入区中文文字使用的字体 / Font for Chinese text in input area
settings.style.input.font.custom       → 自定义… / Custom…
settings.style.input.font.customDesc   → 输入本地安装的字体名称 / Enter a locally installed font name
settings.style.input.font.inherit      → Obsidian 默认 / Obsidian Default
```

### Normalization

In `normalizeChatAppearanceSettings()`:
- `enFontFamily`: trim whitespace, clamp to max 200 chars, validate against predefined ids or allow any non-empty custom string.
- `cnFontFamily`: same treatment.
- Invalid/unknown values fall back to `''` (inherit).

### File Changes Summary

| File | Change |
|---|---|
| `src/core/types/settings.ts` | Add `enFontFamily`, `cnFontFamily` to `ChatAppearanceInputSettings`; add defaults; add normalization |
| `src/features/settings/InputFontRegistry.ts` | **New file** — predefined font option arrays + `InputFontLoader` class |
| `src/features/settings/SettingsStyleInputPanelSection.ts` | Add font subgroup with two dropdown controls |
| `src/features/chat/chatAppearance.ts` | Add `--opencodian-composer-font-family` CSS variable mapping |
| `src/style/base/core.css` | Add `--opencodian-composer-font-family` default + apply rule |
| `src/i18n/locales/en.ts` | Add font-related locale keys |
| `src/i18n/locales/zh.ts` | Add font-related locale keys |
| `src/main.ts` | Trigger `InputFontLoader.ensureLoaded()` on settings load/change |

### Edge Cases

- **Offline / CDN unreachable**: Font CSS `<link>` silently fails. Fallback `sans-serif` renders instead. No error thrown.
- **Obsidian Default selected**: No CSS variable override. Input area uses Obsidian's inherited font.
- **Both English and Chinese set to custom**: Both custom strings are used in the combined font-family stack.
- **Custom input with invalid font name**: CSS silently falls back to `sans-serif`. User sees the fallback immediately in the preview.
- **Theme preset change**: Font settings are independent of theme presets (like existing font-size/font-weight). Preset switch does not reset font choices.

### What This Does NOT Include

- Font size or weight per font (those remain controlled by existing sliders).
- Per-conversation font overrides (only global settings).
- Font preview thumbnails in the dropdown (only live text rendering).
- Bundled font files (all remote-loaded or local-only).
