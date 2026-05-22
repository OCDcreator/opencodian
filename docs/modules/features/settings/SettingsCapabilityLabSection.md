# SettingsCapabilityLabSection

> **源码**: `src/features/settings/SettingsCapabilityLabSection.ts`
> **状态**: [REVIEW]

## 概述

`SettingsCapabilityLabSection` 是 Debug 分区 `capability-lab` 二级标签的诊断/实验面板 owner。它提供六个只读诊断面板，用于检查 Claude Code SDK 能力对等状态，所有面板均标记为 ⚠️ DIAGNOSTIC / EXPERIMENTAL / NOT STABLE，不连接稳定设置持久化。

设计原则：不把未验证能力包装成稳定 UI。所有交互都是只读或 dry-run，不提供导入/删除/恢复按钮。

## 诊断面板

| 面板 | 功能 | 数据来源 |
|------|------|----------|
| Capability Matrix | 静态 SDK 能力对等矩阵 | 代码检查 + `getClaudeCodeAdapter()` |
| JSONL History Browser | 浏览会话消息历史 | `adapter.getSessionMessages()` |
| Subagent Browser | 列出/检查子代理转录 | `adapter.listSubagents()` / `getSubagentMessages()` |
| Rewind Dry-Run Preview | 预览文件检查点回退（不执行） | `adapter.rewindFiles(dryRun: true)` |
| Structured Output Playground | 探测结构化输出数据 | `adapter.getSessionMessages()` 检查 structured_output |
| Discovery & Status | hooks/plugins/skills/agents 状态概览 | `hasCapability()` + adapter.capabilities |

## 依赖注入

通过 `CapabilityLabDeps` 接口接收外部依赖：

- `plugin`: OpenCodianPlugin 实例
- `createSectionHeading`: 共享标题创建回调

## 核心逻辑

### Capability Matrix

`buildMatrixRows()` 静态评估 12 项 Claude Code SDK 能力（Hooks、File Checkpoint、JSONL History、Session Store、Skills、Plugins、Agents、Structured Output、Subagent Transcript、Include Hook Events、Import Session、Fork Session），每项包含 SDK Exposed、Adapter Wired、Runtime Proof 和 Stable UI 四个维度。Runtime Proof 默认为 `untested`，在对应诊断面板执行实时调用后更新为 `pass` 或 `fail`。

### Runtime Proof 更新

`updateRuntimeProof()` 在诊断面板执行后更新页面内嵌标记。不跨标签持久化——矩阵行是静态的，运行时证明反馈只在浏览器区域展示。

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
| `renderDiscoveryStatus()` | 渲染发现/状态面板 |

## 数据属性标记

所有面板和控件使用 `data-diagnostic="true"` 属性标记，便于样式和测试区分诊断性 UI。

## CSS 类命名

使用 `opencodian-capability-lab-*` 前缀：

- `.opencodian-capability-lab-banner` — 顶部实验性警告横幅
- `.opencodian-capability-lab-matrix` — 能力矩阵表格
- `.opencodian-capability-lab-chip` — 状态芯片
- `.opencodian-capability-lab-controls` — 控件容器
- `.opencodian-capability-lab-output` — 输出区域
- `.opencodian-capability-lab-error` — 错误提示
- `.opencodian-capability-lab-proof-marker` — 运行时证明标记

## 注意事项

- 此面板不提供任何写入操作（导入、删除、恢复按钮均故意省略）
- `buildMatrixRows()` 的评估基于代码检查，不是运行时探测
- Structured Output 面板说明 `backend_event` chunks 当前在 OpenCodianView 的 chunk 转换管道中被丢弃
- Discovery 面板使用 `hasCapability()` 检查 adapter 声明的能力
- 文件使用 `eslint-disable max-lines` 注释，因为六个诊断面板共享同一诊断边界
