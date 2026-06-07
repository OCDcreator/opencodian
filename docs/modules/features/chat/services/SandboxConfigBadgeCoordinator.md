# SandboxConfigBadgeCoordinator

**File:** `src/features/chat/services/SandboxConfigBadgeCoordinator.ts`
**Owner:** chat-toolbar
**Stability:** stable
**User surface:** chat (read-only badge)
**Proof state:** readback

## Summary

Read-only sandbox configuration badge that appears in the chat input toolbar next to the permission mode selector. Only mounted for Claude Code backend conversations (`showSandbox: true`). Only visible when sandbox is enabled. Shows configured sub-policy count and detailed tooltip with policy summary.

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

- Only mounted when `ChatSelectionControlsCoordinator.build()` is called with `showSandbox: true`
- `OpenCodianView` gates `showSandbox` on `isClaudeCodeConversationActive()`, so the badge only appears in Claude Code conversations
- Updates on mount and when `update()` is called
- Does NOT update live during queries (sandbox settings apply to next query only)

## Design Decisions

- Badge is gated by backend: `ChatSelectionControlsCoordinator` only mounts the badge when `showSandbox: true`, which `OpenCodianView` sets based on `isClaudeCodeConversationActive()`. This prevents the badge from appearing in OpenCode/non-Claude conversations.
- Tooltip is fully i18n-aware: SDK property names (e.g., `failIfUnavailable`) are preserved as English technical identifiers by design (they map to SDK option keys), but surrounding context (yes/no, blocked, reduces security) is localized.
- Tooltip explicitly states "readback" boundary — OS-level enforcement is not independently verified
- Sub-policy count gives users a quick visual indicator of how many advanced policies are active
