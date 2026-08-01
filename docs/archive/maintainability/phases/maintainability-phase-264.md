# 可维护性改进：第二百六十四阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-263.md`
> **推进的 master-plan lane**: P4 `message shell / notice / timestamp ownership`（persisted assistant notice renderer）

本轮遵循 master plan 与 lane map，继续在 P4 选择一个高价值且低风险的单一职责切片：**把 persisted assistant notice 的 card + footer 编排从 `OpenCodianView.renderMessage()` 下沉到现有 `AssistantNoticeRenderer` / `AssistantShellViewHostAdapter` notice seam。**

这样 persisted notice 与 placeholder notice 现在共用同一条 runtime notice renderer seam；`OpenCodianView.renderMessage()` 在 notice 分支里只保留 host assembly，notice class、card 渲染与 footer 收尾都由 runtime helper 统一编排。

## 1. 本轮范围

- `src/features/chat/runtime/AssistantNoticeRenderer.ts`
  - 新增 `renderPersistedAssistantNotice()`
  - 抽出 persisted / placeholder notice 共用的 card + footer 编排 helper
- `src/features/chat/runtime/AssistantShellViewHostAdapter.ts`
  - 新增 `renderPersistedAssistantNotice()` 适配入口
  - 让 persisted notice 与 placeholder notice 共用同一条 notice render host seam
- `src/features/chat/OpenCodianView.ts`
  - 把 `renderMessage()` 的 persisted notice 分支改为调用 host adapter，而不是直接编排 notice card + footer
- 测试
  - 更新 `tests/unit/features/chat/AssistantShellViewHostAdapter.test.ts`
  - 保持 `tests/unit/features/chat/streamErrorNoticeSync.test.ts` 作为 placeholder notice 回归覆盖
- 直接相关文档
  - 更新 `docs/modules/features/chat/runtime/AssistantNoticeRenderer.md`
  - 更新 `docs/modules/features/chat/runtime/AssistantShellViewHostAdapter.md`

## 2. 变更文件

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/runtime/AssistantNoticeRenderer.ts`
- `src/features/chat/runtime/AssistantShellViewHostAdapter.ts`
- `tests/unit/features/chat/AssistantShellViewHostAdapter.test.ts`
- `docs/modules/features/chat/runtime/AssistantNoticeRenderer.md`
- `docs/modules/features/chat/runtime/AssistantShellViewHostAdapter.md`
- `docs/status/maintainability-phase-264.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- AssistantShellViewHostAdapter streamErrorNoticeSync`
- `npm run build`

本轮构建 `BUILD_ID`：

- `autopilot-maintainability.202604130721`

本轮未执行完整 `npm test` 的原因：

- attempt `259` 不可被 `5` 整除
- 改动未命中要求整库 Jest 回归的高风险路径（`src/main.ts`、`src/core/`、`automation/`、`package.json`、`package-lock.json`、`manifest.json`、`styles.css`、`esbuild.config.mjs`）

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

下一轮如继续留在 P4，可评估 assistant notice 在 `renderMessage()` 里剩余的 message-shell assembly（turn/body 选择、assistant notice class 归一）是否还能沿当前 host seam 再下沉一步；如果该切口收益不足，再切回更高优先级的 P1 / P2 host wiring ownership。

一句话总结第二百六十四阶段本轮：

> 第二百六十四阶段把 persisted assistant notice 的 card + footer 编排迁到 shared runtime notice renderer seam，让 `OpenCodianView.renderMessage()` 的 notice 分支进一步收缩为 host assembly。
