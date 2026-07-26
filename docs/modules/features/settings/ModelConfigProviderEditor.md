# ModelConfigProviderEditor

> **源码**: `src/features/settings/ModelConfigProviderEditor.ts`
> **状态**: [REVIEW]

## 概述

`ModelConfigProviderEditor` 是 `ModelConfigModal` 下的 provider 表单 owner。它接管 workspace / add-provider 两条流程里的 provider 工具条、身份信息、接口接入、额外 `options`、默认模型与 JSON 预览渲染，并把模型列表区委托给 `ModelConfigModelListEditor`。

## 导入关系

```text
上游: obsidian (setIcon), ../../i18n, ../../main, ModelConfigJsonModal, ModelConfigModelListEditor, modelConfigModalState, ProviderIconCacheModal, modelConfigWorkspace
下游: ModelConfigModal
```

## 核心类型 / 接口

```typescript
export type ProviderCheckState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; message: string }
  | { status: 'warning'; message: string }
  | { status: 'error'; message: string };

export interface SelectedProviderEditorState {
  flow: ModelConfigModalFlow;
  provider: ProviderFormState;
  providerCheckState: ProviderCheckState;
}
```

内部 `ModelConfigProviderEditorOptions` 是 modal 与 editor 的 seam：modal 继续持有状态、service side effects 与保存逻辑，editor 只通过 callback 读取 / 更新当前表单值、preview DOM、provider check 状态、模型拉取结果与重绘请求。

## 核心逻辑

### Workspace Provider 编辑

已有 provider 的 API key 会保留在 modal 的内部 form state，但 password input 以空值和 `configured (hidden)` 占位渲染；不会把已有完整 credential 写入 DOM、预览或提示。用户显式输入仍按原有回调替换内部值。workspace preview 的脱敏由 modal callback 统一完成：正常 JSON 递归掩码 secret-key 字段；不可解析 preview 则只显示 hidden sentinel，不能把原始文本泄露进 DOM，也不能把 sentinel 回写 canonical save draft。

provider `extraOptions` 另有 fail-closed 专用保护边界：只有精确 `setCacheKey` 且值为 boolean / `"true"` / `"false"` 的行可进入可视化编辑器；所有其他已配置行都会向共享 key/value renderer 传递 value 为空的副本。原 canonical value 仍留在 form state，因此未编辑的保存不会写入 mask sentinel；对应行的输入、删除和其他控件会锁定，并显示“请在高级 JSONC/native env 中更新”的本地化说明。不要把这条 provider-only 规则搬进共享 `renderKeyValueEditor()`，因为模型列表也使用该 renderer，且不属于本模块的秘密字段边界。

`renderWorkspaceEditor()` 负责已有 provider 的单列编辑流：

- provider 工具条：显示名称 / 状态 / 模型数、项目内启用开关、provider runtime 测试、图标管理与删除入口
- 身份信息：provider id 与显示名称
- 接口接入：接口格式、custom npm、base URL、API key，以及 provider check 结果提示
- 额外配置：provider `options` 里的未知字段编辑
- 模型管理：委托 `ModelConfigModelListEditor.renderWorkspaceModelsSection()`
- 默认模型与 JSON 预览：通过 modal callback 同步 `model` / `small_model` 与 preview / restart DOM

### Add Provider 编辑

`renderAddProviderEditor()` 复用同一批 provider section 规则，但保持新增流程原有差异：

- provider id 输入继续做小写和非法字符清理
- identity / connection section 不额外渲染 workspace 标题块
- API key 显示新增 provider 的自动填充说明
- base URL placeholder 优先从草稿 `raw.options.baseURL` 推导
- 不展示 workspace restart toggle，只展示可编辑 JSON preview 与 format 操作

### 共享表单控件

本模块保留 provider editor 与 model list owner 共用的 DOM primitive：`createTextField()`、`createSelectField()`、`renderKeyValueEditor()`、section/subsection header 和 editable-control event isolation。这样不会为了几个控件再新增薄 helper 文件，且 model list 通过构造时注入的 callbacks 复用同一套控件行为。

## 关键方法

| 方法 / 导出 | 说明 |
|-------------|------|
| `renderWorkspaceEditor()` | 渲染已有 provider 的完整编辑面板 |
| `renderAddProviderEditor()` | 渲染新增 provider 流程的完整编辑面板 |
| `renderProviderToolbar()` | 渲染 provider 状态、可用性、测试、图标与删除操作 |
| `renderProviderConnectionSection()` | 渲染接口格式 / adapter / base URL / API key 并处理格式切换 |
| `renderProviderExtraOptionsSection()` | 渲染 provider 级 `options` 的 key-value 编辑器 |
| `renderWorkspacePreviewSection()` | 渲染只读 workspace JSON 预览和重启开关 |
| `renderAddProviderPreviewSection()` | 渲染新增 provider 的可编辑 JSON preview 与 format 操作 |

## 与其他模块的交互

- 由 [ModelConfigModal.md](C:/Users/lt/Desktop/Write/custom-project/opencodian/docs/modules/features/settings/ModelConfigModal.md) 装配；modal 仍持有状态数组、保存计划、service 写入、通知与关闭保护。
- 委托 [ModelConfigModelListEditor.md](C:/Users/lt/Desktop/Write/custom-project/opencodian/docs/modules/features/settings/ModelConfigModelListEditor.md) 渲染模型列表、模型卡片、高级字段与模型导入面板。
- 打开 `ModelConfigJsonModal` 处理完整 JSON 编辑入口。
- 打开 `ProviderIconCacheModal` 处理当前 provider 的图标缓存管理。

## 注意事项

- 不要把 provider/model 编辑 DOM 重新塞回 `ModelConfigModal.ts`；新增 provider 表单 section 时优先扩展本 owner。
- 不要拆成按 section 分散的小文件；共享控件 primitive 已集中在本 owner 内。
- provider 图标 fallback 仍由 `ProviderIconService` / cache modal 管理，本模块只打开管理入口。
- Provider 状态测试和模型拉取仍通过 modal callback 进入原来的 service side-effect 路径。
- Provider JSON preview 和 key-value textarea 通过 `TextareaSizeMemory` 分别使用 `model-provider-json-editor` / `model-workspace-keyvalue` key 记忆高度；`dispose()` 会清理当前 render 周期的 observer。
