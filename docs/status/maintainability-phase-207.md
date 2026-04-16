# 可维护性改进：第二百零七阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-206.md`
> **推进的 master-plan lane**: P1 `tab / pane / conversation activation 与 sync orchestration`（empty-tab / current-tab shared activation boundary）

本轮先按 master plan 复审，继续优先选择仍能直接削弱 `OpenCodianView` ownership 的 P1 activation/sync orchestration 切口，没有回到已暂停的 `ConversationRenderService` / `TrailingAssistantPatch*` helper-fragmentation lane。实际切片是：**把 empty-tab activation 与 current-tab new conversation open 这两条仍留在 `OpenCodianView` 的 active-pane reset / open shell 路径，统一收束到新的 `TabConversationActivationBridge`，让 `ConversationViewStateService` 直接委托 dedicated bridge 处理 empty-tab activation，而 `openConversationInCurrentTab()` 也继续通过同一 bridge 组合 `TabConversationStateBridge`、`TabViewActivationBridge` 与 `QuestionTodoStatusRefreshCoordinator`。**

这次改动没有改变 empty-tab activation 或 current-tab open 的行为语义：empty-tab 分支仍保持 active conversation clear → 消息区清空 → turn reset → empty-state dock/selector/context/send-button outcome 的原有顺序；current-tab open 分支仍保持 indicator reset（仅 conversation id 变化时）→ active conversation/session writeback → 消息区清空/turn reset → baseline commit → selector/context identity → background-task rebuild → todo/question refresh → supplemental status/question/todo refresh → indicator/context usage async refresh → settled scroll 的既有顺序；只是把这两条 activation/open shell ownership 从 view 继续迁到 shared runtime bridge。

## 1. 本轮范围

- `src/features/chat/runtime/TabConversationActivationBridge.ts`
  - 新增 shared activation bridge
  - 统一承接 empty-tab activation 与 current-tab open 的 active-pane shell orchestration
- `src/features/chat/services/ConversationViewStateService.ts`
  - empty-tab activation 改为直接依赖 shared activation bridge，而不再回调 view host
- `src/features/chat/OpenCodianView.ts`
  - 装配 shared activation bridge
  - 删除 view 内联的 empty-tab activation shell，保留命令入口与 host 装配
- 测试
  - 新增 `tests/unit/features/chat/TabConversationActivationBridge.test.ts`
  - 更新 `tests/unit/features/chat/ConversationViewStateService.test.ts`
- 直接相关文档
  - 新增 `docs/modules/features/chat/runtime/TabConversationActivationBridge.md`
  - 更新 `docs/modules/features/chat/OpenCodianView.md`
  - 更新 `docs/modules/features/chat/services/ConversationViewStateService.md`

## 2. 变更文件

- `src/features/chat/runtime/TabConversationActivationBridge.ts`
- `src/features/chat/services/ConversationViewStateService.ts`
- `src/features/chat/OpenCodianView.ts`
- `tests/unit/features/chat/TabConversationActivationBridge.test.ts`
- `tests/unit/features/chat/ConversationViewStateService.test.ts`
- `docs/modules/features/chat/runtime/TabConversationActivationBridge.md`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/features/chat/services/ConversationViewStateService.md`
- `docs/status/maintainability-phase-207.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- TabConversationActivationBridge ConversationViewStateService TabViewActivationBridge`
- `npm test`
- `npm run build`

补充检查：

- 通过 `rg -n "autopilot-maintainability\\.202604122111" /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/main.js` 校验部署产物已更新到本轮最新 `BUILD_ID`

## 4. 部署结果

`npm run build` 成功后，已按仓库约定部署到 Test Vault：

- 复制 `dist/main.js`
- 复制 `dist/manifest.json`
- 复制 `dist/styles.css`

部署目标：

- `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian`

本轮未改动 bundled assets，因此未复制 `dist/assets/`。

已校验 Test Vault 中的 `main.js` 包含本轮最新 `BUILD_ID`：

- `autopilot-maintainability.202604122111`

## 5. 下一步建议

本轮完成后，empty-tab activation 与 current-tab open 的 shared activation boundary 已不再散落在 `OpenCodianView` 本体内；**下一轮建议继续沿 master plan 的 P1，审查 `applyStreamingConversationActivation()` 与相邻 activation writeback/outcome 路径里仍留在 view 的 active-conversation + baseline + selector/context refresh ownership，选择一个能继续缩小 activation host surface 的 streaming/shared activation 切口，而不是回到更窄的 helper 粉碎。**

一句话总结第二百零七阶段本轮：

> 第二百零七阶段把 empty-tab activation 与 current-tab open 的 shared active-pane shell 迁到 `TabConversationActivationBridge`，推进了 master plan 的 P1 `tab / pane / conversation activation 与 sync orchestration` ownership 迁移。
