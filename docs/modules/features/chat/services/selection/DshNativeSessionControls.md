# DshNativeSessionControls

> Source: `src/features/chat/services/selection/DshNativeSessionControls.ts`
> Owner: `feature.chat-services`

## Phase2 architecture (2026-11-10)

The rejected DSH composer button strip is gone: nothing mounts a DSH-specific strip, modal, sidebar or CSS family, and `DshSessionWorkbenchModal` stays on disk unwired. This module now exports two non-rendering state owners; neither creates DOM. Native capability surfaces only through the existing generic composer permission selector and the shared session workbench.

## `DshNativeSessionControls` — preset state behind the generic selector

Session permission preset state for the generic composer permission selector (`PermissionModeSelectorCoordinator`). `ChatSelectionControlsCoordinator` constructs it only for a native-DSH toolbar; ACP keeps the empty baseline slot with no selector. It publishes a live `PermissionModeConfig` (`backendLabel: 'dsh'`) that the generic selector reads when it repaints — no rendering here.

- Option ids carry the owner generation (`preset-${generation}-${encoded-value}`), so a choice captured by an older dropdown can never match a newer session or connection; `custom` is display-only and never offered. No default is ever written; Plan is not a permission option.
- `getPermissionMode()` reports `dsh-checking` / `dsh-unavailable` class-safe states honestly; `hint()` states the change scope or the honest reason (ACP unavailable, no session, failed, checking, busy/streaming).
- `switchPermissionMode` is the generic selector's host seam: refused while busy/streaming or without the `set` capability; success only after an independent set→read confirmation on the same captured owner. Failures keep the generic selector's existing error path.
- Reads and writes capture adapter, session and generation. Capability discovery completes before any session read (`refreshNativeControlCapabilities?.()` first), and read/preset sequence counters supersede late reads and queued acknowledgements; a queued ack arriving after a committed change cannot restore the queued state. Native `invalidated` bumps the generation; `permission_presets_update` events update state with a new revision; connection recovery re-reads. Unrelated sessions, replaced adapters and destroyed owners cannot repaint state.
- ACP always reports unavailable through `chat.dsh.controls.acpUnavailable`; nothing mutates presets over ACP.

## `DshNativeWorkbenchControls` — shared workbench projection

Substantial owner for DSH native session state projected into the shared workbench. `SessionInformationCoordinator` constructs one instance and integrates its reads (`project` adds `nativePlan` / `nativeTerminals`; `jobTask` attaches native job operations to job rows). Entries are keyed backend+session with a captured owner (`key`, `sessionId`, `service`, `lease()` over adapter generation/conversation/tab); `isDshNativeWorkbenchService` is the structural service guard.

- Refresh awaits capability discovery, then reads Plan, terminal availability, terminals and children as one settled batch under per-control capability gates; a failed list keeps the last evidence and never implies a terminal or child ended.
- Independent Plan is projected into the shared Overview (`nativePlan`): set→read confirmation under `setPlanMode`; a queued change stays a pending note and is never shown as the active state; pushed `plan_update` events supersede older reads and acknowledgements via a revision counter.
- Terminals and children are projected as generic `WorkbenchTask` rows in shared Tasks (`tasks()` returns the same row objects until the next native read): terminal rows expose bounded earlier-output read, send/sendLine with a secret input, a five-signal menu and kill; child rows expose details and cancellation through the parent session (an accepted cancellation is not a final status). Terminal spawn is offered only when the native capability and backend availability agree, with an honest reason and settings navigation otherwise.
- `runTaskAction` fences per row+operation: an unresolved send cannot start a second native send, and a rejected duplicate leaves the newer draft untouched. The render layer keeps pending state in a surface-owned counter keyed by workbench identity + task id, so a rerender rebuilds the row locked and settlement unlocks the row that currently carries the same task — never a detached old one. (Final contract above; the bounded rerender fix for pending terminal send/draft is being landed and is not yet PASS-stamped.)
- `readOutput` reads the newest bounded terminal lines (200) or the child's own history via the optional `readChildSessionMessages` port; the workbench never owns a child runtime. All output passes `sanitizeDiagnosticReport` (strict URLs) bounded to 65,536 characters with explicit truncation; errors stay localized without native exception bodies.

Focused verification: `DshNativeSessionControls.test.ts`, `ChatSelectionControlsCoordinator.test.ts`, `SessionInformationCoordinator.test.ts`. Narrow-pane and visual acceptance still requires real DOM evidence per the shared workbench rules.
