# SlashCommandExecutionService

> **源码**: `src/features/chat/services/SlashCommandExecutionService.ts`
> **状态**: [REVIEW]

## 概述

`SlashCommandExecutionService` 是 chat-side slash command execution owner。它拦截 composer 里以 `/` 开头的输入，为当前 runtime 已注册的 backend slash commands 接管执行，并把真正的 session command 调用继续委托给 `OpenCodeService.runSessionCommand()`。project config 仍会参与 override语义判断，但单独存在于 `.opencode/opencode.json` 的 command 不会在 runtime 注册前被当作可执行命令；`.opencode/commands/**/*.md` markdown command 则在没有同名 runtime/project command 时展开为普通 prompt 发送。

这层 owner 当前只覆盖：

- 解析 `/command arguments` 形式的输入
- 识别 runtime `sdk.command.list()` 返回的普通 commands / skill commands，并在命令 ID 同时出现在 project config 时保留 override 语义
- 按插件设置 `slashCommandSkillMode` 决定 skill 是直接 `/skill args`，还是 `/skills skill args`
- 复用现有 foreground busy / server readiness gate
- 在普通 runtime/project command dispatch 前拦截未被 project/runtime command 覆盖的 `/compact`，调用 host 提供的 `runCompactSession()` 专用路径，而不是走 `session.command()`
- 从活动会话与 focus preview 收集 OpenCodian placeholder runtime context：
  - `vaultPath`
  - `currentNotePath`
  - `currentSelection`
  - `externalContextPaths`
  - `conversationTitle`
- 在 command 请求发出后启动现有 conversation sync loop，并触发一次 visible conversation background sync
- 对 markdown file command，跳过 `session.command()`，将 template（含简单 `$ARGUMENTS` / `$1` / `$UPPER_CASE` 占位展开，缺失值清空）交回 send pipeline 作为普通用户消息发送

它**仍不负责** slash autocomplete、hidden menu UI 或 command-owned hidden agent generation；这些分别留在 `ComposerInputShellCoordinator`、`slashCommandCatalog`/`SettingsCommandsSection` 与 `OpencodeConfigManager`。

## 公开接口

```ts
export interface SlashCommandExecutionHostDependencies { /* flat view deps */ }

export class SlashCommandExecutionService {
  tryRunSlashCommand(content: string): Promise<boolean>;
}
```

- 返回 `true`：当前输入已经被当作 slash command 消费（包括 ready/busy/error path）
- 返回 `false`：当前输入不属于已知 slash command，调用方继续走普通 chat send pipeline

> `createSlashCommandExecutionHost` 与 `executeCompactSession` 已提取到 `SlashCommandExecutionHostFactory.ts`。

## 关键行为

### command 识别

- 非 `/` 前缀输入（不包含行中 `/command`）直接返回 `false`
- `//` 与 `/ ` 这种非命令输入也直接放回普通消息路径
- **行首 `/command`**：原有行为不变，`trimmedContent.startsWith('/')` 路径
- **行中 `/command`**（空白后的 `/command`，例如 `"请帮我 /review src/app.ts"`）：`parseSlashCommandInput()` 使用全局正则匹配并取最后一个匹配项，提取 command 和 arguments；**行中命令现在始终 fall through 到 prompt 路径**（返回 `false`），不会作为 slash command 执行——前导文字的存在意味着用户意图是普通消息而非命令
- 行中匹配同时排除 `//`（例如 `"text //comment"` 不触发命令解析）
- 若行中 `/command` 不被 runtime catalog 认可，`tryRunSlashCommand` 返回 `false`，`SendPipelineRuntime` 将完整原始文本作为普通 prompt 发送（不丢失用户输入）
- **已知的 runtime skill 命令**（`source === 'skill'`）现在也会 fall through 到 prompt 展开路径，由 `SkillContentExpander` 处理，而不是直接作为 session command 执行；这确保 skill 内容通过 XML 展开而非命令调用
- runtime commands 统一使用 `sdk.command.list()` 判断
- project config 只用于识别“这个 runtime command 是否同时存在 project override”，不会让 runtime 未注册的 command 提前执行
- markdown command 只在 runtime command 不存在且 project config 没有同名 command 时接管；因此 `.opencode/commands/*.md` 不会覆盖 JSON/runtime command
- runtime catalog 会过滤掉 `source === 'mcp'` 的条目
- `slashCommandSkillMode === 'direct'` 时，runtime `source === 'skill'` 可以直接用 `/skill-id arguments` 执行
- `slashCommandSkillMode === 'skills-command'` 时，直接 `/skill-id` 不接管；只有 `/skills skill-id arguments` 会映射为真实 `session.command({ command: 'skill-id' })`
- 如果某个 runtime command 同时也有 project override，direct `/command` 仍按该 runtime command 执行，不会被 `/skills` 前缀规则错误降级
- `/compact` 是 OpenCode-only synthetic command：只在没有同名 project override 且 runtime catalog 未提供非内置条目时消费，先经过 server readiness 与当前 tab busy gate，再用当前 OpenCode session 调用 view host 的 manual compaction seam；无 active OpenCode session 或非 OpenCode backend 时显示专用 no-session notice
- `/undo`、`/redo`、`/new`、`/share`、`/unshare` 是额外的 synthetic builtin commands，与 `/compact` 共享同一条检测路径：只在没有同名 project override 且 runtime 未提供非内置条目时走插件内置逻辑
  - `/undo`：查找当前会话最后一条用户消息的 `sourceMessageId`，调用 `revertSession()` 撤销，成功后触发 background sync；无 conversation / 无 session / 非 opencode backend / 无 sourceMessageId 各路径均显示对应 notice 并提前返回
  - `/redo`：调用 `unrevertSession()` 重做，成功后触发 background sync；与 `/undo` 共享一致的 `!conversation` null guard、backend gate 和 error-catch notice 模式
  - `/new`：调用 `createNewConversation()` 创建新会话
  - `/share`：仅对 OpenCode conversation 调用 `shareSession()` 分享，成功后将 URL 复制到剪贴板；非 OpenCode backend 即使存在 `backendSessionId` 也显示 no-session notice 并提前返回
  - `/unshare`：仅对 OpenCode conversation 调用 `unshareSession()` 取消分享；非 OpenCode backend 即使存在 `backendSessionId` 也显示 no-session notice 并提前返回
- 所有 synthetic builtin 的 host 方法在 `SlashCommandExecutionHostFactory.createSlashCommandExecutionHost()` 工厂中从 `deps.openCodeService` 直接映射，不需要 `OpenCodianView` 提供额外辅助方法

### 执行前 gate

- 先复用现有 server readiness / badge refresh seam，保证任何需要 runtime catalog truth 的 slash command 场景都能拉起服务
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

### agent 提取改进

- `extractAgentFromArguments` 现在会剥离尾部标点符号（例如 `@reviewer,` → `reviewer`），避免用户在 agent mention 后加逗号时提取失败
- 同时会拒绝 email 格式的 token（例如 `user@example.com`），避免误将 email 地址识别为 agent mention

## 与发送 runtime 的边界

- `ComposerInputShellCoordinator` 仍只负责提交字符串
- `SendPipelineRuntime` 现在多了一条最前面的 slash interception seam：
  - 先问 `SlashCommandExecutionService.tryRunSlashCommand()`
  - 如果返回 `false`，再继续普通 `prepareMessageSend()` + streaming pipeline
- markdown command 会通过 `runMdFileCommandAsMessage()` 重新进入 send pipeline，并设置 skip-slash 标志避免 template 以 `/` 开头时再次递归拦截
- slash command 真正执行仍走 `OpenCodeService.runSessionCommand()` / `session.command`；执行后的 visible follow-up sync 复用 `ConversationSyncBridge.syncVisibleConversationInBackground()`，因此会优先从 canonical session graph 投影，canonical 缺失时才通过 server read 回填 canonical snapshot
- dispatch runtime/project command 前会用 `getConversationBackendSessionId()` 解析 session identity；没有 backend session id 时返回 command failure，不会创建 queued prompt 或误调用 OpenCode session command。
- **OpenCode-only synthetic command gates**: `/compact`、`/undo`、`/redo`、`/share` 与 `/unshare` 在 `backend !== 'opencode'` 时直接返回 no-session notice。compact / summarize、revert / unrevert 与 share / unshare writes 目前仍是 OpenCode-only 能力，Claude 等 backend 暂不提供稳定支持。
- `/compact` 不属于普通 slash command runtime：`SlashCommandExecutionHostFactory.executeCompactSession()` 负责 provider/model resolution、start/success/failure notice 和 `OpenCodeService.summarizeSession(sessionId, providerID, modelID, false)` 调用，view host 只传入当前 model resolver 与 service 引用
- `session.command` 的返回值不在这层另起一套本地 projector：正常情况下后续 sync event 已写入 canonical graph；如果 command 刚返回但 sync event 尚未投影，visible follow-up sync 会按 canonical-miss fallback 做一次 server gap recovery
- `OpenCodianView` 只负责提供扁平依赖，不持有 slash command host 装配逻辑；host 回调装配由 `SlashCommandExecutionHostFactory.createSlashCommandExecutionHost()` 工厂函数完成，view 只传递原始 service 引用和简单 lambda
- synthetic builtin commands 的 host seam 保持扁平：`/compact` 通过 `deps.runCompactSession` 进入 `executeCompactSession()`，`/undo`、`/redo`、`/share`、`/unshare` 与 `/new` 分别从 `deps.openCodeService` 和 `deps.createNewConversation` 映射，不经过 view 层新增方法
