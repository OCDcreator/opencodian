# 可维护性改进：第十阶段总结

> **状态**: [DONE]
> **承接文档**: `docs/status/maintainability-phase-9.md`

本轮继续沿着第九阶段留下的 shell adapter 边界推进，但仍然只做一个切口：**把 assistant streaming shell 的创建、reveal 与 timestamp/footer 收尾从 `OpenCodianView` 抽到独立的 `AssistantShellRenderer` 模块**。本轮没有继续拆 notice builder 之外的新发送子系统职责，也没有改动 shell port 契约本身。

## 1. 本轮范围

本轮只处理 assistant streaming shell 这一个子职责：

- 新增 `src/features/chat/runtime/AssistantShellRenderer.ts`
  - 统一处理 `createAssistantMessageElement()`
  - 统一处理 `revealStreamingAssistantMessageElement()`
  - 统一处理 `ensureAssistantTimestampRow()`
  - 统一处理 `addTimestampWithCopyButton()`
- `OpenCodianView` 不再直接拥有上述 streaming shell DOM 细节，只保留：
  - `createAssistantShellRendererHost()`：桥接 tab runtime / turn body / scroll / visibility / copy-button 初始化
  - `createAssistantNoticeRenderHost()`：继续桥接 notice card 渲染，但时间戳收尾已转交 `AssistantShellRenderer`
- 发送链路与 view 内部原有调用点统一改为复用 `assistantShellRenderer`
- `tests/unit/features/chat/streamingAssistantShellVisibility.test.ts` 改为直接覆盖独立 shell renderer 的隐藏/显示语义，同时保留 view 侧 inline card reveal 行为验证

## 2. 变更文件

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/runtime/AssistantShellRenderer.ts`
- `tests/unit/features/chat/streamingAssistantShellVisibility.test.ts`
- `docs/modules/README.md`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/features/chat/runtime/AssistantNoticeRenderer.md`
- `docs/modules/features/chat/runtime/AssistantShellRenderer.md`
- `docs/modules/features/chat/runtime/SendPipelineRuntime.md`
- `docs/modules/features/chat/runtime/SendPipelineTypes.md`

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

- `autopilot-maintainability.202604111830`

## 5. 下一步建议

下一轮最推荐继续沿着 shell adapter 边界，把 **streaming inline card 的插入/reveal 编排从 `OpenCodianView` 挪到独立 helper**，优先处理：

- `createStreamingInlineCard()`
- permission / question inline card 复用的“插到最后一个 tool call 之后，否则落到 content 区”的逻辑
- reveal 后 settled auto-scroll 的重复桥接

一句话总结第十阶段本轮：

> 第九阶段已经把 notice builder 与 placeholder 改写从 `OpenCodianView` 移走；第十阶段本轮继续把 assistant streaming shell 的创建、显示与 footer 收尾也收进 `AssistantShellRenderer`，让发送 shell ownership 更接近单一职责模块。
