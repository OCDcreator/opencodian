# OpenCode2Adapter

`getSessionDiff(sessionId, from?)` distinguishes two native v2 meanings: an explicit `from` reads one turn for an immutable Turn Change Record; an omitted `from` lists native history and requests a `from:firstUser` / `to:lastVisibleUser` range for the current Session Change Sidebar. Native staged revert excludes its anchor and later messages. A missing revert anchor rejects the read rather than showing hidden changes. This range is native snapshot diff, never Git status.

OpenCode 2.0.18 captures native snapshots only in Git-backed locations. When no assistant message carries a snapshot start, the full-session reader returns `null` (unavailable), distinct from an authoritative empty `[]`. The chat coordinator may then display persisted turn records as limited fallback evidence. This does not claim native status or line statistics in a non-Git vault.

`getBackgroundTasks(parentSessionId)` reads native parent `subagent` tool metadata and child-session outcomes. `cancelBackgroundTask` checks that a running child belongs to the requested parent before sending native `session.interrupt` to that child ID.
When no snapshot exists, successful native write/edit tool inputs can provide a file-hint-only full-session list (`statsUnavailable`), bounded by the native revert boundary. Slash skill tokens resolve against `client.skill.list` and attach the native skill ID rather than using OpenCode 1 skill expansion.
Config readback recognizes native normalized `provider/model#variant` references as equivalent to their `{providerID, model, variant}` form. A different native provider, model or variant still fails and restores the prior overlay.

> Source: `src/core/agents/backend/OpenCode2Adapter.ts`
> Status: [REVIEW]

## Responsibility

Owns the OpenCode 2.x transport boundary. OpenCode 2 uses `@opencode/client` and a separate `@opencode/cli` process with the `/api` protocol; it must not pass its session IDs into OpenCode 1's `OpenCodeService`.

Local mode starts the user selected executable with a random process password, a loopback ephemeral port and Obsidian CORS origin. Remote mode uses the configured URL/password. The server version must start with `2.`. A changed connection setting triggers a reconnect before the next operation.

## API and stream

- Native session create/list/get/rename/delete/fork/revert/clear/diff/compact operations; model, command and skill catalogs.
- Native permission requests and form questions are mapped into the existing chat cards. Replies remain scoped to their original session IDs.
- Each foreground turn subscribes to OpenCode 2 events before admitting the prompt, filters other sessions, maps text/reasoning/tools/permission/forms, and aborts its own subscription after completion or cancellation.
- Message history reads all cursor pages. Assistant text, model ID and tool state are restored; local OpenCodian fields are merged by the chat view.

## Constraints

OpenCode 2.0.18 does not expose session sharing or its prior LSP execution path. The plugin must show those as unavailable for this backend and must not call the OpenCode 1 implementation. Keep any future capability claims tied to the installed server version and runtime evidence.

### 2026-09-28 parity continuation

The 2.0.18 adapter now applies Build/Plan plus session-scoped permission rules with native readback, normalizes forms including option values and typed answers, records edited file events, pages long histories, reads child sessions, and can generate standalone title text. A local process exit terminates active streams. Session sharing and LSP remain unavailable upstream.

## 2026-09-28 OpenCode 2 auxiliary integration

Added a private auxiliary CLI scope with isolated home/config roots, project config disabled, native agent/session wildcard deny rules and before/after runtime readback. Auxiliary and inline completion capabilities are enabled after the real CLI audit passed on Mac and FA880 with OpenCode 2.0.18 and `opencode-go/space-bunny-free`: unrestricted positive write control, induced write denied in the auxiliary scope, image query, unchanged vault bytes, and no native session or temporary scope residue. The native protocol has no effective-tool enumeration endpoint; the empty tool snapshot follows from the native wildcard deny readback and the pinned 2.0.18 tool filtering implementation. Native manual compaction waits for its admitted compaction message to complete rather than treating admission as completion.

`validateConfigContent()` restarts the owned local server, compares each proposed JSON value with the native document readback, then allows Settings to persist it. A server-resolved default may add fields, so this comparison checks proposed nested values instead of requiring object equality. Session sharing and LSP are unavailable in upstream OpenCode 2.0.18.

Native management catalogs cover integrations, MCP, agents, commands, skills and plugins. MCP connect/disconnect verifies native status; API-key and OAuth completion verify native credentials/status. Keys are submitted directly to the native credential store and are not copied to plugin settings. Credential activation/removal uses native IDs. This management surface is separate from OpenCode 1's configuration owners.

The owned process may stop accepting HTTP connections before its child `exit` event reaches Electron. `start()` checks native health even when its cached connection key matches, then reconnects once; concurrent callers share the same startup promise. `stop()` waits for the child exit, escalating after three seconds so isolated auxiliary directories can be removed on Windows.

Each foreground stream waits for the native `session.inbox.delivered` event matching its own prompt ID before consuming text or completion events. This prevents a late completion from the prior turn from contaminating a cancellation retry.

The selected primary agent is verified against the native agent catalog and switched on the session before the prompt. Structured `@agent` mentions are translated to OpenCode 2's `agents` prompt attachments; the OpenCode 1 part IDs are never sent across the v2 protocol.

The native agent catalog may initially return an empty array while the 2.0.18 configuration plugin loads global, project, and overlay agents. `listAgents()` waits for a populated catalog and reports a readiness error after ten seconds. Settings summary and management catalog share this read so an initial empty response is not presented as an authoritative agent count. In both Test Vaults, an isolated `acceptance-probe` subagent using `opencode-go/space-bunny-free` completed a real child session; the Mac global `image-looker` model separately returned provider 401, which is a credential issue rather than an adapter or upstream capability failure.

Permission-mode changes and explicit primary-agent routing also use the ready catalog. A real turn started immediately after a fresh 2.0.18 process previously failed with `Build agent unavailable` when the first catalog read was empty; the normal, YOLO, and Plan paths must not interpret that transient response as a missing native agent.

OpenCode 2.0.18 removes `todowrite` during v1 history migration and has no replacement todo tool or session todo API. The Todo dock is therefore an upstream exception for this version; its capability remains absent rather than claiming a fabricated snapshot.

## 2026-10-02 T10 native history pagination

OpenCode 2.0.18 `SessionMessagesQuery` permits `order` only on the first page. Its opaque cursor carries the requested ordering; combining `cursor` and `order` is rejected by the native handler. `listAllMessages()` therefore sends ascending order on page one and only the cursor on later pages. A later-page failure rejects the history read rather than returning a partial conversation as complete. Native OpenCode 2 IDs remain local to this adapter and are never delegated to OpenCode 1 SDK v2 facade. Focused regression: `OpenCode2Adapter.t10.test.ts`. Upstream baseline: tag `v2.0.18`, commit `cd9a14a6b688d4021bee381dfd39d2cef9c0f862`, `packages/protocol/src/groups/message.ts` and `packages/server/src/handlers/message.ts`. This regression is protocol-fixture evidence; real native and UI acceptance require their own evidence.
