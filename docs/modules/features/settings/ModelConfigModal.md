# Model Config Modal

> **源码**: `src/features/settings/ModelConfigModal.ts`
> **状态**: [REVIEW]

## 概述

模型配置可视化编辑弹窗。它把本地 OpenCode 模型配置子集读入表单，允许用户编辑默认模型、small model、provider 基础信息以及每个 provider 下的模型列表，然后将结果写回本地配置，并可选触发本地 OpenCode 服务重启。

## 导入关系

```text
上游: obsidian (Modal, Notice), ../../core/types, ../../i18n, ../../main, ../../shared
下游: OpenCodianSettings
```

## 核心类型 / 接口

```typescript
interface ModelFormState {
  id: string;
  name: string;
  context: string;
  output: string;
  raw: OpencodeProviderModelConfig;
}

interface ProviderFormState {
  id: string;
  name: string;
  npm: string;
  baseURL: string;
  apiKey: string;
  models: ModelFormState[];
  raw: OpencodeProviderConfig;
}

export class ModelConfigModal extends Modal { ... }
```

## 核心逻辑

### 配置读取与表单水合

`onOpen()` 先从 `plugin.modelConfigService` 读取本地模型配置，再通过 `hydrate()` 把配置对象转换成可编辑的 `ProviderFormState[]` / `ModelFormState[]`。

### Provider / Model 动态表单

`renderProviders()` 会按 provider 渲染卡片、字段和模型列表，支持：

- 新增 / 删除 provider
- 新增 / 删除 model
- 编辑 provider id、name、baseURL、apiKey、npm
- 编辑 model id、name、context/output limit

### 结构化校验与回写

`toModelConfig()` 负责把表单状态转回 `OpencodeModelConfigSubset`，并做必填、重复 ID、数字合法性等校验；`save()` 调用 `writeLocalModelConfig()` 持久化。

### 可选本地服务重启

若用户勾选重启且当前为本地 server 模式，`maybeRestartServer()` 会在保存后执行健康检查、停止、等待 1 秒、重新启动服务。

## 关键方法

| 方法 / 导出 | 说明 |
|-------------|------|
| `onOpen()` | 读取配置并构建整个弹窗 UI |
| `hydrate()` | 把配置对象转成表单状态 |
| `renderProviders()` | 渲染 provider 和 model 表单卡片 |
| `toModelConfig()` | 表单状态 -> 配置对象，并执行校验 |
| `save()` | 持久化配置、可选重启服务、提示结果 |
| `maybeRestartServer()` | 在本地模式下重启 OpenCode 服务 |

## 数据流

1. 设置页点击“可视化模型配置” -> 打开 `ModelConfigModal`
2. `onOpen()` 读取 `readLocalModelConfig()`
3. `hydrate()` -> `providers[]` / `modelValue` / `smallModelValue`
4. 用户编辑表单，局部状态在内存中更新
5. `save()` -> `toModelConfig()` 校验 -> `writeLocalModelConfig()`
6. 若勾选重启且为本地模式 -> `maybeRestartServer()`
7. 保存插件设置并弹出 `Notice`

## 与其他模块的交互

- 被 [OpenCodianSettings.md](C:/Users/lt/Desktop/Write/custom-project/opencodian/docs/modules/features/settings/OpenCodianSettings.md) 打开
- 依赖 `ModelConfigService` 读写本地模型配置
- 依赖 `OpenCodeService` 在本地模式下重启服务
- 使用 `t()` 获取所有 UI 文案和错误提示

## 配置项

- 读写 `OpencodeModelConfigSubset`
- 间接受 `plugin.settings.server.mode` 影响，以决定是否允许本地重启路径

## 注意事项

- 表单状态保留 `raw` 原始 provider/model 结构，序列化时会尽量合并保留未知字段
- 空白 provider 会被忽略，不会强制写入配置
- `apiKey` 为空时会从 `options` 中删除而不是写空串
- 本地重启只在 server 已运行时执行，远程模式会直接提示不可管理

## 补充说明

- 设置入口：OpenCodianSettings 的 `addModelSettings()` 中 "可视化模型配置" 按钮，点击后 `new ModelConfigModal(app, plugin).open()`
- `toModelConfig()` 校验分支目前无专门测试覆盖，校验逻辑在用户点击保存时内联执行，抛出的 `Error` 由 `save()` 的 try-catch 捕获并通过 `Notice` 显示
