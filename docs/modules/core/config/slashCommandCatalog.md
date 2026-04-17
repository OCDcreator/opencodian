# slashCommandCatalog

> **源码**: `src/core/config/slashCommandCatalog.ts`
> **状态**: [REVIEW]

## 概述

`slashCommandCatalog.ts` 是 commands item 6 新抽出的共享 helper owner。它把 settings/catalog 与 chat/slash menu 都会复用的 slash command 合并规则收口到同一处，避免 `SettingsCommandsSection` 与输入区 autocomplete 再各自维护一套 runtime+project merge 逻辑。

它负责：

- 过滤 runtime `source === 'mcp' | 'skill'` 的条目
- 合并 runtime slash command 与 project `.opencode/opencode.json` `command` map
- 从 command-owned hidden agent 中回填 `temperature` / `top_p` 与 base agent
- 标记 `hiddenSlashCommands` 驱动的 menu hidden 状态
- 为 chat-side slash autocomplete 导出只包含可见条目的轻量 menu item 列表

## 公开导出

```ts
export interface SlashCommandCatalogEntry { ... }
export interface SlashCommandMenuItem { ... }

export function isCatalogRuntimeCommand(command: RuntimeCommand): boolean;
export function mergeSlashCommandCatalog(...): SlashCommandCatalogEntry[];
export function buildVisibleSlashCommandMenuItems(
  catalog: SlashCommandCatalogEntry[],
): SlashCommandMenuItem[];
```

## 关键行为

### 共享合并规则

- project 字段继续覆盖 runtime `template` / `description` / `agent` / `model` / `subtask`
- `command.agent === opencodian-command:<id>` 时，会尝试从对应 hidden agent `options.opencodianCommand.baseAgent` 回填 editor/menu 看到的 agent，而不是泄露内部 agent id
- runtime 不存在、但 project config 存在的命令会保留为 `runtimeAvailable: false`

### menu 可见性投影

- `mergeSlashCommandCatalog()` 保留 `hidden` 状态，供 settings/catalog shell 继续显示 visible toggle
- `buildVisibleSlashCommandMenuItems()` 再只投影 chat slash menu 真正需要的 `id` / `description` / `runtimeAvailable` / `hasProjectOverride` / `subtask`
- 因此 `hiddenSlashCommands` 只影响 autocomplete/menu 可见性，不影响 command config 本身

## 使用方

- `src/features/settings/SettingsCommandsSection.ts`: 复用共享 merge 逻辑渲染 settings catalog + editor source
- `src/features/chat/OpenCodianView.ts`: 在 composer host seam 中读取 merged catalog，并交给 `ComposerInputShellCoordinator` 做 slash autocomplete menu

## 注意事项

- 不要把这层合并规则重新复制回 `SettingsCommandsSection`、`ComposerInputShellCoordinator` 或 `OpenCodeService`
- 这里只负责 catalog merge / menu 投影，不接管 runtime placeholder expansion 或 `runSessionCommand()` 执行
