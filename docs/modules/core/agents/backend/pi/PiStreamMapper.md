# PiStreamMapper
> 2026-09-18 (R-B3): Mechanical refactor (no behavior change): the pi content-block mapping loop moved into a file-local `appendPiContentBlocks()` helper so `toPiChatMessages` stays within the complexity gate.

> 源码: src/core/agents/backend/pi/PiStreamMapper.ts

## 职责

转换文本、思考、工具进度/结果、文件编辑和用量；保留details和图片。错误尝试不能提前结束可重试回合，未知加法事件可忽略。toPiChatMessages 恢复原生ID、思考、工具参数/结果、图片及可见扩展消息，隐藏 display=false 消息。

resolvePiToolCall 把 pi 的 MCP 元工具（`mcp` / `mcpScript`）还原成真实身份：`mcp` 的 `{tool, args}` 调用以限定工具名（如 `server_tool`）作为 name、把 `args` JSON 字符串解析为 input，`{search}` / `{describe}` 发现调用把目标映射到 `query` / `name`，三者都标记 `kind: 'mcp'`，因此对话卡片与其他后端的 MCP 卡片一致（图标、真实工具名、摘要）。`mcpScript` 同样归入 `kind: 'mcp'`。live 流与本地历史恢复（含 content block 的 `toolKind`）共用该 helper，两处不会分叉。

buildPiPrompt 保留文件/选择上下文与图片；buildPiUsageSnapshot 分开当前上下文占用、累计计费和真实总费用。请求结束由服务响应决定。

## 验证

PiAdapter.test.ts、SDK验收脚本、Test Vault；不得导入其他后端实现。
