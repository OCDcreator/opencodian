# ModelConfigModelListEditor

> **源码**: `src/features/settings/ModelConfigModelListEditor.ts`
> **状态**: [REVIEW]

## 概述

`ModelConfigModelListEditor` 是 `ModelConfigModal` provider 表单下的模型列表 / 模型卡片 owner。它接管 workspace 与 add-provider 流程里的模型添加、删除、启用开关、折叠展开、高级字段编辑，以及 workspace 模型拉取结果的缺失导入面板。

## 导入关系

```text
上游: obsidian (setIcon), ../../i18n, modelConfigModalState, modelConfigWorkspace
下游: ModelConfigProviderEditor
```

## 核心类型 / 接口

```typescript
export type ModelKeyValueCollectionKey = 'options' | 'variants' | 'extraFields';

export interface ModelConfigTextFieldConfig { ... }
export interface ModelConfigSelectFieldConfig { ... }
export interface ModelConfigKeyValueEditorConfig { ... }
```

`ModelConfigModelListEditorOptions` 由 provider editor 注入：expanded model uid set、当前 flow、模型拉取结果、fetch/import callbacks、preview/rerender callbacks，以及 provider editor 的共享表单控件 primitive。

## 核心逻辑

### Workspace 模型区

`renderWorkspaceModelsSection()` 保留已有 workspace 行为：

- 显示模型区说明与启用/禁用提示
- 根据接口格式决定“拉取模型”按钮是否可用
- 添加空白模型时调用 `createEmptyModel()`，再刷新 preview 与 modal
- 渲染已拉取候选模型的 inline import panel
- 对每个模型渲染折叠卡片、model id/name 输入、启用开关与删除按钮

### Add Provider 模型区

`renderAddProviderModelsSection()` 保留新增 provider 流程的紧凑表格式模型区：

- header 中直接放置 fetch / add model 操作
- 空列表时显示 prominent empty state
- 非空时显示 id/name 列头，再渲染相同模型卡片
- 新增流程不显示 model enabled toggle，删除按钮保持 icon-only 形态

### 模型卡片与高级字段

模型卡片展开后渲染：

- context / output limits
- model `options`
- model `variants`
- 其他高级字段 `extraFields`

三组 key-value 集合共享 provider editor 注入的 `renderKeyValueEditor()`，因此字段添加、删除、输入、preview 更新与 rerender 行为仍和 provider 级 `options` 一致。

## 关键方法

| 方法 / 导出 | 说明 |
|-------------|------|
| `renderWorkspaceModelsSection()` | 渲染 workspace 的模型管理区和候选导入面板 |
| `renderAddProviderModelsSection()` | 渲染新增 provider 流程的模型管理区 |
| `renderFetchedModelCandidates()` | 渲染 fetch 后的候选模型摘要与“导入缺失模型”操作 |
| `renderModelCard()` | 渲染单个模型卡片的折叠状态 |
| `renderModelCardHeader()` | 渲染 model id/name、workspace 启用开关与删除操作 |
| `renderExpandedModelCardDetails()` | 渲染 context/output 与高级 key-value 字段 |

## 与其他模块的交互

- 被 [ModelConfigProviderEditor.md](C:/Users/lt/Desktop/Write/custom-project/opencodian/docs/modules/features/settings/ModelConfigProviderEditor.md) 创建并委托渲染模型相关区块。
- 使用 `modelConfigWorkspace` 的 `ProviderFormState` / `ModelFormState` / `FetchedProviderModelCandidate` 与 `createEmptyModel()`。
- 通过 callback 调用 modal 原有 `fetchModelsForProvider()` / `importFetchedModels()`，不直接访问 service 或通知 side effects。

## 注意事项

- 不要按模型 card/header/advanced fields 再拆小文件；本 owner 的边界就是模型列表编辑。
- 不要改变 add-provider 与 workspace 的 UI 差异，尤其是新增流程不显示 model enabled toggle。
- 模型启用状态仍写入 form state，最终由 `modelConfigSavePlan.ts` 规划 `disabledModelRefs`。
- 模型拉取导入策略仍为“只导入缺失模型”，由 modal side-effect 方法执行。
