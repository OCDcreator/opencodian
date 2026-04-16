# 可维护性改进：第三百一十三阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-312.md`
> **推进的 master-plan lane**: P1 `OpenCodianView` activation / sync / runtime bridge ownership（conversation-sync scheduling thin host-provider seam）

本轮遵循 master plan、lane map 与上一轮建议，先回到 `OpenCodianView` 的 P1 首查入口：activation / sync host 与 runtime bridge 创建区段，再只检查 conversation-sync scheduling 相关的 view forwarding seam。结合 `TabActivationRuntimeHostProvider`、`ConversationSessionSignalRuntimeHostProvider`、`MessageSendPreparationService` 与 question post-resolution follow-up 对 `ConversationSyncBridge` 的共同依赖，本轮选择了一个低风险单一职责切片：**新增 `ConversationSyncBridgePortProvider`，把 `OpenCodianView` 内联维护的 conversation-sync loop control / signal scheduler / visible-sync follow-up forwarding，收拢成一层薄的 regrouping facade。**

这样 `OpenCodianView` 不再直接维护：

- 多组 `startConversationSyncLoop()` / `stopConversationSyncLoop()` forwarding wrapper
- signal debounce cleanup 与 `scheduleConversationSyncFromSignal()` 在多个 host-provider 之间的重复转发入口
- question post-resolution follow-up 对 `ConversationSyncBridge` 的直接桥接转发

view 现在只暴露一份更扁平的 conversation-sync bridge seam；新的 provider 负责把这组 flat ports 重新分组，供 activation、message-send、session-signal 与 question follow-up 复用。

## 1. 本轮范围

- `src/features/chat/services/ConversationSyncBridgePortProvider.ts`
  - 新增薄 facade，把 `OpenCodianView` 暴露的 flat sync scheduling / visible follow-up seam 重组为 loop control、signal scheduler 与 visible-sync follow-up 三组 ports
- `src/features/chat/OpenCodianView.ts`
  - 移除 conversation-sync scheduling 相关 forwarding wrapper，改为通过新的 provider ports 向相邻 host/provider 暴露 bridge 能力
- `tests/unit/features/chat/ConversationSyncBridgePortProvider.test.ts`
  - 新增 focused coverage，验证 grouped ports 与 late-bound collaborator 行为
- `docs/modules/features/chat/services/ConversationSyncBridgePortProvider.md`
  - 新增模块文档，记录新的 regrouping seam
- `docs/modules/features/chat/services/ConversationSyncBridge.md`
  - 同步边界描述，说明 view-facing lifecycle / signal / visible-follow-up 转发已下沉到 provider

## 2. 变更文件

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/services/ConversationSyncBridgePortProvider.ts`
- `tests/unit/features/chat/ConversationSyncBridgePortProvider.test.ts`
- `docs/modules/features/chat/services/ConversationSyncBridge.md`
- `docs/modules/features/chat/services/ConversationSyncBridgePortProvider.md`
- `docs/status/maintainability-phase-313.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- tests/unit/features/chat/ConversationSyncBridgePortProvider.test.ts tests/unit/features/chat/TabActivationRuntimeHostProvider.test.ts tests/unit/features/chat/QuestionPostResolutionRuntimeHostAdapter.test.ts tests/unit/features/chat/MessageSendPreparationService.test.ts tests/unit/features/chat/ConversationSessionSignalRuntimeHostProvider.test.ts`
- `npm run build`

本轮 build 生成的 `BUILD_ID`：

- `autopilot-maintainability.202604131600`

本轮**未执行**全量 `npm test`。

原因：

- attempt `311` 不可被 `5` 整除，且改动未命中仓库规则定义的高风险路径

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

下一轮建议继续留在 P1，复查 `OpenCodianView` 里 `createTabActivationRuntimeHostProviderHost()` 仍直接持有的 `getConversationSyncFingerprint()` / `lastConversationSyncFingerprint` writeback seam，判断是否还能沿用同类 provider/factory 模式，把 tab activation 侧的 conversation-sync runtime read/write ownership 再下沉一层。

一句话总结第三百一十三阶段本轮：

> 第三百一十三阶段把 conversation-sync scheduling 与 visible follow-up forwarding 从 `OpenCodianView` 下沉到 `ConversationSyncBridgePortProvider`，让 P1 activation / sync host wiring 更接近单一职责 facade，并保持既有 sync bridge 行为不变。
