# 可维护性改进：第二百六十一阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-260.md`
> **推进的 master-plan lane**: P4 `message shell / notice / timestamp ownership`（assistant notice card 组装边界）

本轮先按上一阶段建议复审 P3：`ComposerContextViewFacade` 当前只剩 send-context、focus preview、context row、picker action 与 lifecycle 的薄转发，没有同等级且低风险的新 ownership seam。因此本轮按 lane map fallback 切到 P4，选择一个单一职责切片：**把 assistant notice card 的 DOM、OMO system-reminder 文案归一化、raw block 与 action label 组装从 `OpenCodianView` 抽到新的 `AssistantNoticeCardRenderer`。**

这样 `OpenCodianView` 只保留 Markdown 渲染和 notice action 副作用 host 回调，placeholder notice 与 persisted notice 继续通过同一 renderer 复用 card 组装逻辑。

## 1. 本轮范围

- `src/features/chat/runtime/AssistantNoticeCardRenderer.ts`
  - 新增 assistant notice card renderer
  - 集中处理 notice tone/icon、标题、Markdown body、OMO system-reminder raw block 与 action label
  - 通过 host 保留 Markdown 渲染与 action 副作用回调
- `src/features/chat/OpenCodianView.ts`
  - 移除 notice card DOM / OMO notice body / notice action label 的直接组装细节
  - 构造并复用 `AssistantNoticeCardRenderer`
- 测试
  - 新增 `tests/unit/features/chat/AssistantNoticeCardRenderer.test.ts`
  - 继续跑 `AssistantShellViewHostAdapter` focused suite，确认 streaming placeholder notice 仍走共享 host
- 直接相关文档
  - 新增 `docs/modules/features/chat/runtime/AssistantNoticeCardRenderer.md`
  - 更新 `docs/modules/features/chat/runtime/AssistantNoticeRenderer.md`
  - 更新 `docs/modules/features/chat/OpenCodianView.md`

## 2. 变更文件

- `src/features/chat/runtime/AssistantNoticeCardRenderer.ts`
- `src/features/chat/OpenCodianView.ts`
- `tests/unit/features/chat/AssistantNoticeCardRenderer.test.ts`
- `docs/modules/features/chat/runtime/AssistantNoticeCardRenderer.md`
- `docs/modules/features/chat/runtime/AssistantNoticeRenderer.md`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/status/maintainability-phase-261.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- AssistantNoticeCardRenderer AssistantShellViewHostAdapter`
- `npm run build`

本轮构建 `BUILD_ID`：

- `autopilot-maintainability.202604130653`

本轮未执行完整 `npm test` 的原因：

- attempt `256` 不可被 `5` 整除
- 改动未命中要求整库 Jest 回归的高风险路径（`src/main.ts`、`src/core/`、`automation/`、`package.json`、`package-lock.json`、`manifest.json`、`styles.css`、`esbuild.config.mjs`）

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

下一轮建议继续留在 P4，优先审查 user message footer / timestamp / rewind-fork action 组装是否能抽成低风险 `UserMessageFooterRenderer` 或相邻 runtime helper；如果该 seam 风险偏高，再复审 assistant persisted footer 与 notice footer 的 timestamp finalization 边界。

一句话总结第二百六十一阶段本轮：

> 第二百六十一阶段把 assistant notice card 的 tone/icon、OMO notice body/raw block 与 action label 组装迁到新的 `AssistantNoticeCardRenderer`，让 `OpenCodianView` 只保留 Markdown 渲染和 notice action 副作用的 host wiring。
