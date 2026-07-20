# Model Provider Semantic Grouping Design

## Goal

Make a provider a recognizable, non-interactive model group and make each
model a clearly nested selectable leaf. The Model popover must retain the
shared shadcn-inspired Popover + Command frame without adding dependencies or
new card surfaces.

## Approved Direction

Each provider owns its identity once: an icon and a compact label in a sticky
group heading. Its models appear beneath as indented Command options. A model
must not repeat the provider icon. The existing shared 22px leading grid track
remains empty for model rows, preserving Command row geometry while creating a
visible parent-child relationship.

The group heading is a semantic `role="group"` label, not a selectable option.
It has an opaque `var(--background-primary)` sticky surface, but no full-width
tonal band or per-group separator. Hierarchy comes from icon ownership,
indentation, whitespace, and typography rather than from decorative lines.

## Constraints

- Preserve 280px Model scroll viewport, sticky coverage, 8px narrow-pane
  inset, search filtering, `aria-activedescendant`, roving highlight, Enter,
  Escape, selected checkmark, and focus restoration.
- Only model rows may have `role="option"`; provider groups use
  `role="group"` and `aria-labelledby` with a unique provider-label id.
- Keep the three popovers on the shared Command frame. Do not add shadcn,
  Radix, cmdk, Tailwind, assets, gradients, glass, colored rails, nested cards,
  or new abstractions.
- Use Obsidian theme variables in light and dark themes. Do not hardcode a
  palette.

## Acceptance Criteria

1. A provider logo appears once per rendered provider group, in its heading.
2. Model rows read as children through a stable leading empty slot and a
   smaller internal group rhythm, while retaining the common 32px Command row
   height and selected/checkmark behavior.
3. No provider heading uses a repeating full-width separator or tonal band.
4. Scrolling never exposes a model row above a sticky provider header.
5. Semantic group labels, keyboard navigation, filtering, and selection remain
   correct and covered by targeted tests.
