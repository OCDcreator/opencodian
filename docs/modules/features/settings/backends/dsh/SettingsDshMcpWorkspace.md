# SettingsDshMcpWorkspace

> 2026-11-08：从 `SettingsDshSection` 拆出的 DSH MCP 声明工作区（编辑器 + 逐服务器表单 + 机器本地恢复列表），本页面为唯一所有权文档。

源码：`src/features/settings/backends/dsh/SettingsDshMcpWorkspace.ts`

DSH MCP 声明的完整编辑与恢复 owner。`SettingsDshSection` 在 MCP 二级页（以及 classic 布局）通过 `render(group)` 一行委托；工作区只依赖窄接口，不反向引用 section 类型。

## 边界

- `DshMcpWorkspaceHost`：`getSettings` / `getAdapter` / `validateMcpServers` / `saveSettings` / `vaultPath?` / `recoveryBaseDir?`。section 用 `DshSettingsHost` 扩展它；禁止从本文件 import section 的宿主类型（避免混合/类型 SCC）。
- `DshMcpWorkspaceConnectionPort`：状态 + `start()` + 可选 `applyMcpConfiguration()` / `getSessionMcpStatus()`，由 section 作为 connection port 传入；状态读取只消费后端实际返回，不将已挂载当作已连接。
- `DshMcpPairRow`：env/headers 键值行模型。

## 职责

- 原始 JSON 编辑器整批校验（沿用现有校验器），失败保留草稿并在 aria-live 状态节点显示通用失败文案；成功保存写入 `dsh.mcpServers` 并按会话生效语义提示。
- 逐服务器表单：stdio（command/args/env 对行）与 http（url/headers 对行）；env 与 headers 值输入为 `type="password"` 掩码，原文不进入 DOM 文本。
- 保存路径：校验 → 归档“保存前值”到机器本地恢复库 → `saveSettings`；保存失败回滚且不轮转历史；归档失败如实提示“历史不可用”但不回滚已落盘保存。
- 恢复列表：元数据 only（保存时间 + 字节数），按 vault 哈希身份隔离；恢复两步确认，恢复前以 CAS 复核当前已保存 revision，stale 时仅重绘列表、绝不写入；恢复本身经同一校验 + 保存路径落盘，并把被顶替的当前状态先归档。用户操作数 ≤ 3（展开 → Restore → 确认）。
- 2026-11-08（P2 修复）：`recovery.list` 读取失败（基础目录是普通文件/符号链接、权限不私有或不可达）只降级历史列表区域——在列表外层的 `role="status"` 节点显示本地化 `settings.backend.recovery.unavailable`，MCP 表单、保存按钮与空态保持可用，原始错误文本与路径不进 DOM。重新展开 disclosure 会重读列表但保留 stale/unavailable 反馈，不再清空状态节点。

## 2026-11-09 折叠区一致性与 JSON 编辑布局

原始 JSON disclosure 现在沿用 DSH 单层边框面板：整行标题与右侧 chevron、统一 body 内边距。`renderMcpRawEditor` 在 summary 后创建现有 disclosure body，服务器声明 Setting 标记为 `opencodian-dsh-json-setting`，使名称和说明在上、全宽等宽字体编辑器在下；不再将长说明和代码编辑器挤在左右两列。DSH 四类折叠区（启动高级项、可用默认值恢复、MCP 历史恢复、原始 JSON）共享同一套外框／summary 样式。JSON 的 draft、onChange、校验、保存和应用流程未改变。

## 2026-11-09 高级参数与运行状态

选中服务器的编辑器增加原生 disclosure，Native 支持 stdio 工作目录、工具调用超时、启动失败策略、指令字节预算，以及自动重连、初始／最大间隔和最大次数。Native 控件修改原有 MCP 草稿，通过同一校验、保存、失败回滚和恢复链路提交；空值删除该覆盖，继承 Native 默认值。界面不会因为修改一个数值立即启动进程。

ACP 下上述高级输入只读，保留已存值与未保存草稿，切回 Native 后恢复可编辑；stdio 的 command/args/env 和 HTTP 的 URL/headers 基础编辑保持。原始 JSON 仍可携带经过既有校验器验证的高级请求值，但 disclosure、保存消息和应用消息明确说明“为 Native 保存，在 ACP 中不使用”，应用反馈仅描述 ACP 基础声明，不把高级值的持久化当成 ACP 运行时应用。

依据安装版 `@deepseek-ai/dsh-acp@0.2.2-rc.1/lib/index.js` 的 `resolveMcpConfigs`（221–258）：stdio 的 `cwd` 固定为 `sessionCwd`，stdio/HTTP 的 `failOnStartupError` 固定为 true，`toolCallTimeoutMs`、`maxInstructionBytes` 和 `reconnect` 均不读取服务器声明中的覆盖。`newSession` 与 `resumeSession` 都通过同一 MCP 挂载链路；此修复只诚实呈现该边界，不新增 ACP 应用映射。

运行状态由独立的“读取状态”动作调用 `getSessionMcpStatus`。不支持该方法时显示明确说明；后端未提供远端连接观测时显示“已挂载；连接状态未报告”。不使用请求中的声明数量、成功挂载或模型输出伪造在线状态。迟到结果不更新已经重绘的工作区。

聚焦行为测试：`tests/unit/features/settings/backends/dsh/SettingsDshMcpAdvanced.test.ts`，覆盖草稿事务、空值继承、非法限制、保存失败回滚、未知连接状态和方法不可用，以及 ACP 高级控件禁用、基础字段仍可编辑、传输往返保留值、原始 JSON 仅持久化高级值、保存/应用提示和双语边界文案。

## 机器本地恢复存储

共享 owner：`src/core/agents/backend/configuration/BackendConfigRecoveryStore.ts`（详见该模块页）。快照位于 `~/.opencodian/backend-config-recovery/<sha256(resolve(vault)+"\n"+"dsh:mcpServers")>/dsh-mcp-servers-<1..5>.json`，目录 0700、文件 0600；vault 内或列表 UI 不保存任何秘密副本。`vaultPath` 缺失或非绝对时恢复整体 fail-closed 不可用。
