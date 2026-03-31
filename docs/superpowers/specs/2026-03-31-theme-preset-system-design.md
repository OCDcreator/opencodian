# Theme Preset System Design

Date: 2026-03-31
Status: Draft
Author: Claude + User

## Overview

Add a theme preset system to OpenCodian's settings that allows users to quickly switch between different visual styles and color schemes for the chat interface, while preserving the ability to fine-tune individual appearance settings.

## Goals

1. Provide quick theme switching with distinct visual styles (glassmorphism, flat, soft, sharp)
2. Offer color scheme variants within each style
3. Preserve existing fine-grained appearance controls as post-preset customization
4. Integrate seamlessly with Obsidian's theme system (dark/light mode)

## Non-Goals

- Creating a theme editor/creator UI
- Supporting user-imported custom themes
- Theming beyond the chat interface (e.g., settings panel itself)

## Design

### Preset Structure

#### Visual Styles (4)

| Style | CSS Class | Characteristics |
|-------|-----------|-----------------|
| Glass | `opencodian-theme-glass` | Glassmorphism, blur, subtle shadows (current default) |
| Flat | `opencodian-theme-flat` | No blur/shadows, solid colors, minimal depth |
| Soft | `opencodian-theme-soft` | Large radius, soft shadows, low contrast, gentle feel |
| Sharp | `opencodian-theme-sharp` | Small radius, hard edges, high contrast, technical feel |

#### Color Schemes (2-3 per style)

| Style | Variants |
|-------|----------|
| Glass | Default (violet), Warm (amber/orange), Mint (teal/green) |
| Flat | Default (slate), Ocean (deep blue), Rose (pink/coral) |
| Soft | Default (neutral), Lavender (purple), Latte (warm brown) |
| Sharp | Default (graphite), Neon (cyan/magenta), Graphite (dark gray) |

### Data Model

```typescript
// src/core/types/theme.ts

/** Style class identifiers */
export type ThemeStyleClass = 'glass' | 'flat' | 'soft' | 'sharp';

/** Color scheme variable mappings */
export interface ThemeColorVars {
  '--opencodian-accent': string;
  '--opencodian-accent-soft': string;
  '--opencodian-surface-tint': string;
  '--opencodian-glow': string;
}

/** Complete theme preset definition */
export interface ThemePreset {
  id: string;                      // e.g., 'glass-warm', 'flat-ocean'
  name: string;                    // Display name
  styleClass: ThemeStyleClass;     // Top-level CSS class
  colorVars: ThemeColorVars;       // Color CSS variables
  baseAppearance: AppearanceSettings; // Base appearance values
}

/** User's theme settings stored in plugin settings */
export interface ThemeSettings {
  activePresetId: string | null;   // null = fully custom (no preset)
  customOverrides: Partial<AppearanceSettings>; // User's fine-tuned values
}
```

### Storage Strategy

Add `theme` field to settings, parallel to existing `appearance`:

```typescript
export interface OpenCodianSettings {
  // ... existing fields
  appearance: AppearanceSettings;  // Current fine-grained settings
  theme: ThemeSettings;            // NEW: preset + overrides
}
```

### UI Layout

Location: Settings > Style (top section)

```
┌─ 预设主题 ──────────────────────────────┐
│                                          │
│  风格：                                   │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────┐│
│  │ 玻璃   │ │ 扁平   │ │ 柔和   │ │锐利││
│  │   ✓    │ │        │ │        │ │    ││
│  └────────┘ └────────┘ └────────┘ └────┘│
│                                          │
│  配色：                                   │
│  ○ 默认   ● 暖橙   ○ 薄荷              │
│                                          │
│  [重置为预设默认]                         │
└──────────────────────────────────────────┘

┌─ 细粒度微调 ─────────────────────────────┐
│  (Existing sliders and controls)         │
│  ...                                     │
└──────────────────────────────────────────┘
```

### Interaction Flow

1. **Style Selection**: Click style card → applies `styleClass` + resets `customOverrides`
2. **Color Selection**: Click color dot → applies `colorVars`, preserves overrides
3. **Fine-tuning**: Adjust slider → writes to `customOverrides`, keeps preset reference
4. **Reset**: "Reset to preset" button → clears `customOverrides`, restores pure preset

### Application Mechanism

```
User selects preset
    │
    ▼
┌─────────────────────────────────────┐
│ 1. Set top-level class              │
│    container.setClass('opencodian-theme-{styleClass}')
├─────────────────────────────────────┤
│ 2. Apply color CSS variables        │
│    container.style.setProperty(var, value)
├─────────────────────────────────────┤
│ 3. Merge appearance settings        │
│    final = baseAppearance ∪ customOverrides
├─────────────────────────────────────┤
│ 4. Apply via existing mechanism     │
│    applyStyles(final)               │
└─────────────────────────────────────┘
```

### CSS Architecture

```css
/* Base variables (already exist) */
:root {
  --opencodian-accent: ...;
  --opencodian-surface: ...;
  /* ... */
}

/* Style class overrides */
.opencodian-theme-glass {
  --opencodian-blur-amount: 12px;
  --opencodian-shadow-style: soft;
}

.opencodian-theme-flat {
  --opencodian-blur-amount: 0;
  --opencodian-shadow-style: none;
}

.opencodian-theme-soft {
  --opencodian-blur-amount: 8px;
  --opencodian-radius-multiplier: 1.5;
}

.opencodian-theme-sharp {
  --opencodian-blur-amount: 4px;
  --opencodian-radius-multiplier: 0.5;
}
```

## Implementation Plan

(To be generated by writing-plans skill)

## Open Questions

None at this time.

## Future Considerations

- User-created presets via export/import
- Community theme sharing
- Per-conversation theme override
