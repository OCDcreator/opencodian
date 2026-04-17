# SettingsProjectCommandEditor

> **源码**: `src/features/settings/SettingsProjectCommandEditor.ts`
> **状态**: [REVIEW]

## 概述

`SettingsProjectCommandEditor` 是 `SettingsCommandsSection` 下拆出的 companion owner，专门负责项目级 slash command 核心字段表单。它把 project command 的 create/edit/delete、表单回填与 notice/error 处理从 catalog owner 中分离出来，避免 `SettingsCommandsSection.ts` 因命令表单语义继续膨胀。

当前 editor 只覆盖 ordered plan item 6 的这一小段：

- 选择 runtime command / runtime+project override / project-only command，或创建新的 project command
- 编辑 `command.<id>` 的 `template`、`description`、`agent`、`model`、`subtask`
- 保存到当前 vault 的 `.opencode/opencode.json`
- 删除当前已存在的 project command override

placeholder preview、command-owned hidden agent 与 slash execution runtime 仍留给后续 slice。

## 核心逻辑

### 表单回填

- runtime/project catalog 由上层 `SettingsCommandsSection` 先合并，再把当前可编辑 command 列表传给 editor
- 选中 runtime command 时，editor 会直接用合并后的 `template` / `description` / `agent` / `model` / `subtask` 回填，因此 built-in slash command 也能直接生成 project override
- 选中 project-only command 时，editor 会回填当前 project config 里的值
- 选择“新建项目命令”时，editor 重置为空白状态，并重新允许编辑 ID

### 保存路径

- 保存统一走 `OpencodeConfigManager.upsertCommandConfig()`
- `commandId` 不能为空；`template` 不能为空，否则立即给出 `Notice`
- `description` / `agent` / `model` 会做 trim，空字符串转成 `undefined`
- `subtask` 会明确写回布尔值，让 project command 能表达“强制作为子任务运行”或显式关闭该行为
- 未触碰的未知字段由 `OpencodeConfigManager.upsertCommandConfig()` 的 merge 行为保留

### 删除路径

- 删除统一走 `OpencodeConfigManager.removeCommandConfig()`
- 只有当前选中的 command 在 project `command` map 中存在时，删除按钮才可用
- 删除成功后，通过上层传入的 `onConfigChanged()` 触发 section 重新刷新 catalog 和 editor

## 关键方法

| 方法 | 说明 |
|------|------|
| `render()` | 渲染 command 选择器、核心字段表单和保存 / 删除动作 |
| `createProjectCommandEditorState()` | 根据当前选中的 command 生成 editor state |
| `buildProjectCommandPatch()` | 把 editor state 归一化成 `OpencodeCommandConfig` patch，并校验必填 `template` |
| `saveProjectCommandFromEditor()` | 执行保存、notice 提示与刷新回调 |
| `deleteSelectedProjectCommand()` | 删除当前 project command override 并触发刷新 |

## 与其他模块的交互

- `SettingsCommandsSection.ts`: 提供 editor 挂载点、当前 merged command 列表、project command map 与刷新回调
- `OpencodeConfigManager`: 执行 project `command.<id>` 的 upsert/remove
- `i18n/locales/*`: 提供 editor 标题、字段名、按钮与 notice 文案
- `obsidian` `Setting` / `Notice`: 渲染设置表单并给出交互反馈

## 注意事项

- 这是 `SettingsCommandsSection` 的 companion owner，不应接管 slash catalog merge 或 `hiddenSlashCommands` 可见性写回。
- 当前 editor 只处理 project command 核心字段，不负责 placeholder preview、slash autocomplete 或 `runSessionCommand()`。
- 如果后续 slice 为 command 增加更多本地表单字段，优先继续沿这个 owner 扩展，而不是把表单逻辑塞回 `SettingsCommandsSection.ts`。
