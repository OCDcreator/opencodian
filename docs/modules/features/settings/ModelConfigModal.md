# Model Config Modal

> **源码**: `src/features/settings/ModelConfigModal.ts`
> **状态**: [REVIEW]

## 概述

项目级 provider / model 可视化配置弹窗。它把当前 vault 的 `.opencode/opencode.json` 模型子集读入一个更贴近 `CC Switch` 的平铺单列表单：顶部标题栏 + 当前 provider 简洁工具条 + 分段表单 + 底部配置 JSON 预览，并把 provider/model 开关分别写回项目配置与插件设置。

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

`onOpen()` 先从 `plugin.modelConfigService` 读取本地模型配置，再通过 `hydrate()` 把配置对象转换成可编辑的 `ProviderFormState[]` / `ModelFormState[]`。如果当前没有本地 provider，或调用方显式要求添加新 provider，会先创建一个空白 draft provider，并直接展示预设条与表单。

### 弹窗结构

弹窗现在按 `CC Switch` 的 OpenCode 配置思路重组为更直接的单列配置流：

- 顶部：返回按钮、标题“添加新提供商”、配置路径说明
- 预设区：仅在“添加新提供商”入口下展示扁平 provider 预设按钮行
- provider 区：仅在编辑已有配置时、且当前存在多个 provider 时展示紧凑切换条；新增模式不会暴露“当前 provider”切换条
- 表单区：去掉 hero/大卡片层级，按“身份信息 → 接口接入 → 额外 `options` → 模型管理 → 默认模型 → 配置 JSON”平铺组织
- 工具条：当前 provider 名称、状态、项目内可用性开关，以及测试 / 图标 / 删除操作集中在表单顶部

其中：

- 新增 provider 时优先从 `providerPresets.ts` 顶部预设条选择，首项为“自定义配置项”；在新增模式里，重复切换预设只会覆盖当前草稿，不会继续追加隐藏 provider
- provider 级开关最终写回当前项目 `.opencode/opencode.json`
- model 级开关最终写回插件设置 `disabledModelRefs`
- 图标缓存管理从独立工具入口扩展到当前 provider 上下文入口
- 配置 JSON 预览、原始 JSON 编辑器入口与“保存后重启本地服务”固定展示在底部预览区

可视化编辑器仍然暴露“接口格式”而不是原始 `npm` 包名；保存时会把已知格式映射回 `provider.npm`。如果本地配置里存在未识别的自定义包名，会落到兼容性的“自定义适配器”选项，避免用户仅仅打开再保存就把原值覆盖掉。

### 结构化校验、导入与回写

`toModelConfig()` 负责把当前弹窗状态转回 `OpencodeModelConfigSubset`，并做必填、重复 ID、数字合法性等校验；`save()` 除了写项目配置，还会同步 model 级过滤开关到插件设置。

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
| `render()` | 重建整个弹窗 |
| `renderPresetPicker()` | 在新增入口渲染顶部预设选择条 |
| `renderProviderTabs()` | 在多 provider 草稿下渲染紧凑切换条 |
| `renderEditor()` | 渲染当前 provider 的平铺编辑表单 |
| `renderModelCard()` | 渲染单模型的折叠 / 展开编辑卡片 |
| `toModelConfig()` | 表单状态 -> 配置对象，并执行校验 |
| `save()` | 持久化配置、可选重启服务、提示结果 |
| `maybeRestartServer()` | 在本地模式下重启 OpenCode 服务 |

## 数据流

1. 设置页点击“添加新提供商”或现有 provider 卡片 -> 打开 `ModelConfigModal`
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

- 弹窗状态保留 `raw` 原始 provider/model 结构，序列化时会尽量合并保留未知字段
- 空白 provider 会被忽略，不会强制写入配置；删除最后一个 provider 后会自动补一个新的空白 draft，保持单列添加流程不断开
- `apiKey` 为空时会从 `options` 中删除而不是写空串
- provider 级测试仍然基于当前已保存的项目配置和 runtime；新建但未保存的 provider 只能先做字段级编辑与模型导入，不能参与 runtime probe
- 本地重启只在 server 已运行时执行，远程模式会直接提示不可管理

## 补充说明

- 设置入口：OpenCodianSettings 的 `addModelSettings()` 中 "可视化模型配置" 按钮，点击后 `new ModelConfigModal(app, plugin).open()`
- `toModelConfig()` 校验分支目前无专门测试覆盖，校验逻辑在用户点击保存时内联执行，抛出的 `Error` 由 `save()` 的 try-catch 捕获并通过 `Notice` 显示
