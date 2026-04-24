# slashCommandCatalog

> **源码**: `src/core/config/slashCommandCatalog.ts`
> **状态**: [REVIEW]

## 概述

`slashCommandCatalog.ts` 是 commands item 6 新抽出的共享 helper owner。它把 settings/catalog 与 chat/slash menu 都会复用的 slash command 合并规则收口到同一处，避免 `SettingsCommandsSection` 与输入区 autocomplete 再各自维护一套 runtime+project merge 逻辑；同时把“settings 可见的 merged catalog”与“chat 真正可执行的 runtime-backed menu projection”明确分开。

它负责：

- 过滤 runtime `source === 'mcp'` 的条目，同时保留 `source === 'skill'` 供 direct 或 `/skills` 模式使用
- 合并 runtime slash command 与 project `.opencode/opencode.json` `command` map
- 从 command-owned hidden agent 中回填 `temperature` / `top_p` 与 base agent
- 标记 catalog/menu item 的 `source: 'command' | 'skill' | 'project'`
- 对 runtime skill 额外根据 `app.skills()` 返回的 `location` 推导来源标签（project / OpenCode project / plugin / global / custom）
- 标记 `hiddenSlashCommands` 驱动的 menu hidden 状态
- 为 chat-side slash autocomplete 导出只包含可见条目的轻量 menu item 列表

## 公开导出

```ts
export interface SlashCommandCatalogEntry { ... }
export interface SlashCommandMenuItem { ... }
export interface MergeSlashCommandCatalogOptions { ... }

export function isCatalogRuntimeCommand(command: RuntimeCommand): boolean;
export function mergeSlashCommandCatalog(
  options: MergeSlashCommandCatalogOptions,
): SlashCommandCatalogEntry[];
export function buildVisibleSlashCommandMenuItems(
  catalog: SlashCommandCatalogEntry[],
): SlashCommandMenuItem[];
```

## 关键行为

### 共享合并规则

- project 字段继续覆盖 runtime `template` / `description` / `agent` / `model` / `subtask`
- `command.agent === opencodian-command:<id>` 时，会尝试从对应 hidden agent `options.opencodianCommand.baseAgent` 回填 editor/menu 看到的 agent，而不是泄露内部 agent id
- runtime 不存在、但 project config 存在的命令会保留为 `runtimeAvailable: false`，供 settings/catalog/editor 继续显示
- runtime skill 会保留为 `source: 'skill'`，后续由 chat/menu 层按用户设置决定显示成 `/skill` 还是 `/skills skill`
- runtime skill 若能从 `location` 识别出 plugin cache、project `.claude/.agents`、project `.opencode` 等路径，会把结果写入 `skillSource`，供聊天输入区渲染多语言来源说明；识别失败时回落到 `custom`

### menu 可见性投影

- `mergeSlashCommandCatalog()` 保留 `hidden` 状态，供 settings/catalog shell 继续显示 visible toggle
- `buildVisibleSlashCommandMenuItems()` 再只投影 chat slash menu 真正需要的 `id` / `description` / `runtimeAvailable` / `hasProjectOverride` / `source` / `skillSource` / `subtask`
- 这一步会额外丢弃 `runtimeAvailable: false` 的 project-only 条目，避免 autocomplete 提前暴露 runtime 尚未注册的命令
- 因此 `hiddenSlashCommands` 只影响 autocomplete/menu 可见性，不影响 command config 本身；project-only command 仍然只留在 settings catalog

## 使用方

- `src/features/settings/SettingsCommandsSection.ts`: 复用共享 merge 逻辑渲染 settings catalog + editor source
- `src/features/chat/OpenCodianView.ts`: 在 composer host seam 中读取 merged catalog，并交给 `ComposerInputShellCoordinator` 做 slash autocomplete menu

## 注意事项

- 不要把这层合并规则重新复制回 `SettingsCommandsSection`、`ComposerInputShellCoordinator` 或 `OpenCodeService`
- 这里只负责 catalog merge / menu 投影，不接管 runtime placeholder expansion 或 `runSessionCommand()` 执行
