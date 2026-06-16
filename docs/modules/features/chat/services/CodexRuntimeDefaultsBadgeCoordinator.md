# CodexRuntimeDefaultsBadgeCoordinator

**File:** `src/features/chat/services/CodexRuntimeDefaultsBadgeCoordinator.ts`
**Owner:** chat-toolbar
**Stability:** stable
**User surface:** chat (read-only badge)
**Proof state:** readback

## Summary

Quiet read-only badge for the chat input toolbar that surfaces non-default Codex runtime defaults only when they materially affect the next thread. It appears only while the active backend is Codex and at least one of the following is true:

- `networkAccessEnabled` is true.
- `webSearchMode` differs from the default `cached` mode.
- `additionalDirectories` contains at least one non-empty path.

Sandbox mode and reasoning effort are intentionally not duplicated here because they are already represented by the existing permission selector and effort selector.

This is a product surface for user awareness, not a behavior proof. It reflects the plugin settings that are wired into SDK thread options, while actual runtime enforcement remains inside the Codex CLI subprocess.

## Responsibilities

- Read `backendSettings.codex.{networkAccessEnabled, webSearchMode, additionalDirectories}` from the live plugin settings.
- Render compact chips only for non-default values.
- Keep tooltip copy explicit about lifecycle and readback boundaries.
- Hide the badge container entirely when all defaults are quiet.

## Dependencies

- Obsidian `setIcon` for badge icons.
- `t()` i18n keys under `chat.codex.runtimeDefaultsBadge.*`.
- `ChatSelectionControlsCoordinator` owns backend gating and mount/update/destroy timing.

## Lifecycle

- Mounted by `ChatSelectionControlsCoordinator` only while the active backend is `codex`.
- Updated on toolbar build, permission-display refresh, and locale refresh.
- Hidden when all Codex defaults are at their quiet/default values.
- `destroy()` removes the mounted container from the DOM and clears the internal reference; later `update()` calls are no-ops.
- Changes apply to the next Codex thread, matching the SDK thread-option lifecycle.

## Design Decisions

- The badge is intentionally read-only. Authoring remains in Codex settings or the conversation session settings modal.
- The badge is quiet by default to avoid toolbar clutter; it only speaks when the user has opted into network, web search, or extra directories.
- The coordinator reads through the same live plugin seam used by nearby Claude Code toolbar badges, avoiding new ownership in `OpenCodianView.ts`.
