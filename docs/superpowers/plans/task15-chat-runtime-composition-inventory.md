# Task 15 Inventory — Chat Runtime Composition Owner

> **MANDATORY BLOCK (plan Task 15 step 2):** *"Commit an inventory table listing every concrete coordinator constructor/import to move and the exact retained ItemView responsibilities; code movement is blocked until this target list is reviewed."*
>
> This document is the inventory. No production code is moved in this commit. Code movement begins only after this inventory passes independent review.

**Plan reference:** `docs/superpowers/plans/2026-07-30-agent-friendly-architecture-and-governance-refactor.md` § Task 15
**View under refactor:** `src/features/chat/OpenCodianView.ts` (4995 lines)
**Target owner (to create):** `src/features/chat/runtime/ChatRuntimeComposition.ts`

---

## 1. Current structure (measured, not assumed)

`OpenCodianView` already groups coordinator construction into **four typed `create*RuntimeWiring()` methods**, each returning a wiring object, plus one orchestrating **constructor block (lines 1685–1889)** that calls them and destructures the results into ~40 private view fields.

| Method | Lines | Phase | Returns type |
|---|---|---|---|
| `createSurfaceRuntimeWiring()` | 1956–2057 | surface | `OpenCodianViewSurfaceRuntimeWiring` |
| `createBackgroundTaskRuntimeWiring()` | 2059–2105 | background-task | `OpenCodianViewBackgroundTaskRuntimeWiring` |
| `createConversationRuntimeWiring()` | 2106–2252 | conversation | `OpenCodianViewConversationRuntimeWiring` |
| `createInteractionRuntimeWiring()` | 2369–2526 | interaction/send | `OpenCodianViewInteractionRuntimeWiring` |
| `createBackgroundTaskInfrastructure()` | 2254–2305 | bg-task infra (called inside conversation wiring) | (inline destructure) |

Constructor orchestration block (1685–1889) calls these four, plus constructs a few coordinators inline (`ConversationIdentityRuntime`, `UserMessageContentRenderer`, `ConversationRenderService`) and the `chatDiagnosticsCoordinatorFactory.create(...)`, then destructures everything into view fields and calls `installClaudeCodePermissionHostContext()` / `installCodexApprovalHostContext()`.

This is a **composition seam already half-extracted** — the four methods are the natural unit to relocate into `ChatRuntimeComposition`. The view's job is already "host + forward + destructure".

---

## 2. Move inventory — concrete constructors/imports to relocate

Every concrete `new <Coordinator/Service/...>()` that is **runtime assembly** (not ItemView lifecycle, not DOM mount, not host factory) moves into `ChatRuntimeComposition`. Host-creation methods (`create*Host(...)`, which build the closures that reach back into the view) stay in the view and are passed in as a `ChatRuntimeCompositionHost`.

### 2.1 Field-level constructors

| Line | Field | Class | Decision |
|---|---|---|---|
| 566 | `this.scrollScheduler` | `SettledScrollScheduler` | **STAYS** — scroll scheduler owning mutable `frameId` scheduling/cancellation state (`ScrollManager.ts:101-121`); used across the view. Retained because its lifecycle spans the whole view (constructed once as a field, shared by surface + render paths); exposed to composition read-only via host getter. Not a coordinator; not moved. |
| 567 | `this.conversationWriteSerializationService` | `ConversationWriteSerializationService` | **STAYS-RETAINED** — runtime assembly with mutable write-ticket state, consumed by view-private methods `createConversationWriteTicket` (866) and `commitConversationWrite` (876). These are view-owned write-serialization seams, not coordinator construction; moving them would pull write-serialization logic into composition for no coupling reduction. Retained; not part of `onClose` (no teardown). |
| 1627 | `this.messageComponent` | `Component` (Obsidian) | **STAYS** — Obsidian ItemView lifecycle component; not runtime assembly. |
| 1628 | `this.modifiedFilesSidebarCoordinator` | `ModifiedFilesSidebarCoordinator` | **STAYS-RETAINED** — runtime assembly that owns mutable sidebar state and a DOM sidebar (constructed lazily). Retained because its lifecycle is bound to the view's sidebar DOM mount, not to the chat runtime; its `destroy()` runs at `onClose` (3527). Moving it would split DOM-bound ownership. |
| 1630 | `this.slashCommandMenuCatalogCache` | `SlashCommandMenuCatalogCache` | **STAYS-RETAINED** — runtime assembly constructed privately in the view (not injected via `ChatPluginPort`), but a process-wide catalog cache consumed by multiple owners through `invalidate()`; relocating it would require a new shared owner and expands the slice beyond Task 15's "coordinator construction" scope. Retained with explicit justification; TTL-managed, not part of `onClose`. |
| 1685 | `this.codexChatSurfaceBinding` | `CodexChatSurfaceBinding` | **STAYS-RETAINED** — runtime assembly, but a leaf surface binding (4 host callbacks: `getCodexAdapter`/`invalidateSlashCommandMenuCache`/`openPluginSettings`/`isCodexActive`, no nested coordinators) disposed at `onClose` (3534). Moving it adds a file without reducing view coupling; retained to keep this slice focused on the four large wiring methods. |
| 1693 | `this.chatDiagnosticsCoordinator` | (factory `.create()`) | **STAYS** — already a Task-12 factory injection, not a constructor. |

> **Retention justification (response to review):** `conversationWriteSerializationService`, `modifiedFilesSidebarCoordinator`, `slashCommandMenuCatalogCache`, and `codexChatSurfaceBinding` ARE runtime assemblies. They are retained because moving each would either (a) pull view-private write-serialization seams into composition, (b) split DOM-bound sidebar ownership, (c) force a cross-owner shared-cache refactor out of scope, or (d) create a new thin file for a leaf object. This is an explicit, reviewed scope decision — not an oversight. Each retained object's teardown call site (if any) is listed in §4 so the disposal contract stays intact.

### 2.2 The four `create*RuntimeWiring()` methods (MOVE wholesale)

These four methods + the four wiring interfaces (defined at `OpenCodianView.ts:393`+) move as a cohesive block. All ~35 coordinator constructions inside them move together:

**Surface (17 constructions, lines 1961–2055):** `ServerReferenceContextService` (conditional 1961), `ComposerContextViewFacade.create` (1975, static factory), `TitleGenerationService` (1983), `QuestionDockSlotCoordinator` (1984), `ConversationHistoryActionsCoordinator` (1994), `ConversationSessionSettingsCoordinator` (1997), `TabMessagesPaneCoordinator` (2003), `ChatHeaderPresenter` (2007), `ChatSelectionControlsCoordinator` (2009), `ComposerInputShellCoordinator` (2012), `InputPanelAppearanceCoordinator` (2015), `ChatSurfaceAppearanceCoordinator` (2018), `PersistentAssistantNoticeService` (2024), `ConversationNoticeCoordinator` (2027), `createSessionTodoCoordinator` (2030, factory), `ChildSessionGraphCoordinator` (2031), `AssistantShellViewHostAdapter` (2042). *(Round-1 miscount 13 → round-2 miscount 16 → corrected to 17.)*

**Background-task (4):** `ActiveTabContextUsageCoordinator`, `BackgroundTaskNoticeStateService`, `BackgroundTaskTimelineService`, `BackgroundTaskLiveSignalCoordinator`.

**Conversation (~14):** `ConversationAuthoritativeSyncCoordinator`, `ConversationSessionSignalRuntime`, `ConversationLoadRuntimeBridge`, `BackgroundTaskCompletionNoticeService`, `BackgroundTaskInlinePanelRenderer`, `BackgroundTaskIndicatorCoordinator`, `BackgroundTaskStreamTriggerCoordinator`, plus the sync-coordination/orchestration/bridge/tabs set, `ConversationIdentityRuntime`, `ConversationRenderService`, `UserMessageContentRenderer`.

**Interaction/send (8):** `MessageFinalizationService`, `MessageSendPreparationService`, `SlashCommandExecutionService`, `SendPipelineRuntime`, `AssistantNoticeCardRenderer`, `UserMessageFooterRenderer`, `StreamingInlineCardRenderer`, `PermissionInlineCardRenderer`, plus the question-runtime bundle.

> The composition owner receives a `ChatRuntimeCompositionHost` (all the view's `create*Host()` closures + getters for `plugin`/`app`/`currentConversation`/`getActiveTabId`/etc.) and returns **one assembled `ChatRuntime`** object that the view destructures into its existing fields.

### 2.2a Side-effect field assignments inside wiring methods (MUST surface in `ChatRuntime`)

The wiring methods currently mutate view fields by **side effect** rather than returning them. These are NOT in the declared wiring return types today; the composition owner must expose them so the view never relies on undocumented mutation (review Critical #1):

| Line | Field | Assigned inside | Currently in return type? |
|---|---|---|---|
| 2169 | `this.backgroundTaskHost` | `createBackgroundTaskInfrastructure()` (2254) | NO — destructured locally, then `this.backgroundTaskHost = backgroundTaskHost` |
| 2218 | `this.conversationTabOpenCoordinator` | `createConversationRuntimeWiring()` via `assembleConversationLoadRecovery` (2173) | NO — destructured from `loadRecoveryAssembly`, then `this.conversationTabOpenCoordinator = conversationTabOpenCoordinator` |

After the move, `createBackgroundTaskInfrastructure` and `assembleConversationLoadRecovery` results are consumed entirely inside the composition owner; both `backgroundTaskHost` and `conversationTabOpenCoordinator` become **fields of the returned `ChatRuntime` struct**, assigned by the view's destructure (same as every other field). No view mutation inside the owner; no undocumented forwarding.

### 2.2b Imported runtime-assembly + host-builder factories (MOVE call sites; imports relocate)

The conversation/interaction wiring invokes imported `assemble*`/`create*` runtime-assembly factories AND imported `create*Host` host-builder factories. Each call site moves into the owner. **Full list (review Important #1 + #2):**

**Runtime-assembly factories:**

| Line | Factory (imported) | Phase |
|---|---|---|
| 2030 | `createSessionTodoCoordinator` | surface |
| 2061 | `createQuestionTodoBackgroundTaskRuntimeServiceBundleFromSeam` | background |
| 2114 | `createTabActivationRuntimeAssembly` | conversation |
| 2128 | `assembleConversationHydrationRuntime` | conversation |
| 2135 | `assembleConversationSyncRuntime` | conversation |
| 2142 | `assembleTabActivationConversationSyncRuntimePort` | conversation |
| 2173 | `assembleConversationLoadRecovery` | conversation |
| 2219 | `assembleConversationTabRuntime` | conversation (see §2.2c) |
| 2287 | `createBackgroundTaskViewHost` | conversation (infra) |
| 2461 | `createQuestionRuntimeBundle` | interaction |

**Host-builder factories (build the host objects the above consume):**

| Line | Factory (imported) | Phase |
|---|---|---|
| 1756 | `createConversationRenderHost` | conversation (constructor inline) |
| 2374 | `createMessageFinalizationHost` | interaction |
| 2402 | `createMessageSendPreparationHost` | interaction |
| 2470 | `createSlashCommandExecutionHost` | interaction |
| 2509 | `createSendPipelineRuntimeHost` | interaction |

| Line | View method (NOT imported; stays as host getter) | Phase |
|---|---|---|
| 2023 | `this.createTabConversationSyncFingerprintRuntimePort()` | surface (called via host) |

The corresponding `import` statements for the 15 factories (10 runtime + 5 host-builder) relocate from `OpenCodianView.ts` to `ChatRuntimeComposition.ts`.

### 2.2c `assembleConversationTabRuntime` and the `view: this` god-object hazard (review Important #2)

`assembleConversationTabRuntime` (2219) currently receives `view: this` — the **full `OpenCodianView`**. Naïvely moving this call into `ChatRuntimeComposition` would leak the entire view into composition, violating the no-god-object / no-service-locator constraint.

**Resolution:** a narrow `TabRuntimeViewSource` interface already exists (`src/features/chat/services/ConversationTabRuntimeCoordinator.ts:95`) with exactly 7 getters (`getChatContainerEl`, `getHeaderTabBarSlotEl`, `getBelowHeaderTabBarSlotEl`, `getOuterVerticalTabBarSlotEl`, `getInputTabBarSlotEl`, `getSessionIdForTab`, `getTabSessionStatus`). The view already structurally satisfies it. **The composition owner receives a `TabRuntimeViewSource` via the host and passes THAT to `assembleConversationTabRuntime`, never `this`.** This is a mandatory invariant; a characterization test must pin that `ChatRuntimeComposition` never imports or references the `OpenCodianView` class.

### 2.3 Constructor inline constructions (MOVE the runtime ones)

| Line | Object | Decision |
|---|---|---|
| 1737 | `ConversationIdentityRuntime` | **MOVE** (pure runtime, view closures via host) |
| 1751 | `UserMessageContentRenderer` | **MOVE** (host-driven) |
| 1755 | `ConversationRenderService` | **MOVE** (host-driven) |

### 2.4 NOT moved (retained ItemView responsibilities)

These stay in `OpenCodianView` per the plan's "keep responsible for ItemView lifecycle, DOM mount points and forwarding":

- `super(leaf)`, `this.plugin`, `this.chatDiagnosticsCoordinatorFactory` assignment.
- `messageComponent` (Obsidian Component).
- **Tab canonical state — EXPLICITLY RETAINED (review Important #3):** `tabManager` (field at 542), `createTabRuntimeState()` (1325), `createTabBarMutableState()` (3141), `createTabMessagesPaneCoordinatorHost()` (1382), and the full `TabRuntimeState`/`TabBarMutableState` machinery. The plan forbids moving tab canonical state out of its current owner "without separate design". The composition owner may RECEIVE read-only access to `tabManager` (for coordinators that need `getTabContextUsage`) via the host getter, but it never owns or constructs tab state. `assembleConversationTabRuntime` receives `tabBarState: this.createTabBarMutableState()` — the view builds the mutable state and hands it in; composition does not own it.
- `conversationWriteSerializationService`, `slashCommandMenuCatalogCache`, `codexChatSurfaceBinding` (retained per §2.1).
- All `create*Host(...)` methods (~40 of them) — these are the **view's forwarding closures** the composition host consumes. They stay because they are the ItemView's forwarding seam, not runtime assembly.
- `installClaudeCodePermissionHostContext()` / `installCodexApprovalHostContext()` — wire the view's permission-card renderers; stay (they reassign view-owned `plugin.*HostContext` fields). **Decision point for review:** these run *after* composition and depend on `interactionRuntime`. They stay in the constructor but run against the composition-returned runtime.
- DOM mount creation, `onOpen`/`onload`/`onClose`/`onunload`, scroll managers, tab DOM.

---

## 3. Composition owner shape (proposed contract)

```
ChatRuntimeComposition.compose(host: ChatRuntimeCompositionHost): ChatRuntime
```

- `ChatRuntimeCompositionHost`: a port interface aggregating the existing `create*Host()` return-type accessors + value getters (`plugin`, `app`, `currentConversation`, `getActiveTabId()`, `getTabRuntimeState()`, `scrollScheduler`, `tabManager`, **`tabRuntimeViewSource: TabRuntimeViewSource`** etc.). Defined **once**, in the new owner module.
- `ChatRuntime`: a single struct of all ~40 fields the constructor currently destructures. The view assigns these to its private fields exactly as today.
- The owner holds **no mutable service map, no key/type lookup, no reference to the `OpenCodianView` class**. It is a pure `compose()` function/owner returning one struct. (Pass criterion: "view does not retrieve services from composition by key/type".)

### Anti-goals (explicitly excluded)
- No new thin per-callback files (plan forbids).
- No tab canonical state moved out of its current owner (plan forbids without separate design).
- No behavioral change — pure code relocation. Task-14-style characterization tests must stay green.
- Not a service locator; not a god-object wiring everything to `unknown`.
- **Never pass `view: this` (full `OpenCodianView`) into composition** — only the narrow `TabRuntimeViewSource` (§2.2c).

---

## 4. Disposal order contract (plan requires; review Critical #2)

`onClose()` (`OpenCodianView.ts:3504–3556`) tears down the view in a **fixed 26-step order**. This order is a behavioral contract, not an implementation detail (it controls when sync loops stop vs. when renderers detach). **The move must not alter it.** The view keeps `onClose()` and keeps owning all the field teardown; the composition owner does NOT own disposal — it only constructs.

Because the view still destructures every coordinator out of the returned `ChatRuntime` into its own private fields (exactly as today), `onClose()` calls `.destroy()`/`.cancel()`/`.dispose()`/`.stop()` on those view fields in the **same order**. The owner holds no teardown responsibility. The full ordered teardown (cite: `OpenCodianView.ts:3505–3555`):

| # | Line | Call | Owner of target field |
|---|---|---|---|
| 1 | 3505 | `plugin.unregisterConversationCachePinProvider(...)` | plugin |
| 2 | 3506 | `persistTabState({ flush: true })` | view |
| 3 | 3507 | `clearSlashCommandMenuPreload()` | view |
| 4 | 3508 | `chatHeaderPresenter.destroy()` | **surface (moved)** |
| 5 | 3509 | `conversationHistoryActionsCoordinator.destroy()` | **surface (moved)** |
| 6 | 3510 | `conversationSyncBridgePorts.getLoopControl().stopConversationSyncLoop()` | **conversation (moved)** |
| 7 | 3511 | `composerContextViewFacade.dispose()` | **surface (moved)** |
| 8 | 3512 | `chatSurfaceAppearanceCoordinator.destroy()` | **surface (moved)** |
| 9 | 3513–3514 | `clearScheduledComposerLayoutSync()` / `clearScheduledScrollToBottom()` | view |
| 10 | 3515–3516 | `childSessionGraphCoordinator.clearGraph()` / `.hide()` | **surface (moved)** |
| 11 | 3517 | `titleGenerationService.cancelAll()` | **surface (moved)** |
| 12 | 3518–3520 | `chatSelectionControlsCoordinator` / `inputPanelAppearanceCoordinator` / `composerInputShellCoordinator` `.destroy()` | **surface (moved)** |
| 13 | 3521–3526 | `effortSelector` / `contextRing` `.destroy()` + null-out | view (DOM) |
| 14 | 3527 | `modifiedFilesSidebarCoordinator.destroy()` | **retained (§2.1)** |
| 15 | 3528 | `chatVisualDemoCoordinator.destroyAll()` | view (created at 3594, opt-in demo) |
| 16 | 3529 | `permissionInlineCardRenderer.clearSessionApprovals()` | **interaction (moved)** |
| 17 | 3530–3533 | `backendActiveChangeDisposable` / `backendCapabilityChangeDisposable` `.dispose()` + null-out | view (event disposables) |
| 18 | 3534 | `codexChatSurfaceBinding.dispose()` | **retained (§2.1)** |
| 19 | 3537 | `conversationTabRuntimeCoordinator.destroyTabSystem()` | **conversation (moved)** |
| 20 | 3538–3542 | tab-bar slot / outer-bar host null-out + `.remove()` | view (DOM) |
| 21 | 3543 | `questionDockSlotCoordinator.destroy()` | **surface (moved)** |
| 22 | 3544 | `sessionTodoCoordinator.destroy()` | **surface (moved)** |
| 23 | 3545 | `conversationSessionSignalRuntime.stop()` | **conversation (moved)** |
| 24 | 3548–3551 | `eventRefs` `offref` loop + reset | view (Obsidian event refs) |
| 25 | 3554 | `messageComponent.unload()` | view (Obsidian Component) |
| 26 | 3555 | `markdownService = null` | view |

**Invariants preserved by the move:**
- Every "moved" field above is destructured from `ChatRuntime` into the same private view field, so `onClose` line numbers for the calls are unchanged in behavior.
- The owner exposes no `dispose()` of its own (the view already owns all teardown). If a future coordinator needs owner-scoped teardown, that is a separate slice with its own design — out of scope here.
- Retained objects (`modifiedFilesSidebarCoordinator` step 14, `codexChatSurfaceBinding` step 18) keep their exact teardown positions; retention does not disturb order.

---

## 5. Risk assessment & rollback

- **Highest risk:** the constructor block (1685–1889) is one large method; relocating the four wiring methods changes the `this`-binding of ~40 closures. Mitigation: closures stay in the view's `create*Host()` methods (they already capture `this`); the composition owner only *calls* them.
- **Tab state:** untouched. `createTabRuntimeState()` (1325) and tab canonical state stay in the view.
- **CodeGraph blast radius (pre-move):** `OpenCodianView` constructor has 0 direct function/method callers (instantiated via `registerView`); relocating its internal methods does not change external callers.
- **Rollback:** the move is one commit (`refactor(chat): extract ChatRuntimeComposition owner`); `git revert` restores the view intact. Task 14's pattern (each behavior commit independently revertable) is followed.

---

## 6. Before/after measurement plan (evidence, not sole criterion)

- **Graph edges:** record `check:dependency-direction` edge count + `check:architecture-cycles` SCC count before and after. Expect: small edge shift from view→coordinator to composition→coordinator; **0 new runtime SCC** required.
- **Line count:** informational only (plan: "line count is informational only").
- **Tests:** Task-15 characterization tests pin the four wiring return shapes *before* the move; they must stay green after. View lifecycle suites must stay green.
- **Gates:** full `npm run verify` (15 gates) before codex review.

---

## 7. Review gate for this inventory

This inventory is the **BLOCK artifact**. It must be reviewed (codex/gpt-5.6 terra, independent, read-only) and receive literal APPROVED before `ChatRuntimeComposition.ts` is created. Review focus:
1. Is every moved constructor listed (no silent drift)?
2. Does the split keep ItemView responsibilities (lifecycle/DOM/forwarding) intact?
3. Is the composition owner a true owner (returns a struct, no service map/key lookup)?
4. Is the rollback story sound (single revertable commit)?
