# 可维护性改进：第八十一阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-80.md`

本轮继续沿着 `ConversationRenderService` 的 trailing-assistant skipped debug 日志编排边界收束：**新增 skipped-debug count-inputs contract helper，先把 rendered-count 依赖收束成独立 `previousMessages` / `nextMessages` 窄 contract，再由独立 payload-inputs helper 预建 payload inputs，让 `buildTrailingAssistantPatchSkippedDebugLogPlanningContext()` 只负责组合准备好的 `payloadInputs` 与 `tabId`。** 这样 skipped debug 日志链路里的 rendered-count 读取不再留在 logging-plan context builder 内部，同时保留既有 debug label、payload 字段顺序、`tabId` 注入路径与最终 skipped 日志行为不变。

本轮没有改变 skipped debug 的触发时机、rendered count 的计算方式、`reason` / `payload` 的来源、`logAssistantFinalizationDebug()` 的调用目标，或 trailing-assistant patch 的执行/回退路径；只继续缩窄 skipped debug 日志链路中“count-inputs 预建”和“logging-plan context 装配”的职责边界。

## 1. 本轮范围

- `src/features/chat/services/ConversationRenderService.ts`
  - 新增 `TrailingAssistantPatchSkippedDebugCountInputs`
  - 新增 `buildTrailingAssistantPatchSkippedDebugCountInputs()`
  - 新增 `buildTrailingAssistantPatchSkippedDebugPayloadInputsFromLoggingContext()`
  - 让 `buildTrailingAssistantPatchSkippedDebugLogPlanningContext()` 改为只组合预建的 `payloadInputs` 与 `tabId`
- `docs/modules/features/chat/services/ConversationRenderService.md`
  - 同步说明 skipped debug 日志现在线性经过 planning context、logging context、count-inputs contract、payload inputs、logging-plan contract、payload-plan 与 final-log inputs 这些窄 contract

## 2. 变更文件

- `src/features/chat/services/ConversationRenderService.ts`
- `docs/modules/features/chat/services/ConversationRenderService.md`
- `docs/status/maintainability-phase-81.md`

## 3. 验证

本轮实际执行并通过：

- `npm test`
- `npm run build`

## 4. 部署结果

`npm run build` 成功后，已按仓库约定部署到 Test Vault：

- 复制 `dist/main.js`
- 复制 `dist/manifest.json`
- 复制 `dist/styles.css`

部署目标：

- `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian`

本轮未改动 bundled assets，因此未复制 `dist/assets/`。

已校验 Test Vault 中的 `main.js` 包含最新 `BUILD_ID`：

- `autopilot-maintainability.202604120312`

## 5. 下一步建议

下一轮适合继续把 skipped debug 的 payload-inputs 依赖前移成更窄 contract，让 `buildTrailingAssistantPatchSkippedDebugPayloadInputsFromLoggingContext()` 也更接近只负责组合预建的 reason / payload / count plan 输入。

一句话总结第八十一阶段本轮：

> 第八十一阶段把 trailing-assistant skipped debug 的 rendered-count 依赖前移成独立 count-inputs contract，让 logging-plan context builder 只负责组合准备好的 payloadInputs 与 tabId。
