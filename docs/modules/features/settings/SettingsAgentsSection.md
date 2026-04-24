# SettingsAgentsSection

> **源码**: `src/features/settings/SettingsAgentsSection.ts`
> **状态**: [REVIEW]

## 概述

`SettingsAgentsSection` 是 settings/agents 分区的 owner。它负责加载当前 OpenCode 运行时返回的 built-in / project agent 目录，并与当前 vault 的 `.opencode/opencode.json` 中的 project agent 覆盖合并展示，同时承接项目级 agent 的核心字段编辑器。

当前实现覆盖了 Agents settings 的项目级配置范围：

- 读取 runtime agent 目录与 `OpencodeConfigManager.getAgentConfig()`
- 用 `OpencodeConfigManager.getDefaultAgent()` 初始化默认主代理下拉框
- 通过 `updateDefaultAgent()` 写回项目级 `default_agent`
- 为 `mode: 'subagent'` 的条目提供基础 `@` 菜单可见性开关
- 通过 `upsertAgentConfig()` / `removeAgentConfig()` 写回或清理 `agent.<id>.hidden`
- 提供项目 agent 编辑器，支持 create/edit/delete 以下核心字段：
  - `mode`
  - `disable`
  - `description`
  - `prompt`
  - `model`
  - `temperature`
  - `top_p`
  - `steps`
  - `color`
  - `permission.task` allowlist
  - `options`

commands/slash runtime 与 command-owned hidden-agent flows 不属于本 owner；它们分别由 command config、Commands settings 和 chat runtime seams 维护。

## 核心逻辑

### runtime + project catalog 合并

owner 会并行读取：

- `openCodeService.sdk.app.agents()`：当前 runtime scope 下的 agent 目录，包含 OpenCode built-in agent 与 runtime 已识别的 project agent
- `OpencodeConfigManager.getAgentConfig()`：当前 vault 的项目配置 agent map，兼容 native `agent` 与 deprecated `mode`
- `OpencodeConfigManager.getDefaultAgent()`：项目级默认主代理

合并时优先用 project 配置里的 `description` / `mode` 覆盖 runtime 元数据，并保留 runtime-only、runtime+project-override、project-only 三类条目。`default_agent` 下拉只列出 `primary` / `all` 且未 `disable` 的条目；如果当前配置值已不在可选列表中，会保留一个 unavailable 选项，避免静默丢失现有配置。

### subagent visibility 写回

当前 slice 只处理 OpenCode 原生 `hidden` 字段的基础路径：

- UI 开关采用正向语义：`true` 表示“在 `@` 菜单中显示”，`false` 表示“从 `@` 菜单隐藏”
- 用户关闭可见性时会写入 `agent.<id>.hidden = true`
- 用户重新开启可见性时，如果 project override 只剩 `hidden` 字段，则删除该 agent override
- 用户重新开启可见性时，如果 project override 还有其他字段，则删除 `hidden` 后通过 `upsertAgentConfig()` 保留其余配置

这条路径只对 `mode: 'subagent'` 且未 `disable` 的条目开放，因为 OpenCode 的 `hidden` 语义主要用于子代理 `@` 菜单可见性。

### agent catalog shell height

- agent 目录 block body 现在额外挂 `opencodian-agent-catalog-scroll`
- 目录区使用最大高度 + 内部滚动，避免大量代理把整个 settings 页拉得过长
- 这一层只负责 catalog 可滚动外壳，不改变 runtime/project agent merge 语义

### 项目 agent 核心字段编辑器 / disable / task allowlist 写回

owner 现在在同一分区内提供一个 project agent editor：

- 上方 dropdown 只列出当前 vault 已存在的 project agent override；选择后会把当前配置加载到表单
- 未选择已有条目时，表单处于“新建 project agent”状态
- 保存时统一走 `OpencodeConfigManager.upsertAgentConfig()`，因此会保留该 agent 既有的未知字段，同时允许通过 `undefined` patch 清理已清空的核心字段与 `disable`
- 删除时统一走 `removeAgentConfig()`，只删除当前 project override，不会影响 runtime built-in catalog
- 所有写回都局限在当前 vault 的 `.opencode/opencode.json`
- `disable` 打开后会写入 `agent.<id>.disable = true`；关闭时改写成 `undefined` patch，让 `OpencodeConfigManager` 清理该字段，同时继续保留其他 project override 字段
- `permission.task` textarea 每行接收一个允许的子代理 ID 或 glob；保存时会写成 `permission.task = { '*': 'deny', ...allowRules }`
- 如果已有 agent 使用字符串形式的 `permission` 简写，首次编辑 allowlist 时会提升为 object，并保留原本的 `'*'` 行为再追加 `task`
- 如果只清空 allowlist，则 owner 只清理 `permission.task`，继续保留该 agent 其他 `permission` 键
- `options` 通过 raw JSON textarea 编辑；留空会清理 `agent.<id>.options`，非空时必须是 JSON object
- 保存 `options` 时，editor 会基于当前 project override 构造替换型 object patch，这样删除过的嵌套 key 不会被 `upsertAgentConfig()` 的递归 merge 悄悄保留下来

具体表单实现现已下沉到 companion owner `SettingsProjectAgentEditor`，避免 catalog owner 继续扩张。

数值字段目前按 OpenCode 原生语义写入普通 number：

- `temperature`
- `top_p`
- `steps`

如果输入不是合法数字，owner 会阻止保存并提示用户修正。

## 关键方法

| 方法 | 说明 |
|------|------|
| `attach()` | 挂载 Agents section，创建默认主代理下拉与 agent 目录容器，并启动首次异步刷新 |
| `dispose()` | 递增 refresh run id，防止旧异步加载结果回写已重建的设置页 |
| `renderProjectAgentEditor()` | 渲染项目 agent 选择器与核心字段编辑表单 |
| `saveProjectAgentFromEditor()` | 归一化表单值并写回 project `agent.<id>` |
| `deleteSelectedProjectAgent()` | 删除当前选中的 project agent override |

## 与其他模块的交互

- `OpenCodianSettings.ts`: 创建并挂载本 owner，把 Agents section 从主设置页中独立出来
- `OpenCodeService`: 通过 SDK facade 的 `app.agents()` 读取 runtime agent 目录
- `OpencodeConfigManager`: 读取 / 写回 project `agent`、legacy `mode` import、`default_agent`
- `SettingsProjectAgentEditor.ts`: 负责 project agent 核心字段表单、保存 / 删除 action 与 notice
- `projectAgentEditorConfig.ts`: 为 project agent editor 提供字段归一化与 delete-aware patch helper
- `core/types/opencodeConfig.ts`: 提供 `OpencodeAgentConfig` / `OpencodeAgentMode` 类型
- `i18n/locales/*`: 提供 Agents section 标题、目录来源、mode、状态与错误文案

## 注意事项

- 不要在 `OpenCodianView.ts` 或 `OpenCodeService.ts` 中追加 Agents settings ownership；设置页写回应继续留在本 owner 与 `OpencodeConfigManager` seam 内。
- 当前 owner 只写项目级 `.opencode/opencode.json`，不要读写全局 OpenCode 配置。
- 表单当前已覆盖 project agent 核心字段、`permission.task` allowlist 与 `options`；commands/slash runtime 应保持在相邻 command-specific owner，而不是把逻辑塞回 `OpenCodianSettings.ts`。
