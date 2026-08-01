# 可维护性改进：第二百九十二阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-291.md`
> **推进的 master-plan lane**: P2 `question / todo / background task` wiring 与 post-sync/activation 协调（question post-resolution host 拆分）

本轮继续遵循 master plan 与 lane map 的 P2 首查入口，复审 `OpenCodianView` 里的 question host wiring，并选择一个高价值且低风险的单一职责切片：**把 question resolve 之后的 status refresh / conversation sync follow-up host 从 `QuestionRuntimeViewHostFactory` / 通用 `QuestionRuntimeViewHost` 中拆出，交给独立的 `QuestionPostResolutionRuntimeHostAdapter`。**

这样 `QuestionRuntimeViewHostFactory` 不再继续携带只服务于 post-resolution follow-up 的 pass-through，`QuestionRuntimeHostAdapter` 也改为显式接收独立的 post-resolution host，让通用 question runtime host 更接近 dock/settings/API/tab-attention 组合，而把 resolve 成功后的运行时收尾稳定收束到单独 adapter。

## 1. 本轮范围

- `src/features/chat/OpenCodianView.ts`
  - question runtime 装配改为同时传入通用 `QuestionRuntimeViewHost` 与独立的 post-resolution host
  - `createQuestionRuntimeViewHostFactoryHost()` 删除不再属于通用 question host 的 status-refresh / sync getter
- `src/features/chat/services/QuestionPostResolutionRuntimeHostAdapter.ts`
  - 新增独立 host adapter，负责组装 `QuestionPostResolutionRuntimeFacade` 所需的 tab/session runtime 读取、status refresh 与 sync follow-up 端口
- `src/features/chat/services/QuestionRuntimeHostAdapter.ts`
  - `QuestionRuntimeViewHost` 不再承载 post-resolution follow-up 方法
  - question runtime bundle 改为显式接收独立的 `QuestionPostResolutionRuntimeFacadeHost`
- `src/features/chat/services/QuestionRuntimeViewHostAdapter.ts`
  - 通用 question runtime host 仅保留 dock/settings/API/tab-attention 适配
- `src/features/chat/services/QuestionRuntimeViewHostFactory.ts`
  - factory 责任收窄为 late-bound 的 dock slot、question API 与 tab attention host 装配
- `tests/unit/features/chat/QuestionRuntimeHostAdapter.test.ts`
  - 更新 bundle 装配测试，验证 post-resolution host 改由外部注入
- `tests/unit/features/chat/QuestionRuntimeViewHostAdapter.test.ts`
  - 删除已迁出的 status-refresh / sync follow-up 断言
- `tests/unit/features/chat/QuestionRuntimeViewHostFactory.test.ts`
  - 删除已迁出的 post-resolution follow-up factory 断言
- `tests/unit/features/chat/QuestionPostResolutionRuntimeHostAdapter.test.ts`
  - 新增 adapter 测试，覆盖 post-resolution refresh / sync host 组装
- `docs/modules/features/chat/services/QuestionRuntimeHostAdapter.md`
- `docs/modules/features/chat/services/QuestionRuntimeViewHostAdapter.md`
- `docs/modules/features/chat/services/QuestionRuntimeViewHostFactory.md`
- `docs/modules/features/chat/services/QuestionPostResolutionRuntimeFacade.md`
- `docs/modules/features/chat/services/QuestionPostResolutionRuntimeHostAdapter.md`
  - 同步记录新的 host 边界

## 2. 变更文件

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/services/QuestionPostResolutionRuntimeHostAdapter.ts`
- `src/features/chat/services/QuestionRuntimeHostAdapter.ts`
- `src/features/chat/services/QuestionRuntimeViewHostAdapter.ts`
- `src/features/chat/services/QuestionRuntimeViewHostFactory.ts`
- `tests/unit/features/chat/QuestionPostResolutionRuntimeHostAdapter.test.ts`
- `tests/unit/features/chat/QuestionRuntimeHostAdapter.test.ts`
- `tests/unit/features/chat/QuestionRuntimeViewHostAdapter.test.ts`
- `tests/unit/features/chat/QuestionRuntimeViewHostFactory.test.ts`
- `docs/modules/features/chat/services/QuestionPostResolutionRuntimeFacade.md`
- `docs/modules/features/chat/services/QuestionPostResolutionRuntimeHostAdapter.md`
- `docs/modules/features/chat/services/QuestionRuntimeHostAdapter.md`
- `docs/modules/features/chat/services/QuestionRuntimeViewHostAdapter.md`
- `docs/modules/features/chat/services/QuestionRuntimeViewHostFactory.md`
- `docs/status/maintainability-phase-292.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- tests/unit/features/chat/QuestionRuntimeHostAdapter.test.ts tests/unit/features/chat/QuestionRuntimeViewHostAdapter.test.ts tests/unit/features/chat/QuestionRuntimeViewHostFactory.test.ts tests/unit/features/chat/QuestionPostResolutionRuntimeHostAdapter.test.ts tests/unit/features/chat/QuestionPostResolutionRuntimeFacade.test.ts`
- `npm test`
- `npm run build`

本轮 build 生成的 `BUILD_ID`：

- `autopilot-maintainability.202604131245`

本轮执行全量 `npm test`。

原因：attempt `290` 可被 `5` 整除，命中仓库规则中的全量测试条件。

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

下一轮建议继续复审 P2 question follow-up / refresh 组装：优先检查 `QuestionTodoBackgroundTaskRefreshHostAdapter` 与 `PostSyncQuestionTodoRefreshFacade` 一带是否还保留只为 question/todo post-sync 协调存在的 view-side pass-through；如果这一层已无同等级低风险切口，再按 lane map 转向 P1 的 activation / sync runtime bridge host assembly。

一句话总结第二百九十二阶段本轮：

> 第二百九十二阶段把 question resolve 后的 status/sync follow-up host 从通用 question runtime host 中拆出，让 `QuestionRuntimeViewHostFactory` 与 `QuestionRuntimeHostAdapter` 的职责边界更单一。
