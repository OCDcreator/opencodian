# 可维护性改进：第三百二十三阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-322.md`
> **推进的 master-plan lane**: P4 `message shell / notice / timestamp`
> **完成的 roadmap queue item**: `R8 - P4 message shell / notice / timestamp ownership`

本轮严格执行 roadmap 的第一个 `[NEXT]` 项：`R8 - P4 message shell / notice / timestamp ownership`。本轮把 persisted assistant message 的 shell / notice / footer / timestamp 组装进一步收束到 `AssistantShellViewHostAdapter`，并让 `PersistentAssistantNoticeService` 直接消费 assistant-message render seam，而不是继续经由 `OpenCodianView.renderMessage()` 这条泛化入口。这样削弱的 owner 是 **`OpenCodianView` 的消息级 DOM 壳层 ownership**：view 现在只保留 assistant 正文 block 渲染回调、pseudo-stream reveal，以及少量本地错误 / server-prompt UI 壳层。

本轮刻意**没有**改动 streaming chunk parser、question dock、todo dock、background-task state machine、pseudo-stream reveal 节奏、assistant notice card markup 语义，或 send/finalization 的 transport/persistence/debug 链路。`ConversationRenderService` 只把 assistant tail port 的正文回调收窄为 `renderMessageBody()`，没有回退既有的 trailing-assistant patch 边界。

## 1. 本轮范围

- 收束 persisted assistant message 壳层组装
  - `AssistantShellViewHostAdapter` 新增 `renderPersistedAssistantMessage()`，统一负责普通 persisted assistant message 的 shell、正文 host 回调、footer 收尾，以及 notice message 的分派
  - `AssistantShellViewHostAdapterHost` 新增 persisted assistant body render seam，让 view 不再直接创建 persisted assistant DOM 壳层
- 简化 `OpenCodianView`
  - `renderMessage()` 不再直接组装 assistant persisted shell / notice / footer，只在 assistant 分支委托 `AssistantShellViewHostAdapter`
  - assistant 正文渲染方法收窄为 `renderAssistantMessageBody()`，只负责 structured/fallback content block 渲染
  - `createConversationAssistantTailRenderPort()` 继续保留 tail patch seam，但正文回调改为更窄的 `renderMessageBody()`
- 收紧 notice service 边界
  - `PersistentAssistantNoticeServiceHost` 改为依赖 `renderAssistantMessage()`，明确它只消费 assistant-message renderer，而不是整个 view 的泛化 `renderMessage()`
- 同步直接相关测试与文档
  - focused tests 覆盖 persisted assistant body/footer 装配、新的 notice render seam，以及收窄后的 trailing-assistant tail port
  - 更新 `OpenCodianView`、`AssistantShellViewHostAdapter`、`ConversationRenderService`、`PersistentAssistantNoticeService` 模块文档
  - 更新 roadmap / lane map，把 R8 标为完成并把 R9 提升为新的 `[NEXT]`

## 2. 变更文件

- Code
  - `src/features/chat/OpenCodianView.ts`
  - `src/features/chat/runtime/AssistantShellViewHostAdapter.ts`
  - `src/features/chat/services/ConversationRenderService.ts`
  - `src/features/chat/services/PersistentAssistantNoticeService.ts`
- Tests
  - `tests/unit/features/chat/AssistantShellViewHostAdapter.test.ts`
  - `tests/unit/features/chat/ConversationRenderService.test.ts`
  - `tests/unit/features/chat/PersistentAssistantNoticeService.test.ts`
- Docs
  - `docs/modules/features/chat/OpenCodianView.md`
  - `docs/modules/features/chat/runtime/AssistantPlainTextFallbackRenderer.md`
  - `docs/modules/features/chat/runtime/AssistantStructuredContentRenderer.md`
  - `docs/modules/features/chat/runtime/AssistantShellViewHostAdapter.md`
  - `docs/modules/features/chat/services/ConversationRenderService.md`
  - `docs/modules/features/chat/services/PersistentAssistantNoticeService.md`
  - `docs/status/maintainability-lane-map.md`
  - `docs/status/maintainability-round-roadmap.md`
  - `docs/status/maintainability-phase-323.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- tests/unit/features/chat/AssistantShellViewHostAdapter.test.ts tests/unit/features/chat/PersistentAssistantNoticeService.test.ts tests/unit/features/chat/ConversationRenderService.test.ts`
- `npm test`
- `npm run build`

本轮 build 生成的 `BUILD_ID`：

- `autopilot-maintainability.202604131937`

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动属于 `src/features/chat/**` 的 maintainability refactor、focused tests 与直接相关文档更新，没有命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按规则在成功 build 后停止于构建验证。

## 5. 下一步建议

下一轮应按 roadmap 推进新的 `[NEXT]` 项：`R9 - Settings panel scaffolding split`。建议从 `OpenCodianSettings.ts` 的 section lifecycle、quick-nav registration 与 scroll restoration 入口开始，优先把 settings tab 的壳层编排收束到较厚 coordinator，而不是继续回到 chat renderer 做零散 helper 提取。

一句话总结第三百二十三阶段本轮：

> 第三百二十三阶段把 persisted assistant shell / notice / footer / timestamp 组装收束进 `AssistantShellViewHostAdapter`，让 `OpenCodianView` 从消息级 DOM 壳层回到更窄的 assistant body host 角色，并把 roadmap 推进到 R9/settings。
