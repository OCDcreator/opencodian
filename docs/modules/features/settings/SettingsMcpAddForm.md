# SettingsMcpAddForm

> **源码**: `src/features/settings/SettingsMcpAddForm.ts`
> **状态**: [REVIEW]

## 概述

`SettingsMcpAddForm` 是从 `SettingsMcpSection` 提取的子组件，负责渲染和验证新增 MCP 服务器表单。提取目的是保持 `SettingsMcpSection` 在 max-lines lint 阈值以下，同时完整保留 M2 新增服务器表单的全部行为。2026-04-26 的 UI 收口又把原本平铺的一长串设置项重组为 `Basics` / `Connection` / `OAuth` 的 grouped-card 表单层级，但没有改变提交 payload 或校验逻辑。

## 核心逻辑

### 表单状态

持有 `AddFormState`（type, name, command, environment, enabled, timeout, url, headers, oauthMode, oauthClientId, oauthClientSecret, oauthScope, oauthRedirectUri），所有字段变更即时写回状态。

### 本地服务器字段

`Basics` 组负责 type, name, enabled, timeout。`Connection` 组负责 command（多行文本，每行一个参数）和 environment（KEY=VALUE 对）。

### 远程服务器字段

`Basics` 组仍负责 type, name, enabled, timeout。`Connection` 组负责 url 和 headers（KEY=VALUE 对）。`OAuth` 组负责 oauth（auto / disabled / configured 三档）。

configured 档暴露 clientId、clientSecret、scope、redirectUri 四个字段；即使全部留空，也保留 `oauth: {}` 以与 auto 模式保持可区分的 payload 语义。

### 验证

提交前校验：名称必填、无重名冲突、本地命令非空、远程 URL 可解析、timeout 正整数、KV 无空键。校验失败用 Notice 阻止提交。

### 提交

组装最小必要 payload，调用 `addMcpServer`，成功后重置表单，失败时用 Notice 反馈错误。

始终保留用户选择的 `enabled` 状态（包括显式 `enabled: false`），不会省略该字段。

## 与其他模块的交互

- `src/features/settings/SettingsMcpSection.ts`: 拥有本组件实例，在渲染 add-server 区块时调用 `render()`
- `src/core/opencode/OpenCodeService.ts`: 提供 `getMcpServerSnapshot()`（重名校验）和 `addMcpServer()`
- `src/core/opencode/types.ts`: 定义 `McpServerSnapshot`

## 配置项

无。本组件不持有持久化配置，只消费表单本地状态和运行时快照。

## 注意事项

- 不直接调用 SDK 命名空间，所有数据访问通过 `OpenCodeService` 公共接口
- `parseKvPairs` / `parseKvPairsToRecord` 是本模块私有的 KEY=VALUE 解析工具
- 该组件依赖父级先提供 `.opencodian-mcp-add-form-layout` 容器；自身只负责分组壳和字段切换，不负责外层 block 标题
