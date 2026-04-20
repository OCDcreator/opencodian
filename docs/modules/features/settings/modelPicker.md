# Model Picker Helpers

> **源码**: `src/features/settings/modelPicker.ts`
> **状态**: [REVIEW]

## 概述

`modelPicker.ts` 将 `ModelCatalog` 转成设置页可搜索、可分组的模型选择数据结构。它只做纯数据转换，不创建 UI；实际 modal 和设置区块负责渲染。

## 导入关系

```text
上游: src/core/config/modelConfig
下游: ModelPickerModal.ts, SettingsConversationSection.ts, SettingsModelCatalogCoordinator.ts, 相关单元测试
```

## 核心类型 / 接口

| 导出 | 说明 |
|------|------|
| `ModelPickerOption` | 单个 provider/model 可选项，包含 ref、显示名、context 与搜索文本 |
| `ModelPickerGroup` | 按 provider 分组后的模型选项 |
| `buildModelPickerGroups()` | 从 catalog 构建分组 |
| `filterModelPickerGroups()` | 按 query 和可选 provider id 过滤分组 |
| `findModelPickerOptionByRef()` | 通过 `provider/model` ref 查找选项 |
| `findModelPickerOption()` | 通过 provider id + model id 查找选项 |

## 核心逻辑

### Catalog 展平为搜索结构

`buildModelPickerGroups()` 遍历 catalog providers，为每个 provider 生成 `searchText`，并为每个 model 生成稳定 ref：`${provider.id}/${model.id}`。

### 查询过滤

`filterModelPickerGroups()` 先按 provider scope 缩小范围，再按 query 过滤。若 provider 级 `searchText` 命中，则保留整个组；否则只保留组内命中的 model options。

## 数据流

```text
ModelConfigService catalog
  → buildModelPickerGroups()
  → SettingsModelCatalogCoordinator runtime state
  → ModelPickerModal / settings section 搜索与选择
```

## 与其他模块的交互

- `SettingsModelCatalogCoordinator.ts` 构建和刷新 `modelPickerGroups`。
- `ModelPickerModal.ts` 使用过滤后的 group 渲染搜索结果。
- `SettingsConversationSection.ts` 用 picker option 更新默认模型类设置。

## 配置项

无。

## 注意事项

- `ref` 格式是 `providerId/modelId`；保存或比较模型引用时应保持一致。
- 搜索文本统一 lower-case，新增字段参与搜索时要同步测试。
