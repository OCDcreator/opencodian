# 可维护性改进：第二百一十四阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-213.md`
> **推进的 master-plan lane**: P1 `tab / pane / conversation activation 与 sync orchestration`（delete-all tab reset/bootstrap recovery boundary）

本轮先按 master plan 复审，继续优先选择能直接削弱 `OpenCodianView` ownership 的 P1 切口，没有回到已暂停的 `ConversationRenderService` / `TrailingAssistantPatch*` helper-fragmentation lane。实际切片是：**把 `deleteAllConversations()` 里“删除全部会话后清空 pane、重建 `TabManager`、再 bootstrap fallback conversation”的 recovery orchestration，从 `OpenCodianView` 迁到现有 `ConversationTabLifecycleRecoveryCoordinator`。**

这次改动没有改变现有语义：delete-all 仍先逐个删除 conversation，再清空现有 tab messages pane、重建空 tab manager，并继续复用 `ConversationTabOpenCoordinator.createConversationInNewTab()` 的 noticed fallback 路径；因此“新建 tab 成功” notice、delete-all 成功 notice，以及 fallback 创建失败时的原有错误处理语义都保持不变。变化点只是把 delete-all reset/bootstrap 分支也收束到 dedicated lifecycle coordinator，让 view 只保留确认对话框、success notice wrapper 和 host/port 装配。

## 1. 本轮范围

- `src/features/chat/services/ConversationTabLifecycleRecoveryCoordinator.ts`
  - 扩展 lifecycle recovery coordinator，新增 delete-all reset/bootstrap orchestration
  - 统一承接 delete-all 后的 conversation 删除、pane 清空、`TabManager` 重建与 fallback new-tab bootstrap
- `src/features/chat/OpenCodianView.ts`
  - 为 lifecycle recovery host 补充 `clearTabMessagesPanes()` / `resetTabManager()` 落点
  - 把 `deleteAllConversations()` 改为委托 coordinator
  - 抽出复用的 `createTabManager()` / `resetTabManager()`，收束 view 内的 tab-manager 重建细节
- 测试
  - 更新 `tests/unit/features/chat/ConversationTabLifecycleRecoveryCoordinator.test.ts`
  - 更新 `tests/unit/features/chat/conversationTabLifecycleRecovery.test.ts`
- 直接相关文档
  - 更新 `docs/modules/features/chat/services/ConversationTabLifecycleRecoveryCoordinator.md`
  - 更新 `docs/modules/features/chat/OpenCodianView.md`

## 2. 变更文件

- `src/features/chat/services/ConversationTabLifecycleRecoveryCoordinator.ts`
- `src/features/chat/OpenCodianView.ts`
- `tests/unit/features/chat/ConversationTabLifecycleRecoveryCoordinator.test.ts`
- `tests/unit/features/chat/conversationTabLifecycleRecovery.test.ts`
- `docs/modules/features/chat/services/ConversationTabLifecycleRecoveryCoordinator.md`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/status/maintainability-phase-214.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- ConversationTabLifecycleRecoveryCoordinator conversationTabLifecycleRecovery`
- `npm test`
- `npm run build`

补充检查：

- `rg -n "autopilot-maintainability\\.202604122226" /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/main.js`

## 4. 部署结果

`npm run build` 成功后，已按仓库约定部署到 Test Vault：

- 复制 `dist/main.js`
- 复制 `dist/manifest.json`
- 复制 `dist/styles.css`

部署目标：

- `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian`

本轮未改动 bundled assets，因此未复制 `dist/assets/`。

已校验 Test Vault 中的 `main.js` 包含本轮最新 `BUILD_ID`：

- `autopilot-maintainability.202604122226`

## 5. 下一步建议

`deleteAllConversations()` 的 tab reset/bootstrap orchestration 迁出后，`OpenCodianView` 在 tab lifecycle recovery 这一条 P1 子链上的剩余内联 ownership 已明显收敛。**下一轮建议回到 master plan 复审并优先切到 P2，抽离 `OpenCodianView` 中 session todo / stale notice / dock 协调的一段完整 ownership（例如 todo stale notice + dock refresh + follow-up bridge），继续选择能显著降低 view ownership 的单一职责边界，而不是继续把 tab helper 链打碎。**

一句话总结第二百一十四阶段本轮：

> 第二百一十四阶段把 delete-all 后的 tab reset 与 fallback bootstrap 从 `OpenCodianView` 迁入 `ConversationTabLifecycleRecoveryCoordinator`，继续推进了 master plan 的 P1 `tab / pane / conversation activation 与 sync orchestration` ownership 迁移。
