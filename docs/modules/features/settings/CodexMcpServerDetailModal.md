# CodexMcpServerDetailModal

> **源码**: `src/features/settings/CodexMcpServerDetailModal.ts`
> **状态**: [REVIEW]

## 概述

Codex MCP 服务器结构化检查弹窗。从 Codex 应用服务器 (`mcpServerStatus/list`) 读取 MCP 服务器状态，以卡片形式展示每个服务器的名称、版本、描述、网站 URL、认证状态徽章、工具列表（含描述和可展开的 JSON 输入 schema）、资源和资源模板。资源条目可点击查看（通过 `mcpServer/resource/read` 获取内容，文本/图片安全渲染，二进制显示元数据）。包含刷新工具栏按钮和条件性"认证"按钮（当 `authStatus === 'needs_auth'` 时触发 `mcpServer/oauth/login` OAuth 流程）。

## 导入关系
上游: `obsidian`（App、Modal、Notice）、`CodexAppServerClient`（`AppServerMcpResource`、`AppServerMcpResourceReadResult`、`AppServerMcpServerStatus` 类型）、`i18n`
下游: 被 `SettingsCodexReadbackControls.openMcpServerDetailModal()` 打开；被 `OpenCodianView.openCodexMcpServerDetailFromChat()` 打开（chat→detail 入口）

## 核心类型 / 接口

```typescript
interface CodexMcpServerDetailModalHost {
  getMcpServerStatus(): Promise<AppServerMcpServerStatus[] | null>;
  reloadMcpServers(): Promise<boolean>;
  triggerMcpServerOAuth(name: string, options?: { scopes?: string[]; timeoutSecs?: number }): Promise<boolean>;
  readMcpServerResource(server: string, uri: string): Promise<AppServerMcpResourceReadResult | null>;
}

// 共享 host 工厂——从 adapter-like 对象创建 host，settings 和 chat 两路复用
function createCodexMcpServerDetailHost(adapter: CodexMcpServerDetailAdapterLike): CodexMcpServerDetailModalHost;
```

构造函数: `new CodexMcpServerDetailModal(app, host, focusServerName?)` — `focusServerName` 在渲染后高亮并滚动到对应 server 卡片（`.is-focused` 类）。

## 核心逻辑

### 生命周期

`onOpen()` 自动加载 MCP 服务器状态并渲染卡片列表。`loadAndRender()` 获取数据后调用 `renderServers()`。

### 服务器卡片渲染

`renderServerCard()` 委托给三个子方法：
- `renderServerHeader()`: 标题（名称 + 版本）+ 认证状态徽章 + 条件性"认证"按钮
- `renderServerDescription()`: 描述文本 + 网站 URL 链接
- `renderServerContent()`: 工具/资源元数据行 + 工具列表（含 schema 展开）+ 资源/模板列表

### 认证流程

`handleAuthenticate()` 调用 `host.triggerMcpServerOAuth(serverName)`，通过 `CodexAppServerClient.mcpServerOauthLogin()` 触发 OAuth 浏览器重定向流程，监听 `mcpServer/oauthLogin/completed` 通知确认完成。

### 刷新流程

`handleReload()` 先设置 `busy = true`，调用 `host.reloadMcpServers()`（→ `config/mcpServer/reload`），成功后调用 `loadAndRender()` 重新获取并渲染。`loadAndRender()` 自身也负责 `busy` 状态的生命周期（`try/finally`），保证并发操作安全和重渲染成功。

### 并发保护

`busy` 标志用于防止初始加载、刷新、认证操作重叠。所有异步入口（`loadAndRender`、`handleReload`、`handleAuthenticate`）都通过 `try/finally` 释放 `busy`。

## 关键方法

| 方法 | 说明 |
|------|------|
| `onOpen()` | 自动加载并渲染 MCP 服务器状态 |
| `loadAndRender()` | 获取 MCP 数据并委托渲染 |
| `renderServerCard()` | 渲染单个服务器卡片 |
| `renderServerHeader()` | 渲染标题 + 认证徽章 + 条件性认证按钮 |
| `renderServerDescription()` | 渲染描述 + URL |
| `renderServerContent()` | 渲染工具/资源元数据 + 工具列表 + 资源列表 |
| `renderToolEntry()` | 渲染单个工具条目（名称 + 描述 + 可展开 schema） |
| `renderResourceEntry()` | 渲染单个资源条目（名称 + 描述 + URI + MIME 类型 + "查看"按钮） |
| `renderResourceTemplateEntry()` | 渲染资源模板条目（带"运行时展开"提示） |
| `handleViewResource()` | 点击"查看"→ `host.readMcpServerResource(server, uri)` → 内联渲染内容；再次点击折叠 |
| `renderResourceContent()` | 安全渲染资源内容：文本 → 格式化文本块；图片 → `<img>`；二进制 → 元数据（不显示原始字节） |
| `handleReload()` | 刷新 MCP 配置并重新渲染 |
| `handleAuthenticate()` | 触发 OAuth 认证流程并重新渲染 |
| `applyFocusServer()` | 渲染后高亮并滚动到 `focusServerName` 对应卡片（chat→detail 入口） |

## 数据流

```
SettingsCodexReadbackControls → 打开 CodexMcpServerDetailModal
OpenCodianView.openCodexMcpServerDetailFromChat() → 打开 CodexMcpServerDetailModal(focusServerName)
         ↓
onOpen() → loadAndRender() → host.getMcpServerStatus()
         ↓
renderServers() → for each server: renderServerCard() → applyFocusServer()
         ↓ handleReload → host.reloadMcpServers() → loadAndRender()
         ↓ handleAuthenticate → host.triggerMcpServerOAuth(name)
```

## 与其他模块的交互

- **SettingsCodexReadbackControls**: 创建并打开此 modal（通过 `createCodexMcpServerDetailHost`）
- **OpenCodianView**: 从普通 Codex 聊天的 MCP server chip 打开此 modal（`openCodexMcpServerDetailFromChat`，带 `focusServerName`）
- **CodexAdapter**: 通过 host 接口提供 `getMcpServerStatus()`、`reloadMcpServers()`、`triggerMcpServerOAuth()`、`readMcpServerResource()`
- **CodexAppServerClient**: 底层 JSON-RPC 通信和通知处理
- **i18n**: 使用 `settings.codex.mcpDetail.*` 系列 locale key

## 配置项

无直接配置项。

## 注意事项

- 此 modal 是 `readback` 级别的诊断检查界面，不是 MCP 编写/连接/断开控制面
- 资源查看通过 `mcpServer/resource/read`（params: `{ server, uri }`）获取内容，文本/图片安全渲染，二进制只显示元数据——永不展示原始 JSON dump
- 当前 Test Vault 的真实 MCP 服务器（computer-use、node_repl）暴露零资源；资源查看器在有资源暴露的 MCP 服务器（如 filesystem、knowledge base）时激活
- OAuth 认证按钮仅在 `authStatus === 'needs_auth'` 时可见，当前 Test Vault 无此类服务器
- 工具 schema 使用 `JSON.stringify(tool.inputSchema, null, 2)` 格式化展示
- 认证状态徽章使用颜色编码：绿色（bearer）、灰色（none）、橙色（needs_auth）、淡灰色（unsupported）
