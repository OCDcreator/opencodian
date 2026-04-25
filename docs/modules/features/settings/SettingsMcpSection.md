# SettingsMcpSection

> **源码**: `src/features/settings/SettingsMcpSection.ts`
> **状态**: [REVIEW]

## 概述

`SettingsMcpSection` 是设置页 Server > MCP 二级标签的 owner。它负责从 OpenCodeService 已有的 MCP 运行时接口读取并渲染 MCP 服务器状态概览和逐服务器行，提供 MCP 操作按钮（连接/断开/认证/清除认证），并通过 catalog subscription 实时响应运行时状态变化。新增 MCP 服务器表单委托给 `SettingsMcpAddForm`。

## 核心逻辑

### 概览卡片

渲染四个计数卡片（Total / Connected / Needs auth / Failed），从 `McpServerSnapshot.servers` 按状态分类统计。同时显示上次刷新时间。

### 服务器行列表

对 `McpServerSnapshot.servers` 中的每个服务器渲染一行，显示名称、状态 badge（带 CSS class 区分）、可选的错误信息（仅 `failed` / `needs_client_registration`）和状态感知的操作按钮。

### 操作按钮（按服务器状态）

- **connected**: Disconnect
- **disabled / failed**: Connect
- **needs_auth**: Authenticate + Clear Auth
- **needs_client_registration**: 不提供操作按钮，仅显示错误说明

操作期间所有操作按钮禁用，成功后自动触发 `triggerRefresh()`，失败时用 Notice 反馈错误。

### 新增服务器表单

由 `SettingsMcpAddForm` 子组件渲染和验证，详见 [SettingsMcpAddForm](./SettingsMcpAddForm.md)。

### 刷新行为

- `attachTabbed` / `attach` 调用时立即触发 `refreshMcpServerStatus()`
- 刷新按钮在刷新期间显示 "Refreshing…" 并禁用
- 通过 `subscribeToCatalogUpdates` 监听运行时状态变化自动重渲染
- 操作（connect/disconnect/authenticate/clearAuth）和新增服务器成功后触发刷新

### 生命周期

- `dispose()` 清理 catalog subscription，防止内存泄漏
- `OpenCodianSettings.disposeSections()` 和 `hide()` 都会调用 `dispose()`

## 与其他模块的交互

- `src/features/settings/SettingsMcpAddForm.ts`: 新增 MCP 服务器表单子组件，渲染和验证委托给它
- `src/core/opencode/OpenCodeService.ts`: 提供 `getMcpServerSnapshot()`、`refreshMcpServerStatus()`、`subscribeToCatalogUpdates()`、`addMcpServer()`、`connectMcpServer()`、`disconnectMcpServer()`、`authenticateMcp()`、`removeMcpAuth()`
- `src/core/opencode/types.ts`: 定义 `McpServerSnapshot`、`McpServerStatus`
- `src/core/opencode/OpenCodeCatalogStateStore.ts`: 存储 MCP 状态快照并发射更新事件
- `src/features/settings/settingsLayoutRegistry.ts`: 注册 `server > mcp` 二级标签
- `src/features/settings/SettingsTabbedRenderer.ts`: 在 `renderServerContent` 中路由 `mcp` 标签到本 section
- `src/features/settings/OpenCodianSettings.ts`: 管理 section 生命周期（tabbed 和 classic 两种布局）

## 配置项

无。本 section 不持有持久化配置，只消费运行时状态和表单本地状态。

## 注意事项

- 不直接调用 SDK 命名空间，所有数据访问和操作通过 `OpenCodeService` 公共接口
- classic 布局中 MCP 部分紧跟在 Server 部分之后
- 操作按钮在任意一个操作执行期间全部禁用，防止并发冲突
- `addMcpServer` 的 config 参数只组装最小必要 payload，不做完整 JSON 编辑器
- OAuth 处理保持在 trigger/feedback 层：`authenticateMcp` 一键触发浏览器流程，不做手动 code 输入表单
