# OpenCode 2 backend acceptance

Updated: 2026-09-28. Scope: OpenCode 1 feature parity, with user-approved exceptions for functions absent in upstream OpenCode 2.0.18.

## Delivery state

OpenCode 1 and OpenCode 2 are separate selectable backends. OpenCode 2 uses the pinned `@opencode/client@2.0.18`, a separate executable/server, and native v2 configuration and integration controls. Existing v1 session IDs and configuration owners are not passed into the v2 transport.

**Full parity acceptance remains pending.** Passing tests, deployment, and the scenarios below do not establish every v1 user flow. In particular, provider API-key/OAuth completion has not been exercised with a test account. Upstream exceptions and environmental provider failures are separate from this gap.

## Build and deployment

- Branch: `codex/opencode-v2`; committed and merged to main, published as v1.1.34 on 2026-09-28.
- Final verified build: `codex-opencode-v2.202609281752`, plugin version `1.1.33`.
- `npm run verify`: 912 suites / 9173 tests, lint with no warnings, typecheck, architecture/module documentation, Graphify, production build and generated CSS cleanliness passed. `git diff --check` is clean.
- Mac Test Vault: `testvault`, Obsidian 1.13.7.
- FA880 Test Vault: `OpenCodian-ZCode-TestVault-20260925`, Obsidian 1.13.7.
- Both hosts received `main.js`, `manifest.json`, and `styles.css`; hashes were compared after sequential copy. Both loaded runtimes subsequently reported the final BUILD_ID.

| Artifact | SHA256 |
| --- | --- |
| main.js | `7dfc319983555ad36f648a957d213a4d207c2003b616ae1450df2734db6aa790` |
| manifest.json | `aa33c27f8c71c72fed5994881a98104329533effd4a3cd3d86bc6142405284c2` |
| styles.css | `09fc8fdfc383bc6d531238de30d55c5f5ea6798c7c943a2949e27d1f40d54684` |

FA880's CLI reload initially left the old renderer code running despite the updated disk bundle. Reload through the identified Test Vault plugin manager and loaded-method readback corrected this. Disk parity alone was not treated as runtime parity.

## Evidence matrix

Evidence files are local, ignored artifacts under `.obsidian-debug/`. `UI` means actual browser input or button interaction followed by native readback. `Native` means an internal plugin call to a real CLI/model, not a UI acceptance claim.

| Feature | Mac | FA880 | Evidence / limit |
| --- | --- | --- | --- |
| Backend and v2 configuration selection | UI persistence/application/readback | Native persistence/application/readback | `opencode2-mac-config-readback.json`, `opencode2-fa880-config-loop-0906.json` |
| Local and remote URL/password connection | Native passed | Native passed | `opencode2-{mac,fa880}-remote-smoke.json` |
| Chat compose, reply, model choice | UI passed | UI passed after choosing available model | `opencode2-{mac,fa880}-final-ui-readback.json`; FA880's preceding MiniMax request failed and was not erased |
| Concurrent independent sessions | Native passed | Native passed | `opencode2-{mac,fa880}-native-acceptance-1023.json` |
| Rename, rewind, restore, fork | Native passed | Native passed | Same 10-check acceptance files |
| Context/model/token/cost readback | Native passed | Native passed | Same acceptance files; no paid-cost assertion from zero-cost model |
| Manual compaction completion | Native passed | Native passed | Same acceptance files; native completed compaction message, not admission only |
| Cancellation and same-session retry | Native passed | Native passed | Same acceptance files; native interrupted outcome and retry output |
| Owned process loss and reconnect | Native passed | Native passed | Same acceptance files; lost process, reconnect and subsequent real output |
| Primary agent and structured @agent attachment | Native passed | Native passed | Prior agent-routing readback; actual child execution is separately recorded below |
| Successful subagent execution | Native child succeeded | Native child succeeded | `opencode2-{mac,fa880}-subagent-isolated-success.json`; isolated configured agent and available model |
| Images | UI send and reload/readback | UI file upload, native image attachment and reply passed | `opencode2-mac-image-reload-readback.json`, `opencode2-fa880-image-ui-readback-valid.json`; an earlier 1×1 test fixture returned 400, while a valid PNG passed |
| Build/Plan and permission rules | Native passed; UI deny/allow write cards | Native passed | Previous mode probes; fresh-process Build catalog failure repaired and covered by a readiness regression test |
| Questions/forms | UI selection, native answer, model continuation | UI selection, native answer, model continuation | `opencode2-{mac,fa880}-form-ui-readback.json`; typed form reply/cancel also tested on Mac |
| Commands, skills and agent catalogs | UI execution and native readback passed | UI execution and native readback passed | `opencode2-{mac,fa880}-ui-command-readback-1625.json` and `opencode2-{mac,fa880}-ui-skill-readback-1625.json`: actual composer slash selection/send, native expanded command/user skill attachment, and exact model reply. Final isolated `1600` acceptance also passed. The `1625` UI path is reused on `1651` after a sidebar-only change. |
| Session Change Sidebar and Turn Change Records | UI file edit/card/sidebar passed; native isolated range passed | UI file edit/card/sidebar passed; native isolated range passed | Final build native/mounted-sidebar acceptance: `opencode2-{mac,fa880}-isolated-final-confirmed-1600.json`. Final build cross-session empty readback is `opencode2-mac-postswitch-native-1531.json`; file-edit UI readback `opencode2-mac-sidebar-final-second.json` and `opencode2-fa880-sidebar-ui-1531.json` are earlier builds and reused by scope. The last runtime-only change merges completed child records into the current sidebar projection; focused test `ModifiedFilesSidebar.test.ts` covers it. Both non-Git Test Vaults display file hints with unknown status/line counts, and isolated Git fixtures prove native `added +1/-0`, two-turn range, revert/restore, independent session and child changes. |
| Background child tasks | Native child outcome/file diff passed; live task row and separate parent/child records read back | Native child outcome/file diff passed; live task row and separate parent/child records read back | Final UI readback `opencode2-{mac,fa880}-ui-background-readback-1625.json` shows completed child task rows, distinct immutable parent/child records and child session IDs. It was before the final sidebar-only merge and is reused by scope; focused tests cover the projection merge. |
| MCP connect/disconnect | Existing lean-ctx native toggle passed | Isolated real stdio MCP toggle passed | `opencode2-mac-mcp-toggle.json`, `opencode2-fa880-mcp-isolated-final.json`; protocol-level connection proof, not every MCP tool/OAuth flow |
| Read-only auxiliary query | Real model and write-denial audit passed | Real model positive control, write-denial, image probes passed | `opencode2-formal-audit-mac.log`, `opencode2-fa880-aux-{positive-control,induced,image}.json` |
| Editor inline completion | Alt ghost and Tab insertion passed; original restored | Alt ghost and Tab insertion passed; original restored | `opencode2-{mac,fa880}-inline-keyboard-{ghost,tab,restore}.json` |
| Selected-text inline edit | UI selection → command → instruction → native preview reached; controller reject restored the file | Not run in this build | `opencode2-mac-inline-edit-prepare-1752.json`; preview state was read from the active OpenCode 2 controller and rejected with unchanged-file readback. Pointer-level accept/reject remains pending. |
| Per-backend inline model settings | Both OpenCode 2 override rows visible; persistence not proven | Both rows visible; input value seen but main-window settings stayed unchanged | `opencode2-mac-inline-settings-prepare-1723.json`, `opencode2-fa880-inline-settings-diagnostic-1723.json`; temporary settings restored. Selected-text inline edit preview/accept/reject remains unaccepted. |
| Active-turn steering | Native passed | Native passed | `opencode2-{mac,fa880}-steer-native-toolstart.json`; tool-start synchronized injection returned STEERED_OK |
| API-key/OAuth/credential controls | Implemented; completion pending | Implemented; completion pending | Requires a chosen test integration and interactive authentication |
| OpenCode 1 regression | Prior UI chat passed | Prior native chat passed | Existing regression evidence; not a full v1 re-acceptance |

The earlier 10-check, UI form, image, inline-completion and steering evidence predates the final BUILD_ID. Its feature paths were not changed in this closeout, so it is reused after a change-scope review, not presented as a fresh rerun. Build `1600` directly rechecked native session diff, command, skill and child paths on both hosts. Temporary overlay UI acceptance on `1625` exercised command and skill input, native model readback, completed child task rows and separate parent/child notices; `1651` only changes how those already-persisted child records are included in the current sidebar projection. Those earlier results are reused by this bounded diff scope. The final Test Vault runtime hashes and BUILD_IDs were read back on both hosts. `opencode2-{mac,fa880}-sidebar-final-projection-1651.json` then loaded the same real UI test conversations, proved both parent and child files in the sidebar, compared the separate persisted records, and restored the original backend/settings/conversation identity.

## Session Change Sidebar closeout and limits

- The v2 sidebar now reads its own adapter. OpenCode 2.0.18 interprets a bare `session.diff` as the **latest turn**, so the adapter requests an explicit first-user to last-visible-user native range for session overview. Staged revert excludes the reverted user turn and later turns. An async result is discarded after a newer refresh, tab change, remount or destroy. The real TabBar activation writeback now triggers refresh; the previous view wrapper alone missed actual tab clicks. CodeGraph at review time reported 13 direct method callers, depth 2 blast radius 34 for `OpenCodianView::refreshModifiedFilesSidebar`.
- A completed v2 turn requests native `session.diff(from: userMessageID)` even if no write-tool hint was emitted. The persisted Turn Change Record is immutable. A completed background child's own diff or write-tool hint is recorded separately under its parent user anchor and child session ID; the parent card is not rewritten. Focused tests cover race/identity and immutable record behavior. The isolated real-CLI acceptance proves a child write and native child diff on both hosts. The `1625` normal-conversation UI run additionally read back a completed child task row and separate persisted parent/child records on both hosts. The final `1651` loaded-conversation readback proves both files in the sidebar, the same separate notice IDs/entries and exact settings/conversation restoration.
- OpenCode 2 snapshots require a Git-backed location. In each existing non-Git Test Vault, a real write produced a file hint but native `session.diff` was empty. The UI now says status and line statistics were not provided; it does not claim `modified` or `+0/-0` from those placeholders. In canonical-path Git fixtures on both hosts, real model writes produced native `added +1/-0`, two-file session ranges, native revert/restore and a separate child `added +1/-0`. This is native snapshot evidence, not Git worktree status. Mac's first two Git fixture attempts failed to capture snapshots because `/var` and `/private/var` resolved to different location identities; the third used `realpath` and passed. All attempts remain in `.obsidian-debug/`.

## Confirmed upstream exceptions

Upstream source pinned to tag `v2.0.18`, commit `cd9a14a6b688d4021bee381dfd39d2cef9c0f862`:

- **Todo tool/dock**: v1 migration lists `todowrite` in `REMOVED_TOOLS` and explicitly tells the model it is no longer available. Current v2 session API and tool registry expose no replacement todo API/tool. The adapter therefore does not declare Todos. See [migration source](https://github.com/anomalyco/opencode/blob/cd9a14a6b688d4021bee381dfd39d2cef9c0f862/packages/core/src/database/v1-migration.bun.ts#L901).
- **Session share/unshare**: current native client/server session methods expose no share/unshare operation. Sharing capability remains absent.
- **Legacy LSP execution**: no current native execution route; upstream mutation paths explicitly defer LSP diagnostics until an LSP runtime exists. Configuration containing an LSP key does not prove LSP execution.

Version-bound snapshot prerequisite: native file diff requires a Git-backed location, per [Snapshot.enabled/capture](https://github.com/anomalyco/opencode/blob/cd9a14a6b688d4021bee381dfd39d2cef9c0f862/packages/core/src/snapshot.ts#L115). Both existing non-Git Test Vaults therefore use file hints with unknown status/line statistics; they are not counted as a native-diff pass. Isolated canonical-path Git fixtures prove the actual native diff path on both hosts.

## Environment failures and remaining acceptance work

1. Mac's configured `image-looker` uses `zhipuai-coding-plan/glm-4.6v` and fails with native `provider.auth`, HTTP 401. An isolated agent on `opencode-go/space-bunny-free` succeeded on both hosts. Do not label that 401 as upstream unsupported or silently rewrite the user's global credentials.
2. FA880 UI initially selected `opencode-go/minimax-m2.7` and failed generation. Native assistant error was `provider.invalid-request`, HTTP 400, "Model does not support this protocol." Choosing Space Bunny Free through the UI succeeded. This is a provider/model availability problem, not proof that the adapter cannot stream.
3. Mac native MCP catalog includes a `doc2x` connection failure; the available MCP server's successful connection does not prove doc2x healthy.
4. API-key/OAuth success, credential activation/removal with a real account and successful provider request remain **unverified**. A service provider and user-completed browser login are required; no real key was replaced, removed or requested in chat. Saved credential/catalog reads alone are not accepted as authentication success. These are not upstream exceptions.
5. FA880's recurring `ERR_FILE_NOT_FOUND` entries were attributed by a URL-correlated CDP trace (`opencode2-fa880-resource-reload-1723.json`) to the bundled Newsreader and Oxanium font URLs. `styles.css` requested them from `app://obsidian.md/assets/fonts/...`, although the files live under the plugin directory. This shared CSS packaging defect is unrelated to the OpenCode 2 transport. The final build embeds both fonts in `styles.css`; both loaded on Mac and FA880 and fresh, timestamp-filtered CDP monitoring found no new `ERR_FILE_NOT_FOUND` (`opencode2-{mac,fa880}-font-final-fresh-1752.json`). The first CDP monitoring attempt replayed historical `Log.entryAdded` events and was rejected as a fresh-error assertion.
6. Configuration/editor acceptance has specific remaining gaps, not a known failure of every control. Backend selection, temporary config overlay application/native model readback, slash command and skill execution, and Alt completion/Tab insertion passed on both hosts. Selected-text inline edit preview/accept/reject has not been accepted on both Test Vaults. Per-backend edit/completion model override rows for OpenCode 2 were missing from Settings and now render on both hosts; the actual input values were observed, but detached Settings input did not update the main-window plugin state in this probe, so save/application is **not accepted**. Temporary backend and override settings were restored with before/after readback. Other v1 controls are claimed only where named in the evidence matrix. The UI experiment's `skills` directory needed a later native `location.reload` before appearing; this remains a timing observation rather than a proven reload requirement.

FA880 settings were restored to `activeBackend=zcode`, `enabledBackends=[zcode]`, empty v2 executable/config overlay, and inherited v2 permission mode; `opencode2-fa880-ui-closeout-restored-1625.json` and earlier post-restore identity readbacks confirm this. The matching Mac restoration readback confirms its original v2 default, empty overlay, inherited permission mode and conversation identity. Inline-completion overrides and the FA880 test note's original text had been restored before this continuation. The two files created during the initial sidebar UI runs and the four parent/child files created during the later UI runs were removed with absence readback. Isolated fixture directories remain under OS temp for evidence, while each script deleted its native sessions, stopped its owned process and compared plugin settings/conversation before and after. The FA880 SSH CDP tunnel was opened for this run and closed at closeout.

## Required closeout

Complete the pending UI/account scenarios above, re-check any affected source or configuration changes through the repo gates, deploy only if runtime artifacts change, and add native readbacks before changing full parity acceptance to complete.
