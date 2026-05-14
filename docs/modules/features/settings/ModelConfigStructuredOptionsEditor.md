# ModelConfigStructuredOptionsEditor

> **源码**: `src/features/settings/ModelConfigStructuredOptionsEditor.ts`
> **状态**: [REVIEW]

## 概述

`ModelConfigStructuredOptionsEditor` 是模型卡片展开区里的结构化 `models.<id>.options` 控件 owner。它负责渲染常见 OpenCode / provider 参数控件，并把变更同步回 `ModelFormState.options`。

它存在的原因是让 `ModelConfigModelListEditor.ts` 保持在模型列表 owner 的职责范围内，不继续膨胀成同时负责所有 options 控件细节的大文件。

## 核心逻辑

该 owner 渲染以下控件：

- `reasoningEffort`
- `textVerbosity`
- `reasoningSummary`
- `thinking.type`
- `thinking.budgetTokens`
- `include`

所有变更都通过 `modelConfigStructuredOptions.ts` 写回原始 key/value state。保存、preview、校验仍继续走既有 `modelConfigWorkspace.ts` 与 `modelConfigSavePlan.ts`。

## 与其他模块的交互

- `ModelConfigModelListEditor.ts`: 创建该 owner，并在展开模型卡片时调用 `render()`
- `modelConfigStructuredOptions.ts`: 提供纯数据同步 helper
- `ModelConfigProviderEditor.ts`: 仍提供共享 field primitive 和 preview/rerender callback

## 注意事项

- 不要在这里直接写 `.opencode` 或访问 service。
- 结构化控件不能取代原始 key/value `options` 编辑器；它只是常用字段入口。
