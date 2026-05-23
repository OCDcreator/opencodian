# SettingsCapabilityLabSection

> **源码**: `src/features/settings/SettingsCapabilityLabSection.ts`
> **状态**: [REVIEW]

## 概述

`SettingsCapabilityLabSection` 是 Debug 分区 `capability-lab` 二级标签的诊断/实验面板 owner。它提供十个诊断面板，用于检查 Claude Code SDK 能力对等状态，所有面板均标记为 ⚠️ DIAGNOSTIC / EXPERIMENTAL / NOT STABLE，不连接稳定设置持久化。大多数交互仍是只读或 dry-run；新增的 sessionStore proof 只会写入插件内存里的 diagnostic store，不会改稳定设置或普通 chat UI。

设计原则：不把未验证能力包装成稳定 UI。允许最小的 diagnostic-only runtime proof，但不能把 hooks / sessionStore 伪装成 stable/completed。structured output 的 transcript 渲染与持久化已稳定，但 authoring/triggering 仍为 diagnostic-only。

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
| Discovery & Status | hooks/plugins/skills/agents 状态概览，附带 SessionStart hook runtime proof | `hasCapability()` + adapter.capabilities + `adapter.runDiagnosticPrompt()` |

## 依赖注入

通过 `CapabilityLabDeps` 接口接收外部依赖：

- `plugin`: OpenCodianPlugin 实例
- `createSectionHeading`: 共享标题创建回调

## 核心逻辑

### Capability Matrix

`buildMatrixRows()` 静态评估 16 项 Claude Code SDK 能力（Hooks、File Checkpoint、JSONL History、Session Store、Skills、Plugins、Agents、Agent Definitions、Structured Output、Subagent Transcript、Include Hook Events、Import Session、Fork Session、Resume Session、Session Detail、Backend Routing），每项包含 SDK Exposed、Adapter Wired、Runtime Proof 和 Stable UI 四个维度。Runtime Proof 默认为 `untested`，在对应诊断面板执行实时调用后更新为 `pass` 或 `fail`。`Agent Definitions` 只表示 SDK `agent` / `agents` runtime-only 透传已接线，仍是 Hidden/Untested，不代表 agent authoring UI 已完成。

### Runtime Proof 更新

`updateRuntimeProof()` 在诊断面板执行后更新页面内嵌标记。不跨标签持久化——矩阵行是静态的，运行时证明反馈只在浏览器区域展示。

### Diagnostic Session Store

文件内部持有一个 plugin-scoped `CapabilityLabSessionStore`，实现 SDK `SessionStore` 所需的 `append` / `load` / `listSessions` / `listSubkeys`，用于 Capability Lab 的 mirror/import/list/load proof。它是内存态、plugin-owned 的诊断 adapter，不是稳定数据层。

### Adapter 获取

`getClaudeCodeAdapter()` 从 `plugin.agentServiceRegistry` 获取 `'claude-code'` 注册的 adapter 并窄化类型为 `ClaudeCodeAdapter`。如果 adapter 不可用，相关面板显示 "not available" 提示。

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

- sessionStore import / mirror proof 会写入隔离的 diagnostic store；这不属于稳定插件状态，也不等于开放正式 import/restore UI
- `buildMatrixRows()` 的评估基于代码检查，不是运行时探测
- Structured Output 与 Hooks proof 都通过 `runDiagnosticPrompt()` 直接观察 backend_event；普通 `OpenCodianView` 仍不会把这些事件渲染进稳定 transcript
- Discovery 面板使用 `hasCapability()` 检查 adapter 声明的能力
- 文件使用 `eslint-disable max-lines` 注释，因为十个诊断面板共享同一诊断边界
- Fork Session 诊断探针是 provider-owned 的诊断界面，不是稳定的跨后端 fork UI。它只直接调用 Claude Code adapter 的 `forkSession()`，不触碰权威同步、diff、子会话图或通用 `getSession` 语义
- Resume Session 诊断探针同样是 provider-owned 的诊断界面，不是稳定的 resume-at / resume product surface。它只验证 `runDiagnosticPrompt({ resumeSessionId })` 能否把 SDK `options.resume` 打通到诊断 query，不等于普通聊天或正式恢复 UI 已完成
- Session Detail 诊断探针是 provider-owned 的诊断界面，不是稳定的跨后端 session-detail object contract。它调用 `adapter.getSession()` 并展示原始字段，仅用于验证 `getSession()` 在 Claude Code runtime 上可执行，不代表任何后端通用 session shape
- Backend Routing 诊断探针是 provider-owned 的诊断界面，验证后端路由基础设施工作正常。它显示活跃后端、已注册适配器和会话后端分布，并通过 `listSessions()` + `getSession()` 验证 provider-owned 路由路径，同时通过 `listBackendSessions()` + `getBackendSessionPreview()` + `readBackendSessionTitle()` + `readBackendSessionShareUrl()` 验证 registry 路由层（产品化的窄 seam）。不是稳定产品界面
- Backend Routing 诊断探针读取已注册适配器时使用 `AgentServiceRegistry.listAll()` 公开接口，不再依赖 registry 私有 `adapters` map 的实现细节
