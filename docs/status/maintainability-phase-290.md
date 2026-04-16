# 可维护性改进：第二百九十阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-289.md`
> **推进的 master-plan lane**: P2 `question / todo / background task` wiring 与 post-sync/activation 协调（background-task follow-up reset ownership）

本轮继续遵循 master plan 与 lane map 的 P2 首查入口，选择一个高价值且低风险的单一职责切片：**把 background-task indicator reset 时那段 active anchor / waiting-for-follow-up / launch-completion map / stale notice fingerprint 的 runtime 清空逻辑，从 `OpenCodianView` 下沉到 `BackgroundTaskTimelineService`。**

这样 background-task timeline 模块不只负责 conversation→runtime 重建，也负责 reset-side 的 runtime wipe 规则；`OpenCodianView` 则退化成调用服务的薄桥接，不再直接逐项改写这组 background-task follow-up 字段。

## 1. 本轮范围

- `src/features/chat/services/BackgroundTaskTimelineService.ts`
  - 新增 `resetIndicatorState()`，集中清空 inline panel、runtime follow-up 状态、launch/completion map、authoritative-sync gate 与 stale notice fingerprint
  - 让 `syncStateFromConversation()` 复用同一份 runtime reset 逻辑，避免 reset-path 与 rebuild-path 继续各自维护一套 field 清理规则
- `src/features/chat/OpenCodianView.ts`
  - `createBackgroundTaskTimelineServiceHost()` 新增 `clearInlinePanel` host
  - `resetBackgroundTaskIndicator()` 改为直接委托 `BackgroundTaskTimelineService.resetIndicatorState()`
- 测试
  - 为 `BackgroundTaskTimelineService` 增加 focused coverage，验证 reset 会清空 inline panel 与 follow-up runtime，同时保留 suppression fingerprint 的既有行为
- 直接相关文档
  - 更新 `OpenCodianView` 与 `BackgroundTaskTimelineService` 模块文档，说明 indicator reset/runtime 清空 ownership 已收束到 timeline service

## 2. 变更文件

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/services/BackgroundTaskTimelineService.ts`
- `tests/unit/features/chat/BackgroundTaskTimelineService.test.ts`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/features/chat/services/BackgroundTaskTimelineService.md`
- `docs/status/maintainability-phase-290.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- BackgroundTaskTimelineService`
- `npm run build`

本轮 build 生成的 `BUILD_ID`：

- `autopilot-maintainability.202604131225`

本轮未执行全量 `npm test`。

原因：attempt `288` 不能被 `5` 整除，且改动未命中仓库规则中要求全量测试的 high-risk 路径（`src/main.ts`、`src/core/`、`automation/`、`package.json`、`package-lock.json`、`manifest.json`、`styles.css` 或 `esbuild.config.mjs`）。

## 4. 部署结果

本轮**未执行 Test Vault 部署**。

原因：改动未命中仓库约定的 deploy-relevant 路径（`src/main.ts`、`manifest.json`、`styles.css`、`assets/`、`src/style/`、`src/core/theme/`、`src/features/settings/`），且用户未显式要求部署，因此按仓库规则在成功 build 后停止于构建验证。

## 5. 下一步建议

下一轮建议继续从 P2 首查入口出发，复审 `OpenCodianView` 里仍残留的 stale session-todo / question-resolution follow-up 薄桥接；如果没有同等级 runtime 写回块，可优先删除只为测试或 host 转发保留的 session-todo pass-through，继续把 stale-notice ownership 固定在 `SessionTodoStateService`。

一句话总结第二百九十阶段本轮：

> 第二百九十阶段把 background-task indicator reset 时的 follow-up runtime 清空逻辑下沉到 `BackgroundTaskTimelineService`，让 `OpenCodianView` 不再直接逐项改写这组 background-task 状态。
