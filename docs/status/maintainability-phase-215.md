# 可维护性改进：第二百一十五阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-214.md`
> **推进的 master-plan lane**: P2 `question / todo / background task`（session todo dock coordination boundary）

本轮先按 master plan 复审，优先选择仍能直接削弱 `OpenCodianView` ownership 的 P2 切口，没有回到已暂停的 `ConversationRenderService` / `TrailingAssistantPatch*` helper-fragmentation lane。实际切片是：**把 session todo dock 的挂载、销毁，以及 active/background tab 的 session→dock 选择逻辑，从 `OpenCodianView` 迁到新的 `SessionTodoDockCoordinator`。**

这次改动没有改变现有语义：activation preflight 仍继续按 tab runtime 里的 `sessionTodoSessionId` 预刷新 dock，active tab 的常规 render 仍优先使用 `currentConversation.openCodeSessionId`，而 background tab 仍继续读取 runtime snapshot。变化点只是把 session todo dock 的 DOM 生命周期与渲染选择规则收束到 dedicated coordinator，让 `OpenCodianView` 回到更薄的 host bridge。

## 1. 本轮范围

- `src/features/chat/services/SessionTodoDockCoordinator.ts`
  - 新增 dedicated coordinator，统一承接 session todo dock 的 slot 生命周期与 session 选择逻辑
  - 保留 active-tab render 与 activation preflight / background-tab refresh 的原有分流语义
- `src/features/chat/OpenCodianView.ts`
  - 改为持有 `SessionTodoDockCoordinator`
  - 把 session todo dock 的 attach/destroy/render/update 迁为 coordinator 调用，移除 view 内直接持有的 dock DOM ownership
- 测试
  - 新增 `tests/unit/features/chat/SessionTodoDockCoordinator.test.ts`
- 直接相关文档
  - 新增 `docs/modules/features/chat/services/SessionTodoDockCoordinator.md`
  - 更新 `docs/modules/features/chat/OpenCodianView.md`
  - 更新 `docs/modules/features/chat/services/SessionTodoStateService.md`
  - 更新 `docs/modules/features/chat/ui/SessionTodoDock.md`

## 2. 变更文件

- `src/features/chat/services/SessionTodoDockCoordinator.ts`
- `src/features/chat/OpenCodianView.ts`
- `tests/unit/features/chat/SessionTodoDockCoordinator.test.ts`
- `docs/modules/features/chat/services/SessionTodoDockCoordinator.md`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/features/chat/services/SessionTodoStateService.md`
- `docs/modules/features/chat/ui/SessionTodoDock.md`
- `docs/status/maintainability-phase-215.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- SessionTodoDockCoordinator SessionTodoStateService staleSessionTodoState TabViewActivationBridge`
- `npm test`
- `npm run build`

补充检查：

- `rg -n "autopilot-maintainability\\.202604122240" /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/main.js`

## 4. 部署结果

`npm run build` 成功后，已按仓库约定部署到 Test Vault：

- 复制 `dist/main.js`
- 复制 `dist/manifest.json`
- 复制 `dist/styles.css`

部署目标：

- `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian`

本轮未改动 bundled assets，因此未复制 `dist/assets/`。

已校验 Test Vault 中的 `main.js` 包含本轮最新 `BUILD_ID`：

- `autopilot-maintainability.202604122240`

## 5. 下一步建议

session todo dock 的 DOM ownership 迁出后，`OpenCodianView` 在 P2 session todo 子链上还剩一层明显的 host-bridge 粘合。**下一轮建议继续留在 P2，但选择更完整的 session todo runtime host 适配切口：把 `renderSessionTodoDock()` / `updateSessionTodoDockForTab()` 连同 session todo state/refresh host 装配进一步收束到 dedicated adapter/bundle，让 view 更接近纯组装层，而不是继续保留多组 session todo 中继回调。**

一句话总结第二百一十五阶段本轮：

> 第二百一十五阶段新增 `SessionTodoDockCoordinator` 承接 session todo dock 的生命周期与 session 选择逻辑，推进了 master plan 的 P2 `question / todo / background task` ownership 迁移。
