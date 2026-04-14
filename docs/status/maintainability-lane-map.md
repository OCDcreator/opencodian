# Maintainability Lane Map

> **用途**: 这是每轮开始时的快速定位图。先看这里，再配合 `docs/status/maintainability-round-roadmap.md` 执行当前 `[NEXT]` 任务，而不是自由选题。
> **当前状态**: [REVIEW_REQUIRED] R28-R32 已完成；当前没有可自动执行的 `[NEXT]`，必须等待人工确认。

## 当前优先级

- **当前没有自动下一轮**：R32 gateway checkpoint 已完成，autopilot 必须暂停
- **如继续 maintainability**：先人工确认是否围绕 `OpenCodeService` 剩余 transport/config/finalize seam 设计新 queue

## 当前热点首查入口

- 恢复 autopilot 前，首查 roadmap / master plan / lane map、`docs/status/maintainability-phase-347.md` 与 `src/core/opencode/OpenCodeService.ts` 指标
- `OpenCodianView` / settings / trailing-assistant 链本批都只保留 regression watchpoints，不再开新切口
- P2 regression-only 首查顺序固定为：
  1. `tests/unit/features/chat/QuestionDockCoordinator.test.ts`
  2. `tests/unit/features/chat/QuestionTodoStatusRefreshCoordinator.test.ts`
  3. `tests/unit/features/chat/SessionTodoCoordinator.test.ts`
  4. `tests/unit/features/chat/BackgroundTaskCompletionNoticeService.test.ts`
  5. `tests/unit/features/chat/ConversationSessionSignalRuntime.test.ts`

## P2 收束状态

- R1-R6 已把 question dock lifecycle、todo refresh/status、background completion notice、post-sync handoff 与 session signal orchestration 收束到稳定 owner
- 当前剩余风险以回归为主：background tab 无 session 时的 dock 清理、post-sync todo/status gate、completion notice queue/fingerprint 去重，以及 live signal 进入 `SessionTodoCoordinator` 后的 writeback 顺序
- 后续若不是测试、构建或正确性问题，默认不要再回到 P2 开新拆分切口

## P3 收束状态

- R7 已把 composer-context bundle 创建、`ContextAttachmentBuilder` 与 `ContextFileCatalogService` ownership 收进 `ComposerContextViewFacade.create()`
- `OpenCodianView` 只保留 view host seam、context row DOM 挂载、add-context 按钮和公开的 editor context 入口；不要再把 builder/catalog/service fan-out 放回 view
- 后续若不是回归或正确性问题，不再默认回到 P3；当前按 R28-R32 的 `OpenCodeService` queue 执行

## P4 收束状态

- R8 已把 persisted assistant shell / notice / footer / timestamp 组装收束到 `AssistantShellViewHostAdapter`，并让 `PersistentAssistantNoticeService` 直接消费 assistant-message render seam
- `OpenCodianView` 现在只保留 assistant 正文 block 渲染回调、pseudo-stream reveal 与少量本地错误/server-prompt UI 壳层；不要再把 persisted assistant 壳层组装搬回 view
- 后续若不是回归或正确性问题，不再自动扩展 P4；当前按 R28-R32 的 `OpenCodeService` queue 执行

## Settings maintainability 状态

- R9 已把 settings section lifecycle、quick-nav 与 scroll restoration 收束到 `SettingsSectionCoordinator`
- R10 已把 provider/model accordion、search、bulk toggle 与 probe presentation 收束到 `SettingsModelCatalogPresenter`
- `OpenCodianSettings` 现在负责 section composition、settings persistence 与 modal launch；不要把 model catalog UI 状态机或 probe badge/detail 逻辑搬回主类
- R11 已把 `baseEffective` / `effective` / `currentEnabledProviderIds` availability API 从 settings presenter 侧抽回 `ModelCatalogStateService`
- Settings/core 的下一步不再开新 UI 拆分；当前 R28-R32 已确认优先 `OpenCodeService`，settings 仅保留 regression watchpoints

## 可复用模式

- host wiring 先看 `HostAdapter` / `create*Services()` 的现有模式
- post-sync / activation / runtime 多入口共享逻辑，优先落到 facade / coordinator / runtime bridge
- `OpenCodianView` 只保留 host assembly、bridge 入口和必要 UI writeback

## 低收益规则

- 不要在成功轮次里反复广扫同一大片 `OpenCodianView` 上下文
- `docs/modules/**` 只在模块边界真实变化时再读、再改
- 不要继续深挖 trailing-assistant helper 碎片化链路，除非正确性或构建失败直接阻塞


## R13-R18 执行边界

- 每轮必须先处理第一个 `[NEXT]`，不得自由选择 `OpenCodeService` 或 settings 新切口。
- 本批目标是迁出 `OpenCodianView` 中仍成块存在的 UI/runtime shell ownership，而不是继续制造 provider/factory/adapter 薄层。
- 新 owner 默认要覆盖完整 lifecycle；如果低于约 100 行且少于 3 个公开 API，必须在 phase 文档里说明为何不是微碎片，否则应合并回调用方。
- R18 已完成并已进入暂停态；是否转向 `OpenCodeService` 由下一次人工确认决定。


## R19-R27 执行边界

- 每轮必须先处理第一个 `[NEXT]`，不得自由切回 `OpenCodianView`、settings 或 `ServerManager`。
- 本批目标是迁出 `OpenCodeService` 中仍成块存在的 runtime / state / builder / mapper ownership，而不是把对外 API facade 粉碎成更多小文件。
- 新 owner 默认要覆盖完整 lifecycle；如果低于约 100 行且少于 3 个公开 API，必须在 phase 文档里说明为何不是微碎片，否则应合并回 `OpenCodeService`。
- `OpenCodeService` 继续保持对外总门面；新 owner 通过 host seam 接入，不要把调用方改成直接依赖大量新模块。
- R27 已完成并进入暂停态；是否继续 session/config/query gateway 由下一次人工确认决定。


## R28-R32 执行边界

- 每轮必须先处理第一个 `[NEXT]`，不得自由切回 `OpenCodianView`、settings 或 `ServerManager`。
- 本批目标是迁出 `OpenCodeService` 中仍成块存在的 session / control / negotiation ownership，而不是把 gateway façade 再粉碎成更多小文件。
- 新 owner 默认要覆盖完整 lifecycle；如果低于约 100 行且少于 3 个公开 API，必须在 phase 文档里说明为何不是微碎片，否则应合并回 `OpenCodeService`。
- `R31` 是条件执行项：只有当 query/admin APIs 能形成明显厚 owner 时才允许提交代码重构；否则必须记录跳过原因后直接推进 `R32`。
- R32 完成后必须暂停；是否继续由下一次人工确认决定。
