# 可维护性改进：第二百零六阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-205.md`
> **推进的 master-plan lane**: P1 `tab / pane / conversation activation 与 sync orchestration`（current-tab open shell ownership 下沉）

本轮先按 master plan 复审，继续优先选择仍能直接削弱 `OpenCodianView` ownership 的 P1 activation/sync orchestration 切口，没有回到已暂停的 `ConversationRenderService` / `TrailingAssistantPatch*` helper-fragmentation lane。实际切片是：**把 `OpenCodianView.openConversationInCurrentTab()` 里剩余的 current-tab open shell 提取到新的 `CurrentTabConversationOpenBridge`，让 background-task indicator reset、消息区清空、turn reset、sync baseline 提交，以及 question/todo/context/background-task 后续刷新顺序，统一通过 dedicated bridge 组合 `TabConversationStateBridge` 与 `QuestionTodoStatusRefreshCoordinator`。**

这次改动没有改变 current-tab new conversation 的行为语义：仍只在切到不同 conversation 时重置 background-task indicator，仍保留 active-tab conversation/session state writeback → 消息区清空/turn reset → baseline commit → selector/context identity → background-task runtime rebuild → todo/question refresh → supplemental status/question/todo refresh → indicator/context usage async refresh → settled scroll 的既有顺序；只是把这段 current-tab open orchestration ownership 从 view 继续迁到 dedicated runtime bridge。

## 1. 本轮范围

- `src/features/chat/runtime/CurrentTabConversationOpenBridge.ts`
  - 新增 dedicated current-tab open bridge
  - 统一承接 `openConversationInCurrentTab()` 的 shell cleanup、baseline commit 与后续 UI/runtime refresh 顺序
- `src/features/chat/OpenCodianView.ts`
  - 新增 current-tab open bridge 装配与 host
  - 让 `openConversationInCurrentTab()` 退化成薄桥接入口
- 测试
  - 新增 `tests/unit/features/chat/CurrentTabConversationOpenBridge.test.ts`
- 直接相关文档
  - 新增 `docs/modules/features/chat/runtime/CurrentTabConversationOpenBridge.md`
  - 更新 `docs/modules/features/chat/OpenCodianView.md`

## 2. 变更文件

- `src/features/chat/runtime/CurrentTabConversationOpenBridge.ts`
- `src/features/chat/OpenCodianView.ts`
- `tests/unit/features/chat/CurrentTabConversationOpenBridge.test.ts`
- `docs/modules/features/chat/runtime/CurrentTabConversationOpenBridge.md`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/status/maintainability-phase-206.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- CurrentTabConversationOpenBridge TabConversationStateBridge TabViewActivationBridge ConversationViewStateService`
- `npm test`
- `npm run build`

补充检查：

- 通过 `rg -n "autopilot-maintainability\\.202604122101" /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/main.js` 校验部署产物已更新到本轮最新 `BUILD_ID`

## 4. 部署结果

`npm run build` 成功后，已按仓库约定部署到 Test Vault：

- 复制 `dist/main.js`
- 复制 `dist/manifest.json`
- 复制 `dist/styles.css`

部署目标：

- `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian`

本轮未改动 bundled assets，因此未复制 `dist/assets/`。

已校验 Test Vault 中的 `main.js` 包含本轮最新 `BUILD_ID`：

- `autopilot-maintainability.202604122101`

## 5. 下一步建议

本轮完成后，current-tab new conversation 的 open shell 已不再散落在 `OpenCodianView` 本体内；**下一轮建议继续沿 master plan 的 P1，审查 `applyEmptyTabActivation()` 与相邻 active-pane reset 路径里仍留在 view 的消息区清空 / turn reset / selector-context refresh ownership，选择一个能继续削弱 activation host surface 的共享 activation/open 切口，而不是回到更窄的 helper 粉碎。**

一句话总结第二百零六阶段本轮：

> 第二百零六阶段把 `openConversationInCurrentTab()` 的 current-tab open shell 迁到 `CurrentTabConversationOpenBridge`，推进了 master plan 的 P1 `tab / pane / conversation activation 与 sync orchestration` ownership 迁移。
