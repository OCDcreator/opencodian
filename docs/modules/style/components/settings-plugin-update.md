# Plugin Update Settings Styles

> **源码**: `src/style/components/settings-plugin-update.css`
> **状态**: [REVIEW]
> **Updated**: 2026-07-29 — version management is a default-collapsed disclosure with a full-width header, semantic focus states, and a 150ms reduced-motion-aware content transition.
> **Updated**: 2026-07-28 — version management is one independent card with flat internal status and version-list groups.

## 概述

This component stylesheet styles the shared version-management section in both settings layouts. It is imported by `src/style/index.css` and emitted into the generated root `styles.css` during the normal build.

## Contract

- `.opencodian-plugin-update-section` is the one host-themed version-management card. It owns the border, radius, and background; its header and expanded content each own their `16px` inset so the collapsed card has no empty trailing gap. In tabbed General > Basic, the content shell's `12px` sibling gap places it after the base-settings card; classic mode applies that same gap only to the adjacent General sibling pair.
- `.opencodian-plugin-update-heading-button` is the full-width native disclosure control inside `h4`; it owns hover/focus-visible treatment, title, installed-version metadata, status badge, and the Obsidian chevron icon. It explicitly restores `height: auto` so Obsidian's compact global button height cannot clip its two-row narrow layout. The badge uses the semantic `space-sm` token for its dot gap.
- `.opencodian-plugin-update-content` contains the description, flat status group, release history, and local backups through an overflow-clipped inner grid. It transitions `grid-template-rows`/opacity for `150ms` without a fixed-height ceiling; its closed state also removes the inner vertical padding and separator so it has zero visual height. It is `aria-hidden` + `inert` while closed and disables the transition under `prefers-reduced-motion`.
- `.opencodian-plugin-update-panel` remains a flat status group inside that content wrapper: detail line, error notice, and actions behind a hairline separator.
- Check failures render as a tinted error notice (`.opencodian-plugin-update-status-detail.is-error`) with a bold label and a mono raw-error readout; other states use one muted detail line.
- Release and backup histories use flat compact rows with separators and hover feedback; the current-version badge is a neutral pill. They do not introduce a second card boundary inside the management card.
- The checking-state pulse and row hover transitions are disabled under `prefers-reduced-motion`.
- At widths up to 480px, each version row stacks its action below the identity text and gives that action full width.
- At widths up to 720px, header metadata moves below the title while preserving the full-width click target.
