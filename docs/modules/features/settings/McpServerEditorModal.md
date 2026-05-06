# McpServerEditorModal

> **源码**: `src/features/settings/McpServerEditorModal.ts`
> **状态**: [REVIEW]

## 概述

`McpServerEditorModal` 是 MCP server add/edit 的共用 modal。它使用 `SettingsMcpAddForm` 的纯 helper 维护表单状态和 payload 构建，并通过 `McpConfigService` 写入项目 `.opencode/opencode.json`。表单里的 type / OAuth 下拉在每次 render 后由 `SettingsDropdownControl` 接管视觉层。

## 核心逻辑

### Add mode

使用空默认状态，允许填写 name、local/remote 类型、enabled、timeout、command/environment 或 url/headers/OAuth。保存后调用 `upsertServer()` 创建项目 entry。

### Edit mode

从 project config truth 预填现有 entry，并锁定 server name。保存时仍走 `upsertServer()`，由 service 保留未知字段。

### Validation and save

保存前调用 `validateMcpFormState()`。失败时 Notice；成功时调用 `onSaved()` 刷新 settings runtime state，并关闭 modal。

## 与其他模块的交互

- `src/core/config/McpConfigService.ts`: 执行项目 config upsert。
- `src/features/settings/SettingsMcpAddForm.ts`: 表单状态、预填、校验和 payload 构建。
- `src/features/settings/SettingsMcpSection.ts`: 负责打开 modal 并提供 refresh 回调。

## 注意事项

- Editor modal 是唯一允许用户查看/编辑 secret value 的 MCP UI；status modal 和 cards 必须 redacted 或摘要化。
- 只暴露 approved spec 中列出的 local/remote 字段，不做完整 JSON editor。
- `renderForm()` 会重建 modal 内容，因此必须先销毁旧 dropdown enhancer，再对新内容调用 `enhanceSettingsDropdowns()`。
