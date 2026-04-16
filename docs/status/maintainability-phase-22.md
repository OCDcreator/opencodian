# 可维护性改进：第二十二阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-21.md`

本轮沿着第二十一阶段继续缩窄 assistant footer 收尾，只做一个切口：**把 persisted assistant footer 传给 `AssistantShellRenderer.addTimestampWithCopyButton()` 的 payload 组装抽到专门 helper**。本轮没有改变 assistant footer DOM、copy button 初始化、structured assistant 内容渲染顺序、notice/pseudo-stream footer 行为，或 `AssistantCopyContent` 既有的 structured-text 选择规则。

## 1. 本轮范围

本轮只处理 persisted assistant footer payload 组装：

- `src/features/chat/runtime/AssistantFooterPayload.ts`
  - 新增 `buildPersistedAssistantFooterPayload()`
  - 统一组装 `timestamp`、`content`、`modelId` 与可选 `statusLabel`
  - 继续委托 `resolveAssistantCopyContent()` 处理 structured text blocks / `message.content` fallback
- `src/features/chat/OpenCodianView.ts`
  - 移除两个 persisted assistant footer 调用点里的内联 payload 拼装
  - assistant footer 收尾改为委托新 helper 返回 payload，再补上 `messageEl`
- 新增单测覆盖 structured assistant footer payload 与可选字段保留 `undefined` 的行为
- 只更新直接相关的 chat/runtime 模块文档

## 2. 变更文件

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/runtime/AssistantFooterPayload.ts`
- `tests/unit/features/chat/AssistantFooterPayload.test.ts`
- `docs/modules/README.md`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/features/chat/runtime/AssistantCopyContent.md`
- `docs/modules/features/chat/runtime/AssistantFooterPayload.md`
- `docs/status/maintainability-phase-22.md`

## 3. 验证

本轮实际执行并通过：

- `npm test`
- `npm run build`

## 4. 部署结果

`npm run build` 成功后，已按仓库约定顺序部署：

- 复制 `dist/main.js`
- 复制 `dist/manifest.json`
- 复制 `dist/styles.css`

部署目标：

- `C:\Users\lt\Desktop\Write\testvault\.obsidian\plugins\opencodian\`

已校验 Test Vault 中的 `main.js` 包含最新 `BUILD_ID`：

- `autopilot-maintainability.202604112035`

## 5. 下一步建议

下一轮最推荐继续收窄 persisted assistant footer：把 **`statusLabel` 的计算也从 `OpenCodianView` 抽成纯 helper**，让 view 在 persisted assistant footer 路径里只负责提供 `messageEl` 与触发 renderer。

一句话总结第二十二阶段本轮：

> 第二十一阶段先把 assistant footer 的 copy-source 选择抽离；第二十二阶段继续把 persisted assistant footer 的 timestamp/copy/model/status payload 组装抽成独立 helper，让 `OpenCodianView` 再少持有一段 footer 参数拼装职责。
