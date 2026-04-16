# 可维护性改进：第二百四十四阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-243.md`
> **推进的 master-plan lane**: P3 `context / composer / retained-selection`（composer runtime writeback store extraction）

本轮先按 lane map 的 P3 首查入口回到 `OpenCodianView` 的 composer/context host 装配，再只追到 `ComposerContextViewHostAdapter` 里剩余的 preview / draft writeback seam。最终选择的单一切片是：**新增 `ComposerContextRuntimeStore`，把 active-tab `draftContextItems` / `focusContextPreview` 的读写、active-tab rerender gate 与 preview equality guard 从 `ComposerContextViewHostAdapter` 中拆出，让 adapter 收窄为纯 host assembly。**

这次改动保持 draft context、focus preview、chip attach/detach 与发送前 context draft 读取/清空行为不变。变化点只在于：`OpenCodianView` 与 composer 相关 service 现在共享同一个 runtime store，而不是继续把状态写回逻辑留在 host adapter 内部。

## 1. 本轮范围

- `src/features/chat/services/ComposerContextRuntimeStore.ts`
  - 新增 composer runtime store
  - 集中 draft item add/remove/clear、focus preview set/get、equality guard 与 active-tab rerender gate
- `src/features/chat/services/ComposerContextViewHostAdapter.ts`
  - 改为只负责把 runtime store 组装成 coordinator / action / chip-action / focus-runtime hosts
  - 不再直接持有 preview / draft 写回逻辑
- `src/features/chat/OpenCodianView.ts`
  - 新增 `ComposerContextRuntimeStore` 实例
  - 让 `MessageSendPreparationService` 的 draft read/clear 与 composer hosts 共用同一份 store
- 测试
  - 新增 `tests/unit/features/chat/ComposerContextRuntimeStore.test.ts`
  - 更新 `tests/unit/features/chat/ComposerContextViewHostAdapter.test.ts`
- 直接相关文档
  - 新增 `docs/modules/features/chat/services/ComposerContextRuntimeStore.md`
  - 更新 `docs/modules/features/chat/services/ComposerContextViewHostAdapter.md`

## 2. 变更文件

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/services/ComposerContextRuntimeStore.ts`
- `src/features/chat/services/ComposerContextViewHostAdapter.ts`
- `tests/unit/features/chat/ComposerContextRuntimeStore.test.ts`
- `tests/unit/features/chat/ComposerContextViewHostAdapter.test.ts`
- `docs/modules/features/chat/services/ComposerContextRuntimeStore.md`
- `docs/modules/features/chat/services/ComposerContextViewHostAdapter.md`
- `docs/status/maintainability-phase-244.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- ComposerContextRuntimeStore ComposerContextViewHostAdapter ComposerContextChipActionService ComposerContextCoordinator`
- `npm run build`

本轮构建 `BUILD_ID`：

- `autopilot-maintainability.202604130414`

未执行完整 `npm test` 的原因：

- attempt `239` 不可被 `5` 整除，且改动未命中仓库规则要求全量测试的高风险路径

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

下一轮如果继续沿 P3，可优先复审 `FocusContextRuntimeService` 与 `FocusContextPreviewCoordinator` 之间剩余的 current-note / refresh handoff，看是否能把 preview refresh 触发条件再收束到更窄的 runtime bridge；如果这一圈收益不足，再转向 context catalog 构建/缓存链路。

一句话总结第二百四十四阶段本轮：

> 第二百四十四阶段新增 `ComposerContextRuntimeStore`，把 composer draft / preview 的写回、rerender gate 与 preview equality guard 从 `ComposerContextViewHostAdapter` 中拆出，让 adapter 收窄为纯 host assembly。
