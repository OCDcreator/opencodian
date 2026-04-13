# 可维护性改进：第三百一十二阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-311.md`
> **推进的 master-plan lane**: P1 `OpenCodianView` activation / sync / runtime bridge ownership（background-task live-signal reconcile thin host-provider seam）

本轮遵循 master plan、lane map 与上一轮建议，先回到 `OpenCodianView` 的 P1 首查入口：activation / sync host 与 runtime bridge 创建区段，再复查当前仍直接内联的 background-task live-signal reconcile wiring。结合 `ConversationSessionSignalRuntime` 与 `BackgroundTaskLiveSignalCoordinator` 的衔接方式，本轮选择了一个低风险单一职责切片：**新增 `BackgroundTaskLiveSignalCoordinatorHostProvider` 与 `BackgroundTaskLiveSignalCoordinatorViewHostFactory`，把 `OpenCodianView` 内联维护的 background-task live-signal coordinator host 装配，下沉为一层薄的 host-provider + factory seam。**

这样 `OpenCodianView` 不再直接维护：

- background-task live-signal coordinator host 的 grouped runtime / session lookup / view writeback ports
- live-signal reconcile seam 到 `BackgroundTaskLiveSignalCoordinatorHost` 之间的中间重组布局
- P1 conversation live-signal wiring 中这段 coordinator host assembly 的双重 owner 身份

view 现在只暴露一份更扁平的 live-signal reconcile seam；新的 host-provider 负责重新分组，view-host factory 再把 grouped ports 还原为既有 coordinator 继续消费的扁平 host。

## 1. 本轮范围

- `src/features/chat/services/BackgroundTaskLiveSignalCoordinatorHostProvider.ts`
  - 新增薄 facade，把 `OpenCodianView` 暴露的 flat live-signal reconcile seam 重新分组为 factory 所需的三组 ports
- `src/features/chat/services/BackgroundTaskLiveSignalCoordinatorViewHostFactory.ts`
  - 新增 host factory，把 grouped ports 重新装配为既有 `BackgroundTaskLiveSignalCoordinatorHost`
- `src/features/chat/OpenCodianView.ts`
  - 移除内联 coordinator host 结构，改为只提供 `BackgroundTaskLiveSignalCoordinatorHostProviderHost`
- `tests/unit/features/chat/BackgroundTaskLiveSignalCoordinatorHostProvider.test.ts`
  - 新增 focused coverage，验证 grouped ports 重组与 late-bound collaborator 行为
- `docs/modules/features/chat/services/BackgroundTaskLiveSignalCoordinatorHostProvider.md`
  - 新增模块文档，记录新的 host-provider seam
- `docs/modules/features/chat/services/BackgroundTaskLiveSignalCoordinatorViewHostFactory.md`
  - 新增模块文档，记录 coordinator host assembly factory
- `docs/modules/features/chat/services/BackgroundTaskLiveSignalCoordinator.md`
  - 同步边界描述，说明 coordinator host assembly 已下沉到 provider + factory

## 2. 变更文件

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/services/BackgroundTaskLiveSignalCoordinatorHostProvider.ts`
- `src/features/chat/services/BackgroundTaskLiveSignalCoordinatorViewHostFactory.ts`
- `tests/unit/features/chat/BackgroundTaskLiveSignalCoordinatorHostProvider.test.ts`
- `docs/modules/features/chat/services/BackgroundTaskLiveSignalCoordinator.md`
- `docs/modules/features/chat/services/BackgroundTaskLiveSignalCoordinatorHostProvider.md`
- `docs/modules/features/chat/services/BackgroundTaskLiveSignalCoordinatorViewHostFactory.md`
- `docs/status/maintainability-phase-312.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- tests/unit/features/chat/BackgroundTaskLiveSignalCoordinatorHostProvider.test.ts tests/unit/features/chat/BackgroundTaskLiveSignalCoordinator.test.ts`
- `npm test`
- `npm run build`

本轮 build 生成的 `BUILD_ID`：

- `autopilot-maintainability.202604131549`

本轮执行全量 `npm test` 的原因：

- attempt `310` 可被 `5` 整除，命中仓库规则要求的周期性全量测试

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

下一轮建议继续留在 P1，复查 `OpenCodianView` 里 activation / sync / runtime bridge 创建区段中仍直接暴露的 conversation sync scheduling seam，优先判断 `startConversationSyncLoop` / `stopConversationSyncLoop` / signal debounce cleanup 相关 wiring 是否还能采用类似薄 host-provider facade，下沉 view 对 sync bridge 装配的 ownership。

一句话总结第三百一十二阶段本轮：

> 第三百一十二阶段把 background-task live-signal coordinator host assembly 从 `OpenCodianView` 下沉到 `BackgroundTaskLiveSignalCoordinatorHostProvider` 与 `BackgroundTaskLiveSignalCoordinatorViewHostFactory`，让 P1 conversation live-signal wiring 更接近单一职责 facade，并保持既有 background-task live-signal 协调行为不变。
