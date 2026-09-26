> 2026-09-18 (FlowText parity R-A7): the composer input-shell host gains `addVaultPathContextFromDrop`, forwarding vault path drops to `composerContextViewFacade` (claimed drops preventDefault; editor text drops keep default insertion).
> 2026-09-21 (advantage-parity R-F1)：composer 队列条宿主 + view 四个队列动作（steer/撤回/立即发送/bar 刷新缝）。
> 2026-09-21 (advantage-parity R-E4)：composer chip 徽标按检索通道标注（透传字段）。
> 2026-09-21 (advantage-parity R-E6)：owner manifest 刷新——shared.foundation 的 include 新增 `src/shared/tokenEstimate.ts`（token 估算启发式）；本 owner 的边界与职责未变。
> 2026-09-21 (advantage-parity R-E2)：composer host 新增 Web Viewer 两缝。
> 2026-09-21 (advantage-parity R-E1)：OpenCodianView 的 composer host 新增 attachUrlContextToActiveTab（粘贴 URL → 网页 chip，零视图逻辑）。
> 2026-09-20 (advantage-parity R-D1)：OpenCodianView 的历史菜单 host 新增 exportConversationMarkdown 转发方法（导出逻辑不进视图）。

# Owner: feature.chat-shell
> 2026-09-25 (FA880): The background panel host forwards native ZCode read/cancel operations with explicit session and task IDs; OpenCodianView does not synthesize task status.
> 2026-09-25 (FA880): `showPermissionDialog` forwards a ZCode-only requestId/sessionId pending read to the inline permission card so teardown and timeout can clear that exact UI decision surface.
> 2026-09-24 (ZCode image recovery)：OpenCodianView forwards the composer preparation acknowledgement callback into the send pipeline; it does not clear or recreate image chips itself.
> 2026-09-24（ZCode）：后端切换时，视图先切换目标 conversation，再读取该 conversation 的 capabilities 重建 composer toolbar；不能用上一个后端的能力位决定新工具栏是否挂载权限模式控件。
> 2026-09-21 (advantage-parity R-F2/R-F3/R-F5/R-F6)：OpenCodianView 只组装绑定笔记、preview-first 回退、会话 rail 与 Vim 键协调器的窄 host port；rail 与历史菜单共享 active-backend 会话筛选和既有 load/recovery，宽面板并排、窄面板隐藏；Vim 事件只挂聊天根且避开输入/overlay。ChatPluginPort 仅扩展所需设置读取面，不引入第二份会话状态。

Pricing readiness (2026-09-10): the shell supplies catalog subscription and per-tab billing identity ports; ActiveTabContextUsageCoordinator owns recomputation and listener lifecycle. Details callbacks remain pinned to the originating tab/session.

> Auto-generated scaffold from `architecture-owners.config.json`. The manifest is the canonical truth source; this page narrates the model and records hard-to-automate rationale. Update it when the owner boundary or its non-obvious invariants change.
- 2026-09-17 (composer sizing settings): OpenCodianView 给 Composer host 新增 `getComposerTextareaMaxHeight()`（读 chatAppearance.input.textareaMaxHeight）；ComposerInputShellCoordinator 的文字区高度上限从硬编码 240 改为 host 提供 + 120–480 兜底。边界不变。
- 2026-09-13 (universal memory backend): owner manifest gained `core.memory` and `app.memory-runtime`; this owner's boundary itself is unchanged (no source touched, allowlist untouched).

- **Layer:** `feature` (may import layers: shared, core, feature)
- **Risk:** high
- **Include:** `src/features/chat/**`

## Responsibilities
- main chat view runtime (OpenCodianView): ItemView lifecycle, DOM mount, tab/stream forwarding
- concurrent tab/session streaming orchestration
- conversation reload hydration/auth-sync

## Canonical state (truth home)
- OpenCodianView tab/stream/conversation runtime state
- chat view scroll-restore state

> Cross-owner access is read-only snapshot/command/event. Do not replicate this state as a second writable truth source.

## Entrypoints
- `src/features/chat/OpenCodianView.ts`

## Dependency surface
- **Allowed owner dependencies:** `shared.foundation`, `shared.diagnostics`, `core.opencode`, `core.agents`, `core.config`, `core.storage`, `core.runtime`, `feature.chat-runtime`, `feature.chat-services`, `feature.chat-rendering`, `feature.chat-ui`, `feature.chat-tabs`, `feature.chat-diagnostics`
- **Forbidden dependencies:** `app`
- **Adjacent owners** (prefer editing these when out of scope): `app.composition`, `feature.chat-runtime`, `feature.chat-services`, `feature.settings-debug`
- **Delegates to:** `feature.chat-rendering`, `feature.chat-runtime`, `feature.chat-services`, `feature.chat-tabs`, `feature.chat-ui`, `feature.chat-demos`, `feature.chat-diagnostics`, `feature.chat-misc`

## Focused tests
- `tests/unit/features/chat/OpenCodianView*.test.ts`

## Required gates
Run before merge: `npm run typecheck`, `npm run module-docs`, `npm run build`.

## Recent change notes
- **Turn change record visibility:** the chat plugin port exposes the global `showTurnChangeRecords` display preference to the runtime without making the shell a second store for persisted notices.
- **Session sidebar hydration:** the shell passes the active conversation's persisted messages to the modified-files coordinator and refreshes that surface when active-backend capabilities hydrate, after plugin-reload first-tab restore, after new-tab or current-tab identity actually changes (conversation id or backend session id), and after a Turn Change Record persists successfully. Creation wrappers do not refresh for max-tabs/no-op returns with unchanged identity, avoiding duplicate work while preventing stale previous-session diffs.
- **Turn-diff host seam:** `createAssistantNoticeCardRendererHost()` exposes the two narrow turn-diff capabilities — `resolveVaultRelativePath()` (shared `toVaultRelativePath()` + `getVaultBasePath()`) and `openVaultFile()` (vault-relative `workspace.openLinkText()`); the shell owns the Obsidian side effects so the runtime renderer stays `App`-free.
- **Render-chain concurrency guards:** the shell's settings path merges question-card display toggles into a single `refreshQuestionUi()`; conversation rerenders are serialized with generation checks, `loadConversation` is pinned per-tab and abortable, and clicking the already-active tab short-circuits instead of rehydrating. Both `clearMessagesContainer` seams dispose registered collapsibles before emptying the container.
- **Notice direct-DOM cache invalidation:** the `PersistentAssistantNoticeService` host seam's `renderAssistantMessage` callback appends a notice directly to the live pane (bypassing the full-rerender commit), so it now calls `conversationRenderService.invalidateRerenderFingerprint()` first, preventing a later full refresh from short-circuiting as a no-op and leaving the notice in place.

## Hard invariants
- Do not cross `forbiddenDependencies`.
- Do not replicate canonical state in another owner.
- Changes here must update the matching `docs/modules/**` page (via `module-docs.config.json`).
- Run `npm run inspect:owner -- <this owner or a path>` for an always-fresh summary.

## SDK upgrade integration notes
- 2026-09-02: view 订阅 `ClaudeCodeAdapter.onCommandsChanged`（SDK 0.3.252 `system/commands_changed` 信号）即时失效 slash 命令菜单缓存；镜像 Codex `onSkillsChanged` binding 模式，生命周期随 view teardown 退订。

## Pi owner boundary review (2026-09-08)

The shell supplies the Pi slash-catalog discriminator only. All Pi runtime lifecycle remains behind the registered AgentService adapter.

## Model selection host app seam (2026-09-11)

`createChatSelectionControlsCoordinatorHost()` now supplies `getApp: () => this.app` so the selection controls can resolve local bundled provider icon resource paths. This is a host port only — the shell does not gain icon-resolution logic.

- 2026-09-15: `OpenCodianView` 增加两个只读访问器 `getActiveConversationBackendKind()` / `getActiveTabModelRef()`，供 inline edit 宿主在 `editorCallback` 之外解析当前聊天 tab 的后端与模型；未新增运行时归属。
- 2026-09-17: `OpenCodianView` 的品牌标记图标 id 改为从 `shared.brandingWordmark` 导入（原先在 view 内自存一份字面量），行为不变。> 2026-09-24 (票 06)：OpenCodianView 的斜杠缓存宿主接入 loadZCodeRuntimeCommands（ZCode 实时目录直取归一为既有 / 条目），其余后端语义不变。
