# 可维护性改进：第三百一十五阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-314.md`
> **推进的 master-plan lane**: P2 `question / todo / background task` wiring 与 post-sync/activation 协调（shared tab-scoped conversation-sync fingerprint runtime port）

本轮先遵循 lane map 的 P2 首查顺序，只检查 `OpenCodianView` 里 question/todo/background-task 的 host factory / wiring 片段，然后再回看 focus hint 提到的 `createPersistentAssistantNoticeServiceHost()`。两处都还各自维护一段相同的 tab-scoped conversation-sync fingerprint writeback seam：通过 `getTabRuntimeState()` 回写 `runtime.lastConversationSyncFingerprint`。本轮选择一个低风险单一职责切片：**新增 `TabConversationSyncFingerprintPortProvider`，把 conversation-sync fingerprint 计算与 tab-scoped fingerprint 回写收束为一份共享 runtime port，供 `PersistentAssistantNoticeService` 与 `QuestionTodoBackgroundTaskRuntimeHostProvider` 共同复用。**

这样 `OpenCodianView` 不再分别在两个 host factory 里内联维护：

- `getConversationSyncFingerprint()` 的 persistent-notice forwarding wrapper
- `runtime.lastConversationSyncFingerprint` 的 tab-scoped writeback wrapper

`PersistentAssistantNoticeService` 与 `QuestionTodoBackgroundTaskRuntimeHostProvider` 现在都改为消费同一份 `getConversationSyncRuntime()` seam；新的 provider 负责把 fingerprint read/write regroup 为稳定 runtime port，而原有 notice / question-todo-background-task 逻辑保持不变。

## 1. 本轮范围

- `src/features/chat/services/TabConversationSyncFingerprintPortProvider.ts`
  - 新增薄 provider，把 conversation-sync fingerprint 计算与 tab-scoped fingerprint 回写 regroup 为共享 runtime port
- `src/features/chat/OpenCodianView.ts`
  - 新增 shared fingerprint provider host / runtime port 初始化，并让 persistent-assistant notice 与 question/todo/background-task host wiring 共用这份 seam
- `src/features/chat/services/PersistentAssistantNoticeService.ts`
  - 改为通过 grouped `getConversationSyncRuntime()` seam 读取 fingerprint 并回写 tab sync baseline
- `src/features/chat/services/QuestionTodoBackgroundTaskRuntimeHostProvider.ts`
  - 改为消费 grouped `getConversationSyncRuntime()` seam，而不是单独声明 `setTabConversationSyncFingerprint()`
- `tests/unit/features/chat/TabConversationSyncFingerprintPortProvider.test.ts`
  - 新增 focused coverage，验证新 provider 的 regrouping 行为
- `tests/unit/features/chat/PersistentAssistantNoticeService.test.ts`
- `tests/unit/features/chat/QuestionTodoBackgroundTaskRuntimeHostProvider.test.ts`
- `tests/unit/features/chat/QuestionTodoBackgroundTaskRuntimeServiceBundle.test.ts`
  - 同步更新测试，确认 grouped fingerprint runtime port 被 notice 与 P2 host provider 正常消费
- `docs/modules/features/chat/services/TabConversationSyncFingerprintPortProvider.md`
  - 新增模块文档，记录新的 shared fingerprint runtime seam
- `docs/modules/features/chat/services/PersistentAssistantNoticeService.md`
- `docs/modules/features/chat/services/QuestionTodoBackgroundTaskRuntimeHostProvider.md`
  - 同步边界描述，说明 tab-scoped fingerprint writeback 已前移到新 provider

## 2. 变更文件

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/services/PersistentAssistantNoticeService.ts`
- `src/features/chat/services/QuestionTodoBackgroundTaskRuntimeHostProvider.ts`
- `src/features/chat/services/TabConversationSyncFingerprintPortProvider.ts`
- `tests/unit/features/chat/PersistentAssistantNoticeService.test.ts`
- `tests/unit/features/chat/QuestionTodoBackgroundTaskRuntimeHostProvider.test.ts`
- `tests/unit/features/chat/QuestionTodoBackgroundTaskRuntimeServiceBundle.test.ts`
- `tests/unit/features/chat/TabConversationSyncFingerprintPortProvider.test.ts`
- `docs/modules/features/chat/services/PersistentAssistantNoticeService.md`
- `docs/modules/features/chat/services/QuestionTodoBackgroundTaskRuntimeHostProvider.md`
- `docs/modules/features/chat/services/TabConversationSyncFingerprintPortProvider.md`
- `docs/status/maintainability-phase-315.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- tests/unit/features/chat/TabConversationSyncFingerprintPortProvider.test.ts tests/unit/features/chat/PersistentAssistantNoticeService.test.ts tests/unit/features/chat/QuestionTodoBackgroundTaskRuntimeHostProvider.test.ts tests/unit/features/chat/QuestionTodoBackgroundTaskRuntimeServiceBundle.test.ts`
- `npm run build`

本轮 build 生成的 `BUILD_ID`：

- `autopilot-maintainability.202604131620`

本轮**未执行**全量 `npm test`。

原因：

- attempt `313` 不可被 `5` 整除，且改动未命中仓库规则定义的高风险路径

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

下一轮可继续复查 P2 host factory 里仍然内联的 conversation-state seam：`createQuestionTodoBackgroundTaskRuntimeHostProviderHost()` 还直接持有 `getCurrentConversation()` 与 `setCurrentConversationRevertState()` forwarding，可评估是否值得沿用同类 provider 模式，把 remaining conversation-state regrouping 再从 `OpenCodianView` 下沉一层。

一句话总结第三百一十五阶段本轮：

> 第三百一十五阶段把 persistent-assistant notice 与 question/todo/background-task 共享的 conversation-sync fingerprint read/write seam 从 `OpenCodianView` 下沉到 `TabConversationSyncFingerprintPortProvider`，让 P2 host wiring 更接近单一职责 grouped runtime port，并保持既有行为不变。
