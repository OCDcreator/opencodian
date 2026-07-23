# 能力暴露完整性 Gap 地图

> **建立日期**: 2026-07-23
> **用途**: 这是「后端能力 vs 设置界面暴露」的**唯一真相源**。后续每补一个缺口，就把对应行的状态从 `TODO` 改成 `DONE`，并在「变更记录」追加一行。
> **目标**: 让用户**在插件里就能做到对每个后端的完整配置**，不需要退出插件去改文件。
> **不是**: 这不是新的 maintainability phase，不进自动化队列。这是给人看的功能完整性对照表。
>
> **如何维护**: 只允许改状态列 + 追加变更记录。不要重写结构、不要新增散文叙事。一个缺口一行，可勾选、可验证。

---

## 0. 一句话现状

后端适配层**已经接了约 50 个能力域**，问题不是「后端薄弱」，而是：(1) 已暴露的能力**质量参差**（完整 CRUD / 纯只读壳子 / 半接线并存）；(2) 同类东西**散落在多个 Section**，用户不知该去哪配；(3) 三个后端能力**不对称但界面无感知**。

解「感觉薄弱」的关键 = 建立统一的「完整配置」心智模型 + 补真实 CRUD gap，而不是继续堆功能。

---

## 1. 三个后端 × 能力域 支持矩阵

图例：**✅ 支持**（后端原生 + 已产品化/可配置，runtime 已验证）· **◐ 部分/readback**（后端原生、选项已接线到 SDK 边界，但行为不可独立验证 / 仅诊断 / 部分产品化）· **✖ 不支持**（后端无此能力）· **— 未接入**（后端有但插件未暴露）

| 能力域 | Claude Code | Codex | OpenCode SDK |
|---|:---:|:---:|:---:|
| Model 选择 + live switch | ✅ | ✅ | ✅ |
| Fallback Model | ◐ | ✖ | ✖ |
| Reasoning / Thinking / Effort | ✅ | ✅ | ◐（仅 per-agent 间接）|
| Permission Mode | ✅ | ◐（enum 有，未顶层）| ✖（用 permission/tools 表达）|
| Approval 回调 / Question | ✅ | ◐（approvalPolicy 未顶层）| ◐（v2.question deferred）|
| Tools 白/黑名单 | ✅/◐ | ✖ | ✅ |
| MCP Servers | ✅ | ✅ | ✅ |
| MCP OAuth / resource / tool-call | ◐ | ✅ | ✖ |
| Hooks | ✅（文件 hook）| —（app-server 有，未接入）| ✖ |
| Skills | ✅ | —（未接入）| ◐（v2.skill diagnostic）|
| Slash Commands | ✅ | ✖ | ✅ |
| Agents / Subagents | ◐（diagnostic）| ✖ | ✅ |
| Subagent Depth | ✖ | ✖ | ✅（1.18.3）|
| Sessions resume/fork/history | ✅ | ✅ | ◐（v2.session deferred）|
| Additional Directories / CWD | ✅ | ✅ | ✅ |
| Sandbox | ◐（子策略丰富）| ✅ | ✖ |
| Web Search Mode | ✖ | ◐（settings-only）| ✖ |
| Network Access | ◐ | ✅ | ✖ |
| Env Variables | ✅ | ◐ | ✖ |
| Turn/Budget 限制 | ✅/◐ | ✖ | ✖ |
| System Prompt / Output Style / Plan Mode | ✅ | ✖ | ◐（per-agent prompt）|
| Structured Output | ✅（/json）| —（SDK 有，未顶层）| ✖ |
| Images (Input) | ✖ | ✅ | ✖ |
| Account / Auth readback | ✅ | ◐ readback | ◐ |
| Plugins | ✅（marketplace）| ✖ | ✅ |
| Formatter | ✖ | ✖ | ✅ |
| LSP | ✖ | ✖ | ✅ |
| Compaction | ✖ | —（未接入）| ✅ |
| Share | ✖ | ✖ | ✅ |
| PTY / Terminal | ✖ | ✖ | ◐（deferred，有意 gate）|
| File Checkpoint / Rewind | ◐（SDK bug #236）| ✖ | ✖ |
| Thread Goal | ✖ | ✅ | ✖ |
| Capability Negotiation | ✖ | ✖ | ✅ |
| ACP（跨后端）| ✅ | ✅ | ✅ |

---

## 2. 暴露完整度分档（这才是 gap 的核心）

### 🟢 第一档：已完整暴露 — 不需要动

用户在插件里已能完整配置（完整 CRUD 或等价能力）。

| 能力域 | Section | 状态 |
|--------|---------|------|
| Skill（OpenCode 项目源）| `SettingsSkillSection` | ✅ DONE |
| Slash Commands | `SettingsCommandsSection` | ✅ DONE |
| MCP Server | `SettingsMcpSection` | ✅ DONE |
| ACP（外部 agent）| `SettingsAcpSection` | ✅ DONE |
| Plugin（OpenCode）| `SettingsPluginSection` | ✅ DONE |
| 自定义 Agent + subagent_depth | `SettingsAgentsSection` | ✅ DONE |
| Backend 切换 | `SettingsBackendSection` | ✅ DONE |
| Codex 基础配置 | `SettingsCodexSection` | ✅ DONE |
| Claude Providers preset | `SettingsClaudeProvidersSection` | ✅ DONE |
| OpenCode Tools 权限 | `SettingsToolSection` | ✅ DONE |

### 🟡 第二档：部分暴露 / 有缺陷 — gap 主战场

| # | 能力域 | 缺什么 | 状态 |
|---|--------|--------|------|
| G1 | Skill/Resource 的 **global scope** | `~/.claude`、`~/.agents`、`~/.codex` 全局资源**严格只读**，用户改全局必须出插件 | 🔴 `TODO` |
| G2 | **Codex Approval Policy** | SDK enum 有（never/on-request/on-failure/untrusted），未作顶层设置暴露 | 🔴 `TODO` |
| G3 | **Claude Code Sandbox 子策略** | filesystem/network/ripgrep 的丰富子策略暴露不完整，只暴露顶层 sandbox | 🔴 `TODO` |
| G4 | Codex Web Search Mode | UI 已接线但 cached/live runtime 区分未端到端验证（settings-only）| 🟡 `TODO` |
| G5 | Claude Code 允许工具白名单 | `allowedTools` 仅 readback（零强制），黑名单 OK 但白名单形同虚设 | 🟡 `TODO` |
| G6 | Claude Code Hooks | 仅文件 hook 扫描/创建/打开，无编程式 hook 编辑器 | 🟡 `TODO` |
| G7 | Claude Code inspect 只读块 | runtimeCatalog/accountInfo/contextUsage 等全是「点按钮看一眼」，不是配置项 | 🟡 `TODO`（设计取舍，可延后）|
| G8 | OpenCode v2 deferred 方法 | session/credential/integration/pty/projectCopy 全 deferred-by-safety | 🟡 `WONTFIX`（有意 gate）|
| G9 | 三方 Provider 配置对称性 | Claude 有 providers preset，Codex/OpenCode 暴露方式完全不同 | 🟡 `TODO` |

### 🔴 第三档：后端有但界面完全没暴露 — 明确缺口

| # | 能力域 | 哪个后端有 | 状态 |
|---|--------|-----------|------|
| G10 | Codex Skills/Hooks/Compaction | Codex app-server 有 `skills/list`、`hooks/list`、`thread/compact/start` | `TODO`（若要 Codex 真正对称）|
| G11 | Codex Structured Output | SDK `TurnOptions.outputSchema` | `TODO` |
| G12 | Codex MCP server 模式 (codex/codex-reply) | `codex mcp-server` | `WONTFIX`（判为冗余替代路径）|
| G13 | Claude Code File Checkpoint/Rewind | `Options.rewindFiles` | `BLOCKED`（上游 SDK bug #236）|
| G14 | **统一的能力差异说明** | 三后端差异巨大，用户面前无任何地方说明「切到 X 后端会少这些功能」| 🔴 `TODO`（体验缺口）|

---

## 3. 建议的收敛顺序（不是全做，是按优先级收敛）

> 原则：**先消解「感觉薄弱」，再补真实 CRUD gap，最后做深度对称。** 不要一次全开，否则又回到规划丛林。

### P0 — 消解「薄弱感」的最大体感

- [ ] **G14：能力导航**。改造 `SettingsCapabilityLabSection`（现 8720 行，专做诊断）：用户选某个后端时，直接显示「该后端支持的完整能力清单 + 每项能否在插件配 + 去哪配」。把诊断变导航。**预计单点消解 80% 薄弱感。**

### P1 — 性价比最高的 CRUD gap 补全

- [ ] **G1：global scope 可编辑化**。把 `~/.claude`、`~/.agents`、`~/.codex` 从只读升级为可编辑（带 project/global scope 切换）。这是用户最直接的「我在插件里配不全」痛点。
- [ ] **G2：Codex Approval Policy 暴露**。后端原生支持却没暴露，纯遗漏。

### P2 — 把「假装有」的做实

- [ ] **G4：Codex Web Search Mode 端到端验证**。UI 已接线，补 runtime 验证闭环。
- [ ] **G5：Claude Code allowedTools 白名单做实**。或明确降级为「仅诊断」并改 UI 文案诚实说明。

### P3 — 深度补全（可延后）

- [ ] **G3：Claude Code Sandbox 子策略完整暴露**
- [ ] **G6：Claude Code Hooks 编程式编辑器**
- [ ] **G10：Codex Skills/Hooks/Compaction 接入**（若要 Codex 真正对称）
- [ ] **G11：structured output 跨后端统一**

---

## 4. 变更记录

| 日期 | 改动 | 行号/标识 |
|------|------|----------|
| 2026-07-23 | 建立 gap 地图（基线盘点：50 能力域 × 3 后端，14 个 gap 项）| 全文 |
