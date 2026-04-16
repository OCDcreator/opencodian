# 可维护性改进：第三百一十一阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-310.md`
> **推进的 master-plan lane**: P1 `OpenCodianView` activation / sync / runtime bridge ownership（conversation session-signal thin host-provider seam）

本轮遵循 master plan、lane map 与上一轮建议，先回到 `OpenCodianView` 里的 P1 首查入口：activation / sync host 与 runtime bridge 创建区段中的 conversation session-signal runtime seam，再复查 `ConversationSessionSignalRuntimeViewHostFactory`、`ConversationSyncEventLiveSignalHostAdapter` 与 `ConversationSessionSignalRuntime` 的共享装配边界，最终选择了一个低风险单一职责切片：**新增 `ConversationSessionSignalRuntimeHostProvider`，把 `OpenCodianView` 内联维护的 grouped session-signal factory-host 结构，下沉为一层薄的 host-provider facade。**

这样 `OpenCodianView` 不再直接维护：

- session signal subscriptions 与 session signal writeback 两组 grouped factory-host ports
- session-signal grouped ports 到 factory host 之间的中间重组布局
- P1 session-signal runtime seam 与 factory-host 契约的双重 owner 身份

view 现在只暴露一份更扁平的 session-signal seam；新的 host-provider 负责把它重新分组，再交给既有 `ConversationSessionSignalRuntimeViewHostFactory` 继续派生共享 runtime host。

## 1. 本轮范围

- `src/features/chat/services/ConversationSessionSignalRuntimeHostProvider.ts`
  - 新增薄 facade，把扁平的 session-signal seam 重新分组为 `ConversationSessionSignalRuntimeViewHostFactoryHost`
- `src/features/chat/OpenCodianView.ts`
  - 移除内联 grouped session-signal factory-host 方法，改为只提供扁平的 `ConversationSessionSignalRuntimeHostProviderHost`
- `tests/unit/features/chat/ConversationSessionSignalRuntimeHostProvider.test.ts`
  - 新增 focused coverage，验证 grouped subscription/writeback port 重组与 late-bound collaborator 行为
- `docs/modules/features/chat/services/ConversationSessionSignalRuntimeHostProvider.md`
  - 新增模块文档，记录新的 host-provider seam
- `docs/modules/features/chat/services/ConversationSessionSignalRuntimeViewHostFactory.md`
  - 同步边界描述，说明 grouped session-signal ports 已改由 host-provider 负责

## 2. 变更文件

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/services/ConversationSessionSignalRuntimeHostProvider.ts`
- `tests/unit/features/chat/ConversationSessionSignalRuntimeHostProvider.test.ts`
- `docs/modules/features/chat/services/ConversationSessionSignalRuntimeHostProvider.md`
- `docs/modules/features/chat/services/ConversationSessionSignalRuntimeViewHostFactory.md`
- `docs/status/maintainability-phase-311.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- tests/unit/features/chat/ConversationSessionSignalRuntimeHostProvider.test.ts tests/unit/features/chat/ConversationSessionSignalRuntimeViewHostFactory.test.ts`
- `npm run build`

本轮 build 生成的 `BUILD_ID`：

- `autopilot-maintainability.202604131539`

本轮未执行全量 `npm test`。

原因：

- attempt `309` 不可被 `5` 整除
- 改动未命中仓库规则要求全量测试的高风险路径（`src/main.ts`、`src/core/`、`automation/`、`package.json`、`package-lock.json`、`manifest.json`、`styles.css`、`esbuild.config.mjs`）

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

下一轮建议继续留在 P1，复查 `OpenCodianView` 里 activation / sync / runtime bridge 创建区段中仍然直接暴露的 conversation sync/live-signal runtime wiring，优先判断 background-task live-signal reconcile seam 或 sync scheduling seam 是否还存在一个适合采用类似薄 host-provider facade 的 grouped runtime wiring 切口，继续削弱主集成点对 runtime bridge 装配的 ownership。

一句话总结第三百一十一阶段本轮：

> 第三百一十一阶段把 conversation session-signal 的 grouped factory-host ports 从 `OpenCodianView` 下沉到 `ConversationSessionSignalRuntimeHostProvider`，让 P1 session-signal runtime seam 更接近单一职责 facade，并保持既有 session-signal runtime factory 与 adapter 行为不变。
