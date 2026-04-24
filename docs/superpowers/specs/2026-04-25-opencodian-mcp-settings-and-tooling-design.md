# OpenCodian MCP Settings And Tooling Design

## Goal

为 OpenCodian 完整接入当前 OpenCode SDK 已暴露的 MCP 管理能力：在插件设置页中提供可用的 MCP 服务器管理界面，并让聊天里的 MCP tool call 在历史消息与流式消息中都像普通工具调用一样稳定展示。

## Chosen Approach

采用“**设置页归属到现有 Server 域 + 聊天侧复用现有工具渲染链路补齐 MCP 识别闭环**”的方案：

- 在现有 `Server` 设置页下新增 `mcp` 二级 tab，而不是新增独立一级设置页
- 新增 `SettingsMcpSection` 作为 MCP 设置 owner，负责状态读取、交互操作、表单录入和订阅刷新
- 设置页直接复用现有 `OpenCodeService` 已提供的 MCP 服务方法，不让 UI 散落直接访问 SDK
- 聊天侧继续复用现有 `OpenCodeMessageNormalizationMapper`、`OpenCodeStreamEventTransformer`、`ToolCallRenderer`、`toolIdentity` 链路
- 补齐 OpenCode 实际工具命名下的 MCP 识别、catalog 同步和结果渲染一致性

## Why This Approach

- 当前仓库已经具备一层完整的 SDK façade 和 MCP query/service 封装，继续往下堆 UI 直接碰 SDK 只会破坏现有 owner 边界
- MCP 本质上属于 OpenCode 运行时的一部分，归在 `Server` 设置页比独立一级页面更符合用户心智，也更符合当前 settings 导航结构
- 聊天区已经有 MCP 图标与摘要基础能力，因此最优路线不是重做渲染，而是补齐“识别何时是 MCP、何时刷新 catalog、何时稳定显示”
- 本轮需求明确不做 MCP resources / prompts，因此把范围锁在 MCP server 管理与 tool call 展示，能避免把产品面扩成一个更大协议浏览器

## Current State

### Already Present

- `OpenCodeSdkFacade` 已暴露 `mcp.status/add/connect/disconnect/auth.*`
- `OpenCodeCatalogQueryCoordinator` 已封装 MCP 状态变更与认证请求
- `OpenCodeService` 已向上暴露 MCP wrapper
- `OpenCodeCatalogStateStore` 已保存 MCP server status snapshot
- `OpenCodeEventSubscriptionCoordinator` 已在 `mcp.tools.changed` 时触发 MCP 状态刷新
- `ToolCallRenderer` / `mcpSummaryConfig` / `toolIdentity` 已具备 MCP 图标与摘要的部分基础

### Missing Or Incomplete

- 设置页没有 MCP 管理 UI，用户无法在插件内查看与管理 MCP server
- `Server` 设置导航里没有 `mcp` 二级入口
- 聊天消息虽然能把部分外部工具判为 MCP，但还依赖 observed tool names / registry 结果，存在真实 OpenCode 命名与 catalog 同步不完全稳定的问题
- 缺少面向用户的状态反馈：例如 `needs_auth`、`needs_client_registration`、连接失败原因等并没有在设置页形成操作闭环

## Scope

### In Scope

- 在 `Server` 设置页新增 MCP 二级 tab
- 提供 MCP 服务器状态列表
- 提供 MCP 服务器操作：
  - 刷新状态
  - 连接
  - 断开
  - OAuth 认证
  - 清除 OAuth 凭据
- 提供新增 MCP server 的基础表单：
  - `local`
  - `remote`
- 让聊天中的 MCP tool call 在以下路径里稳定显示为 MCP：
  - 历史消息 hydrate
  - 流式消息更新
  - 工具结果完成态
- 保持 MCP 图标、名称、摘要、状态与普通工具调用 UI 一致
- 中英文 i18n
- 对应模块文档同步

### Out of Scope

- MCP `resources` 的浏览、读取与注入
- MCP `prompts` 的浏览与执行入口
- 聊天工具栏中的 MCP 管理按钮
- 编辑或重构 `reference-projects/`
- 直接改动 OpenCode server / SDK 协议
- 自动修改现有 `.opencode/opencode.json` 中的复杂 MCP 项，仅支持新增 server，不做完整高级编辑器

## Information Architecture

### Settings Navigation

MCP 挂到现有 `Server` 一级页下，新增 `mcp` secondary tab。

`Server` 二级 tab 结构变为：

- `connection`
- `auth`
- `status`
- `mcp`

理由：

- MCP 是 OpenCode runtime / server capability 的一部分
- 与 `connection` / `auth` / `status` 同域，不需要额外一级页面

### Settings MCP Tab Layout

`mcp` tab 分成三个 block：

1. **Overview**
   - 当前 MCP server 总数
   - `connected` 数量
   - `needs_auth` 数量
   - `failed` 数量
   - 最后刷新时间

2. **Servers**
   - 每个 server 一张 row / card
   - 显示 name、type、status、error（如果有）
   - 提供 connect / disconnect / auth / clear auth 等操作

3. **Add Server**
   - 新增 server 表单
   - 支持 `local` / `remote`
   - 保存后立即调用 `addMcpServer`

## Data Model

### Runtime State

MCP 状态统一消费现有 `McpServerStatus`：

- `connected`
- `disabled`
- `failed`
- `needs_auth`
- `needs_client_registration`

设置页只以 runtime status 为真值，不自行维护额外状态枚举。

### Add Server Form Model

本轮表单仅支持 SDK 已暴露、用户最常用的字段。

#### Local MCP

- `type: "local"`
- `command: string[]`
- `environment?: Record<string, string>`
- `enabled?: boolean`
- `timeout?: number`

#### Remote MCP

- `type: "remote"`
- `url: string`
- `headers?: Record<string, string>`
- `oauth?: false | { clientId?: string; clientSecret?: string; scope?: string; redirectUri?: string }`
- `enabled?: boolean`
- `timeout?: number`

### Chat Tool Identity State

MCP tool identity 继续依赖三类上下文：

- `registryTools`
- `knownMcpTools`
- `observedExternalTools`

但本轮要提高稳定性：

- catalog 已知为 MCP 的工具优先判为 `mcp`
- 流式工具事件和历史 hydrate 都统一走同一套 MCP 判定语义
- 避免把真实 MCP tool 错判成 `custom`

## UX Details

### MCP Server List

每个 MCP row 显示：

- server 名称
- 类型：`local` / `remote`
- 状态 badge
- 错误信息（仅 `failed` / `needs_client_registration`）
- 操作按钮

状态文案原则：

- `connected`：已连接
- `disabled`：已禁用 / 未连接
- `needs_auth`：需要认证
- `needs_client_registration`：需要客户端注册
- `failed`：连接失败

### MCP Row Actions

#### Connected

- `Disconnect`
- `Re-auth`（仅 remote + OAuth 可用时显示）
- `Clear Auth`（仅存在 auth 清理语义时显示）

#### Disabled / Failed

- `Connect`
- 如果是 `needs_auth`，优先显示 `Authenticate`

#### Needs Auth

- `Authenticate`
- `Clear Auth`

#### Needs Client Registration

- 不提供自动修复按钮
- 显示错误说明，提示用户补 `clientId`

### Add Server Form

交互分两种模式：

#### Add Local MCP

- `Name`
- `Command`（多行，每行一个参数，首行是可执行命令）
- `Environment` key/value 列表
- `Enabled`
- `Timeout`

#### Add Remote MCP

- `Name`
- `URL`
- `Headers` key/value 列表
- `Enabled`
- `Timeout`
- OAuth 模式：
  - `Auto / Default`
  - `Disabled`
  - `Configured`
- 当 OAuth 选 `Configured` 时展开：
  - `clientId`
  - `clientSecret`
  - `scope`
  - `redirectUri`

### Validation Rules

- `name` 必填
- local `command` 至少一项非空
- remote `url` 必填且必须是可解析 URL
- `timeout` 若填写，必须为正整数
- `headers` / `environment` 不允许空 key
- 新增前若名称与当前 MCP server 冲突，禁止提交

## Chat Rendering Design

### Goal

聊天中的 MCP 调用要和普通 tool call 一样展示：

- 同样的工具头部
- 同样的折叠 / 展开
- 同样的状态轨迹
- MCP 专属图标
- MCP 语义化摘要

用户不需要理解“这是外部工具还是内置工具的另一条特殊链路”；视觉和交互应该一致，只是类型、图标与摘要不同。

### History Hydration

`OpenCodeMessageNormalizationMapper` 负责把历史 part 组装成 `tool_use` content block。

本轮要求：

- 对已知 MCP tool，hydrate 后必须稳定标记 `toolKind: 'mcp'`
- MCP task-like 结果仍遵守现有可见性规则
- 不改普通 builtin / task / question / skill 行为

### Streaming Updates

`OpenCodeStreamEventTransformer` 负责流式消息中的 tool updates。

本轮要求：

- 当 `message.updated` / `message.part.updated` / `permission.asked` 暴露出新的 MCP tool 名时，catalog 观察结果要足够快地影响当前流式渲染
- 同一个 tool call 在 pending/running/completed 阶段不能出现前后 kind 漂移
- 如果某 MCP tool 名仅在流式阶段首次出现，也要尽可能在同一轮对话中被识别为 `mcp`

### Summary And Icon Rules

- 图标继续使用现有 MCP icon
- 摘要继续复用 `mcpSummaryConfig`
- 本轮不发明新的 MCP 专属卡片布局
- 若某 MCP tool 没有命中语义字段，回退到现有 generic MCP summary 逻辑

## Interaction Rules

### Settings Refresh

以下时机必须刷新 MCP 状态：

- 打开 `Server > MCP`
- 用户点击 refresh
- `addMcpServer` 成功后
- `connectMcpServer` / `disconnectMcpServer` 成功后
- `authenticateMcp` / `completeMcpAuth` / `removeMcpAuth` 成功后
- 收到 `mcp.tools.changed`

### Authentication Flow

MCP 设置页只负责触发和反馈，不接管底层 OAuth 细节。

允许两种路径：

1. 一键 `Authenticate`
   - 调 `authenticateMcp`
   - 成功后刷新状态

2. 手动 code callback（保留底层能力）
   - 本轮 spec 默认不单独做“输入 code”表单
   - UI 优先走 SDK 的 `authenticate` 整体流程

### Error Handling

- 所有 MCP 设置页操作失败时，用 Notice 给出简洁错误
- `failed` / `needs_client_registration` 额外把错误信息保留在列表行内
- 聊天侧不新增专门的 MCP 错误样式，仍使用工具调用既有状态/错误展示

## Files And Ownership

### New UI Owner

- `src/features/settings/SettingsMcpSection.ts`

责任：

- MCP 设置页渲染
- MCP 状态刷新
- MCP server 操作触发
- Add form 本地状态与提交

### Existing Owners To Extend

- `src/features/settings/settingsLayoutRegistry.ts`
  - 新增 `server > mcp`
- `src/features/settings/SettingsTabbedRenderer.ts`
  - 渲染 `Server > MCP`
- `src/features/settings/OpenCodianSettings.ts`
  - 挂接 section 生命周期
- `src/core/opencode/OpenCodeService.ts`
  - 只复用既有方法，若确有缺口，新增极少量 façade 辅助方法
- `src/core/opencode/OpenCodeCatalogStateStore.ts`
  - 如需要，增强 MCP / external tool identity 语义
- `src/core/opencode/OpenCodeMessageNormalizationMapper.ts`
  - 补强历史消息的 MCP 判定一致性
- `src/core/opencode/OpenCodeStreamEventTransformer.ts`
  - 补强流式路径中的 MCP 判定一致性
- `src/shared/toolIdentity.ts`
  - 优化 OpenCode MCP 工具名识别优先级
- `src/utils/streaming/ToolCallRenderer.ts`
  - 仅做必要接线，不重做布局
- `src/i18n/locales/en.ts`
- `src/i18n/locales/zh.ts`

## Testing Strategy

### Required Unit Coverage

- `SettingsMcpSection`
  - 渲染不同 MCP 状态
  - 按钮显隐
  - add local / remote 校验
  - 操作后触发刷新
- `OpenCodeCatalogQueryCoordinator`
  - 继续保证 MCP service wrappers 行为正确
- `toolIdentity`
  - OpenCode 实际 MCP 工具名优先判为 `mcp`
- `OpenCodeMessageNormalizationMapper`
  - 历史消息中的 MCP tool kind 稳定
- `OpenCodeStreamEventTransformer`
  - 流式消息中的 MCP tool kind 稳定
- `ToolCallRenderer`
  - MCP 图标 / 摘要 / 状态展示不回退

### Validation Gate

完成实现后应满足：

- `npm run lint`
- `npm run typecheck`
- 相关 unit tests
- `npm run check:module-docs`
- 最后 `npm run verify`

若 UI 改动触及部署相关路径，按仓库规则还需要 build 后 Test Vault deploy，但这是实现阶段要求，不属于本轮 spec 交付的一部分。

## Documentation Impact

本轮实现如果改变下列模块行为，需要同步：

- `docs/modules/...` 中对应 `OpenCodeService` / settings / streaming 模块文档
- 如新增明显的产品能力入口，可在 `devlog.md` 记录
- 不需要新增单独 status 报告，除非实现期出现范围变更

## Risks

### Risk 1: MCP Tool Name Classification Drift

如果 OpenCode 在不同事件源下暴露出的 tool name 不完全一致，可能导致同一个 tool call 在不同阶段被判成不同 kind。

**Mitigation**

- 强化 `toolIdentity` 的优先级策略
- 让 mapper 与 stream transformer 共用同一种判定语义
- 为历史 / 流式各写回归测试

### Risk 2: UI Directly Reimplements MCP Schema Wrongly

如果设置页自己散落拼 MCP payload，很容易和 SDK schema 漂移。

**Mitigation**

- 以 `OpenCodeService` 为唯一操作入口
- form 只组装最小必要 payload
- 不做完整通用 JSON editor

### Risk 3: MCP Tab Bloats Server Settings

如果页面堆太多协议细节，`Server` 页会失焦。

**Mitigation**

- 本轮只保留 server 管理必要能力
- 不引入 resources / prompts / raw browser

## Open Questions

当前没有阻塞性开放问题；本轮已明确：

- MCP 管理在设置页完成
- 聊天区只负责工具调用展示
- MCP resources / prompts 不进入本轮范围

## Acceptance Criteria

- 用户能在 `Server` 设置页看到 `MCP` 二级 tab
- 用户能看到当前 MCP server 列表与状态
- 用户能新增 local / remote MCP server
- 用户能连接、断开、认证、清除认证
- 设置页操作后状态会刷新
- 当聊天里出现 MCP tool call 时，展示与普通工具调用一致，只是 tool kind 为 `mcp`
- 历史消息与流式消息中的 MCP kind 判定一致
- 本轮不引入 resources / prompts UI
