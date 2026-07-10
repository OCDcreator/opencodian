# SettingsMcpSection

> **源码**: `src/features/settings/SettingsMcpSection.ts`
> **状态**: [REVIEW]

## 概述

`SettingsMcpSection` 是设置页独立 `MCP` 一级类目的 owner。它现在渲染一个 Obsidian DOM + CSS 实现的 shadcn-style MCP management surface：顶部 CardHeader 式说明与动作组、低调 status badge rail、ScrollArea 服务器列表、逐服务器 row-card。它只负责页面壳层、运行时操作分发和 modal 打开；项目 `.opencode/opencode.json` 的 MCP 增删改由 `McpConfigService` 负责。

## 核心逻辑

### 管理面板结构

- shell: `opencodian-mcp-settings-shell` 是 layout-only stack，不新增外层重卡片。
- overview: `opencodian-mcp-overview-shell` 只承担 summary card，`Refresh` / `Add Server` 仍留在卡片右上动作区；标题左侧文案与标题右侧 chip rail 共享同一条 header rail，避免产生第二层小卡片。
- stats: Total / Connected / Needs auth / Failed 渲染为低调 pill chips，并直接放在 `MCP 服务器` 标题右侧；每个 chip 带一个 tone dot，代替 dashboard metric cards。
- refresh status: `Last refresh` 也是标题右侧同一条 chip rail 的一员，不再拆成 overview card 下方的独立状态条。
- server list: `opencodian-mcp-server-list` 使用共享 ScrollArea root / viewport / content 三层结构，长列表在 viewport 内滚动。
- server rows: 名称右侧是一组聚合 chips：ownership badge、运行时状态 badge、transport badge；其下是 endpoint summary，右侧再是操作按钮。
- stats 和 server card 列表在 runtime snapshot / project ownership 刷新时只重绘自己的局部容器；刷新前会临时锁定局部高度并保存 `scrollTop`，下一帧恢复，避免 Add/Delete/Refresh 造成列表坍塌或轻微跳动。

### 运行时操作

Connect / Disconnect / Authenticate / Clear Auth 仍全部走 `OpenCodeService` 的 MCP runtime seam。它们只表达运行时连接/断开，不等同于 project config 的 `enabled` 字段。

这些 runtime 操作、toolbar Refresh/Add、Add/Edit 保存回调，以及 Delete 的 project config 写入都必须在执行前重新确认当前 active backend 仍是 OpenCode。`MCP` 一级设置页本身只会在 OpenCode active 时挂载，但旧按钮 callback 可能在用户切换到 Claude Code 后短暂存活；这种 stale callback 必须显示 OpenCode-only Notice，并且不能调用 `refreshMcpServerStatus()`、connect/disconnect/auth、打开 Add/Edit modal、弹出 Delete confirm，或写 `.opencode/opencode.json`。active backend fallback 由 `settingsBackendGuards.ts` 统一解析，避免 MCP 与其他 OpenCode-owned settings owner 的 stale guard 语义漂移。

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
- MCP 主界面借鉴 shadcn Card、Badge、Button、ScrollArea 和 Alert 结构，但不要引入 React、Radix 或 Tailwind，也不要把 overview 恢复成大型 dashboard 指标卡。

### SDK capability disclosure

该 section 现在调用 `renderCapabilityDisclosureRows()`（来自 `capabilityDisclosureRow.ts`）渲染只读能力状态行，显示该 section 拥有的 SDK capability 的 available / unsupported-by-server / disabled-by-user / unknown 状态与脱敏原因，并提供 Re-check 按钮。不重复已有配置编辑器。
