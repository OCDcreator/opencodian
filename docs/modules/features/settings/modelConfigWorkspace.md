# Model Config Workspace Helpers

> **源码**: `src/features/settings/modelConfigWorkspace.ts`
> **状态**: [REVIEW]

## 概述

`modelConfigWorkspace.ts` 是模型配置可视化编辑器的表单状态工具层。它把 OpenCode provider/model config 转成设置 UI 可编辑的 provider/model form state，也负责把松散输入、extra options、variants、provider 接口格式和远程模型列表请求规范化。

## 导入关系

```text
上游: obsidian.requestUrl, src/core/types, src/i18n
下游: ModelConfigModal.ts, ModelConfigProviderEditor.ts, ModelConfigModelListEditor.ts, modelConfigModalState.ts, modelConfigSavePlan.ts, providerPresets.ts, 相关单元测试
```

## 核心类型 / 接口

| 导出 | 说明 |
|------|------|
| `ProviderInterfaceFormatId` / `ProviderInterfaceFormatOption` | provider SDK 接口格式与 UI 选项定义 |
| `KeyValueFieldState` | 表单中的 key-value 行状态 |
| `ModelFormState` / `ProviderFormState` | 可视化编辑器的模型 / provider 表单状态 |
| `HydratedWorkspaceState` | 从 config hydrate 后的完整 workspace |
| `FetchedProviderModelCandidate` | 远程抓取模型列表后的候选模型结构 |

## 核心逻辑

### Provider 接口格式解析

`PROVIDER_INTERFACE_FORMAT_OPTIONS` 固定维护 OpenAI Responses、OpenAI-compatible、Anthropic、Bedrock、Gemini 和 custom 格式。`resolveInterfaceFormatState()` 根据 provider `npm` 字段恢复 UI 状态；`resolveNpmForInterfaceFormat()` 反向生成保存用 `npm` 值。

### 表单 hydrate

`hydrateWorkspaceState()` 将 `OpencodeModelConfigSubset` 展开为：

- `modelValue`
- `smallModelValue`
- provider form 数组
- model form 数组
- options / variants / extra fields 的可编辑 key-value 行

### 保存前转换辅助

模块提供 `serializeUnknownValue()`、`parseLooseValue()`、`parseModelVariantValue()` 和 `assertModelExtraFieldKeyAllowed()`，用于把 UI 文本框中的松散值转换为保存计划可消费的类型，同时阻止保留字段被当作 extra field 写入。

### 远程模型列表

`fetchProviderModels()` 通过 Obsidian `requestUrl()` 请求 provider endpoint，`normalizeFetchedModelsFromResponse()` 将不同 response 形态收束为 `FetchedProviderModelCandidate[]`。

## 数据流

```text
.opencode/opencode.json
  → ModelConfigModal / modelConfigModalState
  → hydrateWorkspaceState()
  → ProviderFormState[] / ModelFormState[]
  → 编辑器组件修改表单状态
  → modelConfigSavePlan.ts 使用 helper 生成保存 patch
```

## 与其他模块的交互

- `ModelConfigModal.ts` 持有并协调 workspace state。
- `ModelConfigProviderEditor.ts` 和 `ModelConfigModelListEditor.ts` 消费表单类型与转换 helper。
- `providerPresets.ts` 复用 `ProviderFormState`、`ModelFormState` 与 `serializeUnknownValue()` 构建 preset 表单。
- `modelConfigWorkspace.test.ts` 和 `modelConfigSavePlan.test.ts` 覆盖 hydrate、parse、save-plan 相关行为。

## 配置项

无独立配置文件；它处理 OpenCode provider/model 配置以及 UI 文本输入。

## 注意事项

- 新增 provider interface format 时，要同步 `PROVIDER_INTERFACE_FORMAT_OPTIONS`、locale key、保存计划和 UI 说明。
- `uid` 只用于表单行稳定渲染，不应写回 OpenCode config。
- `parseLooseValue()` 会影响 extra options 与 variants 保存语义，修改时需同时跑 model config 相关测试。
