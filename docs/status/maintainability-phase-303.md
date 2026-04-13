# 可维护性改进：第三百零三阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-302.md`
> **推进的 master-plan lane**: P1 `OpenCodianView` activation / sync / runtime bridge ownership（tab activation runtime view-host factory seam）

本轮遵循 master plan 与 lane map 的 P1 首查入口，先从 `OpenCodianView` 的 activation / sync host 与 runtime bridge 创建区段切入，再检查 `TabActivationRuntimeHostAdapter`、`TabActivationBridgeHostFactory`、`TabConversationActivationBridge`、`TabViewActivationBridge` 与 `TabRuntimeStateBridge` 的边界后，选择了一个低风险的单一职责切片：**把 tab activation runtime 的 view-facing adapter host 装配下沉到新的 `TabActivationRuntimeViewHostFactory`。**

这样 `OpenCodianView` 不再直接依赖或维护完整的 `TabActivationRuntimeHostAdapterHost` shape。view 只提供 tab runtime、conversation state、question/todo、background task、conversation sync 与 UI writeback 这几组更窄的 late-bound port；factory 负责把这些 port 组合成共享 activation runtime seam，再交给现有 adapter 派生 `TabActivationBridgeHosts`、`TabConversationStateBridgeHost` 与 `TabRuntimeStateBridgeHost`，保留既有 activation、session-state、stream-like tab 状态与 UI writeback 行为。

## 1. 本轮范围

- `src/features/chat/services/TabActivationRuntimeViewHostFactory.ts`
  - 新增 tab activation runtime view-host factory，从 grouped view ports 组合出 `TabActivationRuntimeBridgeHosts`
  - 保持 late-bound port 查找，避免 bridge host 固化过早绑定的 view/service 实例
- `src/features/chat/OpenCodianView.ts`
  - 移除对 raw `TabActivationRuntimeHostAdapterHost` 的直接依赖，改为提供更窄的 factory host 输入
  - 保留 bridge 实例化顺序与具体 view/service writeback 实现
- `tests/unit/features/chat/TabActivationRuntimeViewHostFactory.test.ts`
  - 新增 focused coverage，覆盖 activation runtime hosts 的 grouped port 转发与 late-bound port 替换
- `docs/modules/features/chat/services/TabActivationRuntimeViewHostFactory.md`
  - 新增模块文档，记录新 factory seam 的职责边界
- `docs/modules/features/chat/runtime/TabActivationRuntimeHostAdapter.md`
  - 更新 adapter 文档，标明共享 activation runtime seam 现在先由 view-host factory 装配

## 2. 变更文件

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/services/TabActivationRuntimeViewHostFactory.ts`
- `tests/unit/features/chat/TabActivationRuntimeViewHostFactory.test.ts`
- `docs/modules/features/chat/services/TabActivationRuntimeViewHostFactory.md`
- `docs/modules/features/chat/runtime/TabActivationRuntimeHostAdapter.md`
- `docs/status/maintainability-phase-303.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- tests/unit/features/chat/TabActivationRuntimeViewHostFactory.test.ts tests/unit/features/chat/TabActivationRuntimeHostAdapter.test.ts tests/unit/features/chat/TabConversationActivationBridge.test.ts tests/unit/features/chat/TabViewActivationBridge.test.ts tests/unit/features/chat/TabRuntimeStateBridge.test.ts`
- `npm run build`

本轮 build 生成的 `BUILD_ID`：

- `autopilot-maintainability.202604131430`

本轮未执行全量 `npm test`。

原因：attempt `301` 不可被 `5` 整除，且改动未命中工作流列出的高风险路径（`src/main.ts`、`src/core/`、`automation/`、`package.json`、`package-lock.json`、`manifest.json`、`styles.css`、`esbuild.config.mjs`）。

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

下一轮建议继续沿 P1 复审 `OpenCodianView` 的 activation/runtime 周边，优先查看 conversation hydration outcome / transition host assembly 是否仍有类似的 view-facing port factory seam 可以下沉；如果收益不够明显，再切换到 P2 的 question / todo / background-task activation 协调边界。

一句话总结第三百零三阶段本轮：

> 第三百零三阶段把 tab activation runtime 的 view-facing host assembly 从 `OpenCodianView` 下沉到 `TabActivationRuntimeViewHostFactory`，让 activation runtime seam 更接近单一职责边界。
