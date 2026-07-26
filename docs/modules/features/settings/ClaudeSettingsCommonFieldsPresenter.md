# ClaudeSettingsCommonFieldsPresenter

> **源码**: `src/features/settings/ClaudeSettingsCommonFieldsPresenter.ts`
> **状态**: [ACTIVE]

## 概述

配置 workbench 的九个 common settings 原生 DOM 控件 presenter。它不持有第二份 settings state：宿主提供当前 raw draft、只读状态、单 path edit 应用和诊断回调；presenter 只负责控件渲染、严格 JSON readback、typed parse 和 catalog 驱动的 change。

## 核心行为

- `render(root)` 按 `CLAUDE_SETTINGS_COMMON_FIELDS` 创建稳定的 `data-claude-config-field` 控件；`refresh()` 从同一 raw draft 反映值并在 read-only source 时禁用控件。
- 字符串、数字、布尔、string-array 和 string-record 使用对应控件/JSON 输入；空值表示 inherit/remove。任何 parse、kind、enum 或最小值失败都只报告 inline diagnostic，不改 draft。
- change 通过 `buildClaudeSettingsCommonFieldEdit()` 产生一个局部 `JsoncPathEdit`，交由宿主应用；未知 sibling fields 和格式保留由宿主的 JSONC path-edit applier 负责。

## Durable owner 与边界

`SettingsClaudeConfigurationSection` 拥有唯一 raw draft、selection、revision 和 save lifecycle；`ClaudeSettingsSourceService` 拥有 strict-JSON persistence、CAS、archive/restore。presenter 不直接写文件，不宣称 Claude runtime 已应用；没有真实 probe 时 evidence 的 runtime 轴保持 `unavailable`。
