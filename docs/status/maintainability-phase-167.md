# 可维护性改进：第一百六十七阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-166.md`
> **推进的 master-plan lane**: P2 `question / todo / background task 链路`

本轮继续遵循 master plan 的高优先级 P2，没有回到 paused 的 `ConversationRenderService` / `TrailingAssistantPatch*` helper-fragmentation lane。实际切片是：**把 background task completion notice 的 queued-state、fingerprint/content、persisted dedupe 与 flush append 协调，从 `OpenCodianView` 下沉到新的 `BackgroundTaskCompletionNoticeService`。**

这次改动没有改变 background task timeline 推导、hydration / authoritative-sync gate、inline panel 渲染，或 queue/flush 的上层触发时机；`OpenCodianView` 现在只保留何时收集 segment、何时调用 queue/flush 的编排，具体 completion notice 的聚合与持久化细节由 dedicated service 承接。

## 1. 本轮范围

- `src/features/chat/services/BackgroundTaskCompletionNoticeService.ts`
  - 新增 `BackgroundTaskCompletionNoticeServiceHost` 与 `BackgroundTaskCompletionNoticeRuntime`
  - 统一管理 completion reminder 的 queued notice 聚合、markdown content、fingerprint 与 persisted dedupe
  - 承接 stream 结束后的 completion notice append 与 `noticeMeta` 回写
- `src/features/chat/OpenCodianView.ts`
  - 新增 `backgroundTaskCompletionNoticeService` 装配与 host bridge
  - `queueBackgroundTaskCompletionNotices()` 与 `flushQueuedBackgroundTaskCompletionNotices()` 改成 thin wrappers
  - `collectBackgroundTaskSegments()` 继续保留 completion timeline 推导，但不再自己维护 queued notice / flush 细节
- `tests/unit/features/chat/BackgroundTaskCompletionNoticeService.test.ts`
  - 新增直接单测，覆盖 queued reminder 聚合、sorted notice payload，以及 persisted reminder dedupe
- 直接相关文档
  - `docs/modules/features/chat/OpenCodianView.md`
  - `docs/modules/features/chat/services/BackgroundTaskCompletionNoticeService.md`

## 2. 变更文件

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/services/BackgroundTaskCompletionNoticeService.ts`
- `tests/unit/features/chat/BackgroundTaskCompletionNoticeService.test.ts`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/features/chat/services/BackgroundTaskCompletionNoticeService.md`
- `docs/status/maintainability-phase-167.md`

## 3. 验证

本轮实际执行并通过：

- `npm test`
- `npm run build`
- `git diff --check`

## 4. 部署结果

`npm run build` 成功后，已按仓库约定部署到 Test Vault：

- 复制 `dist/main.js`
- 复制 `dist/manifest.json`
- 复制 `dist/styles.css`

部署目标：

- `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian`

本轮未改动 bundled assets，因此未复制 `dist/assets/`。

已校验 Test Vault 中的 `main.js` 包含本轮最新 `BUILD_ID`：

- `autopilot-maintainability.202604121244`

## 5. 下一步建议

下一轮仍建议优先沿 master plan 的 P2 前进。更高价值的后续切片是把 background task live-signal reconciliation / authoritative-sync runtime bridge，从 `OpenCodianView` 下沉到 dedicated coordinator，同时保留 inline panel DOM 渲染在 view；不要回到 trailing-assistant helper 链，除非测试、构建或正确性问题直接要求。

一句话总结第一百六十七阶段本轮：

> 第一百六十七阶段把 background task completion notice 的队列与持久化协调从 `OpenCodianView` 下沉到 `BackgroundTaskCompletionNoticeService`，推进了 master plan 的 P2 `question / todo / background task` ownership 迁移。
