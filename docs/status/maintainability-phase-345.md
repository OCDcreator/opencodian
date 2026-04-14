# 可维护性改进：第三百四十五阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-344.md`
> **推进的 master-plan lane**: OpenCodeService `question / permission negotiation`
> **完成的 roadmap queue item**: `R30 - Question and permission hub`

本轮严格执行 roadmap 的第一个 `[NEXT]` 项：`R30 - Question and permission hub`。本轮把 `OpenCodeService` 中 pending questions/reply/reject、pending permissions/respond，以及 session permission responder 的共享协商流程收束到新的 `OpenCodeQuestionPermissionHub`，让 `OpenCodeService` 继续退回为 host seam 与对外 façade。

## 1. 本轮范围

- 新增 `src/core/opencode/OpenCodeQuestionPermissionHub.ts`
  - 集中承接 question list/reply/reject 的 `sdkQuestions` / legacy fallback 协商逻辑
  - 集中承接 permission list/respond 与 session permission responder，并在同一 owner 内做 permission request 形状过滤
- 缩减 `src/core/opencode/OpenCodeService.ts`
  - `getPendingQuestions()`、`replyToQuestion()`、`rejectQuestion()` 改为委托给 hub
  - `getPendingPermissions()`、`respondToPermission()`、`respondToSessionPermission()` 改为委托给 hub
  - 删除原先散落在主服务里的 question/permission negotiation transport 分流与 normalization 细节
- 补充 focused coverage
  - 新增 `tests/unit/core/opencode/OpenCodeQuestionPermissionHub.test.ts`
  - 扩展 `tests/unit/core/opencode/OpenCodeService.sdkCompat.test.ts`，覆盖 permission wrappers 仍然经由服务对外暴露
- 更新直接相关模块文档
  - `docs/modules/core/opencode/OpenCodeService.md`
  - `docs/modules/core/opencode/OpenCodeQuestionPermissionHub.md`
- 推进 maintainability 路线文档
  - `docs/status/maintainability-master-plan.md`
  - `docs/status/maintainability-round-roadmap.md`
  - `docs/status/maintainability-lane-map.md`

## 2. 本轮刻意没有动的边界

- 没有改动 provider auth / project / file / find / path / VCS / formatter / LSP / MCP auth 这一组条件性 query gateway；该部分仍留给 `R31`
- 没有改动 `OpenCodeSessionLifecycleCoordinator`、`OpenCodeSessionControlOrchestrator`、`ServerManager`、`OpenCodeSdkFacade` 或 `OpenCodianView`
- 没有改变 question/permission 的交互语义，只把既有 SDK flag、legacy fallback 与 request filtering 收束到同一个 owner
- 没有部署到 Test Vault；本轮命中的代码路径不在 AGENTS 约定的 deploy-relevant runtime/style/settings 范围内

## 3. 验证

- Targeted:
  - `npm test -- OpenCodeQuestionPermissionHub.test.ts OpenCodeService.test.ts OpenCodeService.sdkCompat.test.ts`
- Full:
  - `npm test`
  - `npm run build`

本轮 build 生成的 `BUILD_ID`：

- `autopilot-maintainability.202604141407`

## 4. 文件变更

- `src/core/opencode/OpenCodeService.ts`
- `src/core/opencode/OpenCodeQuestionPermissionHub.ts`
- `tests/unit/core/opencode/OpenCodeQuestionPermissionHub.test.ts`
- `tests/unit/core/opencode/OpenCodeService.sdkCompat.test.ts`
- `docs/modules/core/opencode/OpenCodeService.md`
- `docs/modules/core/opencode/OpenCodeQuestionPermissionHub.md`
- `docs/status/maintainability-master-plan.md`
- `docs/status/maintainability-round-roadmap.md`
- `docs/status/maintainability-lane-map.md`
- `docs/status/maintainability-phase-345.md`

## 5. 下一步建议

下一轮继续执行 roadmap 已晋升的 `[NEXT]`：`R31 - Conditional query gateway`。优先从 `OpenCodeService.ts` 的 provider auth / project / file / find / path / VCS / formatter / LSP / MCP auth 区段评估是否能形成一个明显较厚的 `OpenCodeQueryGateway`；如果评估后仍只会得到薄 wrapper，则按 roadmap 要求在该轮明确说明原因后直接推进 `R32`。

一句话总结第三百四十五阶段本轮：

> 第三百四十五阶段完成 R30，把 `OpenCodeService` 的 question / permission negotiation 收束到 `OpenCodeQuestionPermissionHub`，并将受控队列推进到 `R31 - Conditional query gateway`。
