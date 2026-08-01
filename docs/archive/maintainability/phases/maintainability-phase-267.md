# 可维护性改进：第二百六十七阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-266.md`
> **推进的 master-plan lane**: P1 `OpenCodianView` 中剩余的 activation / sync / runtime bridge ownership（shared activation host factory）

本轮遵循 master plan 与 lane map 的 P1 首查入口，选择一个高价值且低风险的单一职责切片：**把 `OpenCodianView` 里 `TabViewActivationBridge` 与 `TabConversationActivationBridge` 两段并行的 activation host 装配，收束到共享的 `TabActivationBridgeHostFactory`。**

这样 tab 激活相关的 pane/model/send-button writeback 与 current-tab shell reset / settled-scroll 调度，都会先从同一份更窄的 activation seam 派生；`OpenCodianView` 不再分别维护两段 activation host factory，只保留一处 activation writeback host 入口。

## 1. 本轮范围

- `src/features/chat/runtime/TabActivationBridgeHostFactory.ts`
  - 新增 shared factory，同时派生 `TabViewActivationBridgeHost` 与 `TabConversationActivationBridgeHost`
  - 统一 active-tab lookup、pane 切换、composer/model/send-button writeback，以及消息区 shell reset / settled-scroll seam
- `src/features/chat/OpenCodianView.ts`
  - 改为通过 shared factory 生成两个 activation bridge host
  - 删除分散的 `createTabViewActivationBridgeHost()` / `createTabConversationActivationBridgeHost()` 私有装配入口
- 测试
  - 新增 `tests/unit/features/chat/TabActivationBridgeHostFactory.test.ts`
  - 继续用 activation bridge 邻近用例覆盖行为回归
- 直接相关文档
  - 新增 `docs/modules/features/chat/runtime/TabActivationBridgeHostFactory.md`
  - 更新 `docs/modules/features/chat/OpenCodianView.md`
  - 更新 `docs/modules/features/chat/runtime/TabViewActivationBridge.md`
  - 更新 `docs/modules/features/chat/runtime/TabConversationActivationBridge.md`

## 2. 变更文件

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/runtime/TabActivationBridgeHostFactory.ts`
- `tests/unit/features/chat/TabActivationBridgeHostFactory.test.ts`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/features/chat/runtime/TabViewActivationBridge.md`
- `docs/modules/features/chat/runtime/TabConversationActivationBridge.md`
- `docs/modules/features/chat/runtime/TabActivationBridgeHostFactory.md`
- `docs/status/maintainability-phase-267.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- TabActivationBridgeHostFactory TabViewActivationBridge TabConversationActivationBridge`
- `npm run build`

本轮未执行完整 `npm test`。

原因：

- attempt `262` 不可被 `5` 整除
- 改动未命中仓库约定的 full-test 高风险路径（`src/main.ts`、`src/core/`、`automation/`、`package.json`、`package-lock.json`、`manifest.json`、`styles.css`、`esbuild.config.mjs`）

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

下一轮继续留在高优先级 P1 / P2：沿 activation 首查入口继续挑一个共享 late-bound seam，优先考虑把 `OpenCodianView` 中 question runtime host 组装，或 hydration/activation 相邻的剩余 bridge host 写回，再下沉到 dedicated factory / adapter，而不是回到低收益的 helper 细拆。

一句话总结第二百六十七阶段本轮：

> 第二百六十七阶段把两个 tab activation bridge 的 host 装配收束到 shared factory，让 `OpenCodianView` 的这组 P1 activation wiring 进一步压缩成单一写回入口。
