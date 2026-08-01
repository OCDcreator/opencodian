# 可维护性改进：第二百一十二阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-211.md`
> **推进的 master-plan lane**: P1 `tab / pane / conversation activation 与 sync orchestration`（new-conversation open coordinator boundary）

本轮先按 master plan 复审，继续优先选择能直接削弱 `OpenCodianView` ownership 的 P1 切口，没有回到已暂停的 `ConversationRenderService` / `TrailingAssistantPatch*` helper-fragmentation lane。实际切片是：**把 header“新建会话”与“在当前 tab 新建会话”两条入口里的 max-tabs / streaming block / create error / success notice，以及“创建后走 activate 新 tab 还是复用当前 tab open shell”的分支，从 `OpenCodianView` 迁到新的 `ConversationTabOpenCoordinator`。**

这次改动没有改变会话打开语义：新 tab 路径仍先检查 tab 上限、成功后仍创建 tab 并激活；当前 tab 路径仍会在 streaming 时阻止替换、成功后仍复用现有 `TabConversationActivationBridge.openConversation()` 壳层；变化点只是把这些 open/reuse/notice 决策集中到专门 coordinator，让 view 只保留按钮/命令 wrapper 和 host/port 装配。

## 1. 本轮范围

- `src/features/chat/services/ConversationTabOpenCoordinator.ts`
  - 新增 new-conversation open coordinator
  - 统一承接 new-tab / current-tab 的 open-or-reuse 分支，以及 max-tabs / streaming / success / error notice 决策
- `src/features/chat/OpenCodianView.ts`
  - 装配新的 `ConversationTabOpenCoordinator`
  - 让 `createNewConversation()` / `createNewConversationInCurrentTab()` wrapper 改为委托新 coordinator
  - 删除 view 内联的 current-tab open notice/branch 逻辑
- 测试
  - 新增 `tests/unit/features/chat/ConversationTabOpenCoordinator.test.ts`
  - 新增 `tests/unit/features/chat/conversationTabOpen.test.ts`
- 直接相关文档
  - 新增 `docs/modules/features/chat/services/ConversationTabOpenCoordinator.md`
  - 更新 `docs/modules/features/chat/OpenCodianView.md`
  - 更新 `docs/modules/README.md`

## 2. 变更文件

- `src/features/chat/services/ConversationTabOpenCoordinator.ts`
- `src/features/chat/OpenCodianView.ts`
- `tests/unit/features/chat/ConversationTabOpenCoordinator.test.ts`
- `tests/unit/features/chat/conversationTabOpen.test.ts`
- `docs/modules/features/chat/services/ConversationTabOpenCoordinator.md`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/README.md`
- `docs/status/maintainability-phase-212.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- ConversationTabOpenCoordinator conversationTabOpen`
- `npm test`
- `npm run build`

补充检查：

- 通过 `rg -n "autopilot-maintainability\\.202604122206" /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/main.js` 校验部署产物已更新到本轮最新 `BUILD_ID`

## 4. 部署结果

`npm run build` 成功后，已按仓库约定部署到 Test Vault：

- 复制 `dist/main.js`
- 复制 `dist/manifest.json`
- 复制 `dist/styles.css`

部署目标：

- `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian`

本轮未改动 bundled assets，因此未复制 `dist/assets/`。

已校验 Test Vault 中的 `main.js` 包含本轮最新 `BUILD_ID`：

- `autopilot-maintainability.202604122206`

## 5. 下一步建议

本轮完成后，new-conversation 的 open/reuse/notice 入口已从 `OpenCodianView` 迁出；**下一轮建议继续沿 master plan 的 P1，处理 `handleTabClose()` / `deleteConversationsAndCleanupTabs()` 里“关闭或删除后该激活现有 tab 还是 fallback 新建 conversation”的残余 tab-lifecycle 决策，继续削弱 view 对 tab lifecycle recovery 的 ownership，而不是回到更窄的 helper 粉碎。**

一句话总结第二百一十二阶段本轮：

> 第二百一十二阶段新增 `ConversationTabOpenCoordinator`，把 new-tab / current-tab 新建会话入口的 open/reuse/notice 决策从 `OpenCodianView` 迁出，继续推进了 master plan 的 P1 `tab / pane / conversation activation 与 sync orchestration` ownership 迁移。
