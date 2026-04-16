# 可维护性改进：第二百三十九阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-238.md`
> **推进的 master-plan lane**: P2 `question / todo / background task`（activation/open-side context-usage coordinator）

本轮继续遵循 master plan 与 lane map，先回到 `OpenCodianView` 里的 P2 activation/open 首查入口，再只检查相邻的 activation bridge 与 host wiring。最终选择的单一切片是：**把 activation/open-side 相邻的 active-tab context usage identity 写回与 session snapshot 写回下沉到独立的 `ActiveTabContextUsageCoordinator`，让 `TabViewActivationBridge` 与 `TabConversationActivationBridge` 共享同一条 context-usage writeback 链，同时缩窄 `OpenCodianView` 的 activation/open host surface。**

这次改动保持 streaming activation、empty-tab activation、loaded-conversation hydration tail 与 current-tab open conversation 的 context usage 刷新顺序不变；也保持 message finalization、visible sync 以及模型切换/模型目录刷新仍走同一套 active-tab context usage identity/snapshot 语义不变。变化点只在于：activation/open-side 相邻的 context usage host callback 不再散落在两个 bridge 和 `OpenCodianView` 的局部方法里，而是统一落到新的 coordinator。

## 1. 本轮范围

- `src/features/chat/services/ActiveTabContextUsageCoordinator.ts`
  - 新增 activation/open-side active-tab context usage coordinator
  - 统一 active-tab identity 写回、snapshot stale guard 与精确 usage/cost 写回
- `src/features/chat/runtime/TabViewActivationBridge.ts`
  - 改为把 streaming / empty / hydration-tail 的 context usage identity/snapshot 刷新委托给新 coordinator
  - 缩窄 bridge host，只保留 pane、focus、layout、selector 与 send-button 写回
- `src/features/chat/runtime/TabConversationActivationBridge.ts`
  - current-tab open conversation 路径改为复用新 coordinator
  - 缩窄 bridge host，去掉直接 context usage identity/snapshot callback
- `src/features/chat/OpenCodianView.ts`
  - 新增 `ActiveTabContextUsageCoordinator` 装配
  - 将 activation/open-side 与相邻 sync/model-refresh 路径的 context usage writeback 收束到单一 coordinator host
  - 删除 view 内联的 active-tab context usage identity / snapshot 写回实现
- 测试
  - 新增 `tests/unit/features/chat/ActiveTabContextUsageCoordinator.test.ts`
  - 更新 `tests/unit/features/chat/TabViewActivationBridge.test.ts`
  - 更新 `tests/unit/features/chat/TabConversationActivationBridge.test.ts`
- 直接相关文档
  - 新增 `docs/modules/features/chat/services/ActiveTabContextUsageCoordinator.md`
  - 更新 `docs/modules/features/chat/runtime/TabViewActivationBridge.md`
  - 更新 `docs/modules/features/chat/runtime/TabConversationActivationBridge.md`
  - 更新 `docs/modules/features/chat/OpenCodianView.md`

## 2. 变更文件

- `src/features/chat/services/ActiveTabContextUsageCoordinator.ts`
- `src/features/chat/runtime/TabViewActivationBridge.ts`
- `src/features/chat/runtime/TabConversationActivationBridge.ts`
- `src/features/chat/OpenCodianView.ts`
- `tests/unit/features/chat/ActiveTabContextUsageCoordinator.test.ts`
- `tests/unit/features/chat/TabViewActivationBridge.test.ts`
- `tests/unit/features/chat/TabConversationActivationBridge.test.ts`
- `docs/modules/features/chat/services/ActiveTabContextUsageCoordinator.md`
- `docs/modules/features/chat/runtime/TabViewActivationBridge.md`
- `docs/modules/features/chat/runtime/TabConversationActivationBridge.md`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/status/maintainability-phase-239.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- ActiveTabContextUsageCoordinator`
- `npm test -- TabViewActivationBridge`
- `npm test -- TabConversationActivationBridge`
- `npm run build`

本轮构建 `BUILD_ID`：

- `autopilot-maintainability.202604130327`

未执行完整 `npm test`：本轮改动未命中 `src/main.ts`、`src/core/`、`automation/`、`package.json`、`package-lock.json`、`manifest.json`、`styles.css` 或 `esbuild.config.mjs` 等高风险路径，且 attempt `234` 不能被 5 整除。

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

下一轮建议继续按 master plan 优先复审 P2/P3 交界的 activation/open host surface，选择一个相邻但独立的低风险切片，例如把 current-tab open / loaded-conversation hydration 周围残留的 context/composer retained-selection writeback 再下沉到 dedicated coordinator，或把 activation/open 相邻的 context preview/preview-refresh 编排继续从 `OpenCodianView` 收窄；若没有同等低风险切口，再转向 P3 context/composer/retained-selection 主链路。

一句话总结第二百三十九阶段本轮：

> 第二百三十九阶段新增 `ActiveTabContextUsageCoordinator`，把 activation/open-side 的 active-tab context usage identity 写回与 session snapshot 精确 usage/cost 写回从 `TabViewActivationBridge`、`TabConversationActivationBridge` 与 `OpenCodianView` 中下沉到单一 coordinator。
