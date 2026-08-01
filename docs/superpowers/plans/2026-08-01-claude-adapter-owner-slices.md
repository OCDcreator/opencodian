# ClaudeCodeAdapter behavior inventory and slice decision — 2026-08-01

## Task 16 boundary and outcome

This is a Phase 5 / Task 16 inventory and dated child plan. It authorizes neither
production code nor manifest changes, tests, ledger/devlog changes, a gate closure,
or approval. `ClaudeCodeAdapter` remains the backend facade and preserves its
existing public `AgentService` / chat / session / fork contract.

**Decision after independent CodeGraph reproduction:** there are **no approved
implementation slices yet**. The initially plausible session/runtime, SDK-option,
and trace candidates each cross a shared lifecycle or have an unresolved CodeGraph
scope result. They are recorded below as deferred candidates with concrete
re-entry conditions, not as permission to extract files. This is intentional: an
adapter façade must not become a state dump, and a thin port must not hide a
duplicated `Map`, `Query` iterator, callback listener, SDK loader, or diagnostic
state.

## Present ownership, composition, and non-negotiable contracts

- `npm run inspect:owner -- src/core/agents/backend/ClaudeCodeAdapter.ts --json`
  resolves the adapter to high-risk `core.backend`. The current manifest's coarse
  include is `src/core/agents/backend/**`, and its only current `delegatesTo`
  target is `core.backend-diagnostics`.
- Production construction is in `src/main.ts:333–356`: `main` creates the
  permission host/bridge and invokes `new ClaudeCodeAdapter({... sdkLoader:
  loadClaudeCodeSdk, permissionBridge, tracePort, onElicitation, mcpConfigLoader
  ...})`. `mcpConfigLoader` dynamically constructs `McpConfigService`, reads
  project servers, and adapts them through `adaptMcpConfigForClaude` (with `{}`
  fallback). The adapter constructor resolves its process settings and owns the
  lazy `sdkLoadPromise`; it does **not** receive a pre-built runtime coordinator.
  Any later internal coordinator must be constructed by the adapter from immutable
  dependencies. This plan does not alter `main.ts`.
- One local Claude handle aliases to one captured real SDK `session_id`; ordinary
  resume uses only that captured identity, and a mismatch closes/fails the query.
  `fork`, title/history operations, session deletion/invalidations, cancellation,
  effort/model behavior, MCP/permission/elicitation behavior, and trace ordering
  must remain unchanged.
- A persistent SDK `Query` owns one input queue and one output iterator per live
  session. Its pump is the only iterator; post-result callbacks remain one
  dedicated channel. There may be no second session registry, abort set, query
  listener, output queue, trace alias map, or mutable diagnostic-options cache.
- The trace service retains redaction/ring/watchdog/export ownership. Trace calls
  are contained: an absent or throwing trace port cannot affect SDK loading,
  stream chunks, permission/elicitation results, cancellation, or terminal order.

## Canonical-state behavior inventory

| State / behavior group | Current truth home and contract | Extraction constraint |
|---|---|---|
| SDK loading and all broad SDK readback/history APIs | `ClaudeCodeAdapter.sdkLoadPromise` plus `getSdk()`; SDK methods support title, sessions/history/subagents/import/fork, diagnostics and readback. | Remains in adapter. Do not move the promise or expose `getSdk`, a mutable `Query`, or `withActiveOrTemporaryQuery`. |
| Local session + active stream lifecycle | Adapter `sessions`, `cancelledSessions`, `invalidatedSessions`, per-session runtime queues/query/abort/normalizer, and post-result callbacks. | One inseparable state graph until the history/readback uses and stream-normalizer ownership are independently bounded. |
| Ordinary SDK option construction | `buildSdkOptions` calls the shared `buildClaudeCodeOptions`, wraps permission/elicitation to record trace ordering, and is called by normal runtime plus readback-query factories. | Stateless in itself, but its builder is also used by settings/probes and diagnostics; do not fork a second builder or move only one branch. |
| Diagnostic option construction | `resolveDiagnosticSettings`, `resolveDiagnosticCanUseTool`, `resolveDiagnosticOnElicitation`, `applyDiagnosticSdkOverrides`, `buildDiagnosticSdkOptions`, `lastDiagnosticSdkOptions`, and Capability Lab probes. | Diagnostic-only side channel; it is not ordinary chat and is deferred as one broad group. |
| Trace correlation/order | `trace`, `traceContextsBySession`, begin/bind/lookup/remember/clear/finish/terminal helpers and trace calls interleaved with lifecycle, SDK, normalizer, permission and elicitation paths. | One alias map and one safe writer; do not move individual helpers until CodeGraph returns a root-consistent, scope-bounded trace group. |

## CodeGraph status and reproducible method

`./node_modules/.bin/codegraph status --json` reported a complete 1.5.0 index,
`pendingChanges` all zero, and `worktreeMismatch: null`. No `init` was run. Every
row below was independently queried, then had direct callers and a finite depth-2
impact calculated from the repository root. `query` is the root-file confirmation;
caller lists exclude `file` and all other non-function/non-method nodes.

This is **not an exhaustive inventory of the 6,000-line class**, and it makes no
such claim. It covers the material symbol groups named by the review and every
symbol that the three deferred cards would need to move or call through. Remaining
Capability Lab probes, history/rewind helpers, resource discovery, process spawn,
and other methods are an explicit stop/defer condition: no new card may claim a
complete lifecycle until it first inventories its own transitive state/listener/
query dependencies with the same evidence format.

```bash
./node_modules/.bin/codegraph query 'ClaudeCodeAdapter::<symbol>' --json
./node_modules/.bin/codegraph callers 'ClaudeCodeAdapter::<symbol>' --json |
  jq '{symbol, directFunctionOrMethodCallers: [.callers[] |
    select(.kind == "function" or .kind == "method") |
    {name,kind,filePath,startLine}]}'
./node_modules/.bin/codegraph impact 'ClaudeCodeAdapter::<symbol>' --depth 2 --json |
  jq '{symbol,depth,nodeCount,edgeCount,
    root: .affected[0] | {name,kind,filePath,startLine}}'
```

### Session/runtime candidate: material groups assessed; not an exhaustive class inventory

| Query-confirmed root in `ClaudeCodeAdapter.ts` | Direct function/method callers | Depth-2 returned nodes/edges (returned impact root) | Decision |
|---|---|---|---|
| `ClaudeCodeAdapter::createSession` — `method:af5901e400c7cded8f45e0ee92bc3d49`, 1505–1521 | `AcpTransportOwner::sendMessage` is a **name/member collision**: it invokes its injected `createSession` callback, not this adapter method; smoke `createStartedAdapter` is test-only | 6 / 78 (`createSession`) | The root/radius are collision evidence, not an ACP→Claude lifecycle edge. No production Claude caller is type-confirmed by this result; retain/defer until a qualified adapter/registry call-site inventory proves one. |
| `deleteSession` 1523–1535 | none | 2 / 3 (`deleteSession`) | Coupled; retain/defer. |
| `updateSessionTitle` 1537–1554 | none | 2 / 2 (`updateSessionTitle`) | Calls retained `getSdk`; retain/defer. |
| `forkSession` 1947–1988 | `SettingsCapabilityLabSection::runForkDiagnostic` | 4 / 4 (`forkSession`) | Calls retained `getSdk`; retain/defer. |
| `sendMessage` 4686–4827 | test `startRuntime` | 4 / 83 (`sendMessage`) | Couples all stream/identity/trace groups; retain/defer. |
| `ClaudeCodeAdapter::cancelStream` — `method:fed907340bafc19a5db6040ee179c784`, 4829–4843 | `TabMessagesPaneCoordinator::disposePane` and `StreamChunkRouter::scheduleStreamTimeout` are **name/member collisions**: both invoke `StreamController.cancelStream`, not this adapter method | 9 / 14 (`cancelStream`) | The root/radius are collision evidence only; do not infer a chat→Claude cancellation lifecycle or fan-out from them. No production Claude caller is type-confirmed by this result; retain/defer until a qualified adapter/registry call-site inventory proves one. |
| `restartPersistentQueries` 4861–4876 | `SettingsClaudeCodeSection::restartClaudePersistentQueries` | 4 / 3 (`restartPersistentQueries`) | Coupled close lifecycle; retain/defer. |
| `captureSdkSessionId` 5293–5316 | `sendMessage` | 5 / 77 (`captureSdkSessionId`) | Mutates session alias and trace ordering together; retain/defer. |
| `getOrStartRuntime` 5424–5499 | `sendMessage` | 5 / 77 (`getOrStartRuntime`) | Calls retained `getSdk`; retain/defer. |
| `pumpRuntimeOutput` 5857–5903 | `getOrStartRuntime` | 3 / 2 (`pumpRuntimeOutput`) | Sole iterator; retain/defer. |
| `closeRuntime` 5905–5926 | `stop`, `dispose`, `deleteSession`, `cancelStream`, `restartPersistentQueries`, `captureSdkSessionId`, `getOrStartRuntime` | 19 / 37 (`closeRuntime`) | Coupled shutdown; retain/defer. |
| `getOrRestoreSession` 6009–6046 | `forkSession`, `rewindFiles`, `sendMessage` | 11 / 96 (`getOrRestoreSession`) | Also feeds history/rewind; retain/defer. |
| property `sessions` 1380 | `SettingsCapabilityLabSection::loadSubagents` is a **root conflation**: it calls typed `adapter.listSubagents(sessionId)` and never reads `ClaudeCodeAdapter.sessions`; `query ClaudeCodeAdapter::sessions` returned `ClaudeCodeAdapter::listSubagents` (`method:49658f8756e88b5d4e9c70f79d9e01f7`) | 4 / 6 (**returned root `listSubagents`**, not property) | Preserve this mismatch/radius as collision evidence only. The actual type-confirmed Settings edge is `loadSubagents → ClaudeCodeAdapter::listSubagents`, not a property read; the `sessions` property has no confirmed external reader here, so a property move remains a hard stop pending a qualified property/readback inventory. |
| property `cancelledSessions` 1381 | none | 1 / 0 (`cancelledSessions`) | Cannot split from cancel/runtime lifecycle. |
| property `invalidatedSessions` 1382 | none | 1 / 0 (`invalidatedSessions`) | Cannot split from delete/restore lifecycle. |
| property `postResultCallbacks` 1385 | none | 1 / 0 (`postResultCallbacks`) | Cannot split from sole stream pump. |

Additional lifecycle/listener symbols required before the same candidate can be
re-entered are material and were independently assessed. All query roots below are
one definition in `src/core/agents/backend/ClaudeCodeAdapter.ts`; direct caller
lists are function/method only.

| Root (confirmed line) | Direct function/method callers | Depth-2 nodes/edges (returned root) | Lifecycle/listener relationship |
|---|---|---|---|
| `ClaudeCodeAdapter::stop` — `method:d37471b55b09f9f9a9d82639c2f7e1e2`, 1453–1464 | `SettingsBackendSection::{addDefaultBackendSetting, setBackendEnabled}` call generic registry `AgentService.stop` and are not type-confirmed to Claude; test `registerStateAndHealthTests` is a **same-name collision** that calls `ServerManager.stop` | 10 / 17 (`stop`) | Preserve root/radius as collision evidence only. Source defines the adapter's own close/sink/listener/terminal-trace behavior, but no product caller is type-confirmed by this result; do not derive a Settings→Claude lifecycle edge without the required qualified registry inventory. |
| `dispose` 1466–1482 | `AgentServiceRegistry::dispose` | 8 / 12 (`dispose`) | Invalidates every session, clears registry/status/post-result listeners, closes all runtimes. |
| `onPostResultChunk` 1489–1492 | `PromptSuggestionService::attachAdapter` | 6 / 20 (`onPostResultChunk`) | Public listener registration; its set is consumed only by the runtime pump. |
| `firePostResultChunk` 1494–1498 | `pumpRuntimeOutput` | 3 / 2 (`firePostResultChunk`) | Private fan-out after the normal turn boundary; no separate listener owner may be introduced. |
| `ClaudeCodeAdapter::onStatusChange` — `method:05ad3575c4155a10052e6669ce37d4c9`, 1500–1503 | `ServerManager::setStatus` **(same-name collision, not a Claude caller)** | 9 / 15 (`onStatusChange`) | The root id/radius are collision evidence only: `ServerManager::setStatus` invokes its OpenCode server event callback, not `ClaudeCodeAdapter.onStatusChange`. The Claude product subscriber is not root-confirmed by this result; retain the façade-owned `statusValue`/handlers and hard-stop a move until a qualified/typed Claude subscription inventory is reproduced. |
| `applyToActiveQueries` 5276–5291 | `setModel`, `setPermissionMode`, `reloadMcpServers` | 15 / 23 (`applyToActiveQueries`) | Operates every active runtime; couples model/permission/MCP updates to the same session map. |
| `ensureReadyForQuery` 5850–5855 | `runCheckpointRewindProbe`, `runSetModelLiveProbe`, `runDiagnosticPrompt`, `runWarmStartupProbe`, `getOrStartRuntime`, all seven readback-query factories | 52 / 100 (`ensureReadyForQuery`) | Shared CLI/MCP/sink/status readiness boundary; blocks an ordinary stream-only extraction. |
| `loadMcpConfig` 5118–5150 | `start`, `reloadMcpServers`, `ensureReadyForQuery` | 56 / 65 (`loadMcpConfig`) | Shared cache/load lifecycle; not separable from readiness and active-query MCP fan-out. |
| `refreshMcpConfig` 5153–5156 | `reloadMcpServers` | 8 / 7 (`refreshMcpConfig`) | Invalidates the same MCP cache. |
| property `statusChangeHandlers` 1379 | none | 1 / 0 (`statusChangeHandlers`) | Façade listener truth; does not move with a query runtime. |
| property `statusValue` 1378 | none | 1 / 0 (`statusValue`) | Façade connection truth; remains with status listener contract. |
| property `cachedMcpServers` 4878 | none | 1 / 0 (`cachedMcpServers`) | Readiness/options/MCP mutation truth; does not move with a query runtime. |
| property `tracePort` 1387 | none | 1 / 0 (`tracePort`) | Injected diagnostics dependency; must not become a second writer. |
| property `options` 1386 | CodeGraph query returned no qualified property root; callers none | 1 / 0 (**returned `constructor`**, not property) | Another graph root discrepancy; retain in adapter and stop rather than infer a movable dependency bag. |

The four public lifecycle/update roots that re-enter any runtime proposal were
also reproduced independently. Each `query` result below resolved one method in
`src/core/agents/backend/ClaudeCodeAdapter.ts`; its opaque root id and line range
are recorded so a later inventory can detect a changed definition rather than
silently relying on a same-name symbol. Caller lists contain only CodeGraph
`function`/`method` nodes, and impact is explicitly depth 2.

| Query-confirmed root id and file | Direct function/method callers | Depth-2 nodes/edges | Current contract / scope consequence |
|---|---|---|---|
| `ClaudeCodeAdapter::start` — `method:b4c55c7d2c73472f9c96a00116692f7b`, `ClaudeCodeAdapter.ts:1438–1444` | 16 returned: `SettingsBackendSection::addDefaultBackendSetting`, `SettingsBackendSection::setBackendEnabled`, test `createStartedAdapter`, plus same-named `CodexAppServerClient::{listThreads, readThread, startThread, resumeThread, startTurn, startThreadCompaction, interruptTurn, listPermissionProfiles, listModels, getAccountRead, getAccountRateLimits, getAccountUsage, getModelProviderCapabilities}` | 78 / 181 | Loads MCP config, idempotently registers the prompt-suggestion sink, sets connected status, and records a lifecycle trace. The 13 unrelated `CodexAppServerClient` methods are a same-name CodeGraph conflation, not a resolution to a Claude caller; do not infer a narrower caller set from it. |
| `ClaudeCodeAdapter::setModel` — `method:f08f416b695d26d4d86d66a6a79865cd`, `ClaudeCodeAdapter.ts:4845–4847` | `runSetModelLiveProbe`, `getOrStartRuntime` — both are **same-name `Query.setModel` collisions**, not callers of the adapter method | 7 / 12 | The root id/radius prove a name collision only. Source confirms the adapter body fans `runtime.query?.setModel?.(model)` through `applyToActiveQueries`, but this caller result does not establish any Claude product caller. Re-entry must first run the qualified root query and a typed call-site inventory for `ClaudeCodeAdapter` / registry key `claude-code`; until then no fan-out parity claim may rely on these two results. |
| `ClaudeCodeAdapter::setPermissionMode` — `method:4798f53573caa4c338cf81ce9d9ac97a`, `ClaudeCodeAdapter.ts:4849–4851` | `switchClaudeCodePermissionModeInPlugin`, `launchOrdinaryChatPermissionProof`, `applyClaudePermissionMode` | 9 / 11 | Fans `query.setPermissionMode(mode)` to every active query; preserve the active-query behavior and permission results when characterizing a future split. |
| `ClaudeCodeAdapter::reloadMcpServers` — `method:998a0362e0dae63cdca8f7810cb3adcc`, `ClaudeCodeAdapter.ts:4853–4859` | `CodexMcpServerDetailModal::handleReload`, `createCodexMcpServerDetailHost`, and `SettingsCodexReadbackControls::reloadCodexMcpServers` are **Codex same-name collisions**; `SettingsClaudeCodeSection::reloadClaudeMcpServers` is the one Claude-labelled structural optional call at `SettingsClaudeCodeSection.ts:2973–2978`, but CodeGraph does not type-confirm it to the root | 15 / 16 | The root id/radius retain collision evidence, not three Claude callers. Source confirms this method refreshes/loads MCP then passes its resulting map to `query.setMcpServers(...)` through `applyToActiveQueries`; future re-entry must query the qualified root and inventory typed `claude-code` registry retrieval through `reloadClaudeMcpServers` before treating that source call as a product caller. |

`ensureReadyForQuery()` independently loads MCP config, registers the same sink,
and sets connected status; an explicit `start()` is therefore not required before
the first query. This implicit readiness path is a re-entry parity requirement,
not evidence that `start()` can be omitted from the lifecycle inventory.

For every collision above, reproduce `codegraph query
'ClaudeCodeAdapter::<symbol>' --json`, then a source call-site inventory that
follows the value retrieved from `agentServiceRegistry.get('claude-code')` (or a
statically typed `ClaudeCodeAdapter`) to the invocation. Record the qualified
caller symbol, file, line, and finite depth-2 result before calling it a Claude
product caller. The present plan has not completed that inventory for
`setModel`, `onStatusChange`, or the structural `reloadClaudeMcpServers` call;
the hard stop remains. The lifecycle/fan-out acceptance assertions below derive
from the adapter bodies and focused characterization tests, **not** from any
same-name CodeGraph caller result.

The same hard stop applies to the collision rows above: re-entry must query each
qualified adapter root, inventory every typed `ClaudeCodeAdapter` invocation and
the value flow from `agentServiceRegistry.get('claude-code')`, and separately
inventory callback injection sites such as `AcpTransportOwner` and generic
`StreamController`/`AgentService` calls. Record qualified caller, file, line,
runtime type proof, and depth-2 result before claiming a production Claude edge.
Until then the only newly established product edge in this group is
`SettingsCapabilityLabSection::loadSubagents → ClaudeCodeAdapter::listSubagents`;
it establishes neither an external `sessions` property read nor an ownership
transfer. None of these collision radii establishes fan-out or lifecycle parity.

The shared load boundary was also assessed rather than assumed:

| Root | Direct method callers | Depth-2 result | Consequence |
|---|---|---|---|
| `getSdk` 5983–5999 | 20: `updateSessionTitle`, `listSessions`, `getSession`, `getSessionMessages`, `listSubagents`, `getSubagentMessages`, `importSessionToStore`, `forkSession`, `runCheckpointRewindProbe`, `resolveClaudeUserMessageIdentities`, `runSetModelLiveProbe`, `runDiagnosticPrompt`, `runWarmStartupProbe`, `getOrStartRuntime`, `getModelCatalogQuery`, `getRuntimeCatalogQuery`, `getRuntimeSettingsQuery`, `getContextUsageQuery`, `getAccountInfoQuery`, `getRuntimeFileQuery` | 82 nodes / 157 edges; returned root `getSdk` in adapter | Keep in adapter. The breadth crosses settings/chat consumers through those methods; no shared SDK promise or raw SDK port may move. |
| property `sdkLoadPromise` 1383 | none | 1 / 0; returned root property | Keep in adapter with `getSdk`; this is a deliberate non-move. |

The source has **21** syntactic direct `this.getSdk()` invocations (lines 1551,
1563, 1821, 1841, 1864, 1887, 1913, 1948, 2047, 2412, 2496, 2628, 2708, 5459,
5518, 5557, 5618, 5675, 5732, 5789, **5838**). CodeGraph reports 20 direct
function/method callers and omits the source-direct invocation in
`getMcpServerStatusQuery` at line 5838. This plan does **not** invent agreement:
the source result is an additional unresolved graph discrepancy and a hard stop
for any SDK/runtime ownership transfer.

### SDK options and diagnostic candidate: every coupled group assessed

| Query-confirmed root | Direct function/method callers | Depth-2 nodes/edges (returned root) | Decision |
|---|---|---|---|
| `buildSdkOptions` 4880–4977 | 8: `getOrStartRuntime`, `getModelCatalogQuery`, `getRuntimeCatalogQuery`, `getRuntimeSettingsQuery`, `getContextUsageQuery`, `getAccountInfoQuery`, `getRuntimeFileQuery`, `getMcpServerStatusQuery` | 17 / 16 (`buildSdkOptions`) | Deferred with its builder; readback callers make an ordinary-only extraction incomplete. |
| `buildClaudeCodeOptions` in `ClaudeCodeOptionsBuilder.ts` 201–446 | `SettingsCapabilityLabSection::runRestrictedBuiltinToolsProof`, `executeCheckpointRewindProbe`, `runSetModelLiveProbe`, `buildSdkOptions`, `buildDiagnosticSdkOptions` | 40 / 42 (`buildClaudeCodeOptions`) | Shared with settings + diagnostics; do not create a parallel option builder or target owner yet. |
| `buildDiagnosticSdkOptions` 5059–5095 | 16: `runDiagnosticPrompt`, `runWarmStartupProbe`, `runPromptSuggestionsReadbackProbe`, `runSystemPromptReadbackProbe`, `runOutputStyleLiveProbe`, `runTaskBudgetReadbackProbe`, `runSandboxReadbackProbe`, `runPlanModeInstructionsReadbackProbe`, `runToolAliasesReadbackProbe`, `runDebugFileReadbackProbe`, `runDebugFileLiveProbe`, `runStrictMcpConfigReadbackProbe`, `runDebugReadbackProbe`, `runContext1mBetaReadbackProbe`, `runJsRuntimeReadbackProbe`, `runLoadTimeoutReadbackProbe` | 58 / 165 (`buildDiagnosticSdkOptions`) | Hard stop: diagnostic fan-in/cross-scope group remains adapter-owned. |
| `resolveDiagnosticSettings` 4979–5014 | `buildDiagnosticSdkOptions` | 18 / 17 (`resolveDiagnosticSettings`) | Deferred with diagnostic root. |
| `resolveDiagnosticCanUseTool` 5016–5025 | `buildDiagnosticSdkOptions` | 18 / 17 (`resolveDiagnosticCanUseTool`) | Deferred with diagnostic root. |
| `resolveDiagnosticOnElicitation` 5027–5036 | `buildDiagnosticSdkOptions` | 18 / 17 (`resolveDiagnosticOnElicitation`) | Deferred with diagnostic root. |
| `applyDiagnosticSdkOverrides` 5038–5057 | `buildDiagnosticSdkOptions` | 18 / 17 (`applyDiagnosticSdkOverrides`) | Deferred with diagnostic root. |
| `inspectLastDiagnosticSdkOptions` 5103–5111 | `SettingsCapabilityLabSection::runHookProof`, `runFallbackModelProof`, `runStableSettingsReadbackProof`, `runEnvironmentVariablesProof`, `runAgentDefinitionProof`, `runRestrictedBuiltinToolsProof` | 9 / 14 (`inspectLastDiagnosticSdkOptions`) | Public deep-clone readback seam; moves only with diagnostic state, never ordinary options. |
| property `lastDiagnosticSdkOptions` 1384 | none | 1 / 0 (`lastDiagnosticSdkOptions`) | Mutable diagnostic cache; remains with its diagnostic root. |

All seven runtime/readback query factories are also material to the deferred SDK
group because each may reuse the active session query or create a temporary SDK
query after readiness, then calls `buildSdkOptions`. Their roots are all confirmed
in the adapter; direct callers and finite depth results are:

| Query factory root | Direct function/method caller | Depth-2 nodes/edges | Why it blocks a raw readback port |
|---|---|---|---|
| `getModelCatalogQuery` 5501–5528 | `supportedModels` | 4 / 7 | Reuses active query or invokes retained `getSdk`. |
| `getRuntimeCatalogQuery` 5530–5590 | `getRuntimeCatalog` | 6 / 11 | Active-query capability absence is semantically distinct from temporary query. |
| `getRuntimeSettingsQuery` 5592–5647 | `getRuntimeSettings` | 3 / 6 | Reuse/temporary lifecycle and close semantics. |
| `getContextUsageQuery` 5649–5704 | `getContextUsage` | 5 / 7 | Reuse/temporary lifecycle and close semantics. |
| `getAccountInfoQuery` 5706–5761 | `getAccountInfo` | 5 / 8 | Reuse/temporary lifecycle and close semantics. |
| `getRuntimeFileQuery` 5763–5819 | `readRuntimeFile` | 4 / 4 | Reuse/temporary lifecycle and close semantics. |
| `getMcpServerStatusQuery` 5821–5848 | `getMcpServerRuntimeStatuses` | 4 / 5 | Includes the source-direct retained `getSdk()` call at line 5838 missing from CodeGraph's 20-caller result. |

### Trace candidate: every coupled helper assessed

| Query-confirmed root | Direct function/method callers | Depth-2 nodes/edges (returned impact root) | Decision |
|---|---|---|---|
| `trace` 1428–1436 | `deleteSession`, `updateSessionTitle`, `importSessionToStore`, `rewindFiles`, `sendMessage`, `cancelStream`, `buildSdkOptions`, `finishTraceTurn`, `pumpRuntimeOutput` | 29 / 132 (**returned `traceContextForSession`**, not queried `trace`) | Root disagreement plus all-lifecycle fan-in: hard stop. |
| `beginTraceTurn` 5319–5335 | `sendMessage` | 5 / 78 (`beginTraceTurn`) | Deferred with correlation map. |
| `traceContextForSession` 5337–5346 | `deleteSession`, `updateSessionTitle`, `importSessionToStore`, `rewindFiles`, `sendMessage`, `cancelStream`, `buildSdkOptions`, `finishTraceTurn`, `pumpRuntimeOutput` | 29 / 132 (`traceContextForSession`) | Broad lookup; deferred. |
| `rememberTraceContext` 5348–5352 | `forkSession`, `captureSdkSessionId`, `beginTraceTurn`, `getOrRestoreSession` | 9 / 13 (`rememberTraceContext`) | Couples local/SDK alias state; deferred. |
| `clearTraceContext` 5354–5357 | `deleteSession` | 3 / 4 (`clearTraceContext`) | Deferred with map. |
| `finishTraceTurn` 5359–5365 | `stop`, `dispose`, `deleteSession` | 11 / 21 (`finishTraceTurn`) | Deferred with terminal lifecycle. |
| `finishTraceContext` 5367–5374 | `sendMessage`, `cancelStream`, `finishTraceTurn`, `recordTraceTerminal` | 13 / 96 (`finishTraceContext`) | Deferred with terminal lifecycle. |
| `recordTraceTerminal` 5376–5396 | `sendMessage` | 5 / 78 (`recordTraceTerminal`) | Deferred with error/normal terminal ordering. |

## Deferred candidate cards (not implementation authorization)

### A. Session/runtime + persistent SDK query lifecycle — deferred

- **Deferred owner / retirement:** `core.backend` remains the sole owner through
  **Phase 5, expiry 2026-09-01**. On that date, perform a new inventory plus
  independent review/merge checkpoint, or record an explicit Phase-6 deferral
  decision with an owner and replacement expiry; implementation without either is
  forbidden.
- **Why it cannot yet be bounded:** `sessions` is used by subagent/history readback, while all practical creation/validation/rename/fork commands converge on the retained 20-caller `getSdk`. Moving the map, query or its SDK-load promise now either duplicates state/listeners or requires a raw mutable SDK/Query escape hatch. Both violate the canonical-state and narrow-port constraints.
- **No files / owner transfer are authorized now:** do not create `claude-runtime/**`, do not modify `ClaudeCodeAdapter.ts`, and do not edit the manifest. The current source and sole owner stays `core.backend`; target is **none**. Consequently the exact manifest delta for this plan is **zero**.
- **Re-entry port, only after a new inventory:** a coordinator may receive immutable, constrained commands such as `startQuery`, `validateCapturedResume`, `renameCapturedSession`, and `forkCapturedSession`; it may not receive `getSdk`, `sdkLoadPromise`, a mutable `Query`, a general `withActiveOrTemporaryQuery`, a trace alias map, or a trace-port writer. It may emit immutable lifecycle facts only through the retained safe trace boundary. Before proposing it, inventory `ClaudeCodeStreamNormalizer`, history/subagent/readback methods, every callback/normalizer dependency, and every trace-interleaving site so one owner can hold the whole session graph without duplicating trace state or collapsing trace phases.
- **Re-entry characterization must include lifecycle parity:** after that whole
  session/readback/normalizer inventory, prove both explicit `start()` and
  implicit `ensureReadyForQuery()` paths load MCP config, register the
  prompt-suggestion sink exactly once/idempotently, and reach connected status.
  Prove from focused runtime tests—not from the same-name caller results—a model
  update reaches every active `Query` without duplicating any runtime; a
  permission update reaches every active `Query` while preserving its mode and
  permission results; and MCP reload refreshes config then pushes the exact
  resulting server map to every active `Query`. These are falsifiable re-entry
  tests, not an authorization to add them now.
- **Future owner-manifest delta required before any source move:** the exact
  current `core.backend` responsibility string is
  `"agent backend adapters and transports for OpenCode, Codex and Claude"`; replace
  it only with `"agent backend adapters and transports for OpenCode, Codex and Claude excluding only Claude local-session, persistent-query and stream lifecycle"`.
  Its exact current canonical-state string is `"Claude/Codex/OpenCode adapter state"`;
  replace it only with `"Claude/Codex/OpenCode adapter state excluding only Claude local-session, persistent-query and stream runtime state"`.
  Leave the other current `core.backend` responsibility strings—`"Claude settings
  source, project resource secure write, configuration archive"` and `"backend
  model catalog and routing"`—and canonical-state strings—`"agent service
  registry instances"` and `"backend model catalog"`—literal and unchanged. This
  removes only the delegated Claude session/runtime/stream truth, preserving all
  OpenCode, Codex, and non-session Claude adapter/transport responsibilities.
  Change `core.backend.delegatesTo` exactly from
  `["core.backend-diagnostics"]` to
  `["core.backend-diagnostics", "core.backend-claude-runtime"]`.
  Add this complete owner object to the `owners` array (all key spelling and array
  shapes are literal):

  ```json
  {
    "id": "core.backend-claude-runtime",
    "layer": "core",
    "include": [
      "src/core/agents/backend/claude-runtime/**"
    ],
    "delegatesTo": [],
    "responsibilities": [
      "Claude local-session, persistent-query and stream lifecycle"
    ],
    "canonicalState": [
      "Claude local-session registry, cancellation/invalidation, persistent-query and stream runtime"
    ],
    "entrypoints": [
      "src/core/agents/backend/claude-runtime/ClaudeCodeSessionRuntimeCoordinator.ts"
    ],
    "allowedOwnerDependencies": [
      "shared.foundation",
      "shared.diagnostics",
      "core.types"
    ],
    "forbiddenDependencies": [
      "feature",
      "app"
    ],
    "adjacentOwners": [
      "core.backend",
      "core.backend-diagnostics",
      "core.agents"
    ],
    "tests": [
      "tests/unit/core/agents/backend/claude-runtime/**"
    ],
    "overviewDoc": "docs/architecture/owners/core-backend-claude-runtime.md",
    "requiredGates": [
      "typecheck",
      "module-docs",
      "diagnostics-safety"
    ],
    "risk": "high"
  }
  ```

  **Read-only shape validation performed for this plan:** the current schema in
  `scripts/architecture-owner-lib.mjs` requires the listed plural JSON keys as
  arrays, a non-empty `overviewDoc`, a supported `layer`/`risk`, valid cross-owner
  references, and canonical-state uniqueness. The following command extracted the
  complete object above in-memory and returned `true`; it writes neither the plan
  nor the real manifest. `npm run check:owner-manifest` also passed against the
  untouched current manifest.

  ````bash
  awk '
    /^  ```json$/ { in_json = 1; next }
    in_json && /^  ```$/ { exit }
    in_json { sub(/^  /, ""); print }
  ' docs/superpowers/plans/2026-08-01-claude-adapter-owner-slices.md |
    jq -e '[
      has("id"), has("layer"), has("include"), has("delegatesTo"),
      has("responsibilities"), has("canonicalState"), has("entrypoints"),
      has("allowedOwnerDependencies"), has("forbiddenDependencies"),
      has("adjacentOwners"), has("tests"), has("overviewDoc"),
      has("requiredGates"), has("risk"),
      (.layer == "core"), (.include | type == "array"),
      (.delegatesTo | type == "array"),
      (.responsibilities | type == "array" and length > 0),
      (.canonicalState | type == "array"), (.entrypoints | type == "array"),
      (.allowedOwnerDependencies | type == "array"),
      (.forbiddenDependencies | type == "array"),
      (.adjacentOwners | type == "array"), (.tests | type == "array"),
      (.overviewDoc | type == "string" and length > 0),
      (.requiredGates | type == "array"), (.risk == "high")
    ] | all'
  # true
  npm run check:owner-manifest
  # PASS owner-manifest (against the untouched current manifest)
  ````

  This is executable only if the re-inventory eliminates every otherwise-needed
  import of `core.backend`; adding that dependency would require a separate cycle
  review, not an exception. The future transaction must modify existing
  `src/core/agents/backend/ClaudeCodeAdapter.ts` and its mapped document
  `docs/modules/core/agents/backend/ClaudeCodeAdapter.md`; create
  `src/core/agents/backend/claude-runtime/ClaudeCodeSessionRuntimeCoordinator.ts`,
  `tests/unit/core/agents/backend/claude-runtime/ClaudeCodeSessionRuntimeCoordinator.test.ts`,
  the focused existing-runtime suites
  `tests/unit/core/agents/backend/ClaudeCodeAdapter.test.ts` and
  `tests/unit/core/agents/backend/ClaudeCodeSmokeHarness.test.ts`, and the
  lifecycle-crossing trace suite
  `tests/unit/core/agents/backend/ClaudeCodeAdapter.trace.test.ts`; create the
  exact `overviewDoc` above, and
  `docs/modules/core/agents/backend/claude-runtime/ClaudeCodeSessionRuntimeCoordinator.md`.
  It must update `docs/architecture/owners/core-backend.md`,
  `docs/architecture/README.md`, `docs/modules/README.md`, and
  `module-docs.config.json` if its guard needs an explicit new mapping, together
  with the stated `architecture-owners.config.json` delta.

  The coordinator is private and directly imported only by
  `ClaudeCodeAdapter.ts`: do **not** add `src/core/agents/backend/claude-runtime/index.ts`,
  do **not** re-export it from `src/core/agents/backend/index.ts`, and do **not**
  change `docs/modules/core/agents/backend/index.md` for this transaction. The
  one independently revertible implementation commit must include every listed
  source, existing/new test (explicitly including
  `tests/unit/core/agents/backend/ClaudeCodeAdapter.trace.test.ts`), manifest,
  owner/module doc, and required index/config change; its rollback reverts that
  exact complete set and the canonical-state transfer atomically.
  Structured delegation makes the target sole effective owner: after creation,
  `npm run inspect:owner -- src/core/agents/backend/claude-runtime/ClaudeCodeSessionRuntimeCoordinator.ts --json`
  must resolve exactly `core.backend-claude-runtime`, and the manifest checker must
  report no ambiguous path/canonical state.
- **Required characterization / acceptance / rollback if re-entered:** prove one iterator/queue/runtime per session, exactly-once close/interrupt, ordinary option shape, alias identity, resume mismatch failure, fork, permission/elicitation resolve-and-reject, and cancellation parity, plus the explicit/implicit readiness and active-query update parity above. The included trace suite must also prove lifecycle trace ordering is unchanged; redaction containment; absent-port behavior; throwing-port isolation; and capture's final state `off`. The runtime coordinator may not create a second trace map, writer, ring, capture state, or trace phase: correlation/order remains separated in the existing trace transaction. One revertible commit may include only the complete lifecycle, owner/doc changes, and every named focused test (including `ClaudeCodeAdapter.trace.test.ts`); its rollback reverts that whole owner transaction atomically. Abort on a second map/listener or trace state, SDK-load transfer, raw query capability, new feature/app edge, multiple owner result, or a changed finite-depth root that crosses the reviewed set.

### B. Ordinary SDK options + permission/elicitation dispatch — deferred

- **Deferred owner / retirement:** `core.backend` remains the sole owner through
  **Phase 5, expiry 2026-09-01**. On expiry, require a fresh builder-consumer
  inventory and independent review/merge checkpoint, or make an explicit
  owner/expiry deferral decision before Phase 6.
- **Why it cannot yet be bounded:** `buildSdkOptions` shares `buildClaudeCodeOptions` with settings/probe paths and is called by runtime **and** readback factories. The diagnostic group has the reproduced 16-caller, 58/165 fan-in and cannot be reclassified as ordinary chat. Moving only ordinary wrappers would create a second construction policy or change callback/trace order.
- **No files / owner transfer are authorized now:** source remains `core.backend`, target is **none**, and the manifest delta is **zero**. Do not create `claude-sdk/**` and do not change `ClaudeCodeOptionsBuilder.ts`, permission bridge, elicitation bridge, `main.ts`, or UI hosts.
- **Re-entry requirements:** first establish whether all consumers of `buildClaudeCodeOptions` form one complete core-only lifecycle, or explicitly split *by independently proven behavior* without a new builder. Any future target owner must be delegated explicitly by `core.backend`, specify its allowed/adjacent dependencies and sole canonical state (expected to be none if stateless), and preserve injected permission host/elicitation host ownership. It must retain normal options, captured resume id, title semantics, MCP/sessionStore/hooks/tool/plugin/skill/agent/output values and exact request → bridge/host → decision/response-or-throw trace order. The re-entry tests must show normal option construction and permission behavior are unchanged for ordinary sends as well as for their resolve and reject cases; diagnostic-only flags/options must remain out of that path.
- **Characterization / acceptance / rollback:** retain current normal-option and diagnostic probes; add option-shape parity and permission/elicitation resolve/reject ordering assertions. A future standalone commit is revertible only if it does not move diagnostics and does not create a second builder/cache/listener. Abort if the builder's settings/probe callers cannot be brought into the same owner without feature/app dependencies or if diagnostic flags leak into ordinary sends.

### C. Trace correlation and ordering — deferred

- **Deferred owner / retirement:** `core.backend` remains the deferred source
  owner through **Phase 5, expiry 2026-09-01**. On expiry, refresh the graph,
  review the root discrepancy, and either hold a reviewed merge checkpoint or
  record an explicit `core.backend`/`core.backend-diagnostics` Phase-6 deferral
  with a new expiry; never silently carry it forward.
- **Why it cannot yet be bounded:** the entire local/SDK alias map and every helper must move together, but CodeGraph's depth-2 `impact trace` root is `traceContextForSession` rather than the query-confirmed `trace`. That discrepancy, combined with lifecycle/history/options callers above, is an explicit scope-stop condition. Do not treat a same-file returned root as confirmation of the requested symbol.
- **No files / owner transfer are authorized now:** source remains `core.backend`, target is **none**, manifest delta is **zero**. `core.backend-diagnostics` remains owner of trace service/store/redaction only; no `ClaudeAdapterTraceEmitter` is authorized.
- **Re-entry requirements:** refresh/repair the CodeGraph result, then characterize the full safe event sequence: provisional begin at input push; bind real SDK id before SDK envelope/normalized chunks; permission and elicitation request before their decision/response/error; `is_error` result/error chunks become error terminal; cancellation/delete/stop/dispose finish once. An emitter, if ever proposed, owns the only alias map and safe trace invocation, receives immutable ids/facts (not a session/runtime), and never awaits/changes SDK behavior.
- **Future exact manifest delta and physical path:** create
  `src/core/agents/backend/diagnostics/ClaudeAdapterTraceEmitter.ts`. The parent
  path matches both current `core.backend.include` (`src/core/agents/backend/**`)
  and existing `core.backend-diagnostics.include`
  (`src/core/agents/backend/diagnostics/**`); the unchanged exact relationship
  `core.backend.delegatesTo: ["core.backend-diagnostics"]` reduces that overlap to
  the **sole effective owner** `core.backend-diagnostics`. Replace the exact
  `core.backend` responsibility string
  `"agent backend adapters and transports for OpenCode, Codex and Claude"` with
  `"agent backend adapters and transports for OpenCode, Codex and Claude excluding Claude trace correlation"`;
  replace exact canonical string `"Claude/Codex/OpenCode adapter state"` with
  `"Claude/Codex/OpenCode adapter state excluding Claude trace-context correlation"`.
  Append to `core.backend-diagnostics.responsibilities` the exact string
  `"Claude adapter trace-context correlation and event ordering"` and append to
  its `canonicalState` the exact string `"Claude adapter trace-context alias map"`.
  Existing diagnostics allowed `["shared.foundation", "shared.diagnostics"]`,
  forbidden `["feature", "app"]`, and adjacent owners stay unchanged unless a
  renewed inventory proves otherwise. Before a source move,
  `npm run inspect:owner -- src/core/agents/backend/diagnostics/ClaudeAdapterTraceEmitter.ts --json`
  must return only `core.backend-diagnostics`, and `npm run check:owner-manifest`
  must prove exactly-one ownership and canonical-state uniqueness.
- **Characterization / acceptance / rollback:** a future transaction must modify
  existing `src/core/agents/backend/ClaudeCodeAdapter.ts` and its mapped module
  document `docs/modules/core/agents/backend/ClaudeCodeAdapter.md`; create
  `src/core/agents/backend/diagnostics/ClaudeAdapterTraceEmitter.ts`,
  `tests/unit/core/agents/backend/diagnostics/ClaudeAdapterTraceEmitter.test.ts`,
  and exact module document
  `docs/modules/core/agents/backend/diagnostics/ClaudeAdapterTraceEmitter.md`; and
  modify/retain `tests/unit/core/agents/backend/ClaudeCodeAdapter.trace.test.ts`.
  Those tests retain provisional-bind, late-id, cancellation/delete, no-port, and
  throwing-hook coverage; add ordered assertions for ordinary stream, permission,
  and elicitation plus permission/elicitation throwing-hook, redaction, and
  capture-off canaries below. The same atomic transaction must update
  `docs/architecture/owners/core-backend.md`,
  `docs/architecture/owners/core-backend-diagnostics.md`,
  `docs/architecture/README.md`, and `docs/modules/README.md`, update
  `module-docs.config.json` if required by the module-doc guard, and make the
  listed `architecture-owners.config.json` manifest changes.

  `ClaudeAdapterTraceEmitter` is private and directly imported by
  `ClaudeCodeAdapter.ts`. Therefore the transaction must not modify
  `src/core/agents/backend/diagnostics/index.ts`,
  `src/core/agents/backend/index.ts`,
  `docs/modules/core/agents/backend/diagnostics/index.md`, or
  `docs/modules/core/agents/backend/index.md`; no diagnostics-barrel re-export
  or barrel-doc change is permitted. Its rollback must revert every listed
  source, existing/new test, manifest, owner-doc, module-doc, required docs index,
  and mapping/config artifact together with the canonical-state transfer; it may
  not move session/runtime state. This remains deferred: no source authorization
  is granted by Task 16. Abort on any root mismatch, second alias map, awaited
  trace call, secret copy, or feature/app import.

  The existing throwing-hook test is insufficient: its method loop omits
  `recordPermission` and `recordElicitation`. A future trace change must add two
  dedicated throwing-hook canaries. Each must prove that a `recordPermission` or
  `recordElicitation` throw cannot escape; the underlying permission/elicitation
  resolve **and reject** result stays unchanged; no secret canary or absolute-path
  canary appears in capture, report, or export; and capture's final state is `off`.
  These are future characterization tests only—Task 16 adds no tests.

The exact manifest deltas above are mutually exclusive future transactions from
the current manifest snapshot. They must not be applied concurrently. If a prior
approved card has changed either literal parent string, the next card stops and
derives a new BEFORE/AFTER delta from that merged manifest under fresh review.

## Required gates before any deferred card may become a proposed slice

For **each** card, and before a source edit, run and record:

1. focused characterization tests plus new contract tests for that exact lifecycle;
2. CodeGraph `query`, `callers`, finite `impact --depth 2` for every moved/coupled symbol, then `git diff --name-only --diff-filter=ACMR | ./node_modules/.bin/codegraph affected --stdin --path . --json` after edits;
3. `npm run inspect:owner -- <each new/changed path> --json`, `npm run check:owner-manifest`, `npm run check:owner-boundaries`, `npm run check:dependency-direction`, `npm run check:architecture-cycles`, `npm run check:architecture-approvals`, full `npm run verify:architecture`, and `npm run check:module-docs`; record dependency direction and architecture-cycle output proving no reverse type/runtime edge and one canonical-state owner;
4. diagnostics-safety tests for any trace/permission/elicitation touch, including missing/throwing trace ports and secret-redaction invariants;
5. `npm run graphify:update:src`, `npm run check:graphify`, `npm run verify`, and a fresh `npm run build` production build;
6. Test Vault deployment only if the final diff touches a deploy-relevant path listed in `AGENTS.md` (for example `src/main.ts`, settings/style/theme/assets/manifest); otherwise record that deployment is not triggered. If triggered, deploy sequentially and verify `BUILD_ID`.

## Phase 5 `main.ts` type-import metric (incoming) and separate composition note

The Phase 5 metric is **incoming Claude-backend imports of `main.ts`**—not the
imports declared by `main.ts`. Baseline is **0** and target is **0**:

```bash
$ rg -n -U -P -g '*.ts' '(?s)^\s*import\s+(?:type\s+)?(?:[^;]*?)\s+from\s+[\x27\x22][^\x27\x22]*(?:/|\.)main(?:\.ts)?[\x27\x22]' src/core/agents/backend
$ rg -n -U -P -g '*.ts' '(?s)^\s*import\s+(?:type\s+)?(?:[^;]*?)\s+from\s+[\x27\x22][^\x27\x22]*(?:/|\.)main(?:\.ts)?[\x27\x22]' src/core/agents/backend | wc -l
       0
# `-U -P` consumes multiline import declarations, unlike a one-line regex.
```

For clarity only, outbound composition imports in `main.ts` are a separate,
non-goal guard for this task: there are 8 Claude-domain import declarations, one
`import type` declaration, and **3 type-only bindings**—two (`ElicitationRequest`,
`ElicitationResult`) at line 3 and one
`ClaudeCodePermissionBridgeHostContext` at line 23. This artifact leaves them
unchanged; it neither claims nor requires a main-composition reduction.

```bash
$ sed -n '3p;15p;17p;22p;23p;24p;25p;31p' src/main.ts
import type { ElicitationRequest, ElicitationResult } from '@anthropic-ai/claude-agent-sdk';
import { ClaudeCodeAdapter } from './core/agents/backend/ClaudeCodeAdapter';
import {
import { adaptMcpConfigForClaude } from './core/agents/backend/ClaudeCodeMcpConfigAdapter';
import { type ClaudeCodePermissionBridgeHostContext, createClaudeCodePermissionBridgeHost } from './core/agents/backend/ClaudeCodeDefaultPermissionHost';
import { ClaudeCodePermissionBridge, createClaudeCodePermissionBridge } from './core/agents/backend/ClaudeCodePermissionBridge';
import { loadClaudeCodeSdk } from './core/agents/backend/ClaudeCodeSdkLoader';
import { ClaudeSessionTraceService, collectClaudeCodeKnownSecrets, CodexSessionTraceService } from './core/agents/backend/diagnostics';
```

## Task 15 SCC debt and zero-production-change evidence

`task15-chat-runtime-composition-scc-member` is the active
**ChatRuntimeComposition chat/settings/main mixed-SCC** exception (expiry
2027-02-01), not a `core.backend` exception. It remains untouched: this plan does
not move chat coordinators, settings composition, or `main.ts`, and does not retire
or expand the exception. It is only a cross-scope debt guard: a later Claude slice
must prove its affected report adds no `OpenCodianView` / `feature.chat-*` edge;
incidental edge removal is evidence for the later debt task only.

This Task 16 repair changes only this documentation file. Before handoff, the
following must show no production/test source path and a clean patch:

```bash
git diff --name-only -- src ':!src/**/*.test.ts'
git ls-files --others --exclude-standard -- src ':!src/**/*.test.ts'
git diff --check
git diff --no-index --check /dev/null docs/superpowers/plans/2026-08-01-claude-adapter-owner-slices.md
git status --short
```

The `git diff --no-index --check` command intentionally exits **1** because the
plan is untracked; expected output is otherwise empty (no whitespace diagnostics).
Treat any whitespace output as a documentation repair failure. Keep the normal
`git diff --check` command too, because it covers tracked changes.

The plan awaits another independent adversarial review. It does not claim approval
or execute implementation, ledger, deployment, or gate closure.
