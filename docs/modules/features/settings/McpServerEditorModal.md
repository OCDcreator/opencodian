# McpServerEditorModal

> **源码**: `src/features/settings/McpServerEditorModal.ts`
> **状态**: [REVIEW]

## 概述

`McpServerEditorModal` 是 MCP server add/edit 的共用 modal。它使用 `SettingsMcpAddForm` 的纯 helper 维护表单状态和 payload 构建，并通过 `McpConfigService` 写入项目 `.opencode/opencode.json`。表单里的 type / OAuth 下拉在每次 render 后由 `SettingsDropdownControl` 接管视觉层，多行输入框则由 `TextareaSizeMemory` 负责恢复用户上次拉伸的高度。

## 核心逻辑

### Add mode

使用空默认状态，允许填写 name、local/remote 类型、enabled、timeout、command/environment 或 url/headers/OAuth。保存后调用 `upsertServer()` 创建项目 entry。

### Edit mode

从 project config truth 预填现有 entry，并锁定 server name。保存时仍走 `upsertServer()`，由 service 保留未知字段。

### Validation and save

保存前调用 `validateMcpFormState()`。失败时 Notice；成功时调用 `onSaved()` 刷新 settings runtime state，并关闭 modal。

### textarea 尺寸记忆与重渲染清理

- local 模式下，`command` textarea 使用 key `mcp-local-command`
- local 模式下，`environment` textarea 使用 key `mcp-local-environment`
- remote 模式下，`headers` textarea 使用 key `mcp-remote-headers`
- `renderForm()` 每次因 type / OAuth mode 切换而重建内容前，会先销毁旧 dropdown enhancer 和全部 textarea size-memory observer
- `onClose()` 也会再次执行同样的清理，避免 modal 关闭后残留 `ResizeObserver`

## 与其他模块的交互

- `src/core/config/McpConfigService.ts`: 执行项目 config upsert
- `src/features/settings/SettingsMcpAddForm.ts`: 表单状态、预填、校验和 payload 构建
- `src/features/settings/SettingsMcpSection.ts`: 负责打开 modal 并提供 refresh 回调
- `src/features/settings/TextareaSizeMemory.ts`: 为多行 command/environment/headers 字段提供高度恢复与持久化

## 注意事项

- Editor modal 是唯一允许用户查看/编辑 secret value 的 MCP UI；status modal 和 cards 必须 redacted 或摘要化
- 只暴露 approved spec 中列出的 local/remote 字段，不做完整 JSON editor
- `renderForm()` 会重建 modal 内容，因此必须先销毁旧 dropdown enhancer 和 textarea memories，再对新内容调用 `enhanceSettingsDropdowns()`

## 2026-06-16 Shared modal layout adoption

表单布局改用共享 modal 布局系统，替代旧的 MCP 专属 spacing 规则：

- 表单根元素携带 `.opencodian-modal-shell`；分组使用 `.opencodian-modal-section` + `.opencodian-modal-card`。
- 分组正文使用 `.opencodian-modal-form-grid`；底部按钮行使用 `.opencodian-modal-actions`。
- 移除 `.opencodian-mcp-form-group-body` / `.opencodian-mcp-form-actions` 的零散 margin，改由共享 token 控制节奏（`.opencodian-mcp-form-*` 类名保留以承载 MCP 特有覆盖）。
