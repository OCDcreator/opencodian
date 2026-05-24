# SettingsCapabilityLabSection

> **源码**: `src/features/settings/SettingsCapabilityLabSection.ts`
> **状态**: [REVIEW]

## 概述

`SettingsCapabilityLabSection` 是 Debug 分区 `capability-lab` 二级标签的诊断/实验面板 owner。它提供十个诊断面板，用于检查 Claude Code SDK 能力对等状态，所有面板均标记为 ⚠️ DIAGNOSTIC / EXPERIMENTAL / NOT STABLE，不连接稳定设置持久化。大多数交互仍是只读或 dry-run；sessionStore proof 只会写入插件内存里的 diagnostic store，并通过 Diagnostic Store 列表和 readback 证明隔离路径可读，不会改稳定设置或普通 chat UI。

设计原则：不把未验证能力包装成稳定 UI。允许最小的 diagnostic-only runtime proof，但不能把 hooks / sessionStore 伪装成 stable/completed。structured output 的 transcript 渲染与持久化已稳定，但 authoring/triggering 仍为 diagnostic-only；Capability Lab 只证明边界，不把诊断态升级成正式产品面。

## 诊断面板

| 面板 | 功能 | 数据来源 |
|------|------|----------|
| Capability Matrix | 静态 SDK 能力对等矩阵 | 代码检查 + `getClaudeCodeAdapter()` |
| JSONL History Browser | 浏览本地 JSONL 或 diagnostic store 会话历史，支持 import / mirror proof | `adapter.listSessions()` / `getSessionMessages()` / `importSessionToStore()` / `runDiagnosticPrompt()` |
| Subagent Browser | 列出/检查子代理转录 | `adapter.listSubagents()` / `getSubagentMessages()` |
| Rewind Dry-Run Preview | 预览文件检查点回退（不执行） | `adapter.rewindFiles(dryRun: true)` |
| Structured Output Playground | 启动 runtime-only outputFormat probe 并展示 `backend_event` | `adapter.runDiagnosticPrompt()` |
| Fork Session Diagnostic | Provider-owned 诊断探针：选择一个 Claude 会话并执行 fork，输出分叉后的 session ID 和标题 | `adapter.listSessions()` / `adapter.forkSession()` |
| Resume Session Diagnostic | Provider-owned 诊断探针：选择一个 Claude 会话并以 `resumeSessionId` 运行诊断 prompt，输出 resulting session id 与文本预览 | `adapter.listSessions()` / `adapter.runDiagnosticPrompt({ resumeSessionId })` |
| Session Detail Inspection | Provider-owned 诊断探针：选择一个 Claude 会话并调用 `getSession()`，输出 raw session 字段（sessionId, summary, lastModified, messageCount 等）| `adapter.listSessions()` / `adapter.getSession()` |
| Backend Routing Verification | Provider-owned 诊断探针：显示活跃后端、已注册适配器、会话后端分布，验证 `listSessions()` + `getSession()` 通过 provider-owned 路由路径工作，并额外验证 `listBackendSessions()` + `getBackendSessionPreview()` + `readBackendSessionTitle()` + `readBackendSessionShareUrl()` 通过 registry 路由层工作 | `AgentServiceRegistry` / `adapter.listSessions()` / `adapter.getSession()` / `listBackendSessions()` / `getBackendSessionPreview()` / `readBackendSessionTitle()` / `readBackendSessionShareUrl()` |
| Discovery & Status | hooks/plugins/skills/agents 状态概览，附带 SessionStart hook runtime proof；Plugins 和 Skills 现在使用 `getPluginCount()` / `getSkillCount()` 显示运行时加载计数，并通过 `getPluginsList()` / `getSkillsList()` 在 notes 中显示配置名称列表 | `hasCapability()` + adapter.capabilities + `adapter.runDiagnosticPrompt()` |
| MCP Servers Discovery | Discovery & Status 面板中的 detection-only 行：显示 adapter 已加载 MCP server 数量，不提供 authoring | `adapter.getMcpServerCount()` |
| Plugins Discovery | Discovery & Status 面板中的 detection-only 行：显示 adapter 已加载 plugin 数量及名称列表（如 `2 plugin(s): my-plugin, other-plugin`），不提供 authoring | `adapter.getPluginCount()` + `adapter.getPluginsList()` |
| Skills Discovery | Discovery & Status 面板中的 detection-only 行：显示 adapter 已加载 skill 数量及名称列表（如 `3 skill(s): skill-a, skill-b`），`skills: 'all'` 时显示 "All skills enabled"，不提供 authoring | `adapter.getSkillCount()` + `adapter.getSkillsList()` |

## 依赖注入

通过 `CapabilityLabDeps` 接口接收外部依赖：

- `plugin`: OpenCodianPlugin 实例
- `createSectionHeading`: 共享标题创建回调

## 核心逻辑

### Capability Matrix

`buildMatrixRows()` 静态评估 16 项 Claude Code SDK 能力（Hooks、File Checkpoint、JSONL History、Session Store、Skills、Plugins、Agents、Agent Definitions、Structured Output、Subagent Transcript、Include Hook Events、Import Session、Fork Session、Resume Session、Session Detail、Backend Routing），每项包含 SDK Exposed、Adapter Wired、Runtime Proof 和 Stable UI 四个维度。Runtime Proof 默认为 `untested`，在对应诊断面板执行实时调用后更新为 `pass` 或 `fail`。`Agent Definitions` 只表示 SDK `agent` / `agents` runtime-only 透传已接线，仍是 Hidden/Untested，不代表 agent authoring UI 已完成；`Session Store` 也只是隔离的 diagnostic store proof，不是正式会话存储产品面。

`buildMatrixRows()` 还包含 MCP Servers 行，标记为 SDK exposed + adapter wired、runtime proof `untested`、user surface `diagnostic`；该行只表示 Capability Lab 能检测 MCP 服务器加载状态，不表示 MCP authoring UI 已完成。

### Runtime Proof 更新

`updateRuntimeProof()` 在诊断面板执行后更新页面内嵌标记。不跨标签持久化——矩阵行是静态的，运行时证明反馈只在浏览器区域展示。

### Diagnostic Session Store

文件内部持有一个 plugin-scoped `CapabilityLabSessionStore`，实现 SDK `SessionStore` 所需的 `append` / `load` / `listSessions` / `listSubkeys`，用于 Capability Lab 的 mirror/import/list/load proof。Mirror probe 使用 `runDiagnosticPrompt({ sessionStore, sessionStoreFlush: 'eager' })` 写入后，会切到 Diagnostic Store、重新列出并选中返回的 session，再通过 `getSessionMessages(sessionId, { sessionStore, limit: 50, includeSystemMessages: false })` 渲染消息预览作为 readback proof；如果 readback 没有返回任何消息，则 Session Store proof 失败。它是内存态、plugin-owned 的诊断 adapter，不是稳定数据层。
该内存 store 现在也有直接单测，覆盖 append/load 往返、重复 append、listSessions mtime、listSubkeys、空 store 隔离和 projectKey 隔离，但这些测试只证明诊断 store 行为，不把它升级成正式存储产品。

### Adapter 获取

`getClaudeCodeAdapter()` 从 `plugin.agentServiceRegistry` 获取 `'claude-code'` 注册的 adapter 并窄化类型为 `ClaudeCodeAdapter`。如果 adapter 不可用，相关面板显示 "not available" 提示。

Discovery 面板在 adapter 可用时调用 `adapter.getMcpServerCount()`、`adapter.getPluginCount()` 和 `adapter.getSkillCount()` 显示当前已加载 MCP server / plugin / skill 数量，并通过 `getPluginsList()` / `getSkillsList()` 在 notes 中显示配置名称列表；adapter 不可用时显示 detection unavailable。这些检测均为只读，不写入设置，也不创建/编辑对应配置。Skills 的 `getSkillCount()` 在 `skills` 选项为 `'all'` 时返回 `-1`，面板会显示 "All skills enabled" 而非具体数量。MCP notes 现在指向 Claude Code settings 的 Tools tab runtime refresh 控件；Skills / Plugins 的可见只读摘要在 Claude Code settings 的 SDK Foundations tab 中显示。Capability matrix 中 Skills 和 Plugins 仍保持 `runtimeProof: 'untested'` 与 `userSurface: 'hidden'`；当前名称列表只是配置摘要诊断，不是 runtime proof，也不是 authoring UI。

## 导入关系

```text
上游: obsidian (Notice), ../../core/agents/AgentCapability (hasCapability), ../../core/agents/backend/ClaudeCodeAdapter, ../../i18n (t), ../../main (OpenCodianPlugin), ../../shared (createLogger)
下游: src/features/settings/SettingsTabbedRenderer.ts
```

## 关键方法

| 方法 / 导出 | 说明 |
|-------------|------|
| `SettingsCapabilityLabSection` | 诊断面板 owner 类 |
| `constructor(deps)` | 接收 `CapabilityLabDeps` |
| `dispose()` | 空实现，预留清理 |
| `attachTabbed(containerEl, secondaryTabId)` | 渲染完整诊断面板 |
| `renderCapabilityMatrix()` | 渲染能力矩阵表格 |
| `buildMatrixRows(adapter)` | 构建静态能力矩阵行 |
| `renderHistoryBrowser()` | 渲染 JSONL 历史浏览器 |
| `renderSubagentBrowser()` | 渲染子代理浏览器 |
| `renderRewindDryRun()` | 渲染 rewind dry-run 预览 |
| `renderStructuredOutputPlayground()` | 渲染结构化输出实验场 |
| `renderForkProbe()` | 渲染 Fork Session 诊断探针（provider-owned, diagnostic only） |
| `renderResumeProbe()` | 渲染 Resume Session 诊断探针（provider-owned, diagnostic only） |
| `renderSessionDetailProbe()` | 渲染 Session Detail 诊断探针（provider-owned, diagnostic only） |
| `renderBackendRoutingProbe()` | 渲染 Backend Routing 诊断探针（provider-owned, diagnostic only） |
| `renderDiscoveryStatus()` | 渲染发现/状态面板 |

## 数据属性标记

所有面板和控件使用 `data-diagnostic="true"` 属性标记，便于样式和测试区分诊断性 UI。

## CSS 类命名

样式由 `src/style/components/settings-capability-lab.css` 持有，使用 `opencodian-capability-lab-*` 前缀：

- `.opencodian-capability-lab-banner` — 顶部实验性警告横幅
- `.opencodian-capability-lab-summary` — 诊断边界摘要条，明确只读、dry-run 与运行时证明不持久化
- `.opencodian-capability-lab-table-shell` — 能力矩阵横向滚动容器
- `.opencodian-capability-lab-matrix` — 能力矩阵表格；最后一列使用 `User Surface` 标记 `Settings` / `Diagnostic` / `Hidden`，避免把未验证能力包装成稳定 UI
- `.opencodian-capability-lab-chip` — 状态芯片
- `.opencodian-capability-lab-controls` — 控件容器
- `.opencodian-capability-lab-output` — 输出区域
- `.opencodian-capability-lab-preview-list` / `.opencodian-capability-lab-preview-row` — 只读消息预览列表，避免 history browser 退化成整块 JSON 墙
- `.opencodian-capability-lab-error` — 错误提示
- `.opencodian-capability-lab-proof-marker` — 运行时证明标记

## 注意事项

- sessionStore import / mirror proof 会写入隔离的 diagnostic store；mirror proof 必须完成 Diagnostic Store list/select/readback 并读到至少一条消息才算通过。这不属于稳定插件状态，也不等于开放正式 import/restore UI
- `buildMatrixRows()` 的评估基于代码检查，不是运行时探测
- Structured Output 与 Hooks proof 都通过 `runDiagnosticPrompt()` 直接观察 backend_event；普通 `OpenCodianView` 仍不会把这些事件渲染进稳定 transcript。structured output 的 transcript 渲染已稳定，但 authoring/triggering 仍只在诊断面板里可见。
- Discovery 面板使用 `hasCapability()` 检查 adapter 声明的能力
- 文件使用 `eslint-disable max-lines` 注释，因为十个诊断面板共享同一诊断边界
- Fork Session 诊断探针是 provider-owned 的诊断界面，不是稳定的跨后端 fork UI。它只直接调用 Claude Code adapter 的 `forkSession()`，不触碰权威同步、diff、子会话图或通用 `getSession` 语义
- Resume Session 诊断探针同样是 provider-owned 的诊断界面，不是稳定的 resume-at / resume product surface。它只验证 `runDiagnosticPrompt({ resumeSessionId })` 能否把 SDK `options.resume` 打通到诊断 query，不等于普通聊天或正式恢复 UI 已完成
- Session Detail 诊断探针是 provider-owned 的诊断界面，不是稳定的跨后端 session-detail object contract。它调用 `adapter.getSession()` 并展示原始字段，仅用于验证 `getSession()` 在 Claude Code runtime 上可执行，不代表任何后端通用 session shape
- Backend Routing 诊断探针是 provider-owned 的诊断界面，验证后端路由基础设施工作正常。它显示活跃后端、已注册适配器和会话后端分布，并通过 `listSessions()` + `getSession()` 验证 provider-owned 路由路径，同时通过 `listBackendSessions()` + `getBackendSessionPreview()` + `readBackendSessionTitle()` + `readBackendSessionShareUrl()` 验证 registry 路由层（产品化的窄 seam）。不是稳定产品界面
- Backend Routing 诊断探针读取已注册适配器时使用 `AgentServiceRegistry.listAll()` 公开接口，不再依赖 registry 私有 `adapters` map 的实现细节
- Rewind Dry-Run 预览的 `runRewindDryRun()` 方法调用 `adapter.rewindFiles(sessionId, userMessageId, { dryRun: true })` 并渲染结果或错误+提示；该调用路径已有单元测试覆盖（成功渲染 + 失败错误提示），不改变 rewind 仅诊断、非稳定产品的事实
- Subagent Browser 的 `loadSubagents()` 和 `loadSubagentMessages()` 方法已有完整单元测试覆盖：会话刷新、子代理列表渲染、空列表处理、列表加载失败、子代理消息加载、消息加载失败、运行时证明 pass/fail，共 8 个测试用例
- Discovery 面板里的 Hooks / Agent Definitions / Session Store 条目保持 `Discovery Only`，只表示诊断观察，不是稳定产品面；Hook proof 现在会同时展示 SessionStart 事件和 hook event timeline，但仍只属于诊断验证
- Discovery 面板里的 Plugins 条目现在使用 `adapter.getPluginCount()` 动态显示加载状态：有 plugins 时显示 "Exposed" + 计数，无 plugins 时显示 "Discovery Only"；该检测为只读，不提供 plugin authoring
- Discovery 面板里的 Skills 条目现在使用 `adapter.getSkillCount()` 动态显示加载状态：有 skills 时显示 "Exposed" + 计数，`skills: 'all'` 时显示 "All skills enabled"，无 skills 时显示 "Discovery Only"；该检测为只读，不提供 skill authoring
- Discovery 面板里的 MCP Servers 条目同样保持 detection-only：只读取 adapter 的 MCP server count，用于确认静态 options 或动态缓存配置是否已加载，不提供 MCP authoring 或稳定设置入口
