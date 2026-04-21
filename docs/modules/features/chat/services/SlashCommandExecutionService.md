# SlashCommandExecutionService

> **源码**: `src/features/chat/services/SlashCommandExecutionService.ts`
> **状态**: [REVIEW]

## 概述

`SlashCommandExecutionService` 是 chat-side slash command execution owner。它拦截 composer 里以 `/` 开头的输入，只为当前 vault 已知的 project/runtime slash commands 接管执行，并把真正的 session command 调用继续委托给 `OpenCodeService.runSessionCommand()`。

这层 owner 当前只覆盖：

- 解析 `/command arguments` 形式的输入
- 识别 project `.opencode/opencode.json` `command.<id>` 与 runtime `sdk.command.list()` 返回的普通 commands / skill commands
- 按插件设置 `slashCommandSkillMode` 决定 skill 是直接 `/skill args`，还是 `/skills skill args`
- 复用现有 foreground busy / server readiness gate
- 从活动会话与 focus preview 收集 OpenCodian placeholder runtime context：
  - `vaultPath`
  - `currentNotePath`
  - `currentSelection`
  - `externalContextPaths`
  - `conversationTitle`
- 在 command 请求发出后启动现有 conversation sync loop，并触发一次 visible conversation background sync

它**仍不负责** slash autocomplete、hidden menu UI 或 command-owned hidden agent generation；这些分别留在 `ComposerInputShellCoordinator`、`slashCommandCatalog`/`SettingsCommandsSection` 与 `OpencodeConfigManager`。

## 公开接口

```ts
export class SlashCommandExecutionService {
  tryRunSlashCommand(content: string): Promise<boolean>;
}
```

- 返回 `true`：当前输入已经被当作 slash command 消费（包括 ready/busy/error path）
- 返回 `false`：当前输入不属于已知 slash command，调用方继续走普通 chat send pipeline

## 关键行为

### command 识别

- 非 `/` 前缀输入直接返回 `false`
- `//` 与 `/ ` 这种非命令输入也直接放回普通消息路径
- project commands 优先用 `OpencodeConfigManager.getCommandConfig()` 判断
- runtime commands 再使用 `sdk.command.list()` 判断
- runtime catalog 会过滤掉 `source === 'mcp'` 的条目
- `slashCommandSkillMode === 'direct'` 时，runtime `source === 'skill'` 可以直接用 `/skill-id arguments` 执行
- `slashCommandSkillMode === 'skills-command'` 时，直接 `/skill-id` 不接管；只有 `/skills skill-id arguments` 会映射为真实 `session.command({ command: 'skill-id' })`
- 如果 prefixed mode 下某个 skill ID 同时也是 project command，则直接 `/skill-id` 仍按 project command 处理

### 执行前 gate

- 先复用现有 server readiness / badge refresh seam，保证 runtime command 场景能拉起服务
- 再复用现有 conversation/tab/foreground busy gate，避免和前台 busy/retry 状态打架
- foreground busy 时只走现有 blocked notice，不会退回普通发送路径

### runtime placeholder context

- `refreshActiveFocusContextPreview()` 先刷新当前焦点预览
- selection preview 会提供：
  - `currentNotePath = preview.path`
  - `currentSelection = preview.textSnapshot`
- 没有 selection preview 时：
  - `currentSelection = ''`
  - `currentNotePath` 回退到 note preview / `conversation.currentNote`
- `externalContextPaths` 直接来自当前会话持久路径数组，真正的路径规范化仍交给 phase 14 已落地的 `runSessionCommand()` seam

## 与发送 runtime 的边界

- `ComposerInputShellCoordinator` 仍只负责提交字符串
- `SendPipelineRuntime` 现在多了一条最前面的 slash interception seam：
  - 先问 `SlashCommandExecutionService.tryRunSlashCommand()`
  - 如果返回 `false`，再继续普通 `prepareMessageSend()` + streaming pipeline
- slash command 真正执行仍走 `OpenCodeService.runSessionCommand()` / `session.command`；执行后的 visible follow-up sync 复用 `ConversationSyncBridge.syncVisibleConversationInBackground()`，因此会优先从 canonical session graph 投影，canonical 缺失时才通过 server read 回填 canonical snapshot
- `OpenCodianView` 只负责装配 host，不持有新的 slash runtime 逻辑
