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
| `createConversationRuntimeWiring()` | 2106–2253 | conversation | `OpenCodianViewConversationRuntimeWiring` |
| `createInteractionRuntimeWiring()` | 2369–2527 | interaction/send | `OpenCodianViewInteractionRuntimeWiring` |
| `createBackgroundTaskInfrastructure()` | 2254–2368 | bg-task infra (called inside conversation wiring) | (inline destructure) |

Constructor orchestration block (1685–1889) calls these four, plus constructs a few coordinators inline (`ConversationIdentityRuntime`, `UserMessageContentRenderer`, `ConversationRenderService`) and the `chatDiagnosticsCoordinatorFactory.create(...)`, then destructures everything into view fields and calls `installClaudeCodePermissionHostContext()` / `installCodexApprovalHostContext()`.

This is a **composition seam already half-extracted** — the four methods are the natural unit to relocate into `ChatRuntimeComposition`. The view's job is already "host + forward + destructure".

---

## 2. Move inventory — concrete constructors/imports to relocate

Every concrete `new <Coordinator/Service/...>()` that is **runtime assembly** (not ItemView lifecycle, not DOM mount, not host factory) moves into `ChatRuntimeComposition`. Host-creation methods (`create*Host(...)`, which build the closures that reach back into the view) stay in the view and are passed in as a `ChatRuntimeCompositionHost`.

### 2.1 Field-level constructors (move)

| Line | Field | Class | Notes |
|---|---|---|---|
| 1627 | `this.messageComponent` | `Component` (Obsidian) | **STAYS** — ItemView lifecycle component, Obsidian-owned. |
| 1628 | `this.modifiedFilesSidebarCoordinator` | `ModifiedFilesSidebarCoordinator` | **MOVE** — stateless coordinator, no host deps. |
| 1630 | `this.slashCommandMenuCatalogCache` | `SlashCommandMenuCatalogCache` | **STAYS** — constructed with view closures but is a catalog cache consumed widely; keep to minimize blast. (Revisit later.) |
| 1685 | `this.codexChatSurfaceBinding` | `CodexChatSurfaceBinding` | **STAYS** — thin surface binding; leave to avoid churn. |
| 1693 | `this.chatDiagnosticsCoordinator` | (factory) | **STAYS** — already a factory injection (Task 12), not a constructor. |

### 2.2 The four `create*RuntimeWiring()` methods (MOVE wholesale)

These four methods + the four wiring interfaces (defined at `OpenCodianView.ts:393`+) move as a cohesive block. All ~35 coordinator constructions inside them move together:

**Surface (13 coordinators):** `ServerReferenceContextService`, `ComposerContextViewFacade`, `TitleGenerationService`, `QuestionDockSlotCoordinator`, `ConversationHistoryActionsCoordinator`, `ConversationSessionSettingsCoordinator`, `TabMessagesPaneCoordinator`, `ChatHeaderPresenter`, `ChatSelectionControlsCoordinator`, `ComposerInputShellCoordinator`, `InputPanelAppearanceCoordinator`, `ChatSurfaceAppearanceCoordinator`, `PersistentAssistantNoticeService`, `ConversationNoticeCoordinator`, `ChildSessionGraphCoordinator`, `AssistantShellViewHostAdapter`.

**Background-task (4):** `ActiveTabContextUsageCoordinator`, `BackgroundTaskNoticeStateService`, `BackgroundTaskTimelineService`, `BackgroundTaskLiveSignalCoordinator`.

**Conversation (~14):** `ConversationAuthoritativeSyncCoordinator`, `ConversationSessionSignalRuntime`, `ConversationLoadRuntimeBridge`, `BackgroundTaskCompletionNoticeService`, `BackgroundTaskInlinePanelRenderer`, `BackgroundTaskIndicatorCoordinator`, `BackgroundTaskStreamTriggerCoordinator`, plus the sync-coordination/orchestration/bridge/tabs set, `ConversationIdentityRuntime`, `ConversationRenderService`, `UserMessageContentRenderer`.

**Interaction/send (8):** `MessageFinalizationService`, `MessageSendPreparationService`, `SlashCommandExecutionService`, `SendPipelineRuntime`, `AssistantNoticeCardRenderer`, `UserMessageFooterRenderer`, `StreamingInlineCardRenderer`, `PermissionInlineCardRenderer`, plus the question-runtime bundle.

> The composition owner receives a `ChatRuntimeCompositionHost` (all the view's `create*Host()` closures + getters for `plugin`/`app`/`currentConversation`/`getActiveTabId`/etc.) and returns **one assembled `ChatRuntime`** object that the view destructures into its existing fields.

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
- `slashCommandMenuCatalogCache`, `codexChatSurfaceBinding` (kept to limit blast radius).
- All `create*Host(...)` methods (~40 of them) — these are the **view's forwarding closures** the composition host consumes. They stay because they are the ItemView's forwarding seam, not runtime assembly.
- `installClaudeCodePermissionHostContext()` / `installCodexApprovalHostContext()` — wire the view's permission-card renderers; stay (they reassign view-owned `plugin.*HostContext` fields). **Decision point for review:** these run *after* composition and depend on `interactionRuntime`. They stay in the constructor but run against the composition-returned runtime.
- DOM mount creation, `onOpen`/`onload`/`onClose`/`onunload`, scroll managers, tab DOM.

---

## 3. Composition owner shape (proposed contract)

```
ChatRuntimeComposition.compose(host: ChatRuntimeCompositionHost): ChatRuntime
```

- `ChatRuntimeCompositionHost`: a port interface aggregating the existing `create*Host()` return-type accessors + value getters (`plugin`, `app`, `currentConversation`, `getActiveTabId()`, `getTabRuntimeState()`, `scrollScheduler`, `tabManager`, etc.). Defined **once**, in the new owner module.
- `ChatRuntime`: a single struct of all ~40 fields the constructor currently destructures. The view assigns these to its private fields exactly as today.
- The owner holds **no mutable service map, no key/type lookup**. It is a pure `compose()` function/owner returning one struct. (Pass criterion: "view does not retrieve services from composition by key/type".)

### Anti-goals (explicitly excluded)
- No new thin per-callback files (plan forbids).
- No tab canonical state moved out of its current owner (plan forbids without separate design).
- No behavioral change — pure code relocation. Task-14-style characterization tests must stay green.
- Not a service locator; not a god-object wiring everything to `unknown`.

---

## 4. Risk assessment & rollback

- **Highest risk:** the constructor block (1685–1889) is one large method; relocating the four wiring methods changes the `this`-binding of ~40 closures. Mitigation: closures stay in the view's `create*Host()` methods (they already capture `this`); the composition owner only *calls* them.
- **Tab state:** untouched. `createTabRuntimeState()` (1325) and tab canonical state stay in the view.
- **CodeGraph blast radius (pre-move):** `OpenCodianView` constructor has 0 direct function/method callers (instantiated via `registerView`); relocating its internal methods does not change external callers.
- **Rollback:** the move is one commit (`refactor(chat): extract ChatRuntimeComposition owner`); `git revert` restores the view intact. Task 14's pattern (each behavior commit independently revertable) is followed.

---

## 5. Before/after measurement plan (evidence, not sole criterion)

- **Graph edges:** record `check:dependency-direction` edge count + `check:architecture-cycles` SCC count before and after. Expect: small edge shift from view→coordinator to composition→coordinator; **0 new runtime SCC** required.
- **Line count:** informational only (plan: "line count is informational only").
- **Tests:** Task-15 characterization tests pin the four wiring return shapes *before* the move; they must stay green after. View lifecycle suites must stay green.
- **Gates:** full `npm run verify` (15 gates) before codex review.

---

## 6. Review gate for this inventory

This inventory is the **BLOCK artifact**. It must be reviewed (codex/gpt-5.6 terra, independent, read-only) and receive literal APPROVED before `ChatRuntimeComposition.ts` is created. Review focus:
1. Is every moved constructor listed (no silent drift)?
2. Does the split keep ItemView responsibilities (lifecycle/DOM/forwarding) intact?
3. Is the composition owner a true owner (returns a struct, no service map/key lookup)?
4. Is the rollback story sound (single revertable commit)?
