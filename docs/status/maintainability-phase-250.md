# 可维护性改进：第二百五十阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-249.md`
> **推进的 master-plan lane**: P3 `context / composer / retained-selection`（event-bridge focus/catalog split）

本轮继续遵循 lane map 的 P3 首查入口，从 `OpenCodianView` 的 composer/context service 装配区段进入，只复审上一轮建议的 **`ComposerContextEventBridge` 事件接缝**，而不重新广扫 context catalog 数据结构、chips 渲染或 retained-selection 算法。确认仍然混合在一起的职责是：**同一个 `ComposerContextEventBridge` 同时持有 focus-preview activation / retained-selection 事件桥接，以及 vault catalog mutation 注册。**

因此本轮只做一个低风险切片：**把 focus-preview activation 事件与 catalog mutation 事件拆成独立 bridge，并让 `ComposerContextEventBridge` 退回为组合层。** 具体来说，新增 `FocusContextEventBridge` 负责 workspace/composer/document 事件与 retained-selection lifecycle，新增 `ContextFileCatalogEventBridge` 负责 vault `create/delete/rename` 注册；`ComposerContextHostAdapter` 改为组装这两个窄 bridge，再通过原有 `ComposerContextEventBridge` 暴露给 view 同一份 `start()/dispose()` 入口。

这次改动不改变 file-open preview 刷新时机、composer focus handoff、retained-selection polling、catalog 增量更新语义；变化只在于 event-bridge ownership：focus-preview/runtime 事件与 catalog 事件不再耦合在同一模块里。

## 1. 本轮范围

- `src/features/chat/services/FocusContextEventBridge.ts`
  - 新增专用 focus-preview/runtime 事件 bridge
  - 集中 workspace/composer/document 事件注册与 retained-selection polling lifecycle
- `src/features/chat/services/ContextFileCatalogEventBridge.ts`
  - 新增专用 catalog mutation 事件 bridge
  - 集中 vault `create/delete/rename` 到 `ContextFileCatalogService` 的桥接
- `src/features/chat/services/ComposerContextEventBridge.ts`
  - 收窄为组合层，只统一启动/清理两个子 bridge
- `src/features/chat/services/ComposerContextHostAdapter.ts`
  - 改为显式装配 `FocusContextEventBridge` 与 `ContextFileCatalogEventBridge`
- 测试
  - 新增 `tests/unit/features/chat/FocusContextEventBridge.test.ts`
  - 新增 `tests/unit/features/chat/ContextFileCatalogEventBridge.test.ts`
  - 更新 `tests/unit/features/chat/ComposerContextEventBridge.test.ts`
- 直接相关文档
  - 新增 `docs/modules/features/chat/services/FocusContextEventBridge.md`
  - 新增 `docs/modules/features/chat/services/ContextFileCatalogEventBridge.md`
  - 更新 `docs/modules/features/chat/services/ComposerContextEventBridge.md`
  - 更新 `docs/modules/features/chat/services/ComposerContextHostAdapter.md`

## 2. 变更文件

- `src/features/chat/services/ComposerContextEventBridge.ts`
- `src/features/chat/services/ContextFileCatalogEventBridge.ts`
- `src/features/chat/services/FocusContextEventBridge.ts`
- `src/features/chat/services/ComposerContextHostAdapter.ts`
- `tests/unit/features/chat/ComposerContextEventBridge.test.ts`
- `tests/unit/features/chat/ContextFileCatalogEventBridge.test.ts`
- `tests/unit/features/chat/FocusContextEventBridge.test.ts`
- `docs/modules/features/chat/services/ComposerContextEventBridge.md`
- `docs/modules/features/chat/services/ComposerContextHostAdapter.md`
- `docs/modules/features/chat/services/ContextFileCatalogEventBridge.md`
- `docs/modules/features/chat/services/FocusContextEventBridge.md`
- `docs/status/maintainability-phase-250.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- ComposerContextEventBridge FocusContextEventBridge ContextFileCatalogEventBridge ComposerContextHostAdapter`
- `npm test`
- `npm run build`

本轮构建 `BUILD_ID`：

- `autopilot-maintainability.202604130513`

本轮执行完整 `npm test` 的原因：

- attempt `245` 可被 `5` 整除，按仓库规则需要在 targeted tests 后补跑完整测试

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

下一轮如果继续沿 P3 推进，建议复审 `ComposerContextHostAdapter` / `OpenCodianView` 中仍由同一 host seam 同时承担的 **context picker interaction hook 与 retained-selection refresh writeback**，优先寻找一个只影响 host 装配而不改变 picker 行为的窄 split。

一句话总结第二百五十阶段本轮：

> 第二百五十阶段把 `ComposerContextEventBridge` 里的 focus-preview activation 与 catalog mutation 事件注册拆到 `FocusContextEventBridge` 和 `ContextFileCatalogEventBridge`，让 composer-context 事件桥回到组合层 + 单一职责子桥的结构。
