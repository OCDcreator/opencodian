# Capability Lab Backend Tabs Design

## Status

Approved in conversation on 2026-07-15. This design supersedes the consecutive long-page layout in `2026-07-15-capability-lab-backend-workspaces-design.md`. It preserves that design's backend isolation, workspace ownership, state semantics, OpenCode safe operations, responsive tables, and accessibility requirements.

## Goal

Replace the three consecutive Capability Lab backend workspaces with an extensible inner tab surface for Claude Code, OpenCode, and Codex. Only one backend panel is visible at a time, so the page remains navigable as more agent backends are added.

The design must keep backend ownership honest. A capability or diagnostic appears only in the panel whose runtime adapter owns it.

## Non-Goals

- Do not add a fourth shared diagnostics tab.
- Do not copy Claude Code diagnostics into OpenCode or Codex.
- Do not bypass the OpenCode experimental capability gate or add state-changing probes.
- Do not create a global Settings tab framework for this local surface.
- Do not redesign the diagnostic blocks themselves beyond the layout needed for tab ownership.

## Information Architecture

The Capability Lab renders in this order:

1. One Capability Lab title and description.
2. The existing experimental warning and global diagnostic summary.
3. A top-aligned backend tablist.
4. One visible backend tabpanel.

The fixed initial tab order is:

1. Claude Code
2. OpenCode
3. Codex

The backend panels own the following content.

### Claude Code

- Claude Code capability matrix.
- JSONL history browser.
- Subagent browser.
- Rewind dry-run preview.
- Structured output playground.
- Fork diagnostic.
- Resume diagnostic.
- Session detail diagnostic.
- Backend routing diagnostic.
- Discovery and status.
- Diagnostic stream settings and other Claude adapter-owned readbacks.

The backend routing diagnostic remains in Claude Code because its current implementation and proof path require the Claude Code adapter. It may move only after it becomes a genuinely adapter-independent registry diagnostic.

### OpenCode

- Production `getSdkCapabilitySnapshot()` evidence.
- Safe capability refresh through `refreshSdkCapabilities()`.
- Sanitized evidence export.
- Future OpenCode-specific safe probes.

The OpenCode panel must not expose PTY, control-plane, project-copy, background, or other state-changing actions through Capability Lab.

### Codex

- Codex capability matrix.
- Future Codex-specific probes and readbacks.

## Backend Descriptor Contract

The navigation is generated from a Capability Lab-local descriptor list. Each descriptor supplies:

- Stable backend id.
- Localized label.
- Current state resolver and localized state label.
- Panel renderer.
- Stable tab and panel DOM ids.

The tab controller owns navigation behavior only. Capability state calculation and panel rendering remain with `SettingsCapabilityLabSection` and its existing helpers.

Adding a future backend requires adding one descriptor and its panel renderer. It must not require changing keyboard navigation, persistence, responsive layout, or tab activation code.

The descriptor list is local to Capability Lab. This work does not introduce a speculative app-wide registry or replace the existing Settings primary and secondary navigation.

## Selection And Persistence

The selected backend is stored as an independent Capability Lab UI preference. It does not change `activeBackend`, enabled backends, experimental gates, or runtime configuration.

Initial selection resolves in this order:

1. The last persisted Capability Lab backend when it still has a descriptor.
2. The current chat `activeBackend` when it has a descriptor.
3. Claude Code.

Unconfigured backends remain visible and selectable. Their panel shows the existing `unconfigured` state instead of redirecting to another backend.

Activation updates the UI immediately and persists the selection without blocking navigation. If persistence fails, the active tab remains usable for the current Settings session and only a sanitized warning may be logged. Raw settings content or sensitive errors must not be recorded.

Stale persisted backend ids are ignored and normalized through the fallback order above.

## Rendering And Lifecycle

The tablist and lightweight tabpanel shells are created together so every tab has a stable `aria-controls` target.

Panel content uses first-activation lazy mounting:

- Only the initially active panel renders its content on first open.
- Activating an unmounted panel renders it once.
- Returning to an already mounted panel reuses its DOM and local state.
- Inactive panels are hidden and must not start History, Subagent, Rewind, or other reads merely because Capability Lab opened.

Only one tabpanel is visible at a time. Hidden panels remain mounted after first activation so user inputs, loaded evidence, and scroll position are not discarded during tab switches.

Async work must update only its owning panel. Before writing to the DOM, handlers check that the target is still connected and that the render generation is current. Closing or rebuilding Settings must not allow stale async results to mutate a detached surface.

OpenCode refresh continues to replace only OpenCode capability content. It must also resynchronize the OpenCode tab state marker without rebuilding the tablist or changing the selected backend.

## Keyboard And Accessibility Contract

The inner navigation uses complete ARIA Tabs semantics:

- The navigation container has `role="tablist"` and a localized accessible label.
- Each backend control has `role="tab"`, `aria-selected`, `aria-controls`, and roving `tabindex`.
- Each panel has `role="tabpanel"`, `aria-labelledby`, and a stable id.
- Inactive panels use the native `hidden` state.

Activation is manual:

- `ArrowLeft` and `ArrowRight` move focus without loading a panel.
- `Home` and `End` move focus to the first and last tab.
- `Enter` and `Space` activate the focused tab.
- Pointer activation selects the clicked tab directly.

Arrow navigation wraps at the ends. Moving or activating a tab scrolls it into view when the tablist overflows.

Backend state is never color-only. Each tab has an accessible name containing the backend and state. Visible short state text may be suppressed at narrow widths, but the full state remains available to assistive technology and remains visible in the active backend workspace.

Tab activation keeps focus on the tab. Existing action-level focus behavior remains intact, including OpenCode refresh focus restoration to the replacement refresh button.

## Visual Contract

The backend selector is a compact top tab rail beneath the diagnostic summary.

- Use a flat underline-style active indicator and the existing Obsidian/OpenCodian semantic variables.
- Do not wrap the tablist in a card or use large pill-shaped segmented buttons.
- Use compact 13px product typography with normal letter spacing.
- Each tab shows the backend name and a restrained state marker.
- The tab rail owns only its bottom separator and local overflow.
- The active panel retains the current single backend workspace border, background, radius, header, state badge, matrix shell, and actions.
- Do not nest backend workspaces or add cards around existing diagnostic blocks.
- Use only a short color and underline transition, approximately 150ms. Do not slide or animate the large panel contents.

The Capability Lab title and introduction render once. Each panel still renders its backend name, backend-specific description, state, and actions.

## Responsive Contract

At narrow widths, including 320px:

- The tab rail remains one line and scrolls horizontally instead of wrapping.
- The focused or activated tab scrolls into view.
- The page itself does not gain horizontal overflow.
- Backend headers and controls stack using the existing workspace responsive rules.
- Only the tab rail and table shells may own horizontal scrolling.
- Long backend labels, capability ids, CJK copy, and state labels must not overlap or force viewport overflow.

The OpenCode and Codex panels shrink naturally to their content height. Claude Code may remain long because it owns the deep diagnostics, but it no longer lengthens the other backend experiences.

## State And Error Handling

- Claude Code and Codex retain `available` and `unconfigured` workspace states.
- OpenCode retains `available`, `unknown`, and `empty` state calculation from the existing backend workspace design.
- Capability-level hidden, blocked, unsupported, failed, and skipped states remain row-level evidence.
- A failed panel load renders a localized inline error within that panel and does not break tab navigation.
- OpenCode refresh retains one feedback owner, cleans `aria-busy` on every outcome, and never exposes raw server errors.
- Switching tabs during an in-flight operation does not cancel a safe read automatically; completion updates only the operation's mounted owner and clears its busy state.

## Stable DOM Contract

```text
[data-section-block="capability-lab"]
[data-capability-backend-tablist]
[data-capability-backend-tab="claude-code"]
[data-capability-backend-tab="opencode"]
[data-capability-backend-tab="codex"]
[data-capability-backend-panel="claude-code"]
[data-capability-backend-panel="opencode"]
[data-capability-backend-panel="codex"]
[data-capability-panel-mounted]
[data-capability-backend]
[data-backend-state]
```

Exactly one backend tab has `aria-selected="true"`, `tabindex="0"`, and a visible associated panel. Backend workspace elements remain non-nested inside their owning panel.

## Verification

### Automated Tests

- Descriptor order generates Claude Code, OpenCode, and Codex tabs without hard-coded navigation branches.
- A synthetic future descriptor can be added without changing the controller.
- Persisted selection, active backend fallback, and Claude Code fallback resolve in the approved order.
- A stale persisted id does not break rendering.
- Unconfigured backends remain selectable.
- ARIA roles, relationships, selected state, hidden state, and roving tabindex are correct.
- Arrow, Home, End, Enter, Space, and pointer behavior match the manual activation contract.
- Focusing an inactive tab does not mount or load its panel.
- Each panel mounts only once and is reused after switching away and back.
- Opening OpenCode or Codex first does not trigger Claude History or Subagent reads.
- Existing OpenCode refresh, sanitized export, single feedback owner, `aria-busy` cleanup, state update, and focus restoration tests remain green.
- Existing backend workspace isolation, status, matrix ownership, semantic headings, and CJK wrapping tests are adapted to activate the owning panel before asserting content.

### Repository Gates

- Update every affected `docs/modules/**` page and the Capability Lab style documentation.
- Run focused unit tests during TDD.
- Run `npm run graphify:update:src` after source changes.
- Run `npm run verify` with zero lint warnings.

### Test Vault Runtime Proof

Use `obsidian-plugin-autodebug` to build, deploy, reload, and verify the real Obsidian surface.

- Verify the deployed `BUILD_ID`.
- Verify only one Capability Lab title and one backend panel are visible.
- Exercise all three tabs with pointer and keyboard input.
- Verify manual activation does not load a focused-only panel.
- Verify the selected backend survives Settings close/reopen and Obsidian reload.
- Verify unconfigured, unknown, available, and empty states when fixtures or runtime support allow them.
- Verify OpenCode refresh and evidence export in the active OpenCode panel.
- Verify 320px-equivalent narrow width, normal Settings width, and wide width without page-level horizontal overflow.
- Capture light and dark screenshots plus DOM, computed-style, overflow, focus, and console assertions under `.obsidian-debug/`.
- Submit the final screenshots and runtime evidence to an independent GPT-5.6 sol visual, accessibility, and CJK review.

## Acceptance Criteria

The design is complete when Capability Lab exposes one scalable backend tab rail, each backend owns only its real capabilities, inactive panels perform no diagnostic reads before activation, selection and keyboard behavior follow this contract, OpenCode safe operations remain intact, all repository gates pass, and Test Vault evidence confirms the runtime UI in light, dark, and narrow layouts.
