# SettingsProjectAgentEditor

> **源码**: `src/features/settings/SettingsProjectAgentEditor.ts`
> **状态**: [REVIEW]

## 概述

`SettingsProjectAgentEditor` 是 `SettingsAgentsSection` 下拆出的 companion owner，专门负责项目级 agent 核心字段表单。它把 project agent 的 create/edit/delete 写回、表单回填、数值解析与错误提示从 agent catalog owner 中分离出来，避免 `SettingsAgentsSection.ts` 继续膨胀。

当前覆盖的字段范围限定在 ordered item 5 的核心字段：

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

commands/slash runtime 仍留在后续 slice。

## 核心逻辑

### project agent 选择与表单回填

- dropdown 只列出当前 vault 的 project agent override
- 选择已有条目后，会把当前 `agent.<id>` 的核心字段回填到表单
- 未选择条目时，表单保持“新建 project agent”状态

### 保存与删除

- 保存统一走 `OpencodeConfigManager.upsertAgentConfig()`
- 删除统一走 `OpencodeConfigManager.removeAgentConfig()`
- 保存成功或删除成功后，调用上层传入的 `onConfigChanged()`，让 `SettingsAgentsSection` 重新刷新 default dropdown、catalog 和 editor 本身

### 字段归一化

- 空字符串会转换成 `undefined`，用于清理已移除的核心字段
- `disable` 用布尔 toggle 表达；打开时写入 `true`，关闭时写入 `undefined` 以便仅清理该字段而不影响其他 override
- `temperature`、`top_p`、`steps` 会解析为 number；如果不是合法数字，会中断保存并显示 notice
- `permission.task` allowlist 用多行 textarea 表达；每行一个子代理 ID 或 glob pattern，保存时会写成 `{'*': 'deny', <pattern>: 'allow'}` 形式的显式 allowlist
- 读取已有 agent 时，只从 `permission.task` object 中提取值为 `allow` 的条目回填到 textarea；未改动该字段时不会覆盖原有 `permission` 配置
- 如果原始 `permission` 是字符串简写（如 `ask`），首次编辑 allowlist 时会先提升为 object，再附加 `task` 规则
- `options` 用 raw JSON textarea 表达；留空会清理 `agent.<id>.options`，非空时必须是 JSON object
- 读取已有 `options` 时会格式化成缩进 JSON 回填；保存时会按当前 textarea 内容构造“替换型 patch”，让已删除的嵌套键也能从项目 override 中真正移除
- 未触碰的未知字段由 `OpencodeConfigManager.upsertAgentConfig()` 的 merge 行为保留

## 关键方法

| 方法 | 说明 |
|------|------|
| `render()` | 渲染 project agent picker、字段表单与 save/delete action |
| `saveProjectAgentFromEditor()` | 归一化表单值并写回 project agent override |
| `deleteSelectedProjectAgent()` | 删除当前选中的 project agent override |

## 与其他模块的交互

- `projectAgentEditorConfig.ts`: 提供表单归一化、`permission.task` allowlist patch 与 `options` JSON 替换型 patch helper
- `SettingsAgentsSection`: 提供 editor 挂载点、当前 project agent map 与刷新回调
- `OpencodeConfigManager`: 执行 project `agent.<id>` 的 upsert/remove
- `i18n/locales/*`: 提供 editor 字段、按钮与错误提示文案

## 注意事项

- 只写当前 vault 的 `.opencode/opencode.json`；不要扩展到全局 OpenCode 配置。
- 这是 `SettingsAgentsSection` 的 companion owner，不应接管 runtime agent catalog 或 default primary-agent dropdown。
- 后续如果继续补 command-owned hidden agent 或 slash runtime 逻辑，优先继续沿这个 owner/section seam 扩展，而不是把表单逻辑塞回 `OpenCodianSettings.ts`。
