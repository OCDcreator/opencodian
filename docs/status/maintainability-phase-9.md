# 可维护性改进：第九阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-8.md`

本轮沿着第八阶段留下的 `SendPipelineShellPort` 边界继续推进，但仍然只做一个切口：**把 assistant stream notice 的构造与 placeholder notice 渲染从 `OpenCodianView` 抽到独立的 `AssistantNoticeRenderer` 模块**。本轮没有继续搬运 assistant shell 创建/reveal/timestamp ownership，也没有开启新的发送子系统拆分。

## 1. 本轮范围

本轮只处理 assistant notice 这一个子职责：

- 新增 `src/features/chat/runtime/AssistantNoticeRenderer.ts`
  - 统一构造 `buildStreamErrorNotice()`
  - 统一构造 `buildInterruptedAssistantNotice()`
  - 统一处理 `renderAssistantPlaceholderAsNotice()`
- `OpenCodianView` 不再直接拥有上述 notice 构造/placeholder 渲染实现，只保留一个很薄的 render host adapter 来桥接：
  - `renderNoticeCard()`
  - `addTimestampWithCopyButton()`
  - `setStreamingAssistantMessageVisibility()`
- `buildLocalStreamOutcome.ts` 改为直接复用纯 `buildStreamErrorNotice()`，不再通过 shell host builder 间接构造 error notice
- `StreamShellFinalizer.ts` 改为直接复用纯 `buildInterruptedAssistantNotice()`，从 `SendPipelineShellPort` 删除 notice builder 责任
- `SendPipelineTypes.ts` 里 `SendPipelineShellPort` 因此进一步收窄：保留 streaming shell 创建 / reveal / notice placeholder 渲染 / timestamp 收尾，不再包含 notice message builder

本轮额外把缺失的 Three.js vendor build 输入补回到仓库，作为本轮 build 验证的必要修复：

- `reference-projects/three.js/build/three.module.js`
- `reference-projects/three.js/build/three.core.js`
- `reference-projects/three.js/LICENSE`
- `reference-projects/three.js/package.json`

## 2. 变更文件

- `.gitignore`
- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/runtime/AssistantNoticeRenderer.ts`
- `src/features/chat/runtime/SendPipelineTypes.ts`
- `src/features/chat/runtime/buildLocalStreamOutcome.ts`
- `src/features/chat/runtime/StreamLocalFinalizer.ts`
- `src/features/chat/runtime/StreamShellFinalizer.ts`
- `tests/unit/features/chat/buildLocalStreamOutcome.test.ts`
- `tests/unit/features/chat/SendPipelineRuntime.test.ts`
- `tests/unit/features/chat/streamErrorNoticeSync.test.ts`
- `reference-projects/three.js/build/three.module.js`
- `reference-projects/three.js/build/three.core.js`
- `reference-projects/three.js/LICENSE`
- `reference-projects/three.js/package.json`
- `docs/modules/README.md`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/features/chat/runtime/AssistantNoticeRenderer.md`
- `docs/modules/features/chat/runtime/buildLocalStreamOutcome.md`
- `docs/modules/features/chat/runtime/SendPipelineRuntime.md`
- `docs/modules/features/chat/runtime/SendPipelineTypes.md`
- `docs/modules/features/chat/runtime/StreamShellFinalizer.md`

## 3. 验证

本轮实际执行并通过：

- `npm test`
- `npm run build`

其中 build 首次执行时失败，原因是补回 `reference-projects/three.js/build/three.module.js` 后仍缺少它依赖的 `three.core.js`。本轮按“一次 focused repair”补回 `reference-projects/three.js/build/three.core.js` 后重跑 build，通过。

## 4. 部署结果

`npm run build` 成功后，已按仓库约定顺序部署：

- 复制 `dist/main.js`
- 复制 `dist/manifest.json`
- 复制 `dist/styles.css`

部署目标：

- `C:\Users\lt\Desktop\Write\testvault\.obsidian\plugins\opencodian\`

已校验 Test Vault 中的 `main.js` 包含最新 `BUILD_ID`：

- `autopilot-maintainability.202604111816`

## 5. 下一步建议

下一轮最推荐继续利用已经变窄的 `SendPipelineShellPort`，**把 assistant streaming shell 的创建 / reveal / timestamp row adapter 继续从 `OpenCodianView` 挪到独立 shell adapter 模块**，优先处理：

- `createAssistantMessageElement()`
- `revealStreamingAssistantMessageElement()`
- `ensureAssistantTimestampRow()`
- `addTimestampWithCopyButton()`

一句话总结第九阶段本轮：

> 第八阶段已经把发送 host 切成更窄的 port；第九阶段本轮把 assistant notice 构造与 placeholder notice 渲染真正移出 `OpenCodianView`，并顺手补回缺失的 Three.js build 输入，让这一刀可以被完整测试、构建和部署验证。
