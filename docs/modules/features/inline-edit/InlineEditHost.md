# InlineEditHost

> **源码**: `src/features/inline-edit/InlineEditHost.ts`
> **状态**: [REVIEW]

## 概述

inline edit 与插件运行时之间的接缝。`editorCallback` 只给到 `Editor` 与 `MarkdownView`，拿不到聊天视图或 agent registry，因此由宿主实现本契约，controller 只依赖这个接口（可就地测试）。

## 职责

- `getWorkingDirectory()`：辅助会话可读的目录（通常是 vault 根）
- `getLocale()`：选择系统提示词语言
- `resolveAdapter()`：返回当前 backend 的 `InlineEditHostAdapter`；同时承担"聊天活动 tab 的后端，或无聊天视图时 registry 活跃 adapter"的解析规则
- 可选 `createProviderIcon(providerId, size)`：悬浮条模型 chip / 菜单行的提供商品牌图标（与主输入窗口同一 `ProviderIconService` 管线）；缺省或返回 `null` 时回退 lucide 字形
- 重新导出 `InlineEditHostAdapter`，保持 controller 的 import 面最小

## 依赖

- `./InlineEditTypes`（`InlineEditHostAdapter`）

- 可选 `listContextFiles()`："添加上下文"选择器的候选条目（vault 内 `md`/`txt` 文件 + 文件夹，R-A7）；缺失或返回 `null` 时整个入口隐藏，宿主无 vault 时悬浮条保持原状
- 可选 `resolveContextFile(path)`（R-A7）：把拖拽落下的原始路径解析为上下文条目；**必须**走 `app.vault.getAbstractFileByPath()` 并校验 `instanceof TFile | TFolder`，vault 外/非文本路径返回 `null`（不落 chip）；缺省时禁用面板拖拽入口
- 可选 `getMaxConcurrentEdits()`（R-A5）：单编辑器并行编辑上限（`inlineEditMaxConcurrentEdits`）；缺省用控制器默认值 3
- 可选 `isDocumentModeEnabled()`（R-A6）：整篇形态开关（`inlineEditDocumentModeEnabled`）；缺省视为开启
- 可选 `listPresetPrompts()`（R-A2）：「内置 + 用户自定义」合成后的 `#` 预设列表；缺省等价于空表（菜单侧兜底，实际宿主总是提供）

## 维护约束

- 接口保持窄小：只放 controller 真正需要的三个方法，backend/模型解析细节属于实现方
- 模型解析顺序固定为 `inlineEditModelOverrides[kind] → 活动 tab 模型 → null`；显式配置不可用时必须是错误，不得静默回退（`docs/requirements/inline-edit.md` §9）
