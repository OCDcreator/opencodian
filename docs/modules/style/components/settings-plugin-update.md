# Plugin Update Settings Styles

> **源码**: `src/style/components/settings-plugin-update.css`
> **状态**: [REVIEW]
> **Updated**: 2026-07-27 — status panel + badge variants replacing the plain summary/status text rows.
> **Updated**: 2026-07-27 — styles for the General version-management section.

## 概述

This component stylesheet styles the shared version-management section in both settings layouts. It is imported by `src/style/index.css` and emitted into the generated root `styles.css` during the normal build.

## Contract

- `.opencodian-plugin-update-section` provides a visually separated subsection without introducing another heavy settings card.
- `.opencodian-plugin-update-panel` is a flat Codex-card-style status surface: version label + mono value, a pill state badge (`data-plugin-update-badge` variants: neutral `idle`/`empty`, pulsing accent dot `checking`, blue `update`, green `current`, red `error`), and actions behind a hairline separator.
- Check failures render as a tinted error notice (`.opencodian-plugin-update-status-detail.is-error`) with a bold label and a mono raw-error readout; other states use one muted detail line.
- Release and backup histories use compact bordered rows with hover feedback; the current-version badge is a neutral pill.
- The checking-state pulse and row hover transitions are disabled under `prefers-reduced-motion`.
- At widths up to 480px, each version row stacks its action below the identity text and gives that action full width.

