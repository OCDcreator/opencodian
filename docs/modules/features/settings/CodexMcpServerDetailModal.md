# CodexMcpServerDetailModal

> **源码**: `src/features/settings/CodexMcpServerDetailModal.ts`
> **状态**: ACTIVE

## 概述

Codex MCP 服务器结构化检查弹窗。从 Codex 应用服务器 (`mcpServerStatus/list`) 读取 MCP 服务器状态，以**顶部摘要带 + 多个 server inspection section** 的形式展示每个服务器的名称、版本、描述、网站 URL、认证状态徽章、工具列表（含描述和可展开的 JSON 输入 schema）、资源和资源模板。资源条目可点击查看（通过 `mcpServer/resource/read` 获取内容，文本/图片安全渲染，二进制显示元数据）。包含刷新工具栏按钮和条件性"认证"按钮（当 `authStatus === 'needs_auth'` 或 `'notLoggedIn'` 时触发 `mcpServer/oauth/login` OAuth 流程）。

弹窗使用共享的 `.opencodian-inspection-panel` 布局系统：顶部摘要带包含用途说明、只读提示、状态徽章和刷新按钮；每个服务器是一个 `.opencodian-inspection-section`；工具/资源使用 `.opencodian-inspection-row` 行渲染。不使用嵌套卡片。

## 导入关系
上游: `obsidian`（App、Modal、Notice）、`CodexAppServerClient`（`AppServerMcpResource`、`AppServerMcpResourceReadResult`、`AppServerMcpServerStatus` 类型）、`i18n`
下游: 被 `SettingsCodexReadbackControls.openMcpServerDetailModal()` 打开；被 `OpenCodianView.openCodexMcpServerDetailFromChat()` 打开（chat→detail 入口）

## 核心类型 / 接口

```typescript
interface CodexMcpServerDetailModalHost {
  getMcpServerStatus(): Promise<AppServerMcpServerStatus[] | null>;
  reloadMcpServers(): Promise<boolean>;
  triggerMcpServerOAuth(name: string, options?: { scopes?: string[]; timeoutSecs?: number }): Promise<McpOauthLoginResult | null>;
  readMcpServerResource(server: string, uri: string): Promise<AppServerMcpResourceReadResult | null>;
}

// 共享 host 工厂——从 adapter-like 对象创建 host，settings 和 chat 两路复用
function createCodexMcpServerDetailHost(adapter: CodexMcpServerDetailAdapterLike): CodexMcpServerDetailModalHost;
```

构造函数: `new CodexMcpServerDetailModal(app, host, focusServerName?)` — `focusServerName` 在渲染后高亮并滚动到对应 server section（`.is-focused` 类）。

## 核心逻辑

### 生命周期

`onOpen()` 先渲染共享 inspection-panel shell（含摘要带、状态徽章、刷新按钮与内容区），进入 `loading` 状态，然后调用 `loadAndRender()` 获取 MCP 服务器状态。`loadAndRender()` 根据返回结果切换到 `unavailable`（返回 `null`）、`failed`（抛出异常）、`empty`（空数组）或 `success`（非空数组），并通过 `setState()` 渲染对应内容。

### 服务器 section 渲染

`renderServerSection()` 委托给三个子方法：
- `renderServerHeader()`: 标题（名称 + 版本）+ 认证状态徽章 + 条件性"认证"按钮，全部归入 `.opencodian-inspection-section-header`
- `renderServerDescription()`: 描述文本 + 网站 URL 链接
- `renderServerContent()`: 工具/资源元数据行 + 工具列表（含 schema 展开）+ 资源/模板列表

每个服务器使用 `.opencodian-modal-section.opencodian-inspection-section.opencodian-codex-mcp-server-section`，不再使用嵌套卡片。工具和资源使用 `.opencodian-inspection-row` 行渲染，主信息在左，badge/操作在右。

### 折叠/展开交互

`isSectionExpanded()` / `toggleSection()` 管理 server section 的折叠状态。`renderServerHeader()` 渲染的展开按钮带 `aria-expanded` / `aria-controls`，文案通过 `settings.codex.mcpDetail.expandServer` / `collapseServer` 本地化。

### 工具与资源渲染

工具条目与资源条目的具体 DOM 构建委托给 `CodexMcpServerDetailRenderers`：
- `renderToolEntry({ parent, serverName, toolKey, tool, expanded })`: 默认只显示 tool name + "Tool details" 按钮，点击后展开 description 与 schema toggle。
- `renderResourceEntry({ parent, serverName, resource, host, state })`: 渲染资源行与 "View" 按钮，点击后通过 `CodexMcpServerDetailRenderers.handleViewResource()` 读取并安全展示内容。
- `renderResourceTemplateEntry()`: 渲染资源模板行。

modal 主类只负责状态（`expanded`、`busy`）与生命周期；渲染细节交给渲染器模块，以控制单文件行数。

### 认证流程

`handleAuthenticate()` 调用 `host.triggerMcpServerOAuth(serverName)`，通过 `CodexAppServerClient.mcpServerOauthLogin()` 触发 OAuth 浏览器重定向流程，监听 `mcpServer/oauthLogin/completed` 通知确认完成。

### 刷新流程

`handleReload()` 先设置 `busy = true`，调用 `host.reloadMcpServers()`（→ `config/mcpServer/reload`），成功后调用 `loadAndRender()` 重新获取并渲染。`loadAndRender()` 自身也负责 `busy` 状态的生命周期（`try/finally`），保证并发操作安全和重渲染成功。

### 并发保护

`busy` 标志用于防止初始加载、刷新、认证操作重叠。所有异步入口（`loadAndRender`、`handleReload`、`handleAuthenticate`）都通过 `try/finally` 释放 `busy`。资源读取的并发锁通过可变 `RenderBusyState` 对象透传给渲染器。

## 关键方法

| 方法 | 说明 |
|------|------|
| `onOpen()` | 自动加载并渲染 MCP 服务器状态 |
| `loadAndRender()` | 获取 MCP 数据并根据结果切换到对应状态 |
| `setState()` | 更新状态徽章与内容区：loading / unavailable / failed / empty / success |
| `renderSuccessContent()` | 渲染服务器列表 |
| `renderServerSection()` | 渲染单个 server section（折叠/展开状态） |
| `renderServerHeader()` | 渲染摘要行（标题、短 id、计数、auth badge、展开按钮） |
| `renderServerDescription()` | 渲染描述 + URL（仅展开态可见） |
| `renderServerContent()` | 渲染工具/资源子区（展开后调用渲染器） |
| `isSectionExpanded()` / `toggleSection()` | 折叠/展开状态管理 |
| `handleReload()` | 刷新 MCP 配置并重新渲染 |
| `handleAuthenticate()` | 触发 OAuth 认证流程并重新渲染 |
| `applyFocusServer()` | 渲染后高亮并滚动到 `focusServerName` 对应 section（chat→detail 入口） |

## 数据流

```
SettingsCodexReadbackControls → 打开 CodexMcpServerDetailModal
OpenCodianView.openCodexMcpServerDetailFromChat() → 打开 CodexMcpServerDetailModal(focusServerName)
         ↓
onOpen() → renderShell() → setState('loading') → loadAndRender() → host.getMcpServerStatus()
         ↓
setState(state) → renderSuccessContent() → for each server: renderServerSection() → applyFocusServer()
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
- OAuth 认证按钮在 `authStatus === 'needs_auth'` 或 `'notLoggedIn'` 时可见
- 工具 schema 使用 `JSON.stringify(tool.inputSchema, null, 2)` 格式化展示
- 认证状态徽章使用颜色编码：绿色（bearer）、灰色（none）、橙色（needs_auth/notLoggedIn）、淡灰色（unsupported）

## 2026-06-16 Collapsible server sections with two-level tool detail

MCP 服务器详情弹窗改为默认折叠每个 server section，只露出固定高度的摘要行；展开后才显示描述/网站/meta/工具/资源分区。工具也改为默认只显示名称 + "Tool details" 按钮，点击后才显示描述和 schema toggle，schema 仍需再点一次才展示完整 JSON。

### 折叠态摘要行

- 每个 server section 默认折叠，高度固定为 `96px`（CSS token `--opencodian-mcp-server-collapsed-height`）。
- 摘要行包含：display name + version、server id（当 id 与 display name 不同）、auth badge/auth action、tool/resource count、展开/收起按钮。
- 折叠态不显示 server 描述、网站 URL、工具列表、工具描述、schema、资源详情。
- 展开按钮使用原生 `<button>`，带 `aria-expanded` / `aria-controls`，文案走 i18n（`expandServer` / `collapseServer`），不依赖纯图标。

### 展开态

- 展开后显示 `.opencodian-codex-mcp-server-section-body`，包含：
  - `renderServerDescription()`: 描述文本 + 网站 URL 链接。
  - `renderServerContent()`: 工具区与资源区。
- 工具区每个工具只显示 tool name + "Tool details" 按钮；description 和 inputSchema 默认隐藏。
- 点击 "Tool details" 后，description 出现，同时出现 schema toggle；schema toggle 再点一次才展示完整 JSON。
- 资源区保持原有查看能力，但折叠态不暴露资源详情。

### focus server

- 如果构造时传入 `focusServerName` 且命中，该 section 会添加 `.is-focused` 高亮，并默认展开，保留 chat deep-link 体验。
- 未命中的 server 仍保持默认折叠。

### 新增/调整的方法

| 方法 | 说明 |
|------|------|
| `expanded` | 内部状态：`sections`（已展开 server 集合）、`toolDetails`（已展开工具详情集合）。 |
| `isSectionExpanded(name)` | 判断指定 server 是否已展开。 |
| `toggleSection(name, sectionEl, bodyEl, button)` | 切换 server 折叠/展开并更新 ARIA 与文案。 |
| `renderServerHeader()` | 现在负责渲染摘要行（标题、短 id、计数、auth、展开按钮）。 |
| `renderToolEntry()` | 签名改为 `(parent, serverName, toolKey, tool)`，内部渲染 tool name + details button + 二级 details 容器（description + schema toggle）。 |

### DOM / CSS 类更新

- `.opencodian-codex-mcp-server-section` 折叠态使用固定高度 `96px`、`overflow: hidden`、`gap: 0`；展开态移除高度限制并恢复 section 内间距。
- `.opencodian-codex-mcp-server-section-header` 负责固定高度摘要行，标题 `h4` 保持 `padding-left: 0` / `padding-inline-start: 0`。
- `.opencodian-codex-mcp-server-section-counts` 显示 tool/resource count。
- `.opencodian-codex-mcp-server-section-short-id` 显示 server id 摘要（仅当与 display name 不同）。
- `.opencodian-codex-mcp-server-section-body` 为展开内容容器，`.is-hidden` 控制显隐。
- `.opencodian-codex-mcp-server-expand-btn` 为 server 展开/收起按钮。
- `.opencodian-codex-mcp-tool-detail-btn` 为工具详情按钮。
- `.opencodian-codex-mcp-tool-details` 为工具详情容器（description + schema toggle），`.is-hidden` 控制显隐。
- `.opencodian-codex-mcp-tool-schema` 改为复用 `.opencodian-inspection-code` 样式，仍需点击 schema toggle 才显示。

## 2026-06-16 Section-based layout

服务器列表从嵌套卡片改为顶部摘要 + server sections：

- 内容根元素包裹在 `.opencodian-modal-shell.opencodian-inspection-panel` 中；顶部增加统一摘要带（`.opencodian-inspection-summary`）。
- 每个 server 使用 `.opencodian-modal-section.opencodian-inspection-section.opencodian-codex-mcp-server-section`，不再使用 `.opencodian-modal-card` 或 `.opencodian-codex-mcp-server-card`。
- section header 的 `h4` 使用 `padding-left: 0` / `padding-inline-start: 0`，并配合 `flex-wrap`、`min-width: 0`、`word-break: break-word`、`overflow-wrap: anywhere`，确保长 server id / name 在弹窗宽度内自动换行，不会撑破布局或产生横向滚动。
- 工具和资源列表使用 `.opencodian-inspection-row` 行布局：主信息左侧，badge/操作右侧，不再嵌套卡片。
- focus server 高亮改为使用 `::before` 伪元素绘制外框，避免改变 border width 导致布局抖动。

## 2026-06-16 Shared modal layout adoption

本 modal 改用共享 modal/inspection-panel 布局系统，替代原先的零散 margin：

- 内容根元素包裹在 `.opencodian-modal-shell.opencodian-inspection-panel` 中；顶部摘要带包含状态徽章（`.opencodian-codex-mcp-detail-status-value`）和只读提示，状态文本使用共享 `settings.codex.readback.status*` key。
- 弹窗具备 `loading` / `unavailable` / `failed` / `empty` / `success` 五种状态，每次打开自动刷新。
- 刷新按钮归入 `.opencodian-codex-mcp-detail-toolbar.opencodian-inspection-summary-actions`。
- 工具条目改用 `.opencodian-inspection-row` 结构，schema 切换按钮使用 `.opencodian-inspection-detail-toggle`。
- schema 可见性通过 `.opencodian-codex-mcp-tool-schema.is-hidden` 类切换，不再使用内联 `display:none`。
