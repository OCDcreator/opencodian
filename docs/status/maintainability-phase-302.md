# 可维护性改进：第三百零二阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-301.md`
> **推进的 master-plan lane**: P1 `OpenCodianView` activation / sync / runtime bridge ownership（conversation sync/load runtime view-host factory seam）

本轮遵循 master plan 与 lane map 的 P1 首查入口，先从 `OpenCodianView` 的 activation / sync runtime host 创建区段切入，再检查 `ConversationSyncLoadRuntimeHostAdapter`、`ConversationLoadRuntimeBridge` 与 `ConversationSyncHostAdapter` 的边界后，选择了一个低风险的单一职责切片：**把 conversation sync/load runtime host 的 view-facing 装配与 loaded-conversation server-sync 判定下沉到新的 `ConversationSyncLoadRuntimeViewHostFactory`。**

这样 `OpenCodianView` 不再直接维护完整的 `ConversationSyncLoadRuntimeHostAdapterHost` 闭包，也不再在 host assembly 中内联 load-side server-sync policy。view 只提供 conversation store、tab runtime、sync bridge 与 interrupted-tail 判定这几组更窄 port；factory 负责组合成共享 sync/load seam，再交给现有 adapter 派生 `ConversationSyncViewHost` 与 `ConversationLoadRuntimeBridgeHost`，保留既有 sync、hydration、post-sync 与 revert-state 行为。

## 1. 本轮范围

- `src/features/chat/services/ConversationSyncLoadRuntimeViewHostFactory.ts`
  - 新增 view-host factory，从 conversation store、tab runtime、sync bridge 和 interrupted-tail checker 组合出 `ConversationSyncLoadRuntimeHosts`
  - 将 loaded-conversation server-sync 判定从 `OpenCodianView` 的 host 闭包迁入 factory seam
- `src/features/chat/OpenCodianView.ts`
  - 移除 view-local 完整 `ConversationSyncLoadRuntimeHostAdapterHost` 装配，改为提供更窄的 factory host 输入
- `tests/unit/features/chat/ConversationSyncLoadRuntimeViewHostFactory.test.ts`
  - 新增 focused coverage，覆盖 late-bound port 转发、sync/load host 派生，以及 load-side server-sync 判定
- `docs/modules/features/chat/services/ConversationSyncLoadRuntimeViewHostFactory.md`
  - 新增模块文档，记录新 factory seam 的职责边界
- `docs/modules/features/chat/runtime/ConversationSyncLoadRuntimeHostAdapter.md`
  - 更新 adapter 边界说明，标明共享 seam 现在先由 view-host factory 装配
- `docs/modules/features/chat/runtime/ConversationLoadRuntimeBridge.md`
  - 更新 load runtime 边界说明，标明 server-sync 判定 seam 现在由 factory 组合
- `docs/modules/features/chat/services/ConversationSyncHostAdapter.md`
  - 更新 sync host 边界说明，标明 sync host 现在经由 factory + adapter 两段派生

## 2. 变更文件

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/services/ConversationSyncLoadRuntimeViewHostFactory.ts`
- `tests/unit/features/chat/ConversationSyncLoadRuntimeViewHostFactory.test.ts`
- `docs/modules/features/chat/services/ConversationSyncLoadRuntimeViewHostFactory.md`
- `docs/modules/features/chat/runtime/ConversationSyncLoadRuntimeHostAdapter.md`
- `docs/modules/features/chat/runtime/ConversationLoadRuntimeBridge.md`
- `docs/modules/features/chat/services/ConversationSyncHostAdapter.md`
- `docs/status/maintainability-phase-302.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- tests/unit/features/chat/ConversationSyncLoadRuntimeViewHostFactory.test.ts tests/unit/features/chat/ConversationSyncLoadRuntimeHostAdapter.test.ts tests/unit/features/chat/ConversationLoadRuntimeBridge.test.ts tests/unit/features/chat/ConversationSyncHostAdapter.test.ts`
- `npm test`
- `npm run build`

本轮 build 生成的 `BUILD_ID`：

- `autopilot-maintainability.202604131420`

本轮执行全量 `npm test`。

原因：attempt `300` 可被 `5` 整除，按无人值守工作流要求在 focused tests 后继续执行全量测试。

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

下一轮建议继续沿 P1 复审 `OpenCodianView` 的 activation runtime bridge 周边，优先查看 tab activation runtime host 的 view-facing assembly 是否还能以同样方式下沉为 dedicated factory，使 `OpenCodianView` 进一步只保留更窄的 host port 输入。

一句话总结第三百零二阶段本轮：

> 第三百零二阶段把 conversation sync/load runtime host 的 view-facing 装配与 load-side server-sync 判定从 `OpenCodianView` 下沉到 `ConversationSyncLoadRuntimeViewHostFactory`，让 sync/load runtime seam 更接近单一职责边界。
