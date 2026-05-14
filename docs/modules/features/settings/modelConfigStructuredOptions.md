# modelConfigStructuredOptions

> **源码**: `src/features/settings/modelConfigStructuredOptions.ts`
> **状态**: [REVIEW]

## 概述

`modelConfigStructuredOptions.ts` 是模型可视化配置里的纯数据 helper。它不渲染 DOM，也不写 `.opencode` 文件；只负责在结构化控件和现有 `models.<id>.options` key/value 表单之间同步数据。

这个 owner 的目标是让常见 OpenCode / provider 选项更容易配置，同时保留原始 key/value escape hatch：

- `reasoningEffort`
- `textVerbosity`
- `reasoningSummary`
- `include`
- `thinking.type`
- `thinking.budgetTokens`

## 核心逻辑

结构化控件读取和写回的仍是 `KeyValueFieldState[]`：

- `getStructuredModelOptionsState()` 从 key/value 列表提取结构化显示状态
- `setStructuredModelOption()` 更新字符串选项
- `setStructuredStringArrayOption()` 把逗号或换行分隔值写成 JSON string array
- `setStructuredThinkingType()` / `setStructuredThinkingBudget()` 共同维护同一个 `thinking` JSON object

当结构化值被清空时，对应 key 会从 key/value 列表移除。这样 JSON preview 和最终保存仍继续走 `modelConfigWorkspace.ts` / `modelConfigSavePlan.ts` 的既有路径。

## 与其他模块的交互

- `ModelConfigModelListEditor.ts`: 渲染结构化控件，并把变更写回 `model.options`
- `modelConfigWorkspace.ts`: 继续负责 preview 序列化，不需要知道控件来源
- `modelConfigSavePlan.ts`: 继续负责最终 `.opencode` 保存

## 注意事项

- 不要在这里加入 provider 发送语义或 SDK/legacy transport 判断；这里仅处理配置表单状态。
- 新增结构化字段时，必须保持原始 key/value 列表可见且可覆盖未知字段。
