# AdditionalDirectoriesConfigBadgeCoordinator

**File:** `src/features/chat/services/AdditionalDirectoriesConfigBadgeCoordinator.ts`
**Owner:** chat-toolbar
**Stability:** stable
**User surface:** chat (read-only badge)
**Proof state:** readback

## Summary

Read-only Claude Code `additionalDirectories` badge for the chat input toolbar. It appears only when the active backend is Claude Code and the saved Claude settings contain at least one non-empty additional directory. The badge shows the configured directory count and a tooltip listing requested paths.

This is a product surface for user awareness, not a behavior proof. It reflects the plugin setting that is wired into SDK options, while actual resolved directory access remains opaque inside the Claude Code SDK/CLI subprocess.

## Responsibilities

- Read `backendSettings.claudeCode.additionalDirectories` from the live plugin settings.
- Filter empty entries and render a compact configured-scope badge.
- Keep tooltip copy explicit about lifecycle and readback boundaries.
- Attach tooltip copy through the shared `.opencodian-tooltip-trigger[data-tooltip]` overlay, not a native `title`, so the badge has only one hover tooltip.
- Remove the badge when settings become empty or malformed.

## Dependencies

- Obsidian `setIcon` for the `folder-plus` icon.
- `t()` i18n keys under `settings.claudeCode.additionalDirectories.chatBadge.*`.
- `TooltipLayerController` for the body-level shared tooltip overlay.
- `ChatSelectionControlsCoordinator` owns backend gating and mount/update/destroy timing.

## Lifecycle

- Mounted by `ChatSelectionControlsCoordinator` only while the active backend is `claude-code`.
- Updated on toolbar build, permission-display refresh, and locale refresh.
- Hidden when `additionalDirectories` has no non-empty entries.
- Changes apply to the next Claude Code query or a restarted session, matching the SDK init-option lifecycle.

## Design Decisions

- The badge is intentionally read-only. Directory authoring remains in Claude Code settings Runtime tab.
- The tooltip says "requested extra directory scope" and "not independently verified" so users do not confuse the badge with proof that the CLI resolved or can access those paths.
- The badge removes any native `title` source and stores the tooltip in `data-tooltip`, preserving a single tooltip layer with predictable stacking.
- The coordinator reads through the same live plugin seam used by nearby Claude Code toolbar badges, avoiding new ownership in `OpenCodianView.ts`.
