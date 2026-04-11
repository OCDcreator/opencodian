# 可维护性改进：第十二阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-11.md`

本轮继续沿着第十一阶段留下的 inline card 边界推进，但仍然只做一个切口：**把 `showPermissionDialog()` 里的 permission inline card 内容构造与按钮等待流程抽到独立的 `PermissionInlineCardRenderer` 模块，并继续复用 `StreamingInlineCardRenderer` 的 placement/reveal 能力**。本轮没有继续拆 question inline card，也没有改动 permission 响应回传或 stream router 行为。

## 1. 本轮范围

本轮只处理 permission inline card render/wait 这一项子职责：

- 新增 `src/features/chat/runtime/PermissionInlineCardRenderer.ts`
  - 统一渲染 permission inline card 的 header、tool info、patterns、command 与 action buttons
  - 统一封装 allow once / allow always / reject 的按钮等待
  - 统一在用户选择后移除临时 permission card
- `OpenCodianView.showPermissionDialog()` 不再直接持有上述 DOM 构造与点击等待逻辑，只保留：
  - 调用 `PermissionInlineCardRenderer.collectResponse()`
  - 在拿到结果后调用 `respondToPermission()`
  - 失败时记录错误并弹出 notice
- `StreamingInlineCardRenderer` 继续只负责 placement/reveal，不再承载 permission-specific 内容职责

## 2. 变更文件

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/runtime/PermissionInlineCardRenderer.ts`
- `tests/unit/features/chat/streamingAssistantShellVisibility.test.ts`
- `docs/modules/README.md`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/features/chat/runtime/PermissionInlineCardRenderer.md`
- `docs/modules/features/chat/runtime/StreamingInlineCardRenderer.md`

## 3. 验证

本轮实际执行并通过：

- `npm test -- --runTestsByPath tests/unit/features/chat/streamingAssistantShellVisibility.test.ts`
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

- `autopilot-maintainability.202604111845`

## 5. 下一步建议

下一轮最推荐继续沿着 inline card / interaction 边界，把 **grouped/sequential question inline card 的内容构造从 `OpenCodianView` 挪到独立 helper**，优先处理：

- grouped question card 的标题、说明、选项区块拼装
- sequential question card 的 per-question 内容与按钮渲染
- 保持 question helper 继续复用现有 question card 容器与 `StreamingInlineCardRenderer`

一句话总结第十二阶段本轮：

> 第十一阶段已经把 inline card 的共享 placement 抽到 `StreamingInlineCardRenderer`；第十二阶段本轮继续把 permission inline card 自身的内容渲染与按钮等待也移出 `OpenCodianView`，让 view 更接近只负责交互桥接与 service 调用。
