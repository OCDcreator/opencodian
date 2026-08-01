# 可维护性改进：第三百零一阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-300.md`
> **推进的 master-plan lane**: P1 `OpenCodianView` activation / sync / runtime bridge ownership（session-signal runtime host factory seam）

本轮遵循 master plan 与 lane map 的 P1 首查入口，先复审 `OpenCodianView` 里 sync/live-signal host 与 `ConversationSessionSignalRuntime` 的创建区段，再检查 `ConversationSyncEventLiveSignalHostAdapter` 与上一轮新增的 runtime seam 后，选择了一个低风险的单一职责切片：**把 `OpenCodianView` 里完整的 session sync-event / todo-status live-signal host 闭包装配下沉到新的 `ConversationSessionSignalRuntimeViewHostFactory`。**

这样 `OpenCodianView` 不再直接维护 subscription、lookup、sync 调度和 todo/status writeback 的完整 `ConversationSyncEventLiveSignalHostAdapterHost` 映射；view 只提供更窄的 factory host 输入，factory 再生成 runtime 需要的共享 session-signal seam，保留既有 adapter、resolver 与 lifecycle 行为。

## 1. 本轮范围

- `src/features/chat/services/ConversationSessionSignalRuntimeViewHostFactory.ts`
  - 新增 runtime view-host factory，把 OpenCode session-signal subscription port、session todo/status writeback port、tab/conversation lookup 与 sync 调度入口组合为共享 `ConversationSyncEventLiveSignalHostAdapterHost`
- `src/features/chat/OpenCodianView.ts`
  - 移除 view-local 完整 sync/live-signal host assembly，改为提供更窄的 factory host 输入并通过新 factory 创建 runtime host
- `tests/unit/features/chat/ConversationSessionSignalRuntimeViewHostFactory.test.ts`
  - 新增 focused coverage，覆盖 lookup 转发、late-bound subscription / writeback port 转发，以及 sync 调度入口保持不变
- `docs/modules/features/chat/services/ConversationSessionSignalRuntimeViewHostFactory.md`
  - 新增模块文档，记录新 factory seam 的职责边界
- `docs/modules/features/chat/services/ConversationSessionSignalRuntime.md`
  - 更新 runtime 边界说明，标明共享 session-signal host 现在由 view-host factory 创建
- `docs/modules/features/chat/services/ConversationSyncEventLiveSignalHostAdapter.md`
  - 更新 host adapter 边界说明，标明 `OpenCodianView` 不再直接维护完整 seam

## 2. 变更文件

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/services/ConversationSessionSignalRuntimeViewHostFactory.ts`
- `tests/unit/features/chat/ConversationSessionSignalRuntimeViewHostFactory.test.ts`
- `docs/modules/features/chat/services/ConversationSessionSignalRuntimeViewHostFactory.md`
- `docs/modules/features/chat/services/ConversationSessionSignalRuntime.md`
- `docs/modules/features/chat/services/ConversationSyncEventLiveSignalHostAdapter.md`
- `docs/status/maintainability-phase-301.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- tests/unit/features/chat/ConversationSessionSignalRuntimeViewHostFactory.test.ts tests/unit/features/chat/ConversationSessionSignalRuntime.test.ts tests/unit/features/chat/ConversationSyncEventLiveSignalHostAdapter.test.ts`
- `npm run build`

本轮 build 生成的 `BUILD_ID`：

- `autopilot-maintainability.202604131407`

本轮未执行全量 `npm test`。

原因：attempt `299` 不可被 `5` 整除，且改动未命中本轮工作流要求的高风险路径，因此按规则停留在 focused tests + build。

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

下一轮建议继续沿 P1 复审 `OpenCodianView` 的 activation / sync runtime bridge 周边，优先寻找另一个仍由 view 直接组装的 host seam，例如 conversation sync load/runtime hosts 或 tab activation runtime hosts 中可下沉为 dedicated factory 的小片段，继续减少 view 级闭包 assembly。

一句话总结第三百零一阶段本轮：

> 第三百零一阶段把 session sync/live-signal runtime host 的完整装配从 `OpenCodianView` 下沉到 `ConversationSessionSignalRuntimeViewHostFactory`，让 view 只保留更窄的 factory host 输入。
