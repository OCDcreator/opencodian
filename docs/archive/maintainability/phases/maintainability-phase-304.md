# 可维护性改进：第三百零四阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-303.md`
> **推进的 master-plan lane**: P1 `OpenCodianView` activation / sync / runtime bridge ownership（conversation hydration / transition runtime view-host factory seam）

本轮遵循 master plan 与 lane map 的 P1 首查入口，先回到 `OpenCodianView` 的 activation / sync host 与 runtime bridge 创建区段，再检查 `ConversationHydrationOutcomeBridge`、`ConversationHydrationRenderBridge` 与 `ConversationTransitionBridge` 的 host 依赖后，选择了一个低风险的单一职责切片：**把 loaded-conversation hydration / transition 的 view-facing host 装配下沉到新的 `ConversationHydrationRuntimeViewHostFactory`。**

这样 `OpenCodianView` 不再直接维护三份分散的 hydration / outcome / transition bridge host shape。view 现在只提供 hydration render、hydration outcome、transition state 与 transition writeback 这四组更窄的 late-bound port；factory 负责把这些 port 重新组合成 `ConversationHydrationRenderBridgeHost`、`ConversationHydrationOutcomeBridgeHost` 与 `ConversationTransitionBridgeHost`，保留既有 loaded-conversation 切换、rehydrating shell、scroll restore、消息重渲、background-task rebuild 与 post-render outcome 行为。

## 1. 本轮范围

- `src/features/chat/services/ConversationHydrationRuntimeViewHostFactory.ts`
  - 新增 hydration / transition runtime view-host factory，从 grouped view ports 组合出三份 bridge host
  - 保持 late-bound port 查找，避免 hydration/transition bridge host 过早绑定 view/service 实例
- `src/features/chat/OpenCodianView.ts`
  - 移除对 raw hydration / outcome / transition bridge host factory 的直接维护，改为提供更窄的 factory host 输入
  - 保留 bridge 实例化顺序与具体 view/service writeback 实现
- `tests/unit/features/chat/ConversationHydrationRuntimeViewHostFactory.test.ts`
  - 新增 focused coverage，覆盖 grouped port 转发与 late-bound port 替换
- `docs/modules/features/chat/services/ConversationHydrationRuntimeViewHostFactory.md`
  - 新增模块文档，记录新 factory seam 的职责边界

## 2. 变更文件

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/services/ConversationHydrationRuntimeViewHostFactory.ts`
- `tests/unit/features/chat/ConversationHydrationRuntimeViewHostFactory.test.ts`
- `docs/modules/features/chat/services/ConversationHydrationRuntimeViewHostFactory.md`
- `docs/status/maintainability-phase-304.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- tests/unit/features/chat/ConversationHydrationRuntimeViewHostFactory.test.ts tests/unit/features/chat/ConversationHydrationRenderBridge.test.ts tests/unit/features/chat/ConversationHydrationOutcomeBridge.test.ts tests/unit/features/chat/ConversationTransitionBridge.test.ts tests/unit/features/chat/ConversationViewStateService.test.ts`
- `npm run build`

本轮 build 生成的 `BUILD_ID`：

- `autopilot-maintainability.202604131440`

本轮未执行全量 `npm test`。

原因：attempt `302` 不可被 `5` 整除，且改动未命中工作流列出的高风险路径（`src/main.ts`、`src/core/`、`automation/`、`package.json`、`package-lock.json`、`manifest.json`、`styles.css`、`esbuild.config.mjs`）。

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

下一轮建议切换到 P2，优先复审 `OpenCodianView` 里 `createQuestionTodoBackgroundTaskViewHost()` 与相邻 activation / post-sync adapter 装配，判断 question / todo / background-task 的 grouped view-host factory seam 是否足够稳定，优先迁出仍集中在 view 里的 activation coordination host assembly。

一句话总结第三百零四阶段本轮：

> 第三百零四阶段把 loaded-conversation hydration / transition 的 view-facing host assembly 从 `OpenCodianView` 下沉到 `ConversationHydrationRuntimeViewHostFactory`，让 hydration runtime seam 更接近单一职责边界。
