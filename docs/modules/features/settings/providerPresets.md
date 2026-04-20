# Provider Presets

> **源码**: `src/features/settings/providerPresets.ts`
> **状态**: [REVIEW]

## 概述

`providerPresets.ts` 定义模型配置可视化编辑器中的 provider 预设库，并提供把预设转成 `ProviderFormState` 的转换函数。它让设置页可以一键添加 DeepSeek、Zhipu、Kimi、OpenRouter、Bedrock 等常见 provider 的基础配置和模型默认值。

## 导入关系

```text
上游: src/core/types, src/i18n, src/features/settings/modelConfigWorkspace
下游: ModelConfigModal.ts
```

## 核心类型 / 接口

| 导出 | 说明 |
|------|------|
| `ProviderPresetCategory` | 预设分组：官方、中国官方、聚合服务、云厂商、自定义 |
| `ProviderPreset` | 单个 provider 预设结构 |
| `PROVIDER_PRESET_CATEGORY_ORDER` | UI 展示排序 |
| `PROVIDER_PRESETS` | 内置预设列表 |
| `presetToFormState()` | 将预设转换为可编辑的 `ProviderFormState` |

## 核心逻辑

### 预设数据源

每个 preset 维护 provider id、名称、类别、图标、官网/API key URL、interface format、base URL、额外 options 和 models。模型条目可声明 name、context、output。

### 表单转换

`presetToFormState()` 会：

- 优先使用 locale key 覆盖 provider 显示名
- 构建 raw OpenCode provider config
- 为 preset models 生成 `ModelFormState[]`
- 将 extra options 转成 key-value 表单行
- 默认启用 provider 和 models，但不写入 API key

## 数据流

```text
PROVIDER_PRESETS
  → ModelConfigModal preset UI
  → presetToFormState()
  → ProviderFormState
  → modelConfigSavePlan.ts 生成保存 patch
```

## 与其他模块的交互

- `ModelConfigModal.ts` 使用 preset 列表提供添加 provider 的入口。
- `modelConfigWorkspace.ts` 提供共享 form state 类型与 `serializeUnknownValue()`。
- locale 文件为 `settings.model.presets.provider.*` 提供可选显示名。

## 配置项

内置常量，无用户独立配置文件。用户最终保存的是 OpenCode provider config。

## 注意事项

- 新增 preset 时要同步 provider id、locale、默认模型限制和图标信息。
- API key 只保留 placeholder，不应在 preset 中内置真实密钥。
- `presetToFormState()` 生成的 raw config 是保存计划的基础，修改字段结构需同步 model config 测试。
