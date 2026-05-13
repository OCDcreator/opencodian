# projectAgentEditorConfig

> **源码**: `src/features/settings/projectAgentEditorConfig.ts`
> **状态**: [REVIEW]

## 概述

`projectAgentEditorConfig.ts` 是 `SettingsProjectAgentEditor` 的纯配置归一化 helper。它承接 project agent 表单里的值转换、JSON 解析、`permission.task` allowlist patch、`permission.skill` / `tools.skill` 覆盖 patch 和 `options` 替换型 patch，避免 editor owner 因字段语义继续膨胀。

## 核心逻辑

### 基础字段归一化

- `normalizeProjectAgentEditorMode()` 只接受 `primary` / `all` / `subagent`
- `optionalTrimmedText()` 把空字符串转换成 `undefined`
- `parseOptionalNumber()` 把非空数字字段转换成 number，并用调用方传入的错误文案抛错
- `stringifyConfigText()` / `stringifyConfigNumber()` 用于把已有 agent 配置回填成表单字符串

### permission.task allowlist

- `stringifyTaskAllowlist()` 只从 object 形式的 `permission.task` 中提取值为 `allow` 的非 `*` 条目
- `buildProjectAgentPermissionPatch()` 仅在 task allowlist 被编辑过时返回 patch
- allowlist 非空时写成 `{ '*': 'deny', <pattern>: 'allow' }`
- 清空 allowlist 时只清理 `permission.task`；如果原 permission 还有其他 key，会保留这些 key
- 如果原 permission 是字符串简写，会提升成 object 并把原简写放到 `'*'`

### skill 覆盖

- `stringifySkillPermission()` 从 `permission.skill` 读取 allow / ask / deny，其他形态回填为 inherit
- `stringifySkillToolMode()` 从 `tools.skill` 读取 enabled / disabled，缺失时回填为 inherit
- `buildProjectAgentPermissionPatch()` 现在同时支持 task allowlist 与 skill permission 两种 dirty bit；skill inherit 会写 `skill: undefined`，用于抵消 agent config 的递归 merge
- `buildProjectAgentToolsPatch()` 专门构造 `tools.skill` patch；inherit 会移除该 key，disabled 会写入 `false`

### options JSON

- `stringifyOptions()` 把已有 `options` object 格式化为缩进 JSON
- `parseProjectAgentOptionsJson()` 要求非空输入必须是 JSON object；空输入表示清理 `options`
- `buildProjectAgentOptionsPatch()` 只在 options textarea 被编辑过时返回 patch
- `buildObjectReplacementPatch()` 会为被删除的旧 key 写入 `undefined`，抵消 `OpencodeConfigManager.upsertAgentConfig()` 的递归 merge 行为，从而让 textarea 中的 object 成为新的完整 `options`

## 与其他模块的交互

- `SettingsProjectAgentEditor.ts`: 调用本 helper 构建 project agent patch、回填表单值与验证 options JSON
- `OpencodeConfigManager`: 消费 editor 传入的 patch，并通过 `undefined` 删除字段
- `core/types/opencodeConfig.ts`: 提供 `OpencodeAgentConfig` / `OpencodeAgentMode` / permission 类型

## 注意事项

- 本模块不直接读取或写入 `.opencode/opencode.json`；写回仍由 `SettingsProjectAgentEditor` 经 `OpencodeConfigManager` 完成。
- 不要把 UI rendering、Notice 或 settings section 刷新逻辑放进这里；这里应保持纯数据转换。
- `options` patch 语义是“替换 object”，不是“递增 merge”；新增 options 字段时要保留已删除 key 写入 `undefined` 的行为。
