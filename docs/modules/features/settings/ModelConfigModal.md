# Model Config Modal

> **源码**: `src/features/settings/ModelConfigModal.ts`
> **状态**: [REVIEW]

## 概述

项目级 provider / model 工作区弹窗。它把当前 vault 的 `.opencode/opencode.json` 模型子集读入一个双栏工作区，按更接近 `CC Switch` 的“左侧 provider 导航 + 右侧单列表单”节奏组织 provider、模型、额外字段与高级操作，并把 provider/model 开关分别写回项目配置与插件设置。

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
  interfaceFormat: ProviderInterfaceFormatId;
  customNpm: string;
  baseURL: string;
  apiKey: string;
  models: ModelFormState[];
  raw: OpencodeProviderConfig;
}

export class ModelConfigModal extends Modal { ... }
```

## 核心逻辑

### 配置读取与表单水合

`onOpen()` 先从 `plugin.modelConfigService` 读取本地模型配置，再通过 `hydrate()` 把配置对象转换成可编辑的 `ProviderFormState[]` / `ModelFormState[]`。弹窗顶部使用模板条强调“选模板 → 填 provider → 管模型”的顺序，并把默认项与高级区降到主编辑流之后。

### 工作区结构

弹窗现在按 `CC Switch` 的 OpenCode 配置思路重组为单一工作区：

- 顶部：轻量模板条，快速创建 provider 草稿
- 左栏：provider 列表卡片，显示图标、名称、接口格式、模型数、项目启用状态、测试状态，并提供新增入口
- 右栏：单列表单流，按“身份与范围 → 接口接入 → 额外 `options` → 模型管理 → 默认模型 → 高级区”组织

其中：

- provider 级开关最终写回当前项目 `.opencode/opencode.json`
- model 级开关最终写回插件设置 `disabledModelRefs`
- 图标缓存管理从独立工具入口扩展到当前 provider 上下文入口
- JSON 预览、原始 JSON 编辑器入口与“保存后重启本地服务”收拢进默认折叠的高级区

可视化编辑器仍然暴露“接口格式”而不是原始 `npm` 包名；保存时会把已知格式映射回 `provider.npm`。如果本地配置里存在未识别的自定义包名，会落到兼容性的“自定义适配器”选项，避免用户仅仅打开再保存就把原值覆盖掉。

### 结构化校验、导入与回写

`toModelConfig()` 负责把工作区状态转回 `OpencodeModelConfigSubset`，并做必填、重复 ID、数字合法性等校验；`save()` 除了写项目配置，还会同步 model 级过滤开关到插件设置。

模型导入使用 provider 当前填写的 `baseURL + apiKey + 接口格式` 直接请求模型列表；导入策略是“只导入缺失模型”，避免覆盖已手工维护的模型定义。拉取结果在模型区里以次级导入条展示，不再与主表单同权重堆叠。

### 未保存关闭保护

弹窗打开后会记录一份表单快照。若用户修改过内容但尚未保存，关闭弹窗时会弹出确认框；如果内容没有变化，则直接关闭。

### 可选本地服务重启

若用户勾选重启且当前为本地 server 模式，`maybeRestartServer()` 会在保存后执行健康检查、停止、等待 1 秒、重新启动服务。

## 关键方法

| 方法 / 导出 | 说明 |
|-------------|------|
| `onOpen()` | 读取配置并构建整个弹窗 UI |
| `hydrate()` | 把配置对象转成表单状态 |
| `render()` | 重建整个工作区 |
| `renderProviderSidebar()` | 渲染左侧 provider 列表 |
| `renderEditor()` | 渲染当前 provider 的编辑区 |
| `renderModelCard()` | 渲染单模型的折叠 / 展开编辑卡片 |
| `toModelConfig()` | 表单状态 -> 配置对象，并执行校验 |
| `save()` | 持久化配置、可选重启服务、提示结果 |
| `maybeRestartServer()` | 在本地模式下重启 OpenCode 服务 |

## 数据流

1. 设置页点击“项目工作区” -> 打开 `ModelConfigModal`
2. `onOpen()` 读取 `readLocalModelConfig()`
3. `hydrateWorkspaceState()` -> `providers[]` / `modelValue` / `smallModelValue`
4. 用户编辑当前 provider / model，实时刷新 JSON 预览
5. 如需可先执行 provider 测试、模型拉取与缺失导入
6. `save()` -> `toModelConfig()` 校验 -> `writeLocalModelConfig()`
7. 同步 `disabledModelRefs`
8. 若勾选重启且为本地模式 -> `maybeRestartServer()`

## 与其他模块的交互

- 被 [OpenCodianSettings.md](C:/Users/lt/Desktop/Write/custom-project/opencodian/docs/modules/features/settings/OpenCodianSettings.md) 打开
- 依赖 `ModelConfigService` 读写本地模型配置
- 依赖 `OpenCodeService` 在本地模式下重启服务
- 使用 `t()` 获取所有 UI 文案和错误提示

## 配置项

- 读写 `OpencodeModelConfigSubset`
- 间接受 `plugin.settings.server.mode` 影响，以决定是否允许本地重启路径

## 注意事项

- 工作区状态保留 `raw` 原始 provider/model 结构，序列化时会尽量合并保留未知字段
- 空白 provider 会被忽略，不会强制写入配置
- `apiKey` 为空时会从 `options` 中删除而不是写空串
- provider 级测试仍然基于当前已保存的项目配置和 runtime；新建但未保存的 provider 只能先做字段级编辑与模型导入，不能参与 runtime probe
- 本地重启只在 server 已运行时执行，远程模式会直接提示不可管理

## 补充说明

- 设置入口：OpenCodianSettings 的 `addModelSettings()` 中 "可视化模型配置" 按钮，点击后 `new ModelConfigModal(app, plugin).open()`
- `toModelConfig()` 校验分支目前无专门测试覆盖，校验逻辑在用户点击保存时内联执行，抛出的 `Error` 由 `save()` 的 try-catch 捕获并通过 `Notice` 显示
