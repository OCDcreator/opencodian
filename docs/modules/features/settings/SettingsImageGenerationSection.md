# SettingsImageGenerationSection

> **源码**: `src/features/settings/SettingsImageGenerationSection.ts`
> **状态**: [REVIEW]

## 概述

`SettingsImageGenerationSection` 是 R-C2 的设置分区（`feature.settings-shell` owner），管理三个设置项的 CRUD：

- `imageGenerationModels`：OpenAI images 兼容端点列表（显示名 / baseURL / 模型 / API 密钥 / size）。列表第一项是两个入口的默认模型。编辑遵循 context-group CRUD 契约：行内容即写即存，畸形行由加载期归一化在下次启动时修剪。
- `imageGenerationMaxWidth`（默认 600）：插入引用 `|宽度` 的默认值；0 = 不加宽度后缀。
- `imageGenerationAssetCleanup`（默认 `trash`）：预览拒绝后的孤儿资产策略。设置描述明示三条反向路径（插件回退、原生 Ctrl+Z、预览拒绝），满足"行为在设置中说明"。

## 凭据

API 密钥输入框为 password 类型；值走与其他后端密钥（`CodexBackendSettings.apiKey`）相同的 settings 存储与诊断脱敏契约，不在任何日志/诊断/非密码 UI 回显。

## 挂载

- Classic 布局：`OpenCodianSettings` 在"行内编辑"之后挂载（`addImageGenerationSettings`）。
- Tabbed 布局：`settingsLayoutRegistry` 的 conversation 主 tab 下新增二级 tab `image-generation`；`SettingsTabbedRenderer.renderConversationContent` 中 `attachTabbed` 挂载（`data-section-block="image-generation"`，随二级 tab 显隐）。

## 关联模块

- `src/core/types/settings.ts`：三个设置项与 `normalizeImageGeneration*` 归一化。
- `OpenCodianSettings.ts` / `SettingsTabbedRenderer.ts` / `settingsLayoutRegistry.ts`：两种布局的挂载点。
