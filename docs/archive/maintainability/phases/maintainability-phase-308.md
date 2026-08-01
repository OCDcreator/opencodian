# 可维护性改进：第三百零八阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-307.md`
> **推进的 master-plan lane**: P1 `OpenCodianView` activation / sync / runtime bridge ownership（thin host-provider seam）

本轮遵循 master plan、lane map 与上一轮建议，先回到 `OpenCodianView` 里的 P1 首查入口：tab activation runtime host 创建区段与 `createTabActivationRuntimeViewHostFactoryHost()` 片段，再复查 `TabActivationRuntimeViewHostFactory`、`TabActivationRuntimeHostAdapter` 与已有 host-provider 模式，最终选择了一个低风险单一职责切片：**新增 `TabActivationRuntimeHostProvider`，把 `OpenCodianView` 内联维护的 grouped activation/runtime factory-host 结构，下沉为一层薄的 host-provider facade。**

这样 `OpenCodianView` 不再直接维护：

- `TabActivationRuntimeViewHostFactoryHost` 的六组 grouped late-bound ports
- grouped port 到 `TabActivationRuntimeHostAdapterHost` 之间的中间重组布局
- P1 activation/runtime seam 与 factory-host 契约的双重 owner 身份

view 现在只暴露一份更扁平的 activation/runtime seam；新的 host-provider 负责把它重新分组，再交给既有 `TabActivationRuntimeViewHostFactory` 与 `TabActivationRuntimeHostAdapter` 继续派生 bridge hosts。

## 1. 本轮范围

- `src/features/chat/services/TabActivationRuntimeHostProvider.ts`
  - 新增薄 facade，把扁平的 P1 activation/runtime seam 重新分组为 `TabActivationRuntimeViewHostFactoryHost`
- `src/features/chat/OpenCodianView.ts`
  - 移除内联 grouped factory-host 方法，改为只提供扁平的 `TabActivationRuntimeHostProviderHost`
- `tests/unit/features/chat/TabActivationRuntimeHostProvider.test.ts`
  - 新增 focused coverage，验证 grouped port 重组与 late-bound collaborator 行为
- `docs/modules/features/chat/services/TabActivationRuntimeHostProvider.md`
  - 新增模块文档，记录新的 host-provider seam
- `docs/modules/features/chat/services/TabActivationRuntimeViewHostFactory.md`
  - 同步边界描述，说明 grouped ports 已改由 host-provider 负责

## 2. 变更文件

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/services/TabActivationRuntimeHostProvider.ts`
- `tests/unit/features/chat/TabActivationRuntimeHostProvider.test.ts`
- `docs/modules/features/chat/services/TabActivationRuntimeHostProvider.md`
- `docs/modules/features/chat/services/TabActivationRuntimeViewHostFactory.md`
- `docs/status/maintainability-phase-308.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- tests/unit/features/chat/TabActivationRuntimeHostProvider.test.ts tests/unit/features/chat/TabActivationRuntimeViewHostFactory.test.ts`
- `npm run build`

本轮 build 生成的 `BUILD_ID`：

- `autopilot-maintainability.202604131521`

本轮未执行全量 `npm test`。

原因：

- attempt `306` 不可被 `5` 整除
- 改动未命中仓库规则要求全量测试的高风险路径（`src/main.ts`、`src/core/`、`automation/`、`package.json`、`package-lock.json`、`manifest.json`、`styles.css`、`esbuild.config.mjs`）

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

下一轮建议继续留在 P1，复查 `OpenCodianView` 里 activation / sync / runtime bridge 创建区段中仍然直接暴露的 conversation sync / load runtime host seam，优先判断 `createConversationSyncLoadRuntimeViewHostFactoryHost()` 是否也适合采用类似的薄 host-provider facade，进一步削弱主集成点对 grouped runtime wiring 的 ownership。

一句话总结第三百零八阶段本轮：

> 第三百零八阶段把 tab activation runtime 的 grouped factory-host ports 从 `OpenCodianView` 下沉到 `TabActivationRuntimeHostProvider`，让 P1 activation/runtime seam 更接近单一职责 facade，并保持既有 runtime view-host factory 与 adapter 行为不变。
