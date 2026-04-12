# 可维护性改进：第二百六十五阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-264.md`
> **推进的 master-plan lane**: P4 `message shell / notice / timestamp ownership`（persisted assistant notice shell host seam）

本轮继续遵循 master plan、lane map 与上一轮 phase 文档，在 P4 选择一个高价值且低风险的单一职责切片：**把 persisted assistant notice 的 message shell 创建与 notice-class/data-attribute 归一，从 `OpenCodianView.renderMessage()` 下沉到既有 `AssistantShellViewHostAdapter` / `AssistantShellRenderer` host seam。**

这样 `renderMessage()` 的 notice 分支现在直接委托给 assistant shell host adapter；persisted assistant notice 的 turn-body 挂载、assistant notice shell class、`data-message-id` / `data-source-message-id` 与后续 notice card + footer 编排，都沿同一条 runtime seam 收束。

## 1. 本轮范围

- `src/features/chat/runtime/AssistantShellRenderer.ts`
  - 新增 `createPersistedAssistantMessageElement()`
  - 统一 persisted assistant shell 的 turn-body 挂载、assistant class 与 dataset 写入
- `src/features/chat/runtime/AssistantShellViewHostAdapter.ts`
  - 新增 `renderPersistedAssistantNoticeMessage()`
  - 让 persisted notice 的 shell + card + footer 通过同一条 adapter seam 一次完成
- `src/features/chat/OpenCodianView.ts`
  - 把 `renderMessage()` 的 notice 分支改为直接调用 host adapter
  - 移除 view 内残留的 persisted notice shell 组装
- 测试
  - 更新 `tests/unit/features/chat/AssistantShellViewHostAdapter.test.ts`
  - 继续用 `tests/unit/features/chat/streamingAssistantShellVisibility.test.ts` 覆盖 shell renderer 邻近回归
- 直接相关文档
  - 更新 `docs/modules/features/chat/runtime/AssistantShellRenderer.md`
  - 更新 `docs/modules/features/chat/runtime/AssistantShellViewHostAdapter.md`
  - 更新 `docs/modules/features/chat/OpenCodianView.md`

## 2. 变更文件

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/runtime/AssistantShellRenderer.ts`
- `src/features/chat/runtime/AssistantShellViewHostAdapter.ts`
- `tests/unit/features/chat/AssistantShellViewHostAdapter.test.ts`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/features/chat/runtime/AssistantShellRenderer.md`
- `docs/modules/features/chat/runtime/AssistantShellViewHostAdapter.md`
- `docs/status/maintainability-phase-265.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- AssistantShellViewHostAdapter streamingAssistantShellVisibility`
- `npm test`
- `npm run build`

本轮构建 `BUILD_ID`：

- `autopilot-maintainability.202604130728`

本轮执行完整 `npm test` 的原因：

- attempt `260` 可被 `5` 整除，因此按仓库规则执行整库 Jest 回归

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

下一轮建议优先切回更高优先级的 P1 / P2：从 `OpenCodianView` activation / post-sync / question-todo-background-task host wiring 首查入口里，选择一个仍停留在 view 内的共享装配片段，下沉到现有 facade / coordinator seam，而不是继续细拆更窄的 notice helper。

一句话总结第二百六十五阶段本轮：

> 第二百六十五阶段把 persisted assistant notice 的 message shell 创建迁到 shared assistant shell host seam，让 `OpenCodianView.renderMessage()` 的 notice 分支进一步收缩为单一委托入口。
