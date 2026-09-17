# PiExtensionUiHost

> 源码: src/features/chat/services/PiExtensionUiHost.ts

## 职责

适配 select、confirm、input、editor、notify、setTitle、set_editor_text 七种标准 UI。交互由用户回复/取消，AbortSignal 关闭对应 Modal。登录通知提供 URL 链接。

**刻意不渲染 `setStatus` / `setWidget`**：这两个是 Pi 的终端状态行与 widget 面（例如第三方 `pi-mcp-adapter` 扩展通过它们报告 `MCP: 5 servers enabled (1 connected)`）。它们既与聊天界面已有的信息重复，又没有其他后端提供对应界面，因此不落地到 Obsidian。这两个方法官方也不需要响应，忽略它们不会阻塞 RPC 往返。

状态/文本 widget 和编辑器只定位相同 Pi 会话；使用 DOM 文本 API，不执行扩展 HTML。终端自定义组件属于不支持的主机能力。

## 验证

SDK脚本验证9方法往返，Test Vault验证真实Obsidian主机，详见Pi验收报告。
