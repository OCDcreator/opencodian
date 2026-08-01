# OpenCodeService convergence inventory and slice decision — 2026-08-01

## Task 17 boundary and decision

This is Phase 5 / Task 17's dated, docs-only inventory. It authorizes no production,
test, manifest, configuration, generated-graph, ledger, devlog, or approval change.
The only Task 17 artifact is this file.

**Decision: no implementation slice is approved.** OpenCodeService remains the
core.opencode hybrid facade. The apparently small remaining seams all join a complete
SDK-first/legacy lifecycle, an active listener/stream lifecycle, or the sole canonical
OpenCodeSessionStateStore. Until a later inventory pins both transport parity and
exclusive state truth, extracting any one seam would either make a duplicate
cache/listener, expose a mutable client/map, or add a runtime forwarding shim. Those
are hard stops.

Existing thick coordinators already own lifecycle, session, streaming, sync,
question/permission, catalog, and capability units. This review finds no independently
revertible new unit whose whole lifecycle is currently proven by CodeGraph and
characterization coverage.

## Owner facts and non-negotiable contracts

npm run inspect:owner -- src/core/opencode/OpenCodeService.ts --json resolved one
high-risk owner, core.opencode, with these literal manifest entries:

- responsibilities: "OpenCode hybrid facade (SDK v2 primary, legacy HTTP/SSE fallback)",
  "canonical session/message/part state in OpenCodeSessionStateStore", and
  "streaming, sync events, lifecycle, catalog, capability and server management";
- canonical state: "OpenCode canonical session/message/part state",
  "OpenCode streaming/lifecycle coordinators", and "OpenCode server lifecycle";
- entrypoints: src/core/opencode/index.ts, src/core/opencode/OpenCodeService.ts,
  src/core/opencode/OpenCodeSessionStateStore.ts, and src/core/opencode/ServerManager.ts.

Its manifest permits only shared.foundation, shared.diagnostics, and core.types; feature
and app are forbidden. core.opencode-diagnostics is its only current delegate. The active
Task 15 mixed-SCC exception belongs to chat composition, not this owner; Task 17 neither
changes nor retires it.

1. SDK v2 remains first for enabled CRUD/prompt/stream/abort/question/sync surfaces.
   Legacy HTTP and /event SSE stay behaviorally available. Stream fallback remains
   allowed only before the first SDK event; an error after one SDK event remains an error.
2. OpenCodeSessionStateStore remains the **only writable canonical** session/message/part
   and diff truth. Snapshot reload, optimistic user seed, SDK/legacy stream mutations,
   sync mutations and delete all write there; public canonical reads are cloned projections.
3. OpenCodeStreamingRuntimeCoordinator owns active stream contexts and abort/detach;
   OpenCodeSyncEventRuntimeCoordinator owns the three listener sets, wanted state,
   controller and subscription loop; OpenCodeEventSubscriptionCoordinator owns global
   loops. No port can leak a mutable Map, controller, reader, SDK client, callback set,
   or raw store.
4. main.ts constructs OpenCodeService. It must not gain an incoming src/core/opencode
   import except a recorded app/reverse/type-cycle/canonical exception with independent
   review. No generic gateway/service locator, broad port, raw mutable client/map,
   runtime forwarding shim, or unknown cast is proposed.

## Current behavior and canonical-state inventory

| Relationship | Current owner / source | Required bounded-group condition |
|---|---|---|
| SDK construction/options/scope | service OpenCodeSdkFacade, getSdkFacade and getSdkClientOptions | Preserve centralized option injection, unwrapping and error normalization; never export raw SDK. |
| Legacy HTTP | service requestLegacyTransport, get/post/patch/delete, scoped URL/auth helpers | Preserve auth, directory scope, HTTP errors and every existing SDK-failure fallback. |
| Lifecycle/status/settings | OpenCodeServiceLifecycleCoordinator and ServerManager | Preserve initialize/start/stop/dispose order, SDK-first health fallback, server adoption/restart/rollback, cache invalidation and subscription pause/resume. |
| Session CRUD/current id/abort | OpenCodeSessionLifecycleCoordinator | Preserve SDK primary/legacy fallback placement, default-title rule, current session, abort fallback, revert filtering and tool observation. |
| Canonical graph | OpenCodeSessionStateStore | One writer for snapshots, seed, stream/sync mutation, diff, delete; clone-only readers. |
| Streaming/SSE | streaming runtime, legacy reader, transformer, finalization coordinator | Preserve per-session context identity, pre-first-event fallback only, mutation-before-chunk, tail completion, cancel versus detach and trace causal IDs. |
| Sync/status | sync runtime | Preserve todo/status immediate behavior, message/part/diff batching barriers, canonical apply before emit and reconnect health/delay. |
| Prompt/non-stream response | context serializer, request builder, requestAssistantResponse and sendMessage | Stable message/part IDs and prepared parts are used once; SDK prompt/promptAsync and legacy /message//prompt_async differences remain exact. |
| Session control | OpenCodeSessionControlOrchestrator | Fork/revert/diff, command/shell, child/share/summarize and part mutation retain retained session/canonical paths. |
| Questions/permissions | OpenCodeQuestionPermissionHub | SDK-first and legacy fallback, normalization and session-scoped replies remain one negotiation path. |
| Catalog/config/MCP | catalog state/query coordinator | Preserve directory-scoped providers/resolved config distinction, cache/listener lifetime, MCP/auth and scope invalidation. |
| Capability/actions/diagnostics | capability/action coordinators, diagnostics and trace port | Typed redacted gate+confirmation precede actions; diagnostics cannot change transport, stream, permission or terminal ordering. |

## CodeGraph evidence and limits

./node_modules/.bin/codegraph status --json reported CodeGraph 1.5.0, state: complete,
pendingChanges all zero, worktreeMismatch: null, 24,937 nodes and 119,024 edges. No init
was run. Each row was root-queried, then given actual callers and finite impact --depth 2;
callers below include only function/method nodes, never file nodes.

~~~bash
./node_modules/.bin/codegraph query 'OpenCodeService::<symbol>' --json
./node_modules/.bin/codegraph callers 'OpenCodeService::<symbol>' --json | jq '[.callers[] | select(.kind == "function" or .kind == "method")]'
./node_modules/.bin/codegraph impact 'OpenCodeService::<symbol>' --depth 2 --json | jq '{depth,nodeCount,edgeCount,root:.affected[0]}'
~~~

| Query-confirmed root(s) | Direct function/method callers | depth-2 nodes/edges; returned root | Decision |
|---|---|---|---|
| constructor 336–586 | none | 1/0; **lifecycle coordinator constructor**, not service constructor | Same-name/root divergence; do not normalize it. |
| createLifecycleAssembly 588–630 | service constructor | 2/1; service root | Lifecycle host binds settings/server/subscriptions/catalog/compaction/trace; defer. |
| createSessionControlSdk 632–649 | service constructor | 2/1; service root | Already narrow solely for control coordinator; no raw SDK port. |
| requestLegacyTransport 705–731 | service get, post, patch, delete | 72/102; service root | Broad fallback fan-in; defer. |
| getSessionMessages 912–914 | backend preview/history, streaming loadAssistantTail, constructor, sendMessage | 27/66; service root | Reload, finalization, backend history and canonical write converge; defer. |
| applyCanonicalSnapshot 1312–1318 | lifecycle getSessionMessages, constructor | 5/5; service root | Canonical snapshot writer; defer. |
| applyCanonicalSyncEvent 1320–1372 | constructor | 2/1; service root | Host hides sync loop; all message/part/diff mutation reaches state store; defer. |
| requestAssistantResponse 981–1039 | probeProviderResponse, TitleGenerationService.generateTitle | 9/26; service root | SDK/legacy non-stream prompt, title and probe cleanup join; defer. |
| sendMessage 1088–1171 | test consumeRun only | 7/19; service root | Production call resolution incomplete but source proves session/trace/stream/canonical coupling; defer. |
| buildStructuredPromptSendPayload 1173–1186 | message preparation host, service resolver | 9/14; service root | Stable feature-prepared payload; no duplicate ID/part builder. |
| seedCanonicalUserMessage 1188–1216 | message preparation and host | 11/36; service root | Feature-to-core canonical ingress; no writable store port. |
| createCanonicalUserPart 1470–1517 | seedCanonicalUserMessage | 4/3; service root | Same optimistic-write lifecycle. |
| getAvailableModels / refreshMcpServerStatus | constructor/lifecycle; also getMcpStatus | 4/7; 5/6; service roots | Catalog bootstrapping, settings scope and event refresh converge; defer. |
| updateSettings / reapplyCompactionConfigFromProjectConfig | none | 1/0; 2/6; **lifecycle roots**, not service methods | Root divergence; no apparent small-delegate move. |
| forkSession | backend routing; chat fork route | 9/14; service root | Crosses control/lifecycle/UI; defer. |
| question get/reply/reject; permission responses | none | 2/5, 3/4, 3/4, 2/2, 2/2; service roots | Empty caller output is not absence of negotiation contract; defer. |
| getSdkCapabilitySnapshot | four Capability Lab methods | 9/284; service root | High feature radius; typed/redacted boundary cannot become raw client port. |
| refreshSdkCapabilities / requireSdkCapability | settings, disclosure, test, lab, action, view/composition | 28/44; 18/38; service roots | Gate fan-in; existing facade is narrow stable read port. |
| runExperimentalAction / execution | none / constructor | 2/3; 2/1; service roots | Future work must remove, never extend, unsafe casts; Task 17 proposes none. |
| detachStream | StreamChunkRouter.scheduleStreamTimeout | 5/7; service root | Actual feature caller; cancel/detach cannot split. |
| canonical state/messages/diffs reads | render/composition; reload/view; notice/view | 12/15; 11/12; 14/20; service roots | Cross-feature clone reads, never writable truth. |
| sync status/sync subscriptions | ConversationSessionSignalRuntime.start | 4/7; 3/6; service roots | Public facade is stable; listener state stays in sync coordinator. |
| hydrateOpenCodeMessage | reload/sync/render/view/composition | 13/13; service root | Depends on catalog tool identity and canonical render; defer. |

Unqualified get, delete, createSession, initialize, start, and stop returned multiple
same-name service/coordinator definitions. Reproduction chose unrelated roots
(getServerStatus, deleteSessionMessage, createSessionControlSdk, lifecycle initialize/start,
and, for stop, OpenCodeServiceLifecycleCoordinator.stopEventSubscriptions at line 427,
depth 2 = 6 nodes / 8 edges). These are **collisions, not normalized edges**. In
particular, the stop result is a collision hard stop, not an OpenCodeService stop blast
radius. Re-entry must query the qualified root, confirm file/line/id, and add typed source
call-site evidence. If it differs, the card stops before source work.

## Deferred candidate cards — no implementation authorization

For **every** card, current owner is core.opencode and literal target owner is also
core.opencode: this is a same-owner convergence/defer decision, not a disguised
subowner transfer. The exact manifest before state and the exact manifest after state
are identical:

~~~json
{
  "id": "core.opencode",
  "include": ["src/core/opencode/**"],
  "delegatesTo": ["core.opencode-diagnostics"],
  "responsibilities": [
    "OpenCode hybrid facade (SDK v2 primary, legacy HTTP/SSE fallback)",
    "canonical session/message/part state in OpenCodeSessionStateStore",
    "streaming, sync events, lifecycle, catalog, capability and server management"
  ],
  "canonicalState": [
    "OpenCode canonical session/message/part state",
    "OpenCode streaming/lifecycle coordinators",
    "OpenCode server lifecycle"
  ]
}
~~~

Therefore each card's manifest transaction is exactly **zero manifest delta**:
architecture-owners.config.json, module-docs.config.json, src/core/opencode/index.ts,
and manifest.json are explicitly untouched. No future subowner is named or permitted
by this plan. A later proposal that wants an owner transfer must first name an existing
or new literal owner ID, include path, delegatesTo transaction, and a fresh review; it
cannot reinterpret this zero-delta decision.

Every card is retained by core.opencode through **Phase 5**, with a hard expiry of
**2026-09-01**. At expiry, its owner must either (a) run the card's fresh complete
inventory and obtain a fresh independent Sol read-only review plus merge checkpoint,
or (b) record an explicitly approved deferred-owner/expiry extension before any source
move. Neither expiry passage nor a passing test authorizes implementation. Separate
independent review is mandatory after every future implementation round, not only at
expiry.

### Mandatory future commit topology and rollback sequence for every card

No card may combine tests, behavior and generated graph state in one commit. The following
topology is mandatory for cards A–D; each card's exact files below are allocated to it:

1. **C — characterization commit, retained:** only that card's focused test files and
   any required module-doc characterization assertion. It remains after rollback.
2. **B — behavior commit, independently reversible:** only the card's source, mapped
   module-doc and owner-doc files. It contains no graph artifact, manifest, config,
   barrel, generated file, or test allocated to C. Its owner transaction is the literal
   same-owner zero manifest delta above.
3. **G — graph snapshot commit after B:** run npm run graphify:update:src and
   npm run check:graphify, then commit only graphify-out/GRAPH_REPORT.md,
   graphify-out/graph.json and graphify-out/input-manifest.json.

Rollback is: git revert --no-edit G; git revert --no-edit B; npm run
graphify:update:src; npm run check:graphify; and, if the refresh changes the three named
artifacts, commit only them as chore(graphify): restore src graph after B. This restores
the graph digest for reverted source while retaining C. Rerun the card matrix and
npm run verify. A changed manifest/config/barrel or a digest not matching restored source
is an abort, not permission to amend B.

### A. Assembly, lifecycle, SDK facade and legacy transport — deferred

- **Commit allocation:** C is exactly the test paths in this card's characterization
  matrix; B is exactly the source/doc paths in its future-files paragraph; G is exactly
  the three graphify-out artifacts in the mandatory topology. C is retained; revert G,
  then B, and restore graph digest by the stated commands.
- **Owner, retirement and expiry action:** current owner core.opencode; target owner
  core.opencode; retain through Phase 5 to 2026-09-01. The expiry action is the common
  fresh inventory + independent Sol review/merge checkpoint or explicit
  deferred-owner/expiry extension above.
- **Scope and evidence:** constructor, lifecycle assembly, session-control SDK seam,
  SDK options/scope, auth/scoped URL and all legacy verbs; requestLegacyTransport is
  72 nodes/102 edges and constructor/lifecycle roots diverge.
- **Exact narrow port / composition:** no new port now. The only permitted re-entry
  physical wiring is OpenCodeService.createLifecycleAssembly() constructing
  OpenCodeServiceLifecycleCoordinator.createAssembly(host), where host has the existing
  immutable callbacks get/set settings, get/set base URL, SDK health, catalog refresh,
  scoped invalidation, sync/open-code subscription ports and compaction port. It must
  not return OpenCodeSdkFacade, raw requestLegacyTransport/get/post/patch/delete,
  auth headers, or ServerManager.
- **Exact characterization matrix:** OpenCodeServiceLifecycleCoordinator.test.ts pins
  initialize/start/stop/dispose order, SDK health then ServerManager fallback,
  settings update rollback and subscription pause/resume. OpenCodeService.httpRuntime.test.ts
  and OpenCodeService.sdkCrudSync.test.ts pin legacy/error fallback. ServerManager.lifecycle.test.ts,
  ServerManager.runtime.test.ts and ServerManager.occupiedEndpoint.test.ts pin adoption,
  restart and bind failure. A re-entry additionally has to characterize basic/bearer
  auth and normalized directory (including Windows forward slash) for every legacy verb.
- **Falsifiable acceptance / abort:** accept only if SDK-first/legacy fallback location,
  errors and terminal state are byte-for-byte characterization-equivalent and no
  lifecycle/server state is duplicated. Abort before a move if a legacy route lacks an
  SDK/legacy pair, a query root differs, the callback needs a raw client, or a server
  setting/rollback transition changes.
- **Exact future transaction and rollback:** if and only if re-entry passes, C receives
  the test paths below and B receives the source/doc paths below; their combined exact
  file set is:
  src/core/opencode/OpenCodeService.ts;
  src/core/opencode/OpenCodeServiceLifecycleCoordinator.ts;
  tests/unit/core/opencode/OpenCodeServiceLifecycleCoordinator.test.ts;
  tests/unit/core/opencode/OpenCodeService.httpRuntime.test.ts;
  docs/modules/core/opencode/OpenCodeService.md;
  docs/modules/core/opencode/OpenCodeServiceLifecycleCoordinator.md; and
  docs/architecture/owners/core-opencode.md.
  Its exact manifest/config/index set is empty. Mandatory C/B/G topology applies; reverting
  G then B restores the behavior files while retaining C.

### B. Session, message, part, sync and stream lifecycle — deferred

- **Commit allocation:** C is exactly every test path in this card's characterization
  matrix; B is exactly its named source/module-doc/owner-doc paths; G is exactly the
  three graphify-out artifacts. C is retained; revert G then B and restore graph digest.
- **Owner, retirement and expiry action:** current owner core.opencode; target owner
  core.opencode; retain through Phase 5 to 2026-09-01. The common expiry/review action
  is mandatory.
- **Scope and evidence:** session reads/writes, snapshot/sync apply, canonical reads,
  seed, stream/finalization and cancel/detach. getSessionMessages is 27/66; canonical
  reads have feature callers; sendMessage source coupling exceeds current typed callers.
- **Exact narrow port / composition:** no new port now. Existing service methods
  getCanonicalSessionState(), getCanonicalSessionMessages(), getCachedSessionDiffEntries(),
  subscribeToSessionTodoUpdates(), subscribeToSessionStatusUpdates(),
  subscribeToSessionSyncEvents(), sendMessage(), cancelStream() and detachStream()
  are the only re-entry boundary. Physical wiring stays service -> session lifecycle /
  sync runtime / streaming runtime -> OpenCodeSessionStateStore. It must not expose the
  store, a Map, stream context, listener set, controller, client, or general callback.
- **Exact characterization matrix:** OpenCodeSessionStateStore.test.ts proves immutable
  clone reads and message/part/diff mutation truth. OpenCodeStreamingRuntimeCoordinator.test.ts
  proves active-context identity, pre-first-event SDK-to-legacy fallback, reconnect recovery,
  cancel versus detach, and abort lifecycle. OpenCodeStreamingFinalizationCoordinator.test.ts
  proves tail fetch/retry/final chunks. OpenCodeLegacySseStreamReader.test.ts proves reader
  connect/read/buffer/abort cleanup. OpenCodeSyncEventRuntimeCoordinator.test.ts and
  OpenCodeSyncEventRuntimeCoordinator.partRemovedBarrier.test.ts prove listener wanted
  lifecycle, reconnect recovery, apply-before-emit and coalescing/removal barriers.
  OpenCodeService.sdkStreamEvents.test.ts, OpenCodeService.sdkStreamFallback.test.ts,
  OpenCodeService.sdkCrudSync.test.ts, OpenCodeService.sessionRuntime.test.ts and
  OpenCodeService.traceSnapshot.test.ts prove service-level SDK/legacy/canonical/trace parity.
- **Falsifiable acceptance / abort:** accept only if one write path exists for snapshot,
  seed, stream mutation, sync mutation, diff and delete; clone read mutation cannot alter
  truth; each listener registers/removes once; one context exists per session; old finally
  cannot erase new; cancel invokes server abort while detach does not; SDK and legacy match
  canonical graph, event ordering, fallback timing and terminal state. Abort before source
  move if OpenCodeSessionStateStore exclusive truth or SDK/legacy parity is not pinned.
- **Exact future transaction and rollback:** C receives every test path below and B every
  source/doc path below; their combined exact permitted file set is:
  src/core/opencode/OpenCodeService.ts;
  src/core/opencode/OpenCodeSessionStateStore.ts;
  src/core/opencode/OpenCodeSessionLifecycleCoordinator.ts;
  src/core/opencode/OpenCodeSyncEventRuntimeCoordinator.ts;
  src/core/opencode/OpenCodeStreamingRuntimeCoordinator.ts;
  src/core/opencode/OpenCodeStreamingFinalizationCoordinator.ts;
  src/core/opencode/OpenCodeLegacySseStreamReader.ts;
  src/core/opencode/OpenCodeStreamEventTransformer.ts;
  tests/unit/core/opencode/OpenCodeSessionStateStore.test.ts;
  tests/unit/core/opencode/OpenCodeStreamingRuntimeCoordinator.test.ts;
  tests/unit/core/opencode/OpenCodeStreamingFinalizationCoordinator.test.ts;
  tests/unit/core/opencode/OpenCodeLegacySseStreamReader.test.ts;
  tests/unit/core/opencode/OpenCodeSyncEventRuntimeCoordinator.test.ts;
  tests/unit/core/opencode/OpenCodeSyncEventRuntimeCoordinator.partRemovedBarrier.test.ts;
  tests/unit/core/opencode/OpenCodeService.sdkStreamEvents.test.ts;
  tests/unit/core/opencode/OpenCodeService.sdkStreamFallback.test.ts;
  tests/unit/core/opencode/OpenCodeService.sdkCrudSync.test.ts;
  tests/unit/core/opencode/OpenCodeService.sessionRuntime.test.ts;
  tests/unit/core/opencode/OpenCodeService.traceSnapshot.test.ts;
  docs/modules/core/opencode/OpenCodeService.md;
  docs/modules/core/opencode/OpenCodeSessionStateStore.md;
  docs/modules/core/opencode/OpenCodeSessionLifecycleCoordinator.md;
  docs/modules/core/opencode/OpenCodeSyncEventRuntimeCoordinator.md;
  docs/modules/core/opencode/OpenCodeStreamingRuntimeCoordinator.md;
  docs/modules/core/opencode/OpenCodeStreamingFinalizationCoordinator.md;
  docs/modules/core/opencode/OpenCodeLegacySseStreamReader.md;
  docs/modules/core/opencode/OpenCodeStreamEventTransformer.md;
  docs/modules/core/opencode/index.md; and docs/architecture/owners/core-opencode.md.
  Manifest/config/index-export set remains empty. Mandatory C/B/G topology applies;
  reverting G then B restores the behavior files while retaining C.

### C. Prompt, questions, permissions and session control — deferred

- **Commit allocation:** C is exactly every test path in this card's characterization
  matrix; B is exactly its named source/module-doc/owner-doc paths; G is exactly the
  three graphify-out artifacts. C is retained; revert G then B and restore graph digest.
- **Owner, retirement and expiry action:** current owner core.opencode; target owner
  core.opencode; retain through Phase 5 to 2026-09-01, then use the mandatory common
  fresh inventory/Sol review checkpoint or approved extension.
- **Scope and evidence:** non-stream prompt/probe, builder/serializer, question/permission
  hub and session-control orchestration. forkSession crosses backend routing and chat
  (9/14); empty caller results for negotiation are not proof of no lifecycle.
- **Exact narrow port / composition:** no new port now. Service constructs
  OpenCodePromptRequestBuilder and OpenCodeContextPartSerializer, then composes only
  typed service command/results into OpenCodeQuestionPermissionHub and
  OpenCodeSessionControlOrchestrator. The re-entry seam may be exactly the existing
  replyToQuestion(), rejectQuestion(), respondToSessionPermission(),
  respondToPermission(), forkSession(), revertSession(), unrevertSession() and
  getSessionDiff() methods. It must not supply raw session SDK, generic executor,
  mutable question map, unknown payload or forwarding shim.
- **Exact characterization matrix:** OpenCodePromptRequestBuilder.test.ts and
  OpenCodeContextPartSerializer.test.ts pin stable payload/attachment serialization.
  OpenCodeQuestionPermissionHub.test.ts and OpenCodeService.sdkQuestionRuntime.test.ts
  pin SDK/legacy permission/question error fallback and transient question retry.
  OpenCodeSessionControlOrchestrator.test.ts, OpenCodeSessionLifecycleCoordinator.test.ts,
  OpenCodeService.sdkPromptTransport.test.ts, OpenCodeService.httpRuntime.test.ts and
  OpenCodeService.sessionRuntime.test.ts pin control, current session, temporary probe
  deletion and SDK/legacy prompt parity.
- **Falsifiable acceptance / abort:** accept only if prepared IDs are used once;
  prompt option/terminal/error behavior matches SDK and legacy; provider probe always
  deletes its temporary session; question retry, normalization and permission reply order
  match both paths; control reads no duplicate message/part cache; missing/throwing trace
  is inert. Abort for broad port, duplicate truth, unknown cast or unpinned retry/error
  parity.
- **Exact future transaction and rollback:** C receives every test path below and B every
  source/doc path below; their combined exact permitted file set is:
  src/core/opencode/OpenCodeService.ts;
  src/core/opencode/OpenCodePromptRequestBuilder.ts;
  src/core/opencode/OpenCodeContextPartSerializer.ts;
  src/core/opencode/OpenCodeQuestionPermissionHub.ts;
  src/core/opencode/OpenCodeSessionControlOrchestrator.ts;
  tests/unit/core/opencode/OpenCodePromptRequestBuilder.test.ts;
  tests/unit/core/opencode/OpenCodeContextPartSerializer.test.ts;
  tests/unit/core/opencode/OpenCodeQuestionPermissionHub.test.ts;
  tests/unit/core/opencode/OpenCodeSessionControlOrchestrator.test.ts;
  tests/unit/core/opencode/OpenCodeSessionLifecycleCoordinator.test.ts;
  tests/unit/core/opencode/OpenCodeService.sdkQuestionRuntime.test.ts;
  tests/unit/core/opencode/OpenCodeService.sdkPromptTransport.test.ts;
  tests/unit/core/opencode/OpenCodeService.httpRuntime.test.ts;
  tests/unit/core/opencode/OpenCodeService.sessionRuntime.test.ts;
  docs/modules/core/opencode/OpenCodeService.md;
  docs/modules/core/opencode/OpenCodePromptRequestBuilder.md;
  docs/modules/core/opencode/OpenCodeContextPartSerializer.md;
  docs/modules/core/opencode/OpenCodeQuestionPermissionHub.md;
  docs/modules/core/opencode/OpenCodeSessionControlOrchestrator.md;
  docs/modules/core/opencode/OpenCodeSessionLifecycleCoordinator.md;
  docs/modules/core/opencode/index.md; and docs/architecture/owners/core-opencode.md.
  Manifest/config/index-export set is empty. Mandatory C/B/G topology applies; reverting
  G then B restores the behavior files while retaining C.

### D. Catalog, config, MCP, capability, experimental action and diagnostics — deferred

- **Commit allocation:** C is exactly every test path in this card's characterization
  matrix; B is exactly its named source/module-doc/owner-doc paths; G is exactly the
  three graphify-out artifacts. C is retained; revert G then B and restore graph digest.
- **Owner, retirement and expiry action:** current owner core.opencode; target owner
  core.opencode; retain through Phase 5 to 2026-09-01 and require the common separate
  fresh inventory/Sol review checkpoint or approved extension before source moves.
- **Scope and evidence:** catalog/query state, tool/MCP/auth/project/file/VCS/LSP facade,
  capabilities/actions, catalog/global subscriptions and trace diagnostics. Capability
  snapshot is 9/284 and refresh is 28/44; scope resets on lifecycle.
- **Public facade preservation and exact consumers:** OpenCodeService.sdk is a public
  readonly OpenCodeSdkFacade property and remains public. Current consumers are
  src/features/chat/OpenCodianView.ts,
  src/features/chat/services/MessageSendPreparationService.ts,
  src/features/chat/runtime/ChatRuntimeComposition.ts,
  src/features/settings/SettingsAgentsSection.ts and
  src/features/settings/SettingsCommandsSection.ts; consumer tests are
  tests/unit/features/settings/SettingsAgentsSection.test.ts and
  tests/unit/features/settings/SettingsCommandsSection.test.ts. The barrel
  src/core/opencode/index.ts keeps exporting OpenCodeService. This plan prohibits only
  leaking an underlying raw SDK client, mutable catalog state or a service locator; it
  does not privatize, remove or migrate service.sdk. Any consumer migration is a separate
  fresh reviewed transaction naming all listed consumers/tests, barrel and owner decision.
- **Exact narrow port / composition:** no new port. OpenCodeService constructs
  OpenCodeCatalogStateStore, OpenCodeCatalogQueryCoordinator,
  OpenCodeSdkCapabilityDiscoveryCoordinator and OpenCodeSdkExperimentalActionCoordinator.
  Re-entry may retain only service typed redacted getSdkCapabilitySnapshot(),
  refreshSdkCapabilities(), requireSdkCapability(), runExperimentalAction(),
  getToolCatalogSnapshot(), getMcpServerSnapshot() and subscribeToCatalogUpdates()
  boundaries. Coordinator hosts take immutable callbacks; catalog/schema maps, underlying
  raw SDK client, trace writer and dynamic lookup remain private. Public service.sdk remains
  intact.
- **Exact characterization matrix:** OpenCodeCatalogStateStore.test.ts and
  OpenCodeCatalogStateStore.toolClassification.test.ts pin catalog snapshot/cache and
  tool classification. OpenCodeCatalogQueryCoordinator.test.ts,
  OpenCodeService.catalogCompatibility.test.ts and OpenCodeService.sdkCompatCatalog.test.ts
  pin directory-scoped provider/resolved-config behavior, disabled-provider handling, MCP
  status/auth and scope invalidation. OpenCodeEventSubscriptionCoordinator.test.ts pins
  listener/subscription reconnect. OpenCodeSdkCapabilityDiscoveryCoordinator.test.ts,
  OpenCodeSdkExperimentalActionCoordinator.test.ts, OpenCodeService.capabilityCache.test.ts
  and OpenCodeService.experimentalActions.test.ts pin capability/action gate and redaction.
  OpenCodeService.traceSnapshot.test.ts pins inert trace failure.
- **Falsifiable acceptance / abort:** accept only if directory provider/resolved config
  versus process default stays distinct; cache invalidation follows scope/server change;
  catalog and MCP listener lifetimes register/remove once; action requires gate plus
  confirmation and returns redacted result; trace failure remains inert. Abort for any
  feature/app import, raw/mutable port, unknown cast, scope mismatch, duplicate listener
  or unredacted action result.
- **Exact future transaction and rollback:** C receives every test path below and B every
  source/doc path below; their combined exact permitted file set is:
  src/core/opencode/OpenCodeService.ts;
  src/core/opencode/OpenCodeCatalogStateStore.ts;
  src/core/opencode/OpenCodeCatalogQueryCoordinator.ts;
  src/core/opencode/OpenCodeEventSubscriptionCoordinator.ts;
  src/core/opencode/OpenCodeSdkCapabilityDiscoveryCoordinator.ts;
  src/core/opencode/OpenCodeSdkExperimentalActionCoordinator.ts;
  tests/unit/core/opencode/OpenCodeCatalogStateStore.test.ts;
  tests/unit/core/opencode/OpenCodeCatalogStateStore.toolClassification.test.ts;
  tests/unit/core/opencode/OpenCodeCatalogQueryCoordinator.test.ts;
  tests/unit/core/opencode/OpenCodeEventSubscriptionCoordinator.test.ts;
  tests/unit/core/opencode/OpenCodeSdkCapabilityDiscoveryCoordinator.test.ts;
  tests/unit/core/opencode/OpenCodeSdkExperimentalActionCoordinator.test.ts;
  tests/unit/core/opencode/OpenCodeService.catalogCompatibility.test.ts;
  tests/unit/core/opencode/OpenCodeService.sdkCompatCatalog.test.ts;
  tests/unit/core/opencode/OpenCodeService.capabilityCache.test.ts;
  tests/unit/core/opencode/OpenCodeService.experimentalActions.test.ts;
  tests/unit/core/opencode/OpenCodeService.traceSnapshot.test.ts;
  docs/modules/core/opencode/OpenCodeService.md;
  docs/modules/core/opencode/OpenCodeCatalogStateStore.md;
  docs/modules/core/opencode/OpenCodeCatalogQueryCoordinator.md;
  docs/modules/core/opencode/OpenCodeEventSubscriptionCoordinator.md;
  docs/modules/core/opencode/OpenCodeSdkCapabilityDiscoveryCoordinator.md;
  docs/modules/core/opencode/OpenCodeSdkExperimentalActionCoordinator.md;
  docs/modules/core/opencode/index.md; and docs/architecture/owners/core-opencode.md.
  Manifest/config/index-export set is empty. Mandatory C/B/G topology applies; reverting
  G then B restores the behavior files while retaining C.

## Re-entry gates and current test evidence

No facade body qualifies as movable merely because it is short. First rerun its
query/callers/depth-2 impact and record root id/file/line, direct typed callers and
nodes/edges. Multi-definition query, root divergence, cross-card radius or same-name
collision stops source work. Then run/extend the relevant matrix. Current evidence
was re-run as the original ten service/lifecycle suites plus eleven owner-unit suites:
**21/21 suites, 197/197 tests**:

~~~bash
npm test -- --runInBand tests/unit/core/opencode/OpenCodeService.sdkCrudSync.test.ts tests/unit/core/opencode/OpenCodeService.sdkPromptTransport.test.ts tests/unit/core/opencode/OpenCodeService.sdkStreamEvents.test.ts tests/unit/core/opencode/OpenCodeService.sdkStreamFallback.test.ts tests/unit/core/opencode/OpenCodeService.httpRuntime.test.ts tests/unit/core/opencode/OpenCodeService.sessionRuntime.test.ts tests/unit/core/opencode/OpenCodeService.sdkQuestionRuntime.test.ts tests/unit/core/opencode/OpenCodeService.catalogCompatibility.test.ts tests/unit/core/opencode/OpenCodeService.traceSnapshot.test.ts tests/unit/core/opencode/OpenCodeServiceLifecycleCoordinator.test.ts tests/unit/core/opencode/OpenCodeSessionStateStore.test.ts tests/unit/core/opencode/OpenCodeStreamingRuntimeCoordinator.test.ts tests/unit/core/opencode/OpenCodeStreamingFinalizationCoordinator.test.ts tests/unit/core/opencode/OpenCodeLegacySseStreamReader.test.ts tests/unit/core/opencode/OpenCodeSyncEventRuntimeCoordinator.test.ts tests/unit/core/opencode/OpenCodeSyncEventRuntimeCoordinator.partRemovedBarrier.test.ts tests/unit/core/opencode/OpenCodeSessionLifecycleCoordinator.test.ts tests/unit/core/opencode/OpenCodeSessionControlOrchestrator.test.ts tests/unit/core/opencode/OpenCodeQuestionPermissionHub.test.ts tests/unit/core/opencode/OpenCodeCatalogStateStore.test.ts tests/unit/core/opencode/OpenCodeCatalogQueryCoordinator.test.ts
~~~

Every future implementation commit runs relevant focused tests, then:

~~~bash
npm run typecheck
npm run check:owner-manifest
npm run check:owner-boundaries
npm run check:dependency-direction
npm run check:architecture-cycles
npm run check:architecture-approvals
npm run verify:architecture
npm run check:module-docs
npm run graphify:update:src
npm run check:graphify
git diff --name-only --diff-filter=ACMR | ./node_modules/.bin/codegraph affected --stdin --path . --json
npm run verify
npm run build
~~~

Update exact mapped module docs and docs/modules/core/opencode/index.md when required.
Test Vault deployment is conditional: after successful build, deploy sequentially only
if a deploy-relevant AGENTS.md path changed, then prove BUILD_ID; do not claim deployment
otherwise.

## Incoming domain imports of main.ts: baseline → target

The metric is incoming **OpenCode-domain imports of main.ts**, not imports declared by
main.ts: baseline **0**, target **0**. Use this multiline-safe command exactly:

~~~bash
rg -n -U -P -g '*.ts' '(?s)^\s*import\s+(?:type\s+)?(?:[^;]*?)\s+from\s+[\x27\x22][^\x27\x22]*(?:/|\.)main(?:\.ts)?[\x27\x22]' src/core/opencode
rg -n -U -P -g '*.ts' '(?s)^\s*import\s+(?:type\s+)?(?:[^;]*?)\s+from\s+[\x27\x22][^\x27\x22]*(?:/|\.)main(?:\.ts)?[\x27\x22]' src/core/opencode | wc -l
~~~

No new incoming import is allowed outside a recorded independently reviewed
app/reverse/type-cycle/canonical-state exception. This task leaves main's outbound
OpenCodeService construction unchanged and claims no reduction.

## Zero-source-change proof and handoff limits

Before handoff, only this artifact may differ:

~~~bash
git diff --name-only -- src tests manifest.json package.json architecture-owners.config.json graphify-out devlog.md AGENTS.md
git ls-files --others --exclude-standard -- src tests
git diff --check
git diff --no-index --check /dev/null docs/superpowers/plans/2026-08-01-opencode-service-convergence.md
git status --short
~~~

The new-file diff --no-index --check convention can exit 1 for a difference from
/dev/null; it must emit no whitespace error. Task 17 does not close Phase 5, modify
the ledger, or constitute approval. A source move needs fresh independent read-only
review after its own implementation phase.

Task 18 (settings plugin-type coupling inventory + per-domain child plans) is the
remaining Phase 5 discovery task and is out of scope here; this convergence plan
neither blocks nor authorizes it.
