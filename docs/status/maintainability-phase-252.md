# 可维护性改进：第二百五十二阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-251.md`
> **推进的 master-plan lane**: P3 `context / composer / retained-selection`（view-facing composer context facade）

本轮继续遵循 lane map 的 P3 首查入口，从 `ComposerContextHostAdapter` 与 `OpenCodianView` 的 composer/context builder seam 进入，只复审上一轮建议的 **view-facing `ComposerContextServices` bundle**，没有重新广扫 context catalog、chips 渲染、picker lifecycle 或 retained-selection 算法。

确认的低风险问题是：`ComposerContextHostAdapter` 虽然已经统一装配 composer/context runtime，但 `OpenCodianView` 仍逐项保存 `runtimeStore`、action、picker、coordinator、event bridge、focus preview/runtime 等多条依赖，view 侧仍保留明显的 composer-context service fan-out。行为本身稳定，问题主要在 host assignment 颗粒度过细。

因此本轮只做一个窄切片：**新增 `ComposerContextViewFacade`，把 `OpenCodianView` 真正使用的 composer/context 入口收敛成单一 facade。** `ComposerContextHostAdapter` 继续负责内部 bundle 装配，但现在额外返回 `viewFacade`；`OpenCodianView` 不再逐项持有 action / picker / coordinator / event bridge / runtime store / focus runtime，而是通过 facade 处理 draft-context 读取清空、context row 装配、file picker、current note / selection actions、focus preview refresh 与 lifecycle start/dispose。context picker、chips、retained-selection 与 file-open writeback 行为保持不变。

## 1. 本轮范围

- `src/features/chat/services/ComposerContextViewFacade.ts`
  - 新增 view-facing facade
  - 收敛 draft-context、picker/action、focus preview refresh 与 lifecycle 入口
- `src/features/chat/services/ComposerContextHostAdapter.ts`
  - 在既有 bundle 装配之上新增 facade 组装
  - 将 view-facing 返回面收窄为 `viewFacade` + 仍需保留的 focus internals
- `src/features/chat/OpenCodianView.ts`
  - 改为只保存 `ComposerContextViewFacade`
  - 用 facade 取代原先多条 composer-context service assignment 与调用点
- 测试
  - 更新 `tests/unit/features/chat/ComposerContextHostAdapter.test.ts`
- 直接相关文档
  - 新增 `docs/modules/features/chat/services/ComposerContextViewFacade.md`
  - 更新 `docs/modules/features/chat/services/ComposerContextHostAdapter.md`
  - 更新 `docs/modules/features/chat/services/ComposerContextEventBridge.md`

## 2. 变更文件

- `src/features/chat/services/ComposerContextViewFacade.ts`
- `src/features/chat/services/ComposerContextHostAdapter.ts`
- `src/features/chat/OpenCodianView.ts`
- `tests/unit/features/chat/ComposerContextHostAdapter.test.ts`
- `docs/modules/features/chat/services/ComposerContextViewFacade.md`
- `docs/modules/features/chat/services/ComposerContextHostAdapter.md`
- `docs/modules/features/chat/services/ComposerContextEventBridge.md`
- `docs/status/maintainability-phase-252.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- ComposerContextHostAdapter`
- `npm run build`

本轮构建 `BUILD_ID`：

- `autopilot-maintainability.202604130533`

本轮未执行完整 `npm test` 的原因：

- attempt `247` 不能被 `5` 整除
- 改动未命中仓库规则中的高风险路径（`src/main.ts`、`src/core/`、`automation/`、`package.json`、`package-lock.json`、`manifest.json`、`styles.css`、`esbuild.config.mjs`）

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

下一轮如果继续沿 P3 推进，建议复审 `OpenCodianView` 中仍从 composer/context 读取的 send-preparation 与 active-markdown helper 调用点，考虑把 `getDraftContextItems()` / `clearDraftContextItems()` 这类发送前依赖再收敛成更窄的 send-context port，进一步减少非 composer host 对 composer facade 细节的感知。

一句话总结第二百五十二阶段本轮：

> 第二百五十二阶段为 composer/context runtime 增加了 `ComposerContextViewFacade`，把 `OpenCodianView` 的 composer-context service fan-out 收敛为单一 view-facing seam，同时保持 picker、chips 与 retained-selection 行为不变。
