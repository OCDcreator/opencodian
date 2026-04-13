# 可维护性改进：第三百一十四阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-313.md`
> **推进的 master-plan lane**: P1 `OpenCodianView` activation / sync / runtime bridge ownership（tab-activation conversation-sync fingerprint runtime seam）

本轮继续遵循 master plan、lane map 与上一轮建议，先回到 `OpenCodianView` 的 P1 首查入口：activation / sync host 与 runtime bridge 创建区段，再只检查 `createTabActivationRuntimeHostProviderHost()` 里剩余的 conversation-sync fingerprint read/write seam。结合 `TabActivationRuntimeHostProvider`、`TabActivationRuntimeViewHostFactory` 与 `TabConversationStateBridge` 仍共同依赖这组 active-tab sync baseline / loop-control forwarding，本轮选择了一个低风险单一职责切片：**新增 `TabActivationConversationSyncPortProvider`，把 tab activation 仍需复用的 conversation-sync fingerprint 读取、active-tab baseline 回写与 loop-control forwarding，收束成一份独立 runtime port。**

这样 `OpenCodianView` 不再直接在 `createTabActivationRuntimeHostProviderHost()` 中维护：

- `getConversationSyncFingerprint()` 的 tab-activation forwarding wrapper
- `lastConversationSyncFingerprint` 的 active-tab writeback wrapper
- `startConversationSyncLoop()` / `stopConversationSyncLoop()` 的 activation 专用转发入口

tab activation host provider 现在只暴露一份更扁平的 `getConversationSyncRuntime()` seam；新的 provider 负责把这组 conversation-sync fingerprint / loop-control 能力重组为稳定 runtime port，供 activation host wiring 与 factory 复用。

## 1. 本轮范围

- `src/features/chat/services/TabActivationConversationSyncPortProvider.ts`
  - 新增薄 provider，把 tab-activation 仍需共享的 conversation-sync fingerprint / loop-control seam 收束为一个 late-bound runtime port
- `src/features/chat/OpenCodianView.ts`
  - 新增 tab-activation conversation-sync provider host 与 runtime port 初始化，移除 `createTabActivationRuntimeHostProviderHost()` 内联维护的 fingerprint / loop-control forwarding wrapper
- `src/features/chat/services/TabActivationRuntimeHostProvider.ts`
  - 改为消费 grouped `getConversationSyncRuntime()` port，而不是重新声明四个 conversation-sync forwarding callback
- `src/features/chat/services/TabActivationRuntimeViewHostFactory.ts`
  - 直接接入新的 conversation-sync runtime port 类型，保持 shared activation runtime host assembly 不变
- `tests/unit/features/chat/TabActivationConversationSyncPortProvider.test.ts`
  - 新增 focused coverage，验证 provider regrouping 与 late-bound collaborator 行为
- `tests/unit/features/chat/TabActivationRuntimeHostProvider.test.ts`
  - 更新覆盖，确认 host provider 透传 grouped conversation-sync runtime port
- `docs/modules/features/chat/services/TabActivationConversationSyncPortProvider.md`
  - 新增模块文档，记录新的 tab-activation conversation-sync regrouping seam
- `docs/modules/features/chat/services/TabActivationRuntimeHostProvider.md`
- `docs/modules/features/chat/services/TabActivationRuntimeViewHostFactory.md`
  - 同步边界描述，说明 conversation-sync fingerprint / loop-control regrouping 已前移到新 provider

## 2. 变更文件

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/services/TabActivationConversationSyncPortProvider.ts`
- `src/features/chat/services/TabActivationRuntimeHostProvider.ts`
- `src/features/chat/services/TabActivationRuntimeViewHostFactory.ts`
- `tests/unit/features/chat/TabActivationConversationSyncPortProvider.test.ts`
- `tests/unit/features/chat/TabActivationRuntimeHostProvider.test.ts`
- `docs/modules/features/chat/services/TabActivationConversationSyncPortProvider.md`
- `docs/modules/features/chat/services/TabActivationRuntimeHostProvider.md`
- `docs/modules/features/chat/services/TabActivationRuntimeViewHostFactory.md`
- `docs/status/maintainability-phase-314.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- tests/unit/features/chat/TabActivationConversationSyncPortProvider.test.ts tests/unit/features/chat/TabActivationRuntimeHostProvider.test.ts tests/unit/features/chat/TabActivationRuntimeViewHostFactory.test.ts`
- `npm run build`

本轮 build 生成的 `BUILD_ID`：

- `autopilot-maintainability.202604131611`

本轮**未执行**全量 `npm test`。

原因：

- attempt `312` 不可被 `5` 整除，且改动未命中仓库规则定义的高风险路径

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

下一轮可复查 tab-scoped conversation-sync fingerprint writeback 在 `createPersistentAssistantNoticeServiceHost()` 与 `createQuestionTodoBackgroundTaskRuntimeHostProviderHost()` 的重复 seam，评估是否值得沿用同类 provider 模式，把 remaining tab-scoped fingerprint ownership 从 `OpenCodianView` 再下沉一层。

一句话总结第三百一十四阶段本轮：

> 第三百一十四阶段把 tab activation 侧的 conversation-sync fingerprint read/write 与 loop-control forwarding 从 `OpenCodianView` 下沉到 `TabActivationConversationSyncPortProvider`，让 P1 activation runtime wiring 更接近单一职责 grouped port，并保持既有 activation/sync 行为不变。
