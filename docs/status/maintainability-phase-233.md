# 可维护性改进：第二百三十三阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-232.md`
> **推进的 master-plan lane**: P4 `message shell / notice / timestamp`（assistant shell/footer host adapter）

本轮按 master plan 与 lane map 切到 P4，并先从 `OpenCodianView` 的 assistant shell / notice / footer 首查入口，以及 `AssistantShellRenderer.ts`、`AssistantNoticeRenderer.ts`、`PersistedAssistantFooterFinalizer.ts` 现有边界入手。最终选择的单一切片是：**新增 `AssistantShellViewHostAdapter`，把 `OpenCodianView` 里仍然分散的 assistant shell renderer host、notice render host、persisted footer finalizer 与 send-pipeline shell port 装配收束到同一个 runtime adapter。**

这次改动保持 streaming shell 创建/reveal、notice placeholder 改写、persisted footer payload、pseudo-stream footer 收尾，以及 stream error notice 的行为不变；变化点只在于让 `OpenCodianView` 不再直接持有这些 footer/notice host factory 与 renderer/finalizer 的分散 wiring。

## 1. 本轮范围

- `src/features/chat/runtime/AssistantShellViewHostAdapter.ts`
  - 新增 assistant shell/footer/notice 的 view host adapter
  - 统一持有 `AssistantShellRenderer` 与 `PersistedAssistantFooterFinalizer`
  - 统一封装 notice render host 与 `SendPipelineShellPort`
- `src/features/chat/OpenCodianView.ts`
  - 改为实例化 `AssistantShellViewHostAdapter`
  - `SendPipelineRuntime` 的 shell port、persisted footer bridge、stream error notice，以及剩余 assistant timestamp 收尾改走 adapter
  - 删除 view 内部独立的 assistant shell / notice host factory 与 persisted footer finalizer field
- 测试
  - 新增 `tests/unit/features/chat/AssistantShellViewHostAdapter.test.ts`，覆盖 notice placeholder 渲染与 persisted footer 收尾都会复用同一条 shell host seam
- 直接相关文档
  - 新增 `docs/modules/features/chat/runtime/AssistantShellViewHostAdapter.md`
  - 更新 `docs/modules/features/chat/runtime/AssistantShellRenderer.md`
  - 更新 `docs/modules/features/chat/runtime/AssistantNoticeRenderer.md`
  - 更新 `docs/modules/features/chat/runtime/PersistedAssistantFooterFinalizer.md`
  - 更新 `docs/modules/features/chat/OpenCodianView.md`
  - 更新 `docs/modules/README.md`

## 2. 变更文件

- `src/features/chat/runtime/AssistantShellViewHostAdapter.ts`
- `src/features/chat/OpenCodianView.ts`
- `tests/unit/features/chat/AssistantShellViewHostAdapter.test.ts`
- `docs/modules/features/chat/runtime/AssistantShellViewHostAdapter.md`
- `docs/modules/features/chat/runtime/AssistantShellRenderer.md`
- `docs/modules/features/chat/runtime/AssistantNoticeRenderer.md`
- `docs/modules/features/chat/runtime/PersistedAssistantFooterFinalizer.md`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/README.md`
- `docs/status/maintainability-phase-233.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- AssistantShellViewHostAdapter PersistedAssistantFooterFinalizer streamingAssistantShellVisibility streamErrorNoticeSync`
- `npm run build`

本轮未执行全量 `npm test`：attempt `228` 不是 5 的倍数，且改动未命中 `src/main.ts`、`src/core/`、`automation/`、`package.json`、`package-lock.json`、`manifest.json`、`styles.css` 或 `esbuild.config.mjs` 这些工作流定义的高风险路径。

本轮构建 `BUILD_ID`：

- `autopilot-maintainability.202604130223`

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

P4 里，assistant shell / notice / persisted-footer 的 host 装配现在已经集中到一个 adapter。**下一轮建议继续留在 P4，把 `OpenCodianView` 里剩余几个直接调用 `addTimestampWithCopyButton()` 的 assistant error / pseudo-stream / notice footer 收尾也收束到更窄的 footer renderer helper，进一步减少 view 持有的消息级 DOM 收尾细节。**

一句话总结第二百三十三阶段本轮：

> 第二百三十三阶段新增 `AssistantShellViewHostAdapter`，把 assistant shell、notice placeholder、persisted footer 与 send-pipeline shell port 的分散 host wiring 从 `OpenCodianView` 下沉到统一 adapter，让 view 更接近消息壳层装配 host，而不是继续持有多套 footer/notice renderer bridge。
