# 可维护性改进：第二百一十三阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-212.md`
> **推进的 master-plan lane**: P1 `tab / pane / conversation activation 与 sync orchestration`（tab lifecycle recovery coordinator boundary）

本轮先按 master plan 复审，继续优先选择能直接削弱 `OpenCodianView` ownership 的 P1 切口，没有回到已暂停的 `ConversationRenderService` / `TrailingAssistantPatch*` helper-fragmentation lane。实际切片是：**把 `handleTabClose()` 与 `deleteConversationsAndCleanupTabs()` 中“关闭/删除后该激活已有 tab、静默补建 fallback tab，还是走 noticed new-tab fallback”的 recovery 决策，从 `OpenCodianView` 迁到新的 `ConversationTabLifecycleRecoveryCoordinator`。**

这次改动没有改变现有语义：单独关闭最后一个 tab 时仍会静默创建 fallback conversation；删除会话导致 tab 清空时仍继续走 `ConversationTabOpenCoordinator` 的 noticed new-tab 路径；foreground busy tab 仍会阻止关闭并显示原有 notice。变化点只是把 close/delete recovery 的分支与 pane cleanup 收束到 dedicated coordinator，让 view 只保留确认对话框、按钮/命令 wrapper 和 host/port 装配。

## 1. 本轮范围

- `src/features/chat/services/ConversationTabLifecycleRecoveryCoordinator.ts`
  - 新增 tab lifecycle recovery coordinator
  - 统一承接 tab close / conversation delete 后的 pane cleanup、activate-next、silent fallback create，与 delete-empty 的 noticed fallback 分支
- `src/features/chat/OpenCodianView.ts`
  - 装配新的 `ConversationTabLifecycleRecoveryCoordinator`
  - 让 `handleTabClose()` / `deleteConversationsAndCleanupTabs()` 改为委托新 coordinator
  - 删除 view 内联的 close/delete recovery 分支
- `src/features/chat/tabs/index.ts`
  - 补充导出 `CloseTabsResult`，供 recovery coordinator 复用 tabs barrel 类型
- 测试
  - 新增 `tests/unit/features/chat/ConversationTabLifecycleRecoveryCoordinator.test.ts`
  - 新增 `tests/unit/features/chat/conversationTabLifecycleRecovery.test.ts`
- 直接相关文档
  - 新增 `docs/modules/features/chat/services/ConversationTabLifecycleRecoveryCoordinator.md`
  - 更新 `docs/modules/features/chat/OpenCodianView.md`
  - 更新 `docs/modules/features/chat/tabs/index.md`
  - 更新 `docs/modules/README.md`

## 2. 变更文件

- `src/features/chat/services/ConversationTabLifecycleRecoveryCoordinator.ts`
- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/tabs/index.ts`
- `tests/unit/features/chat/ConversationTabLifecycleRecoveryCoordinator.test.ts`
- `tests/unit/features/chat/conversationTabLifecycleRecovery.test.ts`
- `docs/modules/features/chat/services/ConversationTabLifecycleRecoveryCoordinator.md`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/features/chat/tabs/index.md`
- `docs/modules/README.md`
- `docs/status/maintainability-phase-213.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- ConversationTabLifecycleRecoveryCoordinator conversationTabLifecycleRecovery`
- `npm test`
- `npm run build`

补充检查：

- 通过 `rg -n "autopilot-maintainability\\.202604122217" /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/main.js` 校验部署产物已更新到本轮最新 `BUILD_ID`

## 4. 部署结果

`npm run build` 成功后，已按仓库约定部署到 Test Vault：

- 复制 `dist/main.js`
- 复制 `dist/manifest.json`
- 复制 `dist/styles.css`

部署目标：

- `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian`

本轮未改动 bundled assets，因此未复制 `dist/assets/`。

已校验 Test Vault 中的 `main.js` 包含本轮最新 `BUILD_ID`：

- `autopilot-maintainability.202604122217`

## 5. 下一步建议

本轮完成后，tab close / delete 的 recovery create-or-activate 分支已从 `OpenCodianView` 迁出；**下一轮建议继续沿 master plan 的 P1，处理 `deleteAllConversations()` 里仍内联的 tab-manager reset + fallback bootstrap，尽量复用现有 restore / lifecycle coordinator 边界，继续削弱 view 对 tab lifecycle orchestration 的 ownership。**

一句话总结第二百一十三阶段本轮：

> 第二百一十三阶段新增 `ConversationTabLifecycleRecoveryCoordinator`，把 tab close 与 conversation delete 后的 recovery 决策从 `OpenCodianView` 迁出，继续推进了 master plan 的 P1 `tab / pane / conversation activation 与 sync orchestration` ownership 迁移。
