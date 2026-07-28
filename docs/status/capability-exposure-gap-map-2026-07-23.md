# 能力暴露完整性 Gap 地图

> **建立日期**: 2026-07-23
> **用途**: 这是「后端能力 vs 设置界面暴露」的**唯一真相源**。后续每补一个缺口，就把对应行的状态从 `TODO` 改成 `DONE`，并在「变更记录」追加一行。
> **目标**: 让用户**在插件里就能做到对每个后端的完整配置**，不需要退出插件去改文件。
> **不是**: 这不是新的 maintainability phase，不进自动化队列。这是给人看的功能完整性对照表。
>
> **如何维护**: 允许三种基于证据的修改，每次都必须在「变更记录」追加一行：
> 1. 改状态列（TODO → DONE/WONTFIX/NON-CONFIG 等），需附证据来源；
> 2. 把一个混合 gap 拆成多个更窄的 gap（保留原编号作前缀，如 G10a/G10b）；
> 3. 新增一个此前遗漏的 gap（续编号）。
> 不要重写结构、不要新增散文叙事。一个缺口一行，可勾选、可验证。「完整配置」的判定标准见 `CONTEXT.md` 与 `docs/adr/0001`（闭环完备性，非 CRUD 对称）。

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
| Approval 回调 / Question | ✅ | ✅（approvalPolicy 顶层 + session 覆盖 + 回调桥接 fail-closed，见 G2；Question N/A）| ◐（v2.question deferred）|
| Tools 白/黑名单 | ✅/◐ | ✖ | ✅ |
| MCP Servers | ✅ | ✅ | ✅ |
| MCP OAuth / resource / tool-call | ◐ | ✅ | ✖ |
| Hooks | ✅（文件 hook）| ◐（`hooks/list` 只读 readback；无 hooks 写 route；P3 Test Vault QA 已通过）| ✖ |
| Skills | ✅ | ◐（项目层 CRUD + runtime 只读已接入，见 G10a；全局可写化见 G1）| ◐（v2.skill diagnostic）|
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
| Structured Output | ✅（/json）| ✅（outputSchema + 流式映射已通，见 G11）| ✖ |
| Images (Input) | ✖ | ✅ | ✖ |
| Account / Auth readback | ✅ | ◐ readback | ◐ |
| Plugins | ✅（marketplace）| ✖ | ✅ |
| Formatter | ✖ | ✖ | ✅ |
| LSP | ✖ | ✖ | ✅ |
| Compaction | ✖ | ◐（非配置 runtime action；真实成功与 P3 Test Vault QA 已通过）| ✅ |
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
| G1 | Skill/Resource 的 **global scope** | P1-A 已将 Claude Command/Skill/Agent（`~/.claude`）与 Codex Skill/Agent（`~/.agents`、`~/.codex`）接入显式 project/global scope、安全 CRUD、历史与调用方选定的 restore；P1-B 已将 OpenCode XDG 与 `~/.opencode` project/global source inventory、read/write/delete/history/restore 接入。所有写入、读取与历史操作均受精确 `allowlisted-root`/symlink confinement、revision 冲突与归档关联契约约束，并由目标 Jest 契约覆盖。release acceptance（production/Test Vault/真实 Obsidian UI 与安全操作）已完成；三轴仍保持诚实：`persistence` 仅在契约成功路径为 `verified`；`application` 依 request wiring 为 `pending`/`not-applicable`；无真实 backend readback 时 `runtime` 保持 `unavailable` | 🟢 `DONE`（代码、自动化测试与 release acceptance；runtime readback 按证据保持 unavailable） |
| G2 | **Codex Approval Policy** | 已作顶层设置 + session 覆盖暴露（`CodexApprovalPolicy = inherit\|untrusted\|on-request\|never`，`SettingsCodexSection` Permissions tab + `ConversationSessionSettingsModal`）。`inherit` 省略覆盖；`untrusted`/`on-request` 需 app-server+桥接并 fail-closed；`never` 可 SDK 回退。null session 覆盖继承真实全局值：`ConversationSessionSettingsCoordinator` 根据会话设置 registry 调用 adapter，adapter 再把全局默认与会话覆盖合并到下一线程边界。全局默认来源优先为 `getCodexGlobalDefaults().approvalPolicy`，否则读取持久化的 `plugin.settings.backendSettings.codex.approvalPolicy`，最终归一化回 `inherit` | 🟢 `DONE` |
| G3 | **Claude Code Sandbox 子策略** | filesystem/network/ripgrep 子策略控件已存在（`SettingsClaudeCodeSection` 的 sandbox 子策略） | 🟢 `DONE` |
| G4 | Codex Web Search Mode | 配置证据边界已闭合（settings → adapter 选项 → app-server `web_search` config；session 覆盖已接线）。cached/live 行为差异属运行时验证，归 Capability Lab/QA，非配置缺口 | 🟢 `DONE`（配置闭环）；行为验证：Capability Lab/QA |
| G5 | Claude Code 允许工具白名单 | 语义修正：`allowedTools` 是**预审批**（pre-approval）放行，非强制白名单；真正的内置白名单是 `restrictedBuiltinTools`。已用正确语义暴露二者，配置缺口已闭合 | 🟢 `DONE`（语义修正后） |
| G6 | Claude Code Hooks | P2 已在 Settings → Claude Code → Context & Sources → Configuration workbench 完成编程式 Hooks editor：单一 canonical strict-JSON draft 与 common/Advanced JSON 双向一致，schema 驱动 event/group/handler 编辑、未知字段保留、可访问的阻断诊断与语义焦点恢复；保存期 snapshot/fencing、CAS 与 archive-before-mutation 均沿用既有安全契约。RED→GREEN focused 7 suites / 84 tests，最终 `npm run verify` 648 suites / 6120 tests；macOS Test Vault BUILD_ID `main.202607261550`、三件部署文件 SHA-256 对齐，真实 Obsidian QA 与清理均通过（证据：`/Users/dht/.codex/visualizations/2026/07/26/019f9d22-6468-7ab1-a571-ee231409cb85/p2-qa-main.202607261550/`） | 🟢 `DONE`（P2 实现、自动化、部署与真实 QA） |
| G7 | Claude Code inspect 只读块 | runtimeCatalog/accountInfo/contextUsage 是**只读诊断**，不是配置项。按定义属 Capability Navigation/Capability Lab，非配置缺口 | ⚪ `NON-CONFIG / N/A` |
| G8 | OpenCode v2 deferred 方法 | session/credential/integration/pty/projectCopy 全 deferred-by-safety | 🟡 `WONTFIX`（有意 gate）|
| G9 | 三方 Provider 配置（backend-native truth） | 不以三方 CRUD 对称为目标：Claude 只写 vault-local `.claude/settings.local.json`，保存语义为 CAS/archive/conflict 安全链路，写入后 `persistence=verified`、`application=pending`（下一次 Claude 进程/请求边界前）、`runtime=unavailable`；Codex native Provider 为 external-managed/read-only，不伪造 native save，legacy plugin credential 仅 masked 且 transactional；OpenCode 必须显式选择 project/global 的 exact source，managed source 只读，写入走 CAS/archive，`pending`/restart/partial persistence 三轴诚实，effective/runtime 只读结果绝不作为写目标 | 🟢 `DONE`（backend-native contract；真实三后端 QA） |

### 🔴 第三档：后端有但界面完全没暴露 — 明确缺口

| # | 能力域 | 哪个后端有 | 状态 |
|---|--------|-----------|------|
| G10a | Codex Skills | Codex app-server 有 `skills/list`、`skills/changed`（runtime 只读 + 项目 CRUD 已接线于 `SettingsCodexResourcesSection`） | 🟢 `DONE`（项目层）；全局可写化见 G1/新 gap |
| G10b | Codex Hooks | 已接入 `hooks/list`：`{cwds?: string[]}` → `{data:[{cwd,hooks,warnings,errors}]}`；是带 source/path/enabled 的只读 readback，0.144.1 无 hooks 写 route，不能标 CRUD DONE。P3 QA 已在 Test Vault 观察到真实非空 Hooks，并通过 full state matrix、zh/en dark/light 和 314px modal（346px viewport equivalent） | 🟡 `READBACK`（部分暴露；QA 通过） |
| G10c | Codex Compaction | 已接入 `thread/compact/start({threadId})`；空 `{}` 仅 ACK。runtime verified 必须有 accepted ACK、post-dispatch 的同一非空 item ID `item/started` → matching `item/completed`（`contextCompaction`），以及新鲜 `thread/tokenUsage/updated`；completion-only、replayed 或 mismatched ID 均不验证。它是非配置 runtime action；P3 QA 已验证真实成功及 confirmation/pending/duplicate/reject/no-thread/session-switch stale fencing/timeout-warning。Test Vault 仅 1 tab，真实 stale 为 active-tab conversation/session switch；tab-ID switching 仅自动化覆盖 | 🟢 `RUNTIME VERIFIED / NON-CONFIG` |
| G11 | Codex Structured Output | SDK `TurnOptions.outputSchema` 已接线，app-server 流式映射 (`outputSchema` → turn 选项 → `item/agentMessage`) 已通 | 🟢 `DONE` |
| G12 | Codex MCP server 模式 (codex/codex-reply) | `codex mcp-server` | `WONTFIX`（判为冗余替代路径） |
| G13 | Claude Code File Checkpoint/Rewind | `Options.rewindFiles` | `BLOCKED`（上游 SDK bug #236） |
| G14 | **统一的能力差异说明** | **拒绝（WONTFIX/REJECTED）**：settings tab 本身就是导航；按「Capability Navigation」（见 CONTEXT.md）由 Capability Lab 承担「切到 X 后端会少哪些能力」，不在每个 tab 重复 | ⚪ `WONTFIX/REJECTED` |
| G15 | **OpenCode Global Config** | P1-B 已实现 OpenCode Project/Global config source inventory（含 XDG 与 `~/.opencode` 候选）、安全 read/write/delete/history/restore；managed 系统层保持只读。写入与历史操作受 allowlisted-root、symlink confinement、revision 冲突与归档关联契约约束。三轴保持诚实：`persistence` 仅在契约成功路径为 `verified`；`application` 依 request wiring 为 `pending`/`not-applicable`；无真实 backend readback 时 `runtime` 为 `unavailable` | 🟢 `DONE`（P1-B 代码、测试与 release acceptance；runtime readback 按证据保持 unavailable） |
| G16 | **Codex Profiles** | 当前 0.144.1 合约已变化：legacy `profile = "name"` 被拒绝；官方选择是 `$CODEX_HOME/<name>.config.toml` + CLI `--profile`。app-server/thread route 无 profile 选择参数，也无可验证 persistent active-profile 字段；不得实现 `~/.codex/config.toml` profiles editor/switcher，且这不是 `permissionProfile/list` | 🔴 `BLOCKED / CURRENT CONTRACT CHANGED` |

---

## 3. 建议的收敛顺序（不是全做，是按优先级收敛）

> 原则：**先消解「感觉薄弱」，再补真实 CRUD gap，最后做深度对称。** 不要一次全开，否则又回到规划丛林。

### P0 — 消解「薄弱感」的最大体感

- [x] **G14：能力导航** → **拒绝（WONTFIX/REJECTED）**：settings tab 即导航；跨后端能力差异说明归 Capability Lab（Capability Navigation），不在每个 tab 复制。

### P1 — 性价比最高的 CRUD gap 补全

- [x] **G1：global scope 可编辑化（代码、自动化与 release acceptance 已收口）**。P1-A 为 Claude/Codex 资源提供显式 project/global scope、安全 CRUD、历史与选定 restore；P1-B 为 OpenCode XDG 与 `~/.opencode` 配置源提供同等的 source inventory 与安全生命周期。allowlist、精确根目录 confinement、revision 冲突和归档关联均有契约测试。production/Test Vault/真实 Obsidian release acceptance 已完成；`persistence` 只在成功契约路径标 `verified`；`application` 保持 `pending`/`not-applicable`；没有真实 backend readback 的场景中 `runtime` 保持 `unavailable`。
- [x] **G2：Codex Approval Policy 暴露**。已作顶层设置 + session 覆盖暴露（`SettingsCodexSection` Permissions tab + `ConversationSessionSettingsModal`），`inherit`/`untrusted`/`on-request`/`never`，fail-closed 语义已实现。

### P2 — 把「假装有」的做实

- [x] **G4：Codex Web Search Mode**。配置闭环已闭合（cached/live 行为差异归 Capability Lab/QA）。
- [x] **G5：Claude Code 白名单语义修正**。`allowedTools`（预审批）与 `restrictedBuiltinTools`（真正内置白名单）已按正确语义暴露。
- [x] **G6：Claude Code Hooks 编程式编辑器**。P2 的 canonical draft、Hooks schema editor、保存期防竞态、可访问性/本地化与窄宽路径体验已收口；focused 7 suites / 84 tests、`npm run verify` 648 suites / 6120 tests 和 macOS Test Vault 真实 QA 均通过（详见 §2 G6 与 2026-07-26 变更记录）。

### P3 — 深度补全（可延后）

- [x] **G9：三方 Provider 配置（backend-native truth）**。Claude 仅 vault-local 写入并诚实呈现 `persistence=verified`、`application=pending`、`runtime=unavailable`；Codex native Provider external-managed/read-only（无伪造 native save，legacy credential masked/transactional）；OpenCode explicit project/global exact source、managed readonly、CAS/archive 与 pending/restart/partial persistence 三轴证据，effective/runtime readonly 永不成为写目标。这里收口的是各后端原生契约，不是三方 CRUD 对称。
- [x] **G10b：Codex Hooks readback**（仅 `hooks/list`，无 hooks 写 route；真实非空 readback、全状态矩阵、zh/en dark/light、窄宽 QA 已通过）
- [x] **G10c：Codex Compaction runtime action**（真实成功按 ACK + 同 item lifecycle + fresh tokenUsage 判定；confirmation/pending/duplicate/reject/no-thread/session-switch stale fencing/timeout-warning QA 已通过；非配置 runtime action）
- [ ] **G13：Claude Code File Checkpoint/Rewind** — `BLOCKED`（受上游 SDK bug #236 阻塞）
- [ ] **G16：Codex Profiles**（`BLOCKED / CURRENT CONTRACT CHANGED`；不实现 config.toml active-profile editor/switcher）

> P3 路线按终态收口：`DONE` / `READBACK` / `NON-CONFIG` / `WONTFIX` / `BLOCKED`（含 `CURRENT CONTRACT CHANGED`），不把阻断项写成已实现，也不以三方 CRUD 对称作为验收条件。G13 只有在上游 SDK bug #236 修复且真实 rewind probe 可用时才 reopening；G16 只有在官方 app-server/thread profile selection 或可验证的 persistent active-profile contract 出现时才 reopening。

---

## 4. 变更记录

| 日期 | 改动 | 行号/标识 |
|------|------|----------|
| 2026-07-27 (G9 final acceptance) | G9 按 backend-native truth 收口为 DONE：Claude 仅写 vault-local `.claude/settings.local.json`，CAS/archive/conflict 后 `persistence=verified`、`application=pending`、`runtime=unavailable`；Codex native Provider external-managed/read-only，不伪造 native save，legacy plugin credential masked/transactional；OpenCode 显式选定 project/global exact source，managed readonly，CAS/archive 与 `pending`/restart/partial persistence 三轴诚实，effective/runtime readonly 不作写目标。Standards/Spec/UX P0/P1 none；fresh verify 661 suites / 6,240 tests；lint 0 errors / 0 warnings；typecheck/build PASS；Graphify 12,394 nodes / 35,796 edges / 299 communities；CodeGraph complete、pending 0。production build/Test Vault BUILD_ID `main.202607270437`；dist/Test Vault SHA-256 对齐：`main.js`=`bc58930e6ca52a8a44af6aa03ac54df2a5946f55fb86d94913a67ce82e2088cc`、`manifest.json`=`ba6540a1fe1d5e2b0abad80db5b005df4e667120e5136396cd58b1592002e02e`、`styles.css`=`d15ba49e87236bcb48e3e45b0f2fd55ba5e2b0a93c3cec5aa4275be6bfbf79f5`。Definitive live QA: exact 346x900 en/light Claude Provider scan enumerated 30 entries with zero horizontal/vertical/clipped/nested scrollbar violations; the block expands and the parent host owns scrolling；zh/dark token-safe；runtime restored to zh/dark/Codex/1920x954 chat；final errors/residue empty；Retry injection remains AUTOMATED-ONLY；未 push。证据：`.omo/evidence/g9-live-obsidian-qa.md`、`.omo/evidence/g9-final4-build-artifacts.txt` | G9 / §3 P3 / release acceptance |
| 2026-07-26 (P3 final acceptance) | 当前 CLI 为 `codex-cli 0.144.1`，repo pinned SDK/bundled Codex 为 0.139.0。G10b 是 `hooks/list` readonly readback（无 hooks 写 route），真实非空 UI、full state matrix、zh/en dark/light 与 314px modal QA 通过；G10c 是 `thread/compact/start` 非配置 runtime action，只有 accepted ACK、post-dispatch 同一非空 ID 的 `contextCompaction` started→completed 和新鲜 tokenUsage 才验证成功；Luna 增加 same-modal generation fence 且自动化通过，final-build QA 重跑精确真实 Codex reply、真实 compaction success/confirmation/duplicate、session-switch stale fencing 与 timeout/narrow paths（Test Vault 仅 1 tab，真实 stale 为 active-tab switch；tab-ID switching 为自动化覆盖）。G16 仍为 `BLOCKED / CURRENT CONTRACT CHANGED`，不写 config；最终 `~/.codex/config.toml` 保持存在、`-rw-------`、5767 bytes、mtime `2026-07-26T18:27:10+0800`、SHA-256 `53a1b793a30d76ae7eea50b166285234e4875a9eac1fb14ef3b1398d4e2c192b`。focused 8 suites / 91 tests，verify 654 suites / 6,184 tests，production build/Test Vault BUILD_ID `main.202607262132` 与 `main.js` `19aa3a7ecb78b5583f72e225a6eb1da68623076a4b6099d6affcc762f622236a`、`manifest.json` `ba6540a1fe1d5e2b0abad80db5b005df4e667120e5136396cd58b1592002e02e`、`styles.css` `55bc2cee450cafc9739a073672813e6ad152d2e17026739935e10422eb23c339` 已核对；QA 清理完成。证据：`/Users/dht/.codex/visualizations/2026/07/26/019f9df6-ec92-7f80-8ed9-c282c6900bde/p3-qa-main.202607262020/019f9df6-ec92-7f80-8ed9-c282c6900bde-manual-qa.md`。未 push | G10b / G10c / G16 / §3 P3 |
| 2026-07-26 (P2 final acceptance) | G6 Claude Hooks 由 TODO 收口为 DONE：Configuration workbench 的 Hooks 编程式 editor 完成 canonical draft/save snapshot fencing、可见诊断与 ARIA 修复、语义键盘焦点、History 同步 ARIA、三轴本地化与路径分段。RED→GREEN focused 7 suites / 84 tests；`npm run verify` 648 suites / 6120 tests；macOS Test Vault BUILD_ID `main.202607261550` 部署后，`main.js`=`9c3cc67566e4a91734e888b1ae414d3b932a79f6b41d065679e98ef126b67462`、`manifest.json`=`ba6540a1fe1d5e2b0abad80db5b005df4e667120e5136396cd58b1592002e02e`、`styles.css`=`1a7a1629c03819c219bd67aa18f0a3ad5f21c2f065c8c2d7b377d84813f8d26a` 与 dist 全部一致；真实 Obsidian QA 及清理通过，125 个非空 artifact 的 matrix 位于 `/Users/dht/.codex/visualizations/2026/07/26/019f9d22-6468-7ab1-a571-ee231409cb85/p2-qa-main.202607261550/019f9d22-6468-7ab1-a571-ee231409cb85-manual-qa.md` | G6 / §3 P3 / P2 QA |
| 2026-07-25 (P1 final acceptance) | P1-A/P1-B 完成 release acceptance：G1 global resources 与 G15 OpenCode Project/Global Config 的 inventory、安全 CRUD、history/restore 已通过自动化门禁、Test Vault 部署及真实 Obsidian 安全操作验收。三轴继续按证据记录：`persistence` 在成功契约路径为 `verified`，`application` 为 `pending`/`not-applicable`，无真实 backend readback 时 `runtime` 为 `unavailable` | G1 / G15 / §3 P1 |
| 2026-07-24 (P1 close, code/automation only) | G1 收口为 DONE：P1-A 完成 Claude/Codex global resource 的显式 scope、安全 CRUD、revision/history/selected restore 与 Settings 编辑器；P1-B 完成 OpenCode XDG 与 `~/.opencode` source inventory、read/write/delete/history/restore。allowlist + 精确根目录/symlink confinement + 冲突/归档关联由契约测试覆盖。三轴不夸大：成功契约路径的 `persistence` 可为 `verified`，`application` 保持 `pending`/`not-applicable`，`runtime` 为 `unavailable`；生产/Test Vault/真实 Obsidian 验收未关闭 | G1 / §2 / §3 P1 |
| 2026-07-24 | 证据驱动修正：G3/G4/G5/G11/G2 标 DONE（闭环/语义已闭合）；G7 标 NON-CONFIG；G14 拒绝（settings tab 即导航，差异说明归 Capability Lab）；G10 拆为 G10a(已 DONE 项目层)/G10b/G10c；新增 G15(OpenCode Global Config)、G16(Codex Profiles)；维护规则扩展为允许证据修正/拆分/新增。配套：`CONTEXT.md`、`docs/adr/0001-complete-configuration-means-closed-loop-control.md`、A 子系统 allowlist+SHA256+归档契约、B 子系统 Codex Approval Policy、C 子系统运行时证据捕获 | §2/§3/维护规则 |
| 2026-07-24 (round 2) | 修复审查问题：G2 session 审批区分「Use global setting」与显式 inherit；最终运行时应用由 `ConversationSessionSettingsCoordinator` 经 registry 直接调用 adapter，真实全局值优先取 host、缺失时取 plugin settings，不增长 guarded `OpenCodianView`。FileRevision 契约强制 `FileRevision\|null` 并比较 canonicalPath+mtime+size+sha256（restore 也要求 expectedRevision + 校验归档内容）；归档抽出独立 `ConfigurationArchiveService`（confined 段校验 + 清单关联/文件名校验 + 原子清单写 + 类型化 `clearDeleted`）；ThreadStart/Resume 解析对齐 Codex 0.144.1 bindings（SandboxPolicy 对象 / `{id,extends}` profile / 粒度 approval）+ 诚实 evidence 映射 | §2 G2 / A·C 子系统 |
| 2026-07-24 (round 2, archive hardening) | `ConfigurationArchiveService` 安全加固：archive-root anchored realpath/symlink 逐级 parent-walk（所有读/写/删/manifest 操作经 `confinedPath`）；manifest 三态（absent/valid/present-but-invalid→fail-closed，不当首档、不覆盖）；retention 事务顺序改为「写新文件→原子提交 manifest→成功后才 best-effort 清旧；失败清孤立新文件」；`clearDeleted` 改为 manifest-first 诚实结果（cleared=实际物理删除、orphanedFiles、manifestWriteFailed）；format 纳入 manifest association + entry 扩展校验 + 跨格式拒绝 + 缺 format fail-closed；FileRevision 注释与四字段比较一致 | A 子系统 |
| 2026-07-24 (round 3) | 矩阵与已有证据对齐（不新增/不关闭其他 gap）：Approval 回调/Question 的 Codex 改 ✅（approvalPolicy 顶层 + session 覆盖 + 回调桥接 fail-closed，G2 DONE；Question N/A）；Skills 的 Codex 改 ◐（项目层 CRUD + runtime 只读已接入，G10a DONE 项目层；全局可写化仍 G1）；Structured Output 的 Codex 改 ✅（outputSchema + 流式映射，G11 DONE）。另：三轴 ConfigurationEvidence 进入 ThreadStart/Resume 生命周期（pending/verified/unavailable/failed + stale 清除 + 会话隔离）并经 Capability Lab 生产 consumer 可见；restore 路径区分 not-found vs archive-failed（manifest/entry ENOENT→not-found，非法/关联不匹配/symlink/read 错误→archive-failed） | §1 矩阵 / A·C 子系统 |
| 2026-07-24 (round 4) | 诚实性/完整性加固（不关闭新 gap、不夸大）：三轴 evidence 区分 application（request wiring；inherit→not-applicable）与 runtime（response echo），Capability Lab 视觉展示三轴标签 + 实际服务端值；client 捕获不再 stale（无字段响应清空旧 snapshot）；resolveOrStart 捕获 throw→failed；deleteSession/stop 清理 evidence。归档：抽共享 `PathConfinement` owner（assertWithinRoot/resolveCanonical/ confinedPath 三处复用，ENOENT-only fail-closed）；validateEntries 严格（sha256/timestamp 关联）；readLatestDeletedContent 校验内容 size+sha256（篡改→archive-failed）；clearDeleted 完整 association（backend/scope/kind/hash）+ integrityFailures + absent≠cleared。注意：readback 证据 ≠ 「完整配置已完成」，persistence 仍 not-applicable | A·C 子系统 / §1 矩阵文案 |
| 2026-07-24 (P0 final hardening) | 不关闭新 gap，只补硬验收证据：create 使用同目录 temp + 原子 link 的 create-if-absent；update/delete/restore 增加可控外部修改竞态测试并保留外部 bytes；archive 写入前验证 revision 与稳定 bytes 同源；clearDeleted 记录并跨 manifest commit 复核 dev/ino，词法 leaf quarantine 删除，覆盖 symlink 与同内容 regular-file swap；Codex attempt 改为全局单调 token + logical-session 归一化，覆盖 delete/stop-restart/reject/deferred startTurn/active turn/late notification/context eviction；approvalPolicy action 收束到 coordinator registry owner，无豁免 owner-guard 通过 | A·C 子系统 / G2 证据 |
| 2026-07-23 | 建立 gap 地图（基线盘点：50 能力域 × 3 后端，14 个 gap 项）| 全文 |
| 2026-07-28 (Codex provider/model switching) | Codex 能力暴露更新：(1) Settings→Codex→Account 新增只读全局配置摘要卡片（`CodexGlobalConfigSummaryReader`，读取 `~/.codex/config.toml` 安全脱敏，永不写入）；(2) `AgentCapability.Models` 落地，composer 暴露模型选择器（单一 Codex UI 分组，`getModelList` app-server/CLI 回退，next-thread 语义，鉴权感知 Custom 策略：ChatGPT 禁用 / API-key 允许 / 未知允许但标注未验证）；(3) Provider 姿态 B：#23417 app-server thread/start 可能忽略 model_provider，仅只读展示+上游链接，不提供切换控制；(4) Settings→Codex→Project configuration 二级 tab（`<vault>/.codex/config.toml` 安全行为参数编辑器，surgical TOML 保留注释/格式或 fail-closed，CAS/archive/history/restore，外部目录确认）。verify 671 suites / 6,381 tests；BUILD_ID `main.202607281235` | G16 / §3 P3 |
