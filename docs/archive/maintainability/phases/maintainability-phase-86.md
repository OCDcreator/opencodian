# 可维护性改进：第八十六阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-85.md`

本轮继续沿着 `ConversationRenderService` 的 trailing-assistant skipped debug 日志编排边界收束：**把 skipped debug 的 count-planning contract 预建再前移成独立步骤，让 `buildTrailingAssistantPatchSkippedDebugCountPlanFromLoggingContext()` 不再自己串接 logging context 到 count-planning contract 的读取，而只负责消费准备好的 count inputs。** 这样 logging context 到 rendered-count plan 的链路进一步拆分成“抽取 count-planning inputs”“装配 count-planning contract”“执行 count plan 计算”三个单一职责步骤里的前两步与最终 count-plan 计算之间更清晰分层。

本轮没有改变 skipped debug 的触发时机、rendered count 的计算方式、payload 字段顺序、`tabId` 注入路径、debug label，或 trailing-assistant patch 的执行/回退路径；只把 count-planning contract 的 logging-context 串接责任继续前移。

## 1. 本轮范围

- `src/features/chat/services/ConversationRenderService.ts`
  - 新增 `buildTrailingAssistantPatchSkippedDebugCountPlanningContractFromLoggingContext()`
  - 让 `buildTrailingAssistantPatchSkippedDebugCountPlanFromLoggingContext()` 改为只消费预建的 count-planning contract
- `docs/modules/features/chat/services/ConversationRenderService.md`
  - 同步说明 skipped debug 日志现在会先从 logging context 预组装 count-planning contract，再进入 count plan 计算

## 2. 变更文件

- `src/features/chat/services/ConversationRenderService.ts`
- `docs/modules/features/chat/services/ConversationRenderService.md`
- `docs/status/maintainability-phase-86.md`

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

- `autopilot-maintainability.202604120340`

## 5. 下一步建议

下一轮适合继续把 skipped debug 的 count-plan 依赖再前移成更窄 contract，让 `buildTrailingAssistantPatchSkippedDebugPayloadInputsFromLoggingContext()` 更接近只负责组合准备好的 reason/payload inputs 与 count plan。

一句话总结第八十六阶段本轮：

> 第八十六阶段把 trailing-assistant skipped debug 的 count-planning contract 预建再前移一步，让 count-plan builder 更接近只负责消费准备好的 count inputs。
