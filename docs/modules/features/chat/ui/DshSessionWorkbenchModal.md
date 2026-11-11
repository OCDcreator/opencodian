# DshSessionWorkbenchModal

> Source: `src/features/chat/ui/DshSessionWorkbenchModal.ts`
> Owner: `feature.chat-ui`

> **Status: dormant (unwired since 2026-11-10).** Its only opener was the rejected DSH composer strip (`DshNativeSessionControls`), which is no longer mounted, so no runtime path opens this modal. The file is kept on disk pending an explicit cleanup decision. DSH Jobs, child sessions and other native session actions stay reachable only through the existing shared session workbench (Tasks / Agents / Tools); no second DSH-only surface is offered. The description below documents the unwired class only.

The DSH composer’s session-tools button opens this native Obsidian modal. It keeps one captured adapter and parent session for jobs, terminals and child sessions. Three native disclosures reuse the existing flat workbench rows and theme; no backend settings surface is duplicated.

- Jobs: list, detail, bounded output, byte-offset reads, a user-triggered one-second wait, and stop. Native job status is independent of Todos and foreground streaming.
- Terminals: availability and registered backend selection, optional name/directory, spawn, latest-relative bounded 200-line output reads, masked input with explicit Enter selection, five native signals, and close. Empty backend availability links to DSH advanced settings. Input is cleared only after the per-terminal send is admitted and never persisted by this UI. A second click while that terminal's send is pending preserves the newer input draft and does not dispatch another send; either success or failure of the first send leaves that newer draft intact. Signal and close operations retain their independent admission keys.
- Children: native list/status/detail, existing owned history read, and cancellation through the parent session. An accepted cancellation is not relabeled as completed.

Opening performs read-only discovery and subscribes to matching native updates. A five-second read refresh runs only while the modal is open. Every refresh awaits the optional `refreshNativeControlCapabilities()` port before reading the synchronous current capability cache and dispatching session queries. The existing generation/current-owner fence runs after that await; services without the optional port keep their synchronous fallback. A newly enabled native terminal extension can therefore become discoverable without reconnecting.

Pending or failed capability discovery disables native row/form actions while leaving local refresh/settings enabled. Failure shows only localized safe feedback and preserves existing rows, outputs and terminal input drafts for retry. Action predicates read the current capability cache again after refresh and at click time, so existing buttons follow capability enable/disable changes instead of retaining their creation-time booleans. Stable row DOM preserves typed terminal drafts and disclosure state. Actions only run on user interaction; the modal never starts a model turn. Session invalidation closes the modal, and generation/current-owner checks reject late results after tab/client changes. Closing also resets pending/coalesced refresh flags so an old request cannot block a later opening.

Output is rendered as selectable text, passed through the shared diagnostic secret sanitizer, and bounded to 65,536 characters. Truncation is explicit. Errors show localized safe feedback without native exception bodies. Pattern-based redaction cannot identify every arbitrary secret echoed by a shell; output is not an export or credential inspection surface.

Focused verification: `DshSessionWorkbenchModal.test.ts`. Native screenshots still need jobs empty/running/completed/output, unavailable terminal/settings navigation, spawn/send/signal/close, child history/cancel, and narrow/light/dark keyboard behavior.
