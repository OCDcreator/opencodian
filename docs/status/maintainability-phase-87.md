# 可维护性改进：第八十七阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-86.md`

本轮继续沿着 `ConversationRenderService` 的 trailing-assistant skipped debug 日志编排边界收束：**把 skipped debug 的 payload-inputs contract 预建成独立步骤，让 `buildTrailingAssistantPatchSkippedDebugPayloadInputsFromLoggingContext()` 不再同时承担 reason/payload 与 count plan 的准备细节，而只负责消费已经准备好的 payload-inputs contract。** 这样 payload-input assembly 前会先完成 ready count plan 与 reason/payload inputs 的汇总，进一步压窄 logging context 到最终 skipped debug payload inputs 的职责边界。

本轮没有改变 skipped debug 的触发时机、rendered count 的计算方式、payload 字段顺序、`tabId` 注入路径、debug label，或 trailing-assistant patch 的执行/回退路径；只把 ready count plan 进入 payload-inputs contract 的组装责任前移到独立 helper。

## 1. 本轮范围

- `src/features/chat/services/ConversationRenderService.ts`
  - 新增 `buildTrailingAssistantPatchSkippedDebugPayloadInputsContractFromLoggingContext()`
  - 让 `buildTrailingAssistantPatchSkippedDebugPayloadInputsFromLoggingContext()` 只把预建的 payload-inputs contract 转成 payload inputs
- `docs/modules/features/chat/services/ConversationRenderService.md`
  - 同步说明 skipped debug 日志现在会先预建 payload-inputs contract，再进入 payload inputs assembly

## 2. 变更文件

- `src/features/chat/services/ConversationRenderService.ts`
- `docs/modules/features/chat/services/ConversationRenderService.md`
- `docs/status/maintainability-phase-87.md`

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

- `autopilot-maintainability.202604120345`

## 5. 下一步建议

下一轮适合继续把 skipped debug 的 payload-inputs contract preparation 再拆窄一步，例如把 reason/payload inputs 与 count plan 的组合输入预收束成更小的 contract，让 `buildTrailingAssistantPatchSkippedDebugPayloadInputsContractFromLoggingContext()` 也更接近只负责串接预建子输入。

一句话总结第八十七阶段本轮：

> 第八十七阶段把 trailing-assistant skipped debug 的 payload-inputs contract 预建前移，让 payload-inputs assembly 更接近只消费准备好的 reason/payload 与 ready count plan。
