# 可维护性改进：第二百四十三阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-242.md`
> **推进的 master-plan lane**: P3 `context / composer / retained-selection`（composer context chip action extraction）

本轮先按 lane map 的 P3 首查入口回到 `OpenCodianView` 的 composer/context host 装配，再只追到 `ComposerContextCoordinator` 与 `ComposerContextViewHostAdapter` 的 chip attach/detach seam。最终选择的单一切片是：**新增 `ComposerContextChipActionService`，把 composer context chip 的 attach / detach、副作用写回，以及 stale-preview 修正从 `ComposerContextCoordinator` 中拆出，让 coordinator 收窄为纯 render + click delegation。**

这次改动保持 preview chip、attached chip、selection/file attach 语义，以及 active-tab draft/focus preview 写回行为不变。变化点只在于 chip click 的副作用不再由 coordinator 直接执行，而是委托给新的 action service 与更窄的 host seam。

## 1. 本轮范围

- `src/features/chat/services/ComposerContextChipActionService.ts`
  - 新增 composer context chip action service
  - 集中 attach / detach、preview attach 与 stale-preview refresh 逻辑
- `src/features/chat/services/ComposerContextCoordinator.ts`
  - 改为只负责 chip 渲染与 click delegation
  - 不再直接依赖 `ContextAttachmentBuilder`
- `src/features/chat/services/ComposerContextViewHostAdapter.ts`
  - 新增 `createChipActionServiceHost()`
  - 把只读 render host 与带写回的 chip-action host 分离
- `src/features/chat/OpenCodianView.ts`
  - 组装新的 chip action service，并把 coordinator 改为接收更窄的 host + action port
- 测试
  - 新增 `tests/unit/features/chat/ComposerContextChipActionService.test.ts`
  - 更新 `tests/unit/features/chat/ComposerContextCoordinator.test.ts`
  - 更新 `tests/unit/features/chat/ComposerContextViewHostAdapter.test.ts`
- 直接相关文档
  - 新增 `docs/modules/features/chat/services/ComposerContextChipActionService.md`
  - 更新 `docs/modules/features/chat/services/ComposerContextCoordinator.md`
  - 更新 `docs/modules/features/chat/services/ComposerContextViewHostAdapter.md`

## 2. 变更文件

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/services/ComposerContextChipActionService.ts`
- `src/features/chat/services/ComposerContextCoordinator.ts`
- `src/features/chat/services/ComposerContextViewHostAdapter.ts`
- `tests/unit/features/chat/ComposerContextChipActionService.test.ts`
- `tests/unit/features/chat/ComposerContextCoordinator.test.ts`
- `tests/unit/features/chat/ComposerContextViewHostAdapter.test.ts`
- `docs/modules/features/chat/services/ComposerContextChipActionService.md`
- `docs/modules/features/chat/services/ComposerContextCoordinator.md`
- `docs/modules/features/chat/services/ComposerContextViewHostAdapter.md`
- `docs/status/maintainability-phase-243.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- ComposerContextChipActionService ComposerContextCoordinator ComposerContextViewHostAdapter`
- `npm run build`

本轮构建 `BUILD_ID`：

- `autopilot-maintainability.202604130406`

未执行完整 `npm test` 的原因：

- attempt `238` 不可被 `5` 整除，且改动未命中仓库规则要求全量测试的高风险路径

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

下一轮如果继续沿 P3，可优先复审 `ComposerContextViewHostAdapter` 里剩余的 preview / draft writeback 与 active-tab rerender seam，把 render 触发与 runtime state 写回进一步收束到更窄的 store-style adapter；如果这一圈收益不足，再转向 context catalog 或 retained-selection runtime 的相邻桥接点。

一句话总结第二百四十三阶段本轮：

> 第二百四十三阶段新增 `ComposerContextChipActionService`，把 composer context chip 的 attach / detach 与 stale-preview 修正从 `ComposerContextCoordinator` 中拆出，保留既有 preview 与 active-tab 写回行为不变。
