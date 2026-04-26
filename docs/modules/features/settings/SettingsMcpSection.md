# SettingsMcpSection

> **源码**: `src/features/settings/SettingsMcpSection.ts`
> **状态**: [REVIEW]

## 概述

`SettingsMcpSection` 是设置页独立 `MCP` 一级类目的 owner。它现在渲染一个 MCP management panel：顶部说明与工具条、运行时状态统计卡片、逐服务器管理卡片。它只负责页面壳层、运行时操作分发和 modal 打开；项目 `.opencode/opencode.json` 的 MCP 增删改由 `McpConfigService` 负责。

## 核心逻辑

### 管理面板结构

- toolbar: 显示说明、`Refresh` 和 `Add Server`
- stats: Total / Connected / Needs auth / Failed
- server cards: 名称、transport badge、endpoint summary、运行时状态、项目拥有/运行时只读提示、操作按钮

### 运行时操作

Connect / Disconnect / Authenticate / Clear Auth 仍全部走 `OpenCodeService` 的 MCP runtime seam。卡片里的“Runtime connection”只表达运行时连接/断开，不等同于 project config 的 `enabled` 字段。

### 项目配置操作

Add/Edit 打开 `McpServerEditorModal`，Delete 只允许 project-owned server。删除前如果当前已连接，会先 best-effort disconnect，再调用 `McpConfigService.deleteServer()` 从当前项目配置中真正移除该 entry。

### Runtime-only / inherited 服务器

运行时可见但不在当前项目 `mcp` 配置中的服务器会显示为 runtime-only/inherited。它们仍可 monitor 和运行时 connect/disconnect，但 edit/delete 会被阻止并显示 Notice。

### Monitor modal

每张卡片都能打开 `McpServerStatusModal`。该 modal 展示运行时状态、transport summary、错误/认证状态和经过 redaction 的技术详情；当前不伪造 server->tools mapping。

## 与其他模块的交互

- `src/core/config/McpConfigService.ts`: 读取/写入项目 MCP 配置，判断 project ownership，安全 add/edit/delete。
- `src/features/settings/McpServerEditorModal.ts`: Add/Edit 共用表单 modal。
- `src/features/settings/McpServerStatusModal.ts`: Monitor/details modal，负责 secret redaction 和 tools-unavailable 文案。
- `src/features/settings/SettingsMcpAddForm.ts`: 提供 MCP 表单状态、校验和 payload 构建 helper。
- `src/core/opencode/OpenCodeService.ts`: 提供 MCP runtime snapshot、refresh、connect/disconnect/auth flows。

## 注意事项

- Runtime truth 和 project config truth 必须分开，不要用运行时状态推断可编辑配置。
- Delete 是从 `.opencode/opencode.json` 删除 project-owned entry，不是设置 `enabled: false`。
- 不要展示 resources/prompts，也不要伪造工具数量或 per-server tool list。
- 技术详情默认 redacted；headers、environment values、OAuth client secret 不应明文显示在 editor 之外。
