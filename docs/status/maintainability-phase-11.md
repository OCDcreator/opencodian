# 可维护性改进：第十一阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-10.md`

本轮继续沿着第十阶段留下的 streaming shell adapter 边界推进，但仍然只做一个切口：**把 streaming inline card 的共享插入/reveal 逻辑从 `OpenCodianView` 抽到独立的 `StreamingInlineCardRenderer` 模块**。本轮没有继续拆 question/permission 卡片的具体内容构造，也没有触碰 send pipeline 或会话同步逻辑。

## 1. 本轮范围

本轮只处理 streaming inline card placement 这一项子职责：

- 新增 `src/features/chat/runtime/StreamingInlineCardRenderer.ts`
  - 统一处理 `createStreamingInlineCard()`
  - 统一处理“插到最后一个 tool call 之后，否则回退到 content/message 容器”的共享 placement 路径
  - 统一处理 inline card 插入后的 streaming shell reveal
- `OpenCodianView` 不再直接拥有上述 permission/question inline card 插入细节，只保留：
  - `createStreamingInlineCardRendererHost()`：桥接 active tab、tab runtime 与 shell reveal
  - question resolved / grouped / sequential 卡片继续复用新的 inline card renderer
  - permission inline card 也改为复用同一条 post-tool-call placement 路径
- `tests/unit/features/chat/streamingAssistantShellVisibility.test.ts` 改为直接覆盖独立 inline card renderer 的 reveal 与 post-tool-call 插入语义

## 2. 变更文件

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/runtime/StreamingInlineCardRenderer.ts`
- `tests/unit/features/chat/streamingAssistantShellVisibility.test.ts`
- `docs/modules/README.md`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/features/chat/runtime/AssistantShellRenderer.md`
- `docs/modules/features/chat/runtime/StreamingInlineCardRenderer.md`

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

- `autopilot-maintainability.202604111838`

## 5. 下一步建议

下一轮最推荐继续沿着 inline card / interaction 边界，把 **permission inline card 的内容构造与按钮等待逻辑从 `OpenCodianView` 挪到独立 helper**，优先处理：

- `showPermissionDialog()` 里的 header/info/pattern/command 区块渲染
- allow once / always / reject 的等待与结果回传封装
- 保持新 helper 继续复用 `StreamingInlineCardRenderer` 的 placement/reveal 能力

一句话总结第十一阶段本轮：

> 第十阶段已经把 assistant streaming shell 的创建与收尾移出 `OpenCodianView`；第十一阶段本轮继续把 permission/question 共用的 inline card 插入与 reveal 也收进 `StreamingInlineCardRenderer`，让 view 更接近只负责业务路由而不是 DOM placement 细节。
