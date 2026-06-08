# SettingsProjectCommandEditor

> **源码**: `src/features/settings/SettingsProjectCommandEditor.ts`
> **状态**: [REVIEW]

## 概述

`SettingsProjectCommandEditor` 是 `SettingsCommandsSection` 下拆出的 companion owner，专门负责项目级 slash command 核心字段表单。它把 project command 的 create/edit/delete、表单回填与 notice/error 处理从 catalog owner 中分离出来，避免 `SettingsCommandsSection.ts` 因命令表单语义继续膨胀。

这个 editor 覆盖 Commands settings 中的 project slash command 表单范围：

- 选择 runtime command / runtime+project override / project-only command，或创建新的 project command
- 编辑 `command.<id>` 的 `template`、`description`、`agent`、`model`、`temperature`、`top_p`、`subtask`
- 在 `template` 字段旁展示 OpenCodian 支持的 placeholder token reference
- 保存到当前 vault 的 `.opencode/opencode.json`
- 删除当前已存在的 project command override

保存/删除后由上层刷新 editor 时，`render()` 会在清空本地表单容器前锁定当前高度并记录 `scrollTop`，重绘后立即恢复滚动、下一帧释放高度，避免长 command 表单局部闪动。`template` 作为唯一的长 textarea 还会通过 `TextareaSizeMemory` 以 `project-command-template` 为稳定 key 记住用户拉伸后的高度。

## 核心逻辑

### 表单回填

- runtime/project catalog 由上层 `SettingsCommandsSection` 先合并，再把当前可编辑 command 列表传给 editor
- 选中 runtime command 时，editor 会直接用合并后的 `template` / `description` / `agent` / `model` / `temperature` / `top_p` / `subtask` 回填，因此 built-in slash command 也能直接生成 project override
- 如果上层当前把 skill 暴露成 `/skills <skill>` 模式，editor dropdown 也会沿用这个 label，而不是继续假装它是直接 `/<skill>` 命令
- 选中 project-only command 时，editor 会回填当前 project config 里的值
- 如果当前 project command 的 `agent` 实际上是 command-owned hidden agent，editor 会显示该 hidden agent 对应的 base agent，而不会把内部 agent ID 暴露给用户
- 选择“新建项目命令”时，editor 重置为空白状态，并重新允许编辑 ID

### 保存路径

- 保存统一走 `OpencodeConfigManager.upsertCommandConfig()`
- `commandId` 不能为空；`template` 不能为空，否则立即给出 `Notice`
- `description` / `agent` / `model` 会做 trim，空字符串转成 `undefined`
- `temperature` / `top_p` 会解析为可选数字；非法输入会立即给出 `Notice`
- `subtask` 会明确写回布尔值，让 project command 能表达“强制作为子任务运行”或显式关闭该行为
- 命令级 sampling 不会直接保留在 native `command` schema 里，而是委托 manager 生成 / 清理 hidden agent；设置文案则把这件事解释成“后台隐藏辅助代理”，避免把内部 agent ID 暴露给用户
- 未触碰的未知字段由 `OpencodeConfigManager.upsertCommandConfig()` 的 merge 行为保留

### placeholder reference

- editor 会在 `template` textarea 下方渲染 OpenCodian placeholder reference，而不会在保存时改写 template 文本
- 当前展示的 token 是 `{{vault_path}}`、`{{current_note_path}}`、`{{current_selection}}`、`{{external_context_paths}}`、`{{conversation_title}}`
- 这只是 settings/editor 层面的说明壳层，实际运行时展开与 slash command execution 分别由 `OpenCodeSessionControlOrchestrator` 与 `SlashCommandExecutionService` 处理

### textarea 尺寸记忆

- `render()` 开始时会先调用 `dispose()`，释放上一轮表单持有的 textarea resize observer
- `template` textarea 使用 `TextareaSizeMemory.attach(text.inputEl, 'project-command-template')`
- 因此在切换命令、刷新 catalog 或关闭再打开设置页后，用户上次拉伸出的高度仍会恢复

### 删除路径

- 删除统一走 `OpencodeConfigManager.removeCommandConfig()`
- 只有当前选中的 command 在 project `command` map 中存在时，删除按钮才可用
- 删除成功后，通过上层传入的 `onConfigChanged()` 触发 section 重新刷新 catalog 和 editor

## 关键方法

| 方法 | 说明 |
|------|------|
| `dispose()` | 销毁当前 editor 持有的 textarea size-memory observer |
| `render()` | 渲染 command 选择器、核心字段表单（含 sampling）和保存 / 删除动作 |
| `renderPlaceholderReference()` | 在 template 字段附近渲染支持的 OpenCodian placeholder token 列表 |
| `createProjectCommandEditorState()` | 根据当前选中的 command 生成 editor state |
| `buildProjectCommandPatch()` | 把 editor state 归一化成 `OpencodeCommandConfig` patch，并校验必填 `template` |
| `saveProjectCommandFromEditor()` | 执行保存、notice 提示与刷新回调 |
| `deleteSelectedProjectCommand()` | 删除当前 project command override 并触发刷新 |

## 与其他模块的交互

- `SettingsCommandsSection.ts`: 提供 editor 挂载点、当前 merged command 列表、project command map 与刷新回调
- `OpencodeConfigManager`: 执行 project `command.<id>` 的 upsert/remove
- `TextareaSizeMemory.ts`: 为 `template` textarea 提供高度恢复与 `ResizeObserver` 持久化
- `i18n/locales/*`: 提供 editor 标题、字段名、按钮与 notice 文案
- `obsidian` `Setting` / `Notice`: 渲染设置表单并给出交互反馈

## 注意事项

- 这是 `SettingsCommandsSection` 的 companion owner，不应接管 slash catalog merge 或 `hiddenSlashCommands` 可见性写回
- `render()` 会在每次重建前调用 `dispose()`；如果新增其他多行输入，必须继续沿用同样的清理约束，避免叠加 observer
- 当前 editor 不负责 placeholder runtime expansion、slash autocomplete 或 `runSessionCommand()`；它只把命令级 sampling patch 交给现有 config seam
- 如果以后为 command 增加更多本地表单字段，优先继续沿这个 owner 扩展，而不是把表单逻辑塞回 `SettingsCommandsSection.ts`
