# 可维护性改进：第二百三十四阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-233.md`
> **推进的 master-plan lane**: P4 `message shell / notice / timestamp`（assistant footer renderer helper）

本轮继续按 master plan 与 lane map 留在 P4，并先从 `OpenCodianView` 里 assistant shell / notice / footer 的首查入口，以及 `AssistantShellViewHostAdapter.ts`、`AssistantFooterPayload.ts`、`PersistedAssistantFooterFinalizer.ts` 现有边界入手。最终选择的单一切片是：**新增 `AssistantFooterRenderer`，把 `OpenCodianView` 里剩余的 assistant error / notice / pseudo-stream footer timestamp 收尾都收束到同一个窄 helper，并继续复用既有 persisted footer finalizer。**

这次改动保持 stream error 本地 assistant 气泡、notice card footer、pseudo-stream reveal footer，以及 persisted assistant footer 的行为不变；变化点只在于让 `OpenCodianView` 不再直接展开这些 footer 的 timestamp/copy/model payload 细节。

## 1. 本轮范围

- `src/features/chat/runtime/AssistantFooterRenderer.ts`
  - 新增 assistant footer renderer helper
  - 统一承接 notice / pseudo-stream / error / persisted assistant footer 的 renderer 调用
  - persisted footer 继续复用 `PersistedAssistantFooterFinalizer`
- `src/features/chat/runtime/AssistantFooterPayload.ts`
  - 扩展 notice / pseudo-stream / error footer payload helper
  - 保持 persisted footer payload 与 interrupted badge 逻辑不变
- `src/features/chat/runtime/AssistantShellViewHostAdapter.ts`
  - 改为持有 `AssistantFooterRenderer`
  - 新增 `finalizeNoticeFooter()`、`finalizePseudoStreamFooter()`、`finalizeErrorFooter()`
- `src/features/chat/OpenCodianView.ts`
  - notice message、pseudo-stream synced assistant 与本地 assistant error footer 改走 adapter 的 footer helper
  - 删除 view 内部剩余的 assistant footer timestamp 参数拼装
- 测试
  - 新增 `tests/unit/features/chat/AssistantFooterRenderer.test.ts`
  - 扩展 `AssistantFooterPayload.test.ts` 与 `AssistantShellViewHostAdapter.test.ts`
- 直接相关文档
  - 新增 `docs/modules/features/chat/runtime/AssistantFooterRenderer.md`
  - 更新 `docs/modules/features/chat/runtime/AssistantFooterPayload.md`
  - 更新 `docs/modules/features/chat/runtime/PersistedAssistantFooterFinalizer.md`
  - 更新 `docs/modules/features/chat/runtime/AssistantShellViewHostAdapter.md`
  - 更新 `docs/modules/features/chat/OpenCodianView.md`
  - 更新 `docs/modules/README.md`

## 2. 变更文件

- `src/features/chat/runtime/AssistantFooterRenderer.ts`
- `src/features/chat/runtime/AssistantFooterPayload.ts`
- `src/features/chat/runtime/AssistantShellViewHostAdapter.ts`
- `src/features/chat/OpenCodianView.ts`
- `tests/unit/features/chat/AssistantFooterRenderer.test.ts`
- `tests/unit/features/chat/AssistantFooterPayload.test.ts`
- `tests/unit/features/chat/AssistantShellViewHostAdapter.test.ts`
- `docs/modules/features/chat/runtime/AssistantFooterRenderer.md`
- `docs/modules/features/chat/runtime/AssistantFooterPayload.md`
- `docs/modules/features/chat/runtime/PersistedAssistantFooterFinalizer.md`
- `docs/modules/features/chat/runtime/AssistantShellViewHostAdapter.md`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/README.md`
- `docs/status/maintainability-phase-234.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- AssistantFooterRenderer AssistantFooterPayload AssistantShellViewHostAdapter PersistedAssistantFooterFinalizer streamingAssistantShellVisibility streamErrorNoticeSync`
- `npm run build`

本轮未执行全量 `npm test`：attempt `229` 不是 5 的倍数，且改动未命中 `src/main.ts`、`src/core/`、`automation/`、`package.json`、`package-lock.json`、`manifest.json`、`styles.css` 或 `esbuild.config.mjs` 这些工作流定义的高风险路径。

本轮构建 `BUILD_ID`：

- `autopilot-maintainability.202604130232`

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

P4 里，assistant notice / pseudo-stream / error footer 的 timestamp 收尾现在已经集中到统一 helper。**下一轮建议继续沿 P4 做最后一个相邻低风险切口：把 `finalizeAssistantMessageWithError()` 里本地 stream-error block 的 DOM 组装也抽到更窄的 assistant error renderer，让 `OpenCodianView` 只保留错误消息持久化与滚动写回。**

一句话总结第二百三十四阶段本轮：

> 第二百三十四阶段新增 `AssistantFooterRenderer`，把 notice、pseudo-stream 与本地 assistant error 的 footer renderer 调用从 `OpenCodianView` 下沉到统一 helper，并继续复用 persisted footer finalizer，让 view 更接近消息级 shell host，而不是继续持有多种 footer payload 细节。
