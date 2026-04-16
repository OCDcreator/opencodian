# 可维护性改进：第二百四十七阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-246.md`
> **推进的 master-plan lane**: P3 `context / composer / retained-selection`（context picker / retained-selection host wiring extraction）

本轮先按 lane map 的 P3 首查入口回到 `OpenCodianView` 的 composer/context seam，优先复审 context picker / retained-selection 相关的 host wiring，而不是继续细拆 catalog pipeline。确认高价值、低风险的集中点仍在 **view 构造函数里逐项 new 出 composer context bundle，并散落维护多份 host 闭包** 之后，本轮只做这一处切片：**新增 `ComposerContextHostAdapter`，把 `ComposerContextRuntimeStore`、`ComposerContextActionService`、`ComposerContextChipActionService`、`FocusContextRuntimeService`、`FocusContextPreviewCoordinator`、`ComposerContextCoordinator` 与 `ComposerContextEventBridge` 的装配，连同 retained-selection / context picker 所需的 host wiring，一起从 `OpenCodianView` 中提取出去。**

这次改动保持 composer context 的 current-note / selection / file 入口行为、focus preview 刷新、retained-selection 轮询和当前会话 note path 写回语义不变。变化点只在于 `OpenCodianView` 不再直接维护多份 context host factory，而是只提供一份较窄的 `ComposerContextViewHost`。

## 1. 本轮范围

- `src/features/chat/services/ComposerContextHostAdapter.ts`
  - 新增 composer context host adapter
  - 集中 composer context bundle 的 service 创建与 retained-selection / context picker host wiring
- `src/features/chat/OpenCodianView.ts`
  - 改为只提供较窄的 `ComposerContextViewHost`
  - 删除分散的 composer context host factory，改用 `createComposerContextServices()`
- 测试
  - 新增 `tests/unit/features/chat/ComposerContextHostAdapter.test.ts`
  - 保留 `tests/unit/features/chat/ComposerContextViewHostAdapter.test.ts` 验证底层 runtime-store adapter 语义未变
- 直接相关文档
  - 新增 `docs/modules/features/chat/services/ComposerContextHostAdapter.md`
  - 更新 `docs/modules/features/chat/OpenCodianView.md`
  - 更新 `docs/modules/features/chat/services/ComposerContextViewHostAdapter.md`

## 2. 变更文件

- `src/features/chat/services/ComposerContextHostAdapter.ts`
- `src/features/chat/OpenCodianView.ts`
- `tests/unit/features/chat/ComposerContextHostAdapter.test.ts`
- `docs/modules/features/chat/services/ComposerContextHostAdapter.md`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/features/chat/services/ComposerContextViewHostAdapter.md`
- `docs/status/maintainability-phase-247.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- ComposerContextHostAdapter ComposerContextViewHostAdapter`
- `npm run build`

本轮构建 `BUILD_ID`：

- `autopilot-maintainability.202604130443`

本轮未执行完整 `npm test` 的原因：

- attempt `242` 不可被 `5` 整除
- 改动未命中仓库规则要求全量测试的高风险路径（`src/main.ts`、`src/core/`、`automation/`、`package.json`、`package-lock.json`、`manifest.json`、`styles.css`、`esbuild.config.mjs`）

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

下一轮如果继续沿 P3 推进，建议继续回到 `OpenCodianView` 的 composer/context ownership，优先复审 **context picker 打开/关闭与 retained-selection UI writeback** 周边，寻找还能继续从 view 迁出的单一 host/bridge 切口，而不是再回到 catalog build pipeline。

一句话总结第二百四十七阶段本轮：

> 第二百四十七阶段新增 `ComposerContextHostAdapter`，把 composer context / retained-selection 相关的 service 装配与 host wiring 从 `OpenCodianView` 中拆出，让 view 收窄为较小的 context host 提供者。
