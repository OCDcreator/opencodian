# 可维护性改进：第二十三阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-22.md`

本轮延续第二十二阶段的 persisted assistant footer 收尾，只做一个切口：**把 persisted assistant footer 的 `statusLabel` 计算从 `OpenCodianView` 抽到纯 helper**。本轮没有改变 assistant footer DOM、copy button 初始化、structured assistant 内容渲染顺序、notice / pseudo-stream footer 行为，或 streaming shell finalizer 现有的中断 badge 处理路径。

## 1. 本轮范围

本轮只处理 persisted assistant footer 的 status-label 归位：

- `src/features/chat/runtime/AssistantFooterPayload.ts`
  - 新增 `resolvePersistedAssistantFooterStatusLabel()`
  - 由 footer helper 内部统一根据 persisted assistant `streamState` 推导 `statusLabel`
  - `buildPersistedAssistantFooterPayload()` 不再要求调用方额外传入 `statusLabel`
- `src/features/chat/OpenCodianView.ts`
  - 移除 persisted assistant footer 两个调用点里的 interrupted badge 计算
  - 删除 view 内只为 persisted footer 服务的 `getAssistantStreamStatusLabel()`
- `tests/unit/features/chat/AssistantFooterPayload.test.ts`
  - 调整 payload 组装测试，覆盖 helper 内部的 interrupted badge 推导
  - 新增纯 helper 对 interrupted / non-interrupted persisted message 的 focused coverage
- 只更新直接相关的 chat/runtime 模块文档

## 2. 变更文件

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/runtime/AssistantFooterPayload.ts`
- `tests/unit/features/chat/AssistantFooterPayload.test.ts`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/features/chat/runtime/AssistantFooterPayload.md`
- `docs/status/maintainability-phase-23.md`

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

- `autopilot-maintainability.202604112042`

## 5. 下一步建议

下一轮最推荐继续收窄 persisted assistant footer 调用面：把 **`assistantShellRenderer.addTimestampWithCopyButton({ messageEl, ...payload })` 的 persisted assistant 调用包装成单独 helper**，让 `OpenCodianView` 在这条路径里只负责提供 `messageEl`、`message` 并委托专门 footer renderer。

一句话总结第二十三阶段本轮：

> 第二十二阶段先把 persisted assistant footer payload 组装抽离；第二十三阶段继续把 interrupted status badge 计算收进同一个 runtime helper，让 `OpenCodianView` 再少持有一段只属于 persisted footer 的状态分支。
