# 可维护性改进：第二百三十五阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-234.md`
> **推进的 master-plan lane**: P4 `message shell / notice / timestamp`（local stream-error renderer helper）

本轮继续按 master plan 与 lane map 留在 P4，并先从 `OpenCodianView` 里 assistant shell / notice / footer 的首查入口切入，再检查 `AssistantShellViewHostAdapter.ts`、`AssistantFooterRenderer.ts` 与上一轮新增的 footer seam。最终选择的单一切片是：**新增 `AssistantErrorRenderer`，把 `finalizeAssistantMessageWithError()` 里本地 stream-error block 的 DOM 组装下沉到窄 renderer，并通过既有 assistant shell adapter 复用 error footer 收尾。**

这次改动保持本地 stream-error assistant bubble 的 icon/text/footer、消息持久化、同步 fingerprint 写回和滚动行为不变；变化点只在于让 `OpenCodianView` 不再直接组装错误块 DOM，而是只保留时间戳/模型选择、持久化与滚动写回。

## 1. 本轮范围

- `src/features/chat/runtime/AssistantErrorRenderer.ts`
  - 新增 local stream-error renderer helper
  - 统一承接本地错误块的 DOM 组装，并把 footer 收尾继续交给既有 error footer seam
- `src/features/chat/runtime/AssistantShellViewHostAdapter.ts`
  - 改为持有 `AssistantErrorRenderer`
  - 新增 `renderStreamError()`，让 view 通过既有 assistant shell host seam 渲染本地错误泡泡
- `src/features/chat/OpenCodianView.ts`
  - `finalizeAssistantMessageWithError()` 改为调用 adapter 的 `renderStreamError()`
  - 删除 view 内部本地 stream-error block 的直接 DOM 组装
- 测试
  - 新增 `tests/unit/features/chat/AssistantErrorRenderer.test.ts`
  - 扩展 `tests/unit/features/chat/AssistantShellViewHostAdapter.test.ts`
- 直接相关文档
  - 新增 `docs/modules/features/chat/runtime/AssistantErrorRenderer.md`
  - 更新 `docs/modules/features/chat/runtime/AssistantShellViewHostAdapter.md`
  - 更新 `docs/modules/features/chat/OpenCodianView.md`
  - 更新 `docs/modules/README.md`

## 2. 变更文件

- `src/features/chat/runtime/AssistantErrorRenderer.ts`
- `src/features/chat/runtime/AssistantShellViewHostAdapter.ts`
- `src/features/chat/OpenCodianView.ts`
- `tests/unit/features/chat/AssistantErrorRenderer.test.ts`
- `tests/unit/features/chat/AssistantShellViewHostAdapter.test.ts`
- `docs/modules/features/chat/runtime/AssistantErrorRenderer.md`
- `docs/modules/features/chat/runtime/AssistantShellViewHostAdapter.md`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/README.md`
- `docs/status/maintainability-phase-235.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- AssistantErrorRenderer AssistantShellViewHostAdapter streamErrorNoticeSync`
- `npm test`
- `npm run build`

本轮构建 `BUILD_ID`：

- `autopilot-maintainability.202604130239`

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

本轮已完成上一阶段建议的最后一个相邻 P4 低风险切口。**下一轮建议按 master plan 重新回到更高优先级 lane 复审，并优先从 P2 首查入口里选择一个 question/todo/background-task host wiring 切片，把 `OpenCodianView` 中相关 runtime wiring 继续下沉到既有 coordinator/facade seam。**

一句话总结第二百三十五阶段本轮：

> 第二百三十五阶段新增 `AssistantErrorRenderer`，把本地 stream-error assistant bubble 的错误块 DOM 从 `OpenCodianView` 下沉到更窄的 runtime helper，并通过 `AssistantShellViewHostAdapter` 继续复用既有 error footer seam，让 view 更接近消息级 host + persistence 写回，而不是继续持有错误泡泡 DOM 细节。
