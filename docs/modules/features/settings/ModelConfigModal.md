# Model Config Modal

> **源码**: `src/features/settings/ModelConfigModal.ts`
> **状态**: [REVIEW]

## 概述

项目级 provider / model 可视化配置弹窗。它把当前 vault 的 `.opencode/opencode.json` 模型子集读入一个更贴近 `CC Switch` 的平铺单列表单：顶部标题栏 + provider 预设 / 切换 + 当前 provider 编辑面板 + 底部配置 JSON 预览，并把 provider/model 开关分别写回项目配置与插件设置。自当前 maintainability round 起，modal 本体进一步收敛成 shell：快照 / JSON draft 状态语义下沉到 `modelConfigModalState.ts`，保存规划与序列化规则下沉到 `modelConfigSavePlan.ts`，provider 表单与模型列表渲染则分别下沉到 `ModelConfigProviderEditor.ts` 与 `ModelConfigModelListEditor.ts`。

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
  options: KeyValueFieldState[];
  variants: KeyValueFieldState[];
  extraFields: KeyValueFieldState[];
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

额外的打开选项：

```typescript
interface ModelConfigModalOpenOptions {
  initialProviderId?: string;
  initialView?: 'preset-selector' | 'editor';
  onSaved?: () => Promise<void> | void;
}
```

## 核心逻辑

### 配置读取与表单水合

`onOpen()` 先从 `plugin.modelConfigService` 读取本地模型配置，再通过 `hydrateWorkspaceState()` 把配置对象转换成可编辑的 `ProviderFormState[]` / `ModelFormState[]`。如果当前没有本地 provider，或调用方显式要求添加新 provider，会先创建一个空白 draft provider，并直接展示预设条与表单；如果传入 `initialProviderId`，则优先选中对应 provider。

### 弹窗结构

弹窗现在按 `CC Switch` 的 OpenCode 配置思路重组为更直接的单列配置流，modal 自己只保留顶部 shell / provider 选择 / save orchestration，具体编辑表单委托给 editor owners：

- 顶部：返回按钮、标题“添加新提供商”、配置路径说明
- 预设区：仅在“添加新提供商”入口下展示扁平 provider 预设按钮行
- provider 区：仅在编辑已有配置时、且当前存在多个 provider 时展示紧凑切换条；新增模式不会暴露“当前 provider”切换条
- 表单区：去掉 hero/大卡片层级，按“身份信息 → 接口接入 → 额外 `options` → 模型管理 → 默认模型 → 配置 JSON”平铺组织；provider section 由 `ModelConfigProviderEditor` 持有，模型区由 `ModelConfigModelListEditor` 持有
- 工具条：当前 provider 名称、状态、项目内可用性开关，以及测试 / 图标 / 删除操作集中在表单顶部

其中：

- 新增 provider 时优先从 `providerPresets.ts` 顶部预设条选择，首项为“自定义配置项”；在新增模式里，重复切换预设只会覆盖当前草稿，不会继续追加隐藏 provider
- provider 级开关最终写回当前项目 `.opencode/opencode.json`
- model 级开关最终写回插件设置 `disabledModelRefs`
- 图标缓存管理从独立工具入口扩展到当前 provider 上下文入口
- 配置 JSON 预览、原始 JSON 编辑器入口与“保存后重启本地服务”固定展示在底部预览区

可视化编辑器仍然暴露“接口格式”而不是原始 `npm` 包名；保存时会把已知格式映射回 `provider.npm`。如果本地配置里存在未识别的自定义包名，会落到兼容性的“自定义适配器”选项，避免用户仅仅打开再保存就把原值覆盖掉。

### 结构化校验、导入与回写

`ModelConfigModal` 不再内联 `toModelConfig()` / `buildSavePlan()` 这一整组纯逻辑：workspace / add-provider 两条保存路径都先交给 `buildModelConfigSavePlan()` 生成统一 plan，再由 modal 执行写入、可选重启、`saveSettings()` 与成功/失败提示。provider/model 序列化、availability 子集与 `disabledModelRefs` 规划现在都集中在 `modelConfigSavePlan.ts`；provider / model DOM 组装也不再直接堆在 modal 内，而是转交给两个 editor owner。

模型导入使用 provider 当前填写的 `baseURL + apiKey + 接口格式` 直接请求模型列表；导入策略是“只导入缺失模型”，避免覆盖已手工维护的模型定义。拉取结果在模型区里以次级导入条展示，不再与主表单同权重堆叠。模型高级配置里，`options` 与 `variants` 被单独拆出：前者表示调用参数，后者表示同一模型的多档预设，其余未知顶层字段继续保留在“其他高级字段”里。

### 未保存关闭保护

弹窗打开后会记录一份表单快照。若用户修改过内容但尚未保存，关闭弹窗时会弹出确认框；如果内容没有变化，则直接关闭。快照生成逻辑现在集中在 `createModelConfigModalSnapshot()`，新增 provider 流程会把 JSON draft 一并纳入比较，避免“只改 JSON draft 但没改表单”时误判成无改动。

这条关闭路径现在已有单测覆盖：service 不可用回退、preset-selector 初始草稿、`initialProviderId` 选中逻辑、未保存关闭确认。

### 可选本地服务重启

若用户勾选重启且当前为本地 server 模式，`maybeRestartServer()` 会在保存后执行健康检查、停止、等待 1 秒、重新启动服务。

## 关键方法

| 方法 / 导出 | 说明 |
|-------------|------|
| `onOpen()` | 读取配置并构建整个弹窗 UI |
| `render()` | 重建整个弹窗 |
| `renderPresetPicker()` | 在新增入口渲染顶部预设选择条 |
| `renderProviderTabs()` | 在多 provider 草稿下渲染紧凑切换条 |
| `renderEditor()` | 为当前 provider 选择正确的 editor owner，并把 modal 状态 / callback 注入进去 |
| `save()` | 调用 `buildModelConfigSavePlan()`，再执行写入、设置同步、可选重启与提示 |
| `maybeRestartServer()` | 在本地模式下重启 OpenCode 服务 |

## 数据流

1. 设置页点击“添加新提供商”或现有 provider 卡片 -> 打开 `ModelConfigModal`
2. `onOpen()` 读取 `readLocalModelConfig()`
3. `hydrateWorkspaceState()` -> `providers[]` / `modelValue` / `smallModelValue`
4. 用户编辑当前 provider / model，实时刷新 JSON 预览
5. 如需可先执行 provider 测试、模型拉取与缺失导入
6. `save()` -> `buildModelConfigSavePlan()` -> `writeLocalModelConfig()`
7. 同步 `disabledModelRefs`
8. 若勾选重启且为本地模式 -> `maybeRestartServer()`

## 与其他模块的交互

- 被 [OpenCodianSettings.md](C:/Users/lt/Desktop/Write/custom-project/opencodian/docs/modules/features/settings/OpenCodianSettings.md) 打开
- 依赖 `ModelConfigService` 读写本地模型配置
- 依赖 `OpenCodeService` 在本地模式下重启服务
- 依赖 [modelConfigModalState.md](C:/Users/lt/Desktop/Write/custom-project/opencodian/docs/modules/features/settings/modelConfigModalState.md) 管理快照 / JSON draft / 表单同步
- 依赖 [modelConfigSavePlan.md](C:/Users/lt/Desktop/Write/custom-project/opencodian/docs/modules/features/settings/modelConfigSavePlan.md) 管理保存计划与序列化
- 依赖 [ModelConfigProviderEditor.md](C:/Users/lt/Desktop/Write/custom-project/opencodian/docs/modules/features/settings/ModelConfigProviderEditor.md) 持有 provider 工具条、表单区、默认模型与 preview 渲染
- 依赖 [ModelConfigModelListEditor.md](C:/Users/lt/Desktop/Write/custom-project/opencodian/docs/modules/features/settings/ModelConfigModelListEditor.md) 持有模型列表、模型卡片与高级字段编辑
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
- 若只是调整 provider / model 可视化编辑区，优先扩展 `ModelConfigProviderEditor` 或 `ModelConfigModelListEditor`，不要再把 bulk DOM 逻辑塞回 modal shell

## 补充说明

- 设置入口：OpenCodianSettings 的 `addModelSettings()` 中 "可视化模型配置" 按钮，点击后 `new ModelConfigModal(app, plugin).open()`
- save plan / state 纯逻辑现在有独立单测覆盖，modal 侧继续保留 opening flow、close confirm、以及 editor owner 装配路径的 focused tests
