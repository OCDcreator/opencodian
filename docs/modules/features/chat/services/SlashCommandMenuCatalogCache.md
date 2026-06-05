# SlashCommandMenuCatalogCache

> **源码**: `src/features/chat/services/SlashCommandMenuCatalogCache.ts`
> **状态**: [REVIEW]

## 概述

`SlashCommandMenuCatalogCache` 是 chat composer suggestion catalog 的加载缓存。它把较慢的 runtime `sdk.command.list()`、`sdk.app.skills()`、Claude runtime commands、project command 配置、`.opencode/commands/**/*.md` markdown command 文件和 command-owned hidden agent 配置合并成 chat 侧 `SlashCommandMenuItem[]`，同时把同一 `sdk.app.skills()` 调用侧带的 runtime `app.agents()` 与 project agent config 投影成 composer agent sidecar。

project-only command 仍会参与 merge 以提供 override/source 信息，但不会进入最终 slash autocomplete 列表，直到 runtime 真正暴露该命令。`@agent` 候选通过 `AgentMentionCandidateService.projectCandidates()` 对齐上游过滤规则，只暴露 `subagent` / `all` 且非 hidden 的 agent；主 Agent selector 候选通过 `defaultCandidates()` 暴露 `primary` / `all` 且非 hidden / disabled 的 agent。

## 核心行为

- `load()` 返回当前 hidden-command key 下的缓存结果；缓存仍新鲜时不再触发 runtime 请求。
- host 可选提供 `loadClaudeRuntimeCommands?()`；`startLoad()` 会把它和 OpenCode runtime/project/skill/agent/md command 加载并行执行，并把结果作为 `claudeRuntimeCommands` 传给 `mergeSlashCommandCatalog()`。
- 缓存 TTL 目前是 `120s`；如果没有主动失效，超时前重复打开 `/` 会继续复用同一份 merged catalog。
- 如果后台预热仍在进行，用户触发的 `load()` 会复用同一个 pending promise，不会再发第二次 `sdk.command.list()`。
- `load()` 返回的 slash item array 会携带不可枚举的 agent-candidate promise；`ComposerInputShellCoordinator` 在 `@agent` 查询时会重新调用 host `loadSlashCommandMenuItems()` 并通过 `loadAgentMentionCandidatesFromSlashCommandMenuItems()` 读取 subagent 候选，在主 Agent 下拉框打开时也会重新读取 shared catalog sidecar。这样 composer 自己的上次 items 不会绕过 view 层 cache invalidation，同时仍不要求 `OpenCodianView` 新增单独 runtime agent seam。
- hidden command 列表会进入 cache key；设置里隐藏/显示命令后，下一次加载会重新合并 catalog。
- **Backend-aware cache key**: host 可选提供 `getBackendKey?()` 返回后端标识符（如 `'opencode'` 或 `'claude-code'`）；该标识符会与 hidden-command key 合并生成最终 cache key，确保不同后端的菜单结果不会互相泄露。后端切换后 cache 自然失效。
- **Backend isolation**: 当 Claude Code 为活跃后端时，host 的 OpenCode 加载方法（`loadRuntimeCommands`、`loadRuntimeSkills`、`loadProjectCommands`、`loadProjectAgents`）应返回空值；只有 `loadClaudeRuntimeCommands` 提供数据。这确保 Claude slash menu 只包含 Claude runtime commands，不会混入 OpenCode 命令/技能。
- **Claude backend skips `.opencode/commands/*.md`**: `startLoad()` 在 Claude backend 下跳过 md-file command 加载，因为 `.opencode/commands` 是 OpenCode 专属的命令格式。
- **Claude backend skips synthetic builtins**: `appendSyntheticBuiltinCommands()` 只在 OpenCode backend 下追加（`/compact`、`/undo`、`/redo`、`/new`、`/share`、`/unshare`）。Claude backend 下这些条目不追加，因为它们是 OpenCode 运行时能力而非 Claude 能力。
- **Backend-aware agent sidecar**: host 可选提供 `loadClaudeRuntimeAgents?()` 返回 Claude 运行时代理列表。Claude backend 下 agent mention/selection 候选只使用 `loadClaudeRuntimeAgents()` 的结果（不使用 OpenCode runtime agents 或 project agents）；OpenCode backend 下继续使用 `getAttachedOpenCodeAppAgents` + `AgentMentionCandidateService` 管道。这确保 `@agent` 菜单不会在后端间混入代理。
- `runtimeAvailable: false` 的 project-only command 不会进入最终 menu items；它们只保留在 settings/catalog 层。
- 当 host 提供 Claude runtime commands 时，cache 可生成 `source: "claude-runtime"` 的 menu entries，让 Claude Code active backend 也能显示自己的 `/` command catalog。
- runtime `source === 'skill'` 会进入缓存；后续由 `slashCommandMenuFilter.ts` 按 `slashCommandSkillMode` 决定直显或 `/skills` 前缀。
- `.opencode/commands/**/*.md` 会通过 host seam 读入并作为 `source: "md-command"` 合并；同名 runtime/project command 优先，markdown command 不覆盖已有 command truth。
- 如果某个 runtime skill 出现在 `sdk.app.skills()` 里、但当前 `sdk.command.list()` 没返回同名条目，cache 会补一条 synthetic `source: "skill"` menu item。这样 `/skills` 前缀模式仍然能继续展开 skill 二级候选，composer 高亮也能把 `/skills skill-name` 识别成已知 skill，而不是出现只有 `/skills` 根项、没有后续候选的断链状态。
- cache 会额外注入 synthetic builtin command menu items（`/compact`、`/undo`、`/redo`、`/new`、`/share`、`/unshare`），除非同名 runtime/project entry 已存在或被 hidden commands 隐藏；实际执行由 `SlashCommandExecutionService` 的专用路径处理，不走普通 `session.command()`
- `appendSyntheticBuiltinCommands()` 现已导出，供 `SettingsCommandsSection` 在设置 catalog 中同步显示这些合成命令，确保设置页与聊天菜单的可见性一致；合成条目标记 `isBuiltin: true` 以区别于用户自定义命令
- `sdk.app.skills()` 失败时不会让整个 slash menu 失败；cache 会回退到“只有 command/source 没有 provenance”的 catalog，保证 `/` 菜单仍可用。
- `sdk.app.agents()` sidecar 失败时只会让 `@agent` / 主 Agent selector 候选为空，不会破坏 slash menu 加载。
- runtime skill 的 `location` 会在 cache 内转换成 `skillSource`，供 UI 按当前语言显示“项目 / OpenCode 项目 / 插件：xxx / 全局 / 自定义路径”等来源说明。
- `warm()` 只做后台预热；失败时通过 `onWarmLoadFailed()` 交给调用方 debug log，不把错误固化到缓存里。
- `invalidate()` 清理缓存与 pending 引用，用于 view close 或需要强制刷新时。
- 从当前实现开始，插件入口会在两类场景主动触发失效：`saveSettings()` 完成后，以及 OpenCode server status 重新进入 `running` 时。后者会额外请求 view 侧重新 `warm()`，尽快把 slash 目录和最新 runtime 对齐。

## 关联模块

- `OpenCodianView.ts`: 创建本 cache，view 打开后延迟预热，并把 `load()` 暴露给 `ComposerInputShellCoordinator` host seam。
- `ClaudeCodeAdapter.ts`: 通过 view/cache host 的 `loadClaudeRuntimeCommands()` 提供 sanitized Claude runtime commands，最终合并为 `claude-runtime` slash menu items；通过 `loadClaudeRuntimeAgents()` 提供 Claude runtime agents 给 `@agent` mention 候选。
- `ComposerInputShellCoordinator.ts`: 负责 slash / `@agent` menu 与主 Agent selector 状态 / DOM 编排；不直接知道 runtime/project catalog 如何加载。
- `core/config/slashCommandCatalog.ts`: 提供 runtime/project command 合并与 visible menu projection。
- `CommandMdFileLoader.ts`: 读取 project `.opencode/commands/**/*.md` commands，供本 cache 合并进 autocomplete。
- `AgentMentionCandidateService.ts`: 提供 runtime/project agent 聚合、`@agent` picker projection 和 default-eligible primary agent projection。
- `OpenCodeSdkFacade.ts`: 在 `app.skills()` 结果上携带同一 app namespace 的 `app.agents()` sidecar，避免为了 composer agent 候选加厚 view host。

## 注意事项

- 不要在输入每个字符时绕过 view 层 cache 直接调用 `sdk.command.list()`；composer 可以重新请求 host catalog，但 host 必须继续走本 cache，让 hidden command key、TTL、pending promise 和 warm preload 语义保持集中。
- 不要把 `@agent` 候选回退成纯文本解析；composer 只使用 selected mention 形成 `SurfaceInvocationIntent.mentions`，主 Agent 下拉框只形成 `SurfaceInvocationIntent.primaryAgent`。
- 如果后续 project command editor 需要即时刷新 chat menu，可调用 view 侧的 cache invalidation seam，而不是复制 catalog 合并逻辑。
