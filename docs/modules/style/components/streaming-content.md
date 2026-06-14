# Streaming Content Styles

> **源码**: `src/style/components/streaming-content.css`
> **状态**: [FINAL]

## 职责

负责流式输出区域的“思考块”“工具调用块”“错误块”“等待提示”和服务端动作卡片样式。

## 关键类名 / CSS 变量

- `.streaming-thinking-*`：思考区标题、正文、展开态。
- `.streaming-tool-*`：工具调用头部、状态图标、输出行、截断提示。
- `.streaming-tool-server-chip`：MCP 工具块头部显示的服务器名 chip（仅 `kind: 'mcp'` 且 `toolMetadata.server` 存在时渲染）。
- `.streaming-tool-auth-btn`：MCP 认证失败时渲染的内联认证按钮（仅 Codex 聊天）。
- `.streaming-tool-auth-done`：15Z 新增。认证成功后替换认证按钮的绿色 "Authenticated" 徽章。
- `.streaming-mcp-auth-hint`（含 `.is-done`/`.is-pending`/`.is-failed` 变体）：15Z 新增。认证后状态提示（成功重试/进行中/失败重试）。
- `.streaming-error-block`：流式错误信息条。
- `.opencodian-server-action-card*`：服务启动/确认动作卡片。
- `.opencodian-pending*`：等待中提示文案。
- 动画：`@keyframes spin`、`fadeIn`。

## 关联 TS 组件

- `src/features/chat/OpenCodianView.ts`
- `src/utils/streaming/ThinkingBlockRenderer.ts`
- `src/utils/streaming/ToolCallRenderer.ts`
- `src/utils/streaming/StreamController.ts`

## 修改注意点

- 工具状态色（running/completed/error/blocked）是关键信号，改色前先评估可辨识性。
- 输出区字体分层（正文 vs monospace 行日志）不要混淆，否则可读性明显下降。
- 修改后执行 `npm run build:css`（或完整 `npm run build`）。
