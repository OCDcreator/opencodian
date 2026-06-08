# SandboxConfigBadgeCoordinator

**File:** `src/features/chat/services/SandboxConfigBadgeCoordinator.ts`
**Owner:** chat-toolbar
**Stability:** stable
**User surface:** chat (read-only badge)
**Proof state:** readback

## Summary

Read-only sandbox configuration badge that appears in the chat input toolbar next to the permission mode selector. Mounted by `ChatSelectionControlsCoordinator` only while the active backend is Claude Code. Only visible when sandbox is enabled. Shows configured sub-policy count and detailed tooltip with policy summary.

## Responsibilities

- Render a small "Sandbox" badge in the chat toolbar when sandbox is enabled
- Count active sub-policies (excludedCommands, filesystem paths, network domains, etc.)
- Display detailed tooltip with full policy configuration
- Provide readback transparency: badge reflects plugin settings, NOT independently verified OS-level enforcement

## Dependencies

- `ClaudeCodeSandboxSettings` from `src/core/types/settings`
- Obsidian `setIcon` for the shield-check icon
- `t()` i18n for locale strings

## Lifecycle

- Mounted by `ChatSelectionControlsCoordinator` while the live plugin active backend is `claude-code`
- `ChatSelectionControlsCoordinator` refreshes the badge on build, permission-display refresh, and locale refresh, so backend hot-switches show or hide the badge without requiring `OpenCodianView` ownership
- Updates on mount and when `update()` is called
- Does NOT update live during queries (sandbox settings apply to next query only)

## Design Decisions

- Badge is gated by backend inside `ChatSelectionControlsCoordinator` by reading the live plugin `activeBackend`. This prevents the badge from appearing in OpenCode/non-Claude conversations without adding new host methods to `OpenCodianView`.
- Tooltip is fully i18n-aware: SDK property names (e.g., `failIfUnavailable`) are preserved as English technical identifiers by design (they map to SDK option keys), but surrounding context (yes/no, blocked, reduces security) is localized.
- Tooltip explicitly states "readback" boundary — OS-level enforcement is not independently verified
- Sub-policy count gives users a quick visual indicator of how many advanced policies are active
