# Settings Plugin Update Section

> **源码**: `src/features/settings/SettingsPluginUpdateSection.ts`
> **状态**: [REVIEW]
> **Updated**: 2026-07-27 — restructured the summary into a status panel: version label/value block, short state badge (`data-plugin-update-badge`), structured error notice, and panel-internal actions.
> **Updated**: 2026-07-27 — added the shared General > Basic version-management section.

## 概述

`SettingsPluginUpdateSection` is the settings-side owner for OpenCodian version management. Both the classic General section and tabbed General > Basic route through this same class, keeping release state, local backups, confirmation prompts, and disabled states identical across layouts.

## UI contract

- Shows the installed version as a label + mono value block next to a short state badge (`data-plugin-update-badge`: `idle` / `checking` / `error` / `empty` / `update` / `current`), plus a detail line for idle/checking/ready and a structured error notice (bold label + mono raw error) for failures.
- Keeps the manual check action and an explicit latest-stable action inside the status panel, separated by a hairline.
- Separates the complete remote stable-release history from local three-file backups using `data-plugin-update-list="releases"` and `data-plugin-update-list="backups"`.
- Keeps incompatible entries visible but disables their action and renders the service-supplied reason.
- Uses a confirmation dialog for every remote install and backup restore. A target older than the currently installed version uses downgrade-specific copy.
- Refreshes the owning settings shell immediately when a check/apply operation begins and once it settles. `data-plugin-update-applying` and disabled buttons expose the serialized in-progress state.
- Shows completion/failure notices only after the service operation settles; completion copy asks the user to reload the plugin or restart Obsidian.

## Boundaries

This class owns DOM composition and interaction only. It must not duplicate release validation, package writes, backup retention, source fallback, or persistence; those belong to `PluginUpdateService`. The settings shell owns the actual full-page redraw callback.

