# Settings Plugin Update Section

> **源码**: `src/features/settings/SettingsPluginUpdateSection.ts`
> **状态**: [REVIEW]
> **Updated**: 2026-07-29 — version management is a default-collapsed disclosure with a full-width accessible header, ephemeral expansion state, and inert content while closed.
> **Updated**: 2026-07-28 — version management now renders as one independent card with flat status, release, and backup groups.
> **Updated**: 2026-07-27 — added the shared General > Basic version-management section.

## 概述

`SettingsPluginUpdateSection` is the settings-side owner for OpenCodian version management. Both the classic General section and tabbed General > Basic route through this same class, keeping release state, local backups, confirmation prompts, and disabled states identical across layouts.

## UI contract

- Renders a full-width native button inside `h4`. The header contains the title, installed version, state badge (`data-plugin-update-badge`: `idle` / `checking` / `error` / `empty` / `update` / `current`), and the Obsidian `chevron-right` / `chevron-down` icon.
- The header exposes `aria-expanded` and `aria-controls`; the localized expand/collapse label is announced through `aria-label`. The content wrapper uses `aria-hidden` and `inert` while collapsed, and the header toggles this DOM state without rebuilding the settings page or moving focus.
- Keeps the description, flat status/actions, release history, and local backups inside `.opencodian-plugin-update-content`; the outer card remains the only card surface.
- Keeps the manual check action and explicit latest-stable action in a flat status group, separated by a hairline inside the one version-management card.
- Keeps the complete remote stable-release history and local three-file backups as flat groups using `data-plugin-update-list="releases"` and `data-plugin-update-list="backups"`, so their row separators never create nested cards.
- Keeps incompatible entries visible but disables their action and renders the service-supplied reason.
- Uses a confirmation dialog for every remote install and backup restore. A target older than the currently installed version uses downgrade-specific copy.
- Refreshes the owning settings shell immediately when a check/apply operation begins and once it settles. `data-plugin-update-applying` and disabled buttons expose the serialized in-progress state.
- Shows completion/failure notices only after the service operation settles; completion copy asks the user to reload the plugin or restart Obsidian.

## Boundaries

This class owns DOM composition and interaction only. It must not duplicate release validation, package writes, backup retention, source fallback, or persistence; those belong to `PluginUpdateService`. The settings shell owns the actual full-page redraw callback.
