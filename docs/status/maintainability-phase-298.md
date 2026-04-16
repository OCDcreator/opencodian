# 可维护性改进：第二百九十八阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-297.md`
> **推进的 master-plan lane**: P1 `OpenCodianView` activation / sync / runtime bridge ownership（conversation sync event / session live-signal host assembly 拆分）

本轮遵循 master plan 与 lane map 的 P1 首查入口，先复审 `OpenCodianView` 的 activation / sync host 创建区段，再检查 `ConversationSyncEventAdapter` 与 `ConversationSessionLiveSignalAdapter` 的 host 需求后，选择了一个低风险的单一职责切片：**把 conversation sync event host 与 session todo/status live-signal host 的共享装配从 `OpenCodianView` 中拆出，交给新的 `src/features/chat/services/ConversationSyncEventLiveSignalHostAdapter.ts`。**

这样 `OpenCodianView` 不再并排维护 `createConversationSyncEventAdapterHost()` 与 `createConversationSessionLiveSignalAdapterHost()` 两段平行闭包；view 只提供一份 sync/live-signal seam，由 dedicated adapter 派生 `ConversationSyncEventAdapterHost` 与 `ConversationSessionLiveSignalAdapterHost`。两条 session-signal adapter 的订阅、匹配与写回行为保持不变。

## 1. 本轮范围

- `src/features/chat/services/ConversationSyncEventLiveSignalHostAdapter.ts`
  - 新增 dedicated host adapter，从同一份 view seam 派生 sync-event host 与 session live-signal host
- `src/features/chat/OpenCodianView.ts`
  - 改为通过 `createConversationSyncEventLiveSignalHosts()` 装配 `ConversationSyncEventAdapter` 与 `ConversationSessionLiveSignalAdapter`
  - 删除 view 内分散的 sync-event / live-signal 双 host factory
- `tests/unit/features/chat/ConversationSyncEventLiveSignalHostAdapter.test.ts`
  - 覆盖 adapter 从同一 seam 派生两类 host，并确认每侧只暴露各自需要的回调
- `docs/modules/features/chat/services/ConversationSyncEventLiveSignalHostAdapter.md`
  - 新增模块文档，记录新的 sync/live-signal host assembly 边界
- `docs/modules/features/chat/services/ConversationSyncEventAdapter.md`
  - 更新与 `OpenCodianView` 的边界描述，说明 sync-event host 现在经由共享 adapter seam 进入
- `docs/modules/features/chat/services/ConversationSessionLiveSignalAdapter.md`
  - 更新与 `OpenCodianView` 的边界描述，说明 live-signal host 现在经由共享 adapter seam 进入

## 2. 变更文件

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/services/ConversationSyncEventLiveSignalHostAdapter.ts`
- `tests/unit/features/chat/ConversationSyncEventLiveSignalHostAdapter.test.ts`
- `docs/modules/features/chat/services/ConversationSyncEventLiveSignalHostAdapter.md`
- `docs/modules/features/chat/services/ConversationSyncEventAdapter.md`
- `docs/modules/features/chat/services/ConversationSessionLiveSignalAdapter.md`
- `docs/status/maintainability-phase-298.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- tests/unit/features/chat/ConversationSyncEventLiveSignalHostAdapter.test.ts tests/unit/features/chat/ConversationSyncEventAdapter.test.ts tests/unit/features/chat/ConversationSessionLiveSignalAdapter.test.ts`
- `npm run build`

本轮 build 生成的 `BUILD_ID`：

- `autopilot-maintainability.202604131344`

本轮未执行全量 `npm test`。

原因：attempt `296` 不可被 `5` 整除，且改动未命中本轮工作流要求的高风险路径，因此按规则停留在 focused tests + build。

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

下一轮建议继续沿 P1 复审 `ConversationSyncEventAdapter` 与 `ConversationSessionLiveSignalAdapter` 内共享的 session→tab 匹配 / active-tab fallback 解析，优先寻找可迁移到 dedicated resolver 的单一职责切片，继续削弱 sync signal 链路对 view-adjacent wiring 的耦合。

一句话总结第二百九十八阶段本轮：

> 第二百九十八阶段把 conversation sync event / session live-signal 的共享 host assembly 从 `OpenCodianView` 中拆出，让两条 session-signal adapter 共用 dedicated host seam。
