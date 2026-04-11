# 可维护性改进：第二十一阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-20.md`

本轮继续沿着第二十阶段留下的 assistant footer 收尾边界推进，只做一个切口：**把 `getAssistantCopyContent()` 里“structured text blocks 提取 vs `message.content` fallback”的 copy-source 选择逻辑抽到专门 helper**。本轮没有改变 structured assistant 的 DOM 渲染顺序、resolved question card 插入规则、timestamp row DOM、copy button 初始化流程，或 `AssistantShellRenderer` 的 footer 收尾语义。

## 1. 本轮范围

本轮只处理 persisted assistant footer 的 copy-content 来源选择：

- `src/features/chat/runtime/AssistantCopyContent.ts`
  - 新增 `resolveAssistantCopyContent()`
  - 新增 `extractAssistantStructuredTextCopyContent()`
  - 统一处理 `contentBlocks` 存在时的 structured text 提取与无 structured blocks 时的 `message.content` fallback
- `src/features/chat/OpenCodianView.ts`
  - 移除 view 内联的 `getAssistantCopyContent()`
  - assistant footer 的 timestamp/copy 收尾改为直接委托新 helper 提供 copy content
- 单测覆盖 structured text 拼接、structured blocks 无可复制文本时保持空结果、以及无 structured blocks 时的 fallback content
- 只更新直接相关 chat/runtime 模块文档

## 2. 变更文件

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/runtime/AssistantCopyContent.ts`
- `tests/unit/features/chat/AssistantCopyContent.test.ts`
- `docs/modules/README.md`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/features/chat/runtime/AssistantCopyContent.md`
- `docs/status/maintainability-phase-21.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- --runTestsByPath tests/unit/features/chat/AssistantCopyContent.test.ts tests/unit/features/chat/AssistantStructuredContentRenderer.test.ts tests/unit/features/chat/AssistantPlainTextFallbackRenderer.test.ts`
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

- `autopilot-maintainability.202604112026`

## 5. 下一步建议

下一轮最推荐继续缩窄 assistant footer 收尾：把 **persisted assistant footer 传给 `AssistantShellRenderer.addTimestampWithCopyButton()` 的 payload 组装** 抽成一个更窄的 helper，让 `OpenCodianView` 不再同时负责 `statusLabel`、copy-content 与 footer 参数拼装。

一句话总结第二十一阶段本轮：

> 第二十阶段先抽离了 structured `contentBlocks` 的 resolved-card 插入顺序；第二十一阶段继续把 assistant footer 的 copy-source 选择抽成独立 helper，让 `OpenCodianView` 再少持有一段 persisted assistant 正文导出细节。
