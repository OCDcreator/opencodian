# Plugin Update Settings Styles

> **源码**: `src/style/components/settings-plugin-update.css`
> **状态**: [REVIEW]
> **Updated**: 2026-07-28 — version management is one independent card with flat internal status and version-list groups.

## 概述

This component stylesheet styles the shared version-management section in both settings layouts. It is imported by `src/style/index.css` and emitted into the generated root `styles.css` during the normal build.

## Contract

- `.opencodian-plugin-update-section` is the one host-themed version-management card. It owns the border, radius, background, padding, and `12px` group rhythm for the title, status, release history, and local backups. In tabbed General > Basic, the content shell's `12px` sibling gap places it after the base-settings card; classic mode applies that same gap only to the adjacent General sibling pair.
- `.opencodian-plugin-update-panel` is a flat status group inside that card: version label + mono value, a pill state badge (`data-plugin-update-badge` variants: neutral `idle`/`empty`, pulsing accent dot `checking`, blue `update`, green `current`, red `error`), and actions behind a hairline separator.
- Check failures render as a tinted error notice (`.opencodian-plugin-update-status-detail.is-error`) with a bold label and a mono raw-error readout; other states use one muted detail line.
- Release and backup histories use flat compact rows with separators and hover feedback; the current-version badge is a neutral pill. They do not introduce a second card boundary inside the management card.
- The checking-state pulse and row hover transitions are disabled under `prefers-reduced-motion`.
- At widths up to 480px, each version row stacks its action below the identity text and gives that action full width.
