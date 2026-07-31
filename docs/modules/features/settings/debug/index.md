# settings/debug aggregate index

> 这是 `settings/debug/` 的聚合索引，不对应也不替代任何 `src/index.ts` 源码模块映射。

## 模块文档

- [OpenCodeDebugPanel](OpenCodeDebugPanel.md)：OpenCode trace debug workbench 的完整 owner。
- [CodexDebugPanel](CodexDebugPanel.md)：Codex session-trace debug workbench 的完整 owner。
- [ClaudeCodeDebugPanel](ClaudeCodeDebugPanel.md)：Claude Code debug workbench 的完整 owner。
- [types](types.md)：三个 panel 使用的窄 settings/diagnostics ports 及其 composition adapters。

## 边界与挂载语义

`SettingsDebugSection` 持有 shared debug shell/router 与平台、路径、action、module-render 等 helpers；三个 backend panel 各自是完整 owner，而不是 forwarding shim。各 settings composition 边界把 app-owned diagnostics service 适配为 panel 消费的窄 diagnostics ports，不把完整 plugin 或 service 交给 panel。

Claude panel 在 classic `attach()` 与 tabbed `attachTabbed()` 路径中均保留。Codex panel 仍只在 tabbed 路径挂载；classic `attach()` 的 Codex omission 是保留的 legacy 语义，本 slice 不修复或删除它。
