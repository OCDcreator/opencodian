# R-C6 外部接口（远程驱动）设计文档

- 日期：2026-09-18
- 需求基准：`docs/requirements/flowtext-parity.md` §R-C6（L724-754）、§6 跨批次硬约束、§7 设置项、§8 测试计划、§11 非目标
- 实施计划：`docs/requirements/flowtext-parity-impl-plan.md` §1 共享约束、§2 批次 C（R-C6 先出独立设计文档）
- 状态：设计稿（待主智能体验收；实施前需按 §10 开放问题定案）
- 行号证据均在本 worktree（`feature/flowtext-parity` 分支）于 2026-09-18 逐条核实。

---

## 1. 目标与范围

### 1.1 目标

为 OpenCodian 提供一个**默认关闭**的本地 HTTP 接口，允许外部程序（FlowText Harness、脚本，乃至同网段受信设备）：

1. 发起一条指令（驱动 agent 会话）；
2. 查询会话状态；
3. 同步获取结果。

安全姿态：仅绑定 `127.0.0.1`、令牌鉴权、全量审计日志（遵守既有 redaction 规则）、操作白名单、最小可用（单会话、单指令、同步取结果）。

### 1.2 明确不做（非目标，承接需求 §11）

| 不做项 | 说明 |
|---|---|
| 多用户 | 单令牌单通道；无调用方身份模型。 |
| 权限分级 | 无 per-caller 能力差异；白名单是全局的。 |
| 非环回地址默认暴露 | 默认仅 `127.0.0.1`；绑定其他地址需二次确认 + 风险警告（见 §5.3）。 |
| 限流 / 配额 | 单飞行（single-flight）之外不做速率限制。 |
| 流式推送 / WebSocket / SSE | v1 同步请求-响应；长连接留待后续批次。 |
| 文件传输通道 | 接口本身不提供任何文件读写端点（见 §4.6）。 |
| 加密传输（TLS） | 环回明文 + 令牌；非环回场景的风险由二次确认与审计覆盖，v1 不做 TLS。 |

### 1.3 与跨批次硬约束（§6）的关系

- 本接口**不新增任何写路径**：它不写 vault 文件；指令驱动的 agent 会话沿用既有后端工具策略，与本地聊天使用完全一致，无任何远程提权。
- fail-closed 优先：无令牌、错令牌、未知操作、未知路径、超大请求体、并发第二条指令，一律显式拒绝，不静默降级（见 §5.1）。
- 后端无关：接口驱动的是 `OpenCodeService` 的 OpenCode 会话。其他后端（claude-code / codex / pi）不在 v1 白名单内，如实不支持，不伪造成功（见 §4.6、§10-Q5）。

---

## 2. 现状证据（本分支核实）

需求文档的三条"现状证据"**全部在本分支复核成立**，其中第二条需要更精确的表述：

| # | 需求文档断言 | 核实结果 | 证据 |
|---|---|---|---|
| 1 | ACP 为客户端，无 host/server 模式 | **成立**。`AcpClientManager` 仅 `spawn` 外部 ACP agent 并消费其 stdio（`stdio: ['pipe','pipe','pipe']`），全文件无任何监听语义 | `src/core/acp/AcpClientManager.ts:51-87`（`connect()` + `spawn` 于 :62-66） |
| 2 | 全仓库无插件自有监听端口 | **实质成立，需精确化**。插件进程内存在两处 `net.createServer`，但都不是对外服务端口：(a) 端口可用性探针，`listen` 后立即 `close`；(b) aux 行内编辑的临时本地传输，`listen(0, '127.0.0.1')` 由内核分配临时端口、进程内自用。`4096` 端口属于 OpenCode 后端**子进程**（`opencode serve`），由 `ServerManager` 管理其生命周期，不是插件进程自持的监听器 | `src/core/opencode/LocalSidecarProcessInspector.ts:321-333`（探针）；`src/core/agents/backend/auxiliary/OpenCodeAuxScope.ts:546-548`（临时端口 0）；`src/core/opencode/ServerManager.ts:188-205`（4096 属子进程，插件仅探活/接管） |
| 3 | 无 `registerObsidianProtocolHandler` | **成立**。`rg "registerObsidianProtocolHandler" src/` 零命中（2026-09-18 在本分支执行） | — |

其他与设计直接相关的既有设施（本节仅罗列，规则见 §4 / §5 / §6）：

- **令牌/凭据的既有存放路径**：后端凭据（如 `CodexBackendSettings.apiKey`）作为普通字段进入归一化设置，默认空串、逐字段归一化（`src/core/types/settings.ts:474, 850, 1311`），经 `StorageService` 写入 vault 内 `.opencodian/settings.core.json` envelope（`src/core/storage/StorageService.ts:31-36, 589-616`）。
- **redaction 基座**：`src/shared/diagnostics/TraceRedactor.ts`（`redactionMode: 'compatibility' | 'hardened'`，:21-23、:68）与 `src/shared/diagnosticSecretSanitizer.ts`（`DIAGNOSTIC_REDACTION_PATTERNS`，:22-56；`sanitizeDiagnosticReport()`，:64）。Claude 会话追踪已示范 hardened 用法（`src/core/agents/backend/diagnostics/ClaudeSessionTraceService.ts:92-99`：`knownSecrets` 动态收集 + `redactionMode: 'hardened'` + `sanitizeExport`）。
- **追踪存储基座**：`src/shared/diagnostics/TraceStore.ts:11-21`（结构层保留 7 天 / 50MB，深采集 24h / 10MB；默认目录 `~/.config/obsidian/OpenCodian/diagnostics`，:16-19）。
- **加密随机数既有用法**：`randomBytes` 已在 TraceStore 使用（`src/shared/diagnostics/TraceStore.ts:3, 268-273`）；`randomUUID` 在 OpenCodeService（`src/core/opencode/OpenCodeService.ts:9`）。
- **驱动会话的既有公开 API**：`OpenCodeService.createSession(title, { setCurrent })`（`src/core/opencode/OpenCodeService.ts:852`）、`getSessionInfo`（:907）、`getSessionMessages`（:912）、`getSessionStatuses`（:944）、`sendMessage(message, options)` 异步生成器、`options.sessionId` 可显式指定会话（:1096-1098）；服务端中止走 `OpenCodeSessionLifecycleCoordinator.abortSession(sessionId)`（`src/core/opencode/OpenCodeSessionLifecycleCoordinator.ts:187`）。
- **端口探活可复用**：`LocalProcessProbe.canBindLocalEndpoint(host, port)`（`src/core/opencode/LocalSidecarProcessInspector.ts:321-333`），`ServerManager` 已在用（`src/core/opencode/ServerManager.ts:132`）。
- `remoteControl` 关键字在 `src/` 内零命中：设置项尚未存在，本设计为从零新增。

---

## 3. 威胁模型

本批次安全面最大，逐类攻击者过一遍。假设：接口默认关闭；开启时绑定 `127.0.0.1:4105`，令牌 256-bit。

### 3.1 攻击者画像与能力评估

**（a）无令牌攻击者**（本机其他进程、同机其他用户进程、浏览器网页 drive-by）

- 可做：探测 `127.0.0.1:4105` 端口存在性；向其发送任意字节。
- 得到什么：一律 `401`，响应体为固定文案（不区分"缺令牌/错令牌"，避免枚举 oracle）；无任何匿名路径；尝试本身进审计日志（时间、来源端口、结果 401）。
- 浏览器 drive-by（恶意网页内 `fetch('http://127.0.0.1:4105/...')`）：即使页面可发请求，也无法携带令牌 → 401；另外 `Host` 头白名单与 DNS-rebinding 防护（§4.2）在鉴权**之前**拒绝，响应不带 CORS 头，浏览器读不到任何响应体。

**（b）令牌泄露持有者**（读到令牌的本机进程、同步盘、截图、日志）

- 可做：发起指令驱动远程会话、查询状态、取结果——**能力上限等同本地聊天用户**（agent 在后端自身工具策略内可编辑 vault 文件）。
- 缓解：仅环回（远端主机无法直达）；单飞行（不能并发堆积指令）；全部请求进审计；设置页一键轮换令牌（旧令牌立即失效）；总开关关闭即失效。
- 明确接受的风险：拿到令牌 = 拿到"以插件身份驱动一次 agent 会话"的能力。本设计不试图在接口层再建一层 agent 动作审批（那是后端权限体系与硬约束 §6.1 的职责），只保证**接口本身不放大**该能力（无文件端点、无凭据端点、无配置读取端点，见 §4.6）。

**（c）恶意本机进程（同 OS 用户）**

- 同 OS 用户本可读取 vault、读取 `.opencodian/settings.core.json`（令牌即在其中）、读取既有 `apiKey` 字段、直接运行 `opencode` CLI。**它不在本接口能防御的边界内**，诚实地写明。
- 设计目标仅为"不放大"：接口不提供任何能读取凭据、配置根（`~/.claude`/`~/.codex`/`~/.pi`/`~/.opencode`）、vault 外文件的端点；审计日志不回显令牌。
- 跨用户本机进程（多用户主机）：环回绑定不隔离用户，但令牌仍不可知 → 落回 (a)；绑定非环回地址会把 (a) 升级为网络攻击者，这正是二次确认要拦的场景。

**（d）网络攻击者（默认部署下）**

- 默认仅 `127.0.0.1`：不存在网络面。非环回绑定（用户显式二次确认后）：明文 HTTP + Bearer 令牌，同网段可嗅探令牌——二次确认弹窗中必须写明此风险（§5.3）。

### 3.2 资产清单与暴露判定

| 资产 | 是否经接口暴露 | 手段 |
|---|---|---|
| 访问令牌 | **否** | 不出现在任何响应、日志、审计、错误文案；审计仅记录指纹 |
| 后端凭据（apiKey 等） | **否** | 接口无对应端点；指令文本不会注入到凭据存储路径 |
| `~/.claude` 等配置根内容 | **否** | 无文件系统端点；操作白名单是封闭集 |
| vault 外文件内容 | **否** | 同上；白名单内不存在任何接受路径参数的操作 |
| 用户指令全文 | **否**（审计只存摘要） | 审计摘要 = 长度 + SHA-256 前缀（§6.2） |
| agent 会话结果文本 | **是**（对持有效令牌者） | 与本地聊天一致，属接口的功能本身 |

### 3.3 范围外

- 后端 agent 自身的工具滥用（由后端权限体系与既有硬约束治理，接口不重复建设也不削弱）。
- 同 OS 用户的本机攻击者（见上）。
- 物理接触 / 恶意 Obsidian 插件（能做一切本接口能做的事，且更多）。

---

## 4. 技术方案

### 4.1 总体架构与 owner 归属

`npm run inspect:owner` 核实结论（2026-09-18）：

- `core.security`（现仅 `src/core/security/BlocklistChecker.ts`）：职责是"blocklist/security checks shared across the runtime"，允许依赖仅 `shared.foundation`——**放不下**需要驱动 `core.opencode` 会话的监听服务。
- `core.opencode`：已是最大 owner，AGENTS.md 明令不得再向其（尤其 `OpenCodeService`）堆积新的运行时职责。
- `src/core/remotecontrol/RemoteControlService.ts` 当前**无 owner 解析**（inspect:owner 返回 "No owner resolved"）。

**归属决定：注册新 owner `core.remotecontrol`**（layer `core`）。依据 owner 模型（`docs/architecture/owners/README.md`：owner 是完整行为单元，"isolating a high-risk dependency" 是新增文件的正当理由；新增 owner 有先例，如 2026-09-15 的 `feature.inline-edit`），一个自持监听套接字的网络服务正是"高风险依赖隔离"的典型场景，而不是薄 helper 层。

| 项 | 值 |
|---|---|
| Owner id | `core.remotecontrol` |
| 入口 | `src/core/remotecontrol/index.ts`、`src/core/remotecontrol/RemoteControlService.ts` |
| 职责 | 监听器生命周期、令牌鉴权、Host 校验、请求路由与白名单、单飞行调度、超时中止、审计事件发射 |
| 允许依赖 | `shared.foundation`、`shared.diagnostics`（TraceStore/TraceRedactor）、`core.types`、`core.opencode`（经窄接口驱动会话） |
| 禁止依赖 | `feature`、`app`（监听器绝不 import 视图） |
| Focused tests | `tests/unit/core/remotecontrol/**` |
| 必需门禁 | typecheck、module-docs、build |

组合（composition）归属 `app.composition`：`main.ts` 仅**构造** `RemoteControlService`（注入 `OpenCodeService` 门面与设置）、在设置变更时调用 `update(settings)`、`onUnload` 时 `dispose()`——与 `DiagnosticsRuntimeCoordinator` 代 `main.ts` 构造追踪服务的既有分工一致，`main.ts` 不写任何监听/鉴权逻辑。设置变更（开关、绑定地址、令牌轮换）经 `update()` 触发"停旧监听 → 校验 → 起新监听"的原子重载；新监听绑定失败则回退为**关闭态**并显式报错（fail-closed，不带着旧配置硬撑）。

实现文件面（均为 owner 内实体文件，非薄转发层）：

- `RemoteControlService.ts`：监听器 + 请求处理 + 单飞行。
- `RemoteControlAudit.ts`：审计事件类型、指令摘要派生、`TraceStore` 实例的组装（复用 `shared.diagnostics`，见 §6）。
- `RemoteControlAuth.ts`：令牌生成、常数时间摘要比对、指纹派生（纯函数，单测友好）。

### 4.2 传输层

- `node:http` 的 `http.createServer`（Electron 渲染进程内 Node 可用；仓库已直接使用 `node:child_process`/`node:net`/`node:crypto`，无新增原生依赖）。
- **默认绑定 `127.0.0.1:4105`**（显式 host 字符串，IPv4-only；不使用 `::`/未指定地址，杜绝意外双栈）。`4105` 避开 OpenCode 默认 `4096`；端口冲突时**显式失败**（`ERR_REMOTE_CONTROL_PORT_IN_USE`，设置页提示），不自动换端口（客户端需要稳定端点；可配置性见 §10-Q1）。
- **`Host` 头白名单**：仅接受 `127.0.0.1:4105`、`localhost:4105`、`[::1]:4105`，其余在鉴权前 `403`——挡 DNS rebinding。
- 无 CORS 头（`Access-Control-*` 一律不下发）；`OPTIONS` 预检直接 `405`。
- 请求体仅接受 `application/json`，上限 **64 KiB**（超限 `413`）；读体阶段即强制。
- 服务器实例 `maxConnections` 设小值（如 4）；无 keep-alive 需求时 `Connection: close`。

### 4.3 令牌：生成、存储、比对、轮换

- **生成**：`crypto.randomBytes(32)` → base64url（约 43 字符，256-bit 熵），仅在用户显式开启功能时生成（`remoteControlEnabled` 置真而令牌为空 → 自动生成后展示一次）。`randomBytes` 是仓库既有用法（`TraceStore.ts:3`）。
- **存储**：进入归一化设置字段 `remoteControlToken`，走**既有凭据同一条路径**——`src/core/types/settings.ts` 默认值 + 逐字段归一化（先例：`CodexBackendSettings.apiKey`，:474/:850/:1311），经 `StorageService` 持久化到 `.opencodian/settings.core.json` envelope（`StorageService.ts:31-36, 589-616`）。**不发明新的明文存储**：不落独立文件、不写 vault 笔记、不进 localStorage；与现有 `apiKey` 字段同受 envelope 备份机制约束。（该路径本身是 vault 内 JSON 明文，属既有约定；同步盘暴露面在 §3.1(c) 与 §10-Q4 讨论。）
- **比对**：对 `sha256(提供令牌)` 与 `sha256(存储令牌)` 做 `crypto.timingSafeEqual`（先归一到等长摘要再比较，规避长度泄漏）；任何缺失/畸形 `Authorization: Bearer` 头一律同一固定 `401` 文案。
- **轮换**：设置页"重新生成"按钮 → 旧令牌即刻失效（单值存储，天然覆盖）；关闭功能**不**清除令牌（关闭 ≠ 吊销，避免反复开关导致外部驱动程序反复失配；吊销走轮换，见 §10-Q3）。
- **永不回显**：令牌不出现在任何响应、错误、日志、审计；审计只记 `sha256(令牌)` 前 12 hex 作指纹（用于事后对账"是哪个令牌"——v1 单令牌下主要用于格式占位与未来多令牌演进）。

### 4.4 接口与请求/响应形态

全部端点统一前缀 `/v1`，统一令牌鉴权（含 `health`——保持"无令牌一律拒绝"的单一心智模型，验收标准 2 的覆盖面也最简单）。

**`GET /v1/health`** — 存活与忙碌探测：

```json
// 200
{ "ok": true, "busy": false, "sessionId": "ses_..." }
```

**`POST /v1/instruction`** — 发起指令并**同步等待结果**：

```json
// 请求
{ "instruction": "整理今日会议笔记并生成待办清单" }

// 200（轮耗尽后返回）
{
  "requestId": "rc_...",
  "sessionId": "ses_...",
  "terminalState": "completed",   // completed | cancelled | error | timeout
  "result": { "text": "…最终 assistant 文本…" },
  "durationMs": 12345
}

// 409（单飞行冲突）
{ "error": { "code": "busy", "message": "an instruction is already in flight" } }
```

**`GET /v1/session`** — 查询会话状态：

```json
// 200
{ "sessionId": "ses_...", "activity": "idle", "lastTerminalState": "completed", "lastDurationMs": 12345 }
```

**错误形态**（统一，错误码封闭集）：

| HTTP | code | 触发 |
|---|---|---|
| 400 | `malformed_request` | JSON 解析失败 / 字段类型错误 / instruction 为空或超长（>32k 字符） |
| 401 | `unauthorized` | 缺令牌 / 错令牌（固定文案，不区分两者） |
| 403 | `forbidden_host` | Host 头不在白名单 |
| 403 | `unknown_operation` | 路径不在白名单（**包括任何形如"读文件"的假想操作**，见 §4.6） |
| 405 | `method_not_allowed` | GET/POST 用错 |
| 409 | `busy` | 已有指令在飞行 |
| 413 | `payload_too_large` | 请求体 > 64 KiB |
| 500 | `internal_error` | 未分类异常（文案固定，堆栈只进审计） |

### 4.5 会话模型（最小可用：单会话、单指令、同步取结果）

- **专用会话**：服务开启后首次收到指令时 `createSession('OpenCodian Remote Control', { setCurrent: false })` 建一个**专用远程会话**——与用户当前聊天 tab 的活动会话完全隔离：不抢占界面会话、不受用户切 tab 影响、用户聊天流也不受远程指令流干扰。后续指令在同一专用会话内续跑（保留上下文；`createSession` 与 `sendMessage(…, { sessionId })` 均为 `OpenCodeService` 既有公开 API，见 §2）。
- **单飞行**：服务内一个 `inFlight` 状态机（`idle → running → terminal`）；第二条并发指令立即 `409 busy`，排队不做（最小可用）。
- **同步取结果**：处理器 `for await` 消费 `sendMessage(instruction, { sessionId })` 的 `StreamChunk` 流至终态，聚合最终 assistant 文本作为 `result.text` 返回；连接保持打开直到终态，**超时由服务端控制**而非依赖客户端断开。
- **超时中止**：硬性轮限时（建议默认 **15 分钟**，见 §10-Q2）到期即调 `abortSession(sessionId)`（`OpenCodeSessionLifecycleCoordinator.ts:187` 既有路径）并以 `terminalState: "timeout"` 返回已聚合的部分结果摘要——与硬约束 §6.4"不静默、不部分应用"一致：部分结果显式标注 `timeout`，绝不伪造成 `completed`。
- **结果边界**：`result.text` 是 agent 输出文本，与聊天界面所见同源；接口不附加任何配置、凭据、路径元数据。
- **可观测**：远程会话在 OpenCode 服务端会话列表中可见（不隐藏）；聊天视图 v1 不展示其实时流（后续批次再做透出）。

### 4.6 能力白名单

封闭集，代码内显式枚举（非配置驱动，避免"配置出错变成全开"）：

| 操作 | 端点 | 白名单内 | 说明 |
|---|---|---|---|
| `health` | `GET /v1/health` | 是 | 探活/忙碌 |
| `instruction.submit` | `POST /v1/instruction` | 是 | 唯一的能力触发点 |
| `session.status` | `GET /v1/session` | 是 | 状态查询 |
| 任何文件读/写 | — | **否** | 白名单里不存在该操作类别；带路径参数的请求体一律 `malformed_request`，带假想 `readFile` 路径的请求一律 `unknown_operation` |
| 配置/凭据/目录读取 | — | **否** | 同上 |
| 会话删除 / 会话枚举 / 模型管理 | — | **否**（v1） | 最小可用；`listSessions` 等虽有 API 但不暴露 |

白名单外的兜底语义：未知路径 + 未知方法 → `403 unknown_operation` / `405`，且**必须**进审计日志（未授权探测是最有价值的审计信号）。

验收标准 4（vault 外文件读取被拒绝）在本设计下是**结构性成立**：接口根本不存在文件操作端点，任何此类尝试命中 `unknown_operation`。若未来批次引入文件类操作，必须重新过设计门（路径 containment + 快照体系），本设计不预埋。

---

## 5. 失败语义与安全约束

### 5.1 fail-closed 请求处理顺序（固定不变）

```
连接 → ① Host 校验(403) → ② 方法+路径白名单(405/403) → ③ 令牌常数时间比对(401)
     → ④ 请求体上限+JSON 解析(413/400) → ⑤ 单飞行(409) → ⑥ 执行 → 终态
```

- 无令牌与错令牌**不可区分**（同一 `401` 文案），无任何匿名路径、无演示端点、无"只读免鉴权"端点。
- ⑤ 之前的每一步失败都必须写审计（含 401/403——这类记录的取证价值最高）；⑥ 之后必然产生一条终态审计。
- 任何内部异常落 `500 internal_error` 固定文案；细节只经 hardened redaction 进审计。
- 服务自身的失败同样是 fail-closed：`update()` 重载时新配置绑定失败 → 回到关闭态 + Notice 报错，而不是沿用旧监听。

### 5.2 关闭态语义（验收标准 1 的实现）

`remoteControlEnabled: false`（默认）时：`RemoteControlService` **根本不构造** `http.Server`，不调用任何 `listen`——不是"监听后拒绝请求"，而是无套接字。验证手段：对 `127.0.0.1:4105` 与 `[::1]:4105` 分别跑 `LocalProcessProbe.canBindLocalEndpoint`（既有探针，`LocalSidecarProcessInspector.ts:321`），两者均可绑定即证明无 IPv4/IPv6 监听（§7.4）。

### 5.3 非环回绑定的二次确认

- `remoteControlBindAddress` 归一化：接受 `127.0.0.1`（默认）、`::1`、`localhost`（归一为 `127.0.0.1`）；**其他任何值视为非环回**。
- 设置 UI 对非环回值弹**模态二次确认**，风险文案固定且双语：明文 HTTP 无 TLS、Bearer 令牌可被同网段嗅探、任何拿到令牌的设备可驱动 agent 修改 vault、审计无法识别具体调用方（无身份模型）。确认后记录 `remoteControlNonLoopbackAcknowledgedAt`（时间戳，随设置持久化）；`RemoteControlService` 绑定时二次校验该时间戳存在，缺失即拒绝启动（UI 与服务双保险）。
- 地址改回环回值时清除确认时间戳；再次改非环回需重新确认。

### 5.4 不可暴露项的实现保证（非口号）

| 禁止项 | 结构性保证 |
|---|---|
| 凭据 | `RemoteControlService` 的注入面里**没有**凭据对象；白名单无对应端点；审计经 hardened redaction 二次兜底 |
| 配置根（`~/.claude` 等）内容 | 无文件系统访问代码路径（owner 不 import `fs` 于请求面） |
| vault 外文件读取 | 无文件端点（§4.6）；请求体字段封闭（仅 `instruction` 字符串），无路径参数可注入 |
| 用户指令全文（审计） | 审计只存长度 + SHA-256 前缀（§6.2） |
| 令牌 | 单值存储、永不回显、审计只存指纹（§4.3） |

redaction 规则的遵守方式：审计导出层挂 `sanitizeExport → sanitizeDiagnosticReport()`（`diagnosticSecretSanitizer.ts:64`），结构化字段再过 `TraceRedactor({ redactionMode: 'hardened', knownSecrets })`（先例 `ClaudeSessionTraceService.ts:92-99`；`knownSecrets` 沿用"动态收集"惯例——本 owner 将当前 `remoteControlToken` 与设置内现存 apiKey 一并注入，令牌即便因未来改动意外进入日志字段也会被击穿改写）。

---

## 6. 审计日志与可观测性

### 6.1 存储位置与保留

- 复用 `shared.diagnostics` 的 `TraceStore`（独立实例，`bundlePrefix: 'remote-control'`），落默认共享诊断目录 `~/.config/obsidian/OpenCodian/diagnostics/`（`TraceStore.ts:16-19`）。**审计属安全取证，不进 vault**（避免被同步/索引/用户误删；与既有诊断目录一致）。
- 事件按**结构层（structural）**保留：7 天 / 50MB 封顶，自动淘汰（`TraceStore.ts:11-15`）——审计是滚动窗口，不是永久台账；需要长期留存的用户可自行导出 JSONL（导出同样过 redaction）。
- 存储降级行为继承 TraceStore 既有语义：磁盘失败转内存模式并计 `droppedEvents`，降级事件本身也进审计流（`onDegraded`，先例同 Claude 追踪服务）。

### 6.2 记录形态

```json
{
  "v": 1,
  "time": "2026-09-18T12:34:56.789Z",
  "event": "request.terminal",          // 或 request.rejected / lifecycle.started / lifecycle.stopped
  "requestId": "rc_...",
  "source": { "remoteAddress": "127.0.0.1", "remotePort": 54321, "host": "127.0.0.1:4105" },
  "op": "instruction.submit",
  "authFingerprint": "9f86d08b88fd",     // sha256(token) 前 12 hex，非令牌本身
  "instruction": { "charLength": 87, "sha256Prefix12": "3f2a…" },   // 摘要：无内容
  "outcome": { "httpStatus": 200, "terminalState": "completed", "durationMs": 12345 }
}
```

- **时间、来源、指令摘要、结果终态**四要素齐全（需求约束原文）；来源在环回下退化为端口对 + Host——这是无身份模型下的物理上限，如实呈现（§10-Q6）。
- **指令摘要 = `charLength` + SHA-256 前 12 hex**，刻意不含任何正文片段（连"首行截断 40 字"都不做）：验收标准 3 要求"无用户指令全文（除非显式开启调试采集）"，本设计选择**v1 不提供内容采集开关**，使该豁免条款空转——摘要已足够对账（外部驱动程序可本地留存指令原文并凭 `requestId` + 哈希比对）。若未来确需内容，必须新开显式开关并走 deep capture + hardened redaction（§10-Q5）。
- **无凭据**：记录结构里没有任何字段会承载令牌/密钥；再叠加 §5.4 的双层 redaction 兜底。

### 6.3 可观测性

- 设置页（debug 区，归属 `feature.settings-debug` 的既有 Claude/诊断追踪块旁）展示：审计目录、当前状态（关闭/监听中/错误）、`droppedEvents` 计数、"打开审计目录"入口——复用既有追踪设置的交互模式，不新建设置页。
- 生命周期事件（started/stopped/bind-failed）同审计流，便于事后还原"接口何时开着"。

---

## 7. 测试计划

### 7.1 单元测试（`tests/unit/core/remotecontrol/**`，纯函数、不依赖 Obsidian）

- 令牌：生成熵（长度/字符集）、摘要比对（正确/错误/缺失/畸形 Bearer、常数时间路径不比较原始串）、指纹派生。
- 请求路由：§4.4 错误码全表——401（无/错令牌不可区分）、403（Host 白名单外、unknown_operation）、405、409、413、400。
- 指令摘要派生：任意输入 → 仅长度+哈希，断言**不含输入子串**。
- 设置归一化：`remoteControlEnabled`/`remoteControlBindAddress`/`remoteControlToken` 缺失、错型、非法地址的回退默认；`localhost`→`127.0.0.1` 归一；非环回无确认时间戳时服务拒绝绑定。

### 7.2 契约测试（跨模块）

- `RemoteControlService` × 桩 `OpenCodeService` 驱动接口：`POST /v1/instruction` 全轮次（chunk 聚合、终态映射、`abortSession` 被调用于超时路径）；`setCurrent: false` 断言（远程会话不抢占用户活动会话）。
- 设置四件套契约：`remoteControlEnabled` 关→开→改地址→关的 `update()` 重载序列产生"停旧→起新/回退关闭"的监听状态机断言。

### 7.3 端到端（真实 `node:http`，环回自连）

- 有效令牌发起指令 → 轮终态 → 200 结果往返（桩驱动注入固定输出）。
- 超时路径：将轮限时注入为毫秒级 → 断言 `terminalState: "timeout"` 且 `abortSession` 已调。
- 审计落盘：临时目录 TraceStore 实例 → 断言 JSONL 存在、字段齐全、且**不含**令牌原文与指令正文（grep 断言）。

### 7.4 实机验收（Obsidian 真机，主智能体执行；含验收标准要求的全部负例）

1. **关闭态无监听（含 IPv6）**：默认配置启动 Obsidian，宿主机 `lsof -nP -i :4105` 为空，且 `LocalProcessProbe.canBindLocalEndpoint('127.0.0.1', 4105)` 与 `('::1', 4105)` 均为 true。
2. **无令牌被拒**：开启后 `curl http://127.0.0.1:4105/v1/health`（无头）与带错令牌头 → 均 `401` 同文案。
3. **有效令牌往返**：设置页复制令牌 → `curl -H "Authorization: Bearer …" -d '{"instruction":"…"}'` → 200 终态 + 结果；`GET /v1/session` 状态一致。
4. **vault 外读取被拒**：`curl -d '{"op":"readFile","path":"/etc/passwd"}'` → `403 unknown_operation`；带路径字段的 instruction → `400 malformed_request`。
5. **审计无凭据**：导出审计 JSONL，`grep` 断言无令牌原文、无指令全文、无 apiKey 形态串（`sk-` 前缀等）。
6. **二次确认**：绑定地址改 `0.0.0.0` → 模态出现、取消不生效、确认后才监听；设置页有醒目的"非环回已启用"状态。
7. **非目标回归**：全程聊天 tab 正常收发（远程会话不干扰用户活动会话）。

### 7.5 门禁

按 §1 共享约束：`npm run verify` 全绿（lint 0 警告）、`check:module-docs`（新增 `src/core/remotecontrol/**` 需同步 `docs/modules/**`）、`npm run graphify:update:src`、`architecture-owners.config.json` 注册新 owner 后过 `check:owner-manifest`。

---

## 8. 验收标准映射（R-C6 四条逐条）

| # | 验收标准（需求 L750-754） | 设计如何使其可验证 |
|---|---|---|
| 1 | 关闭状态：不监听任何端口（含 IPv6） | §5.2：关闭态不构造 Server、零 `listen` 调用；§7.4-1 双栈探活 + `lsof` 实机复核 |
| 2 | 开启后：无令牌请求被拒绝；有效令牌可发起指令并取回结果 | §5.1 处理顺序③（401 无匿名路径）；§4.4/4.5 同步往返；§7.3 e2e + §7.4-2/3 实机 |
| 3 | 请求进审计日志，且无凭据、无指令全文（除非显式开调试采集） | §6.2 记录形态（摘要=长度+哈希，v1 无内容采集开关，条款豁免面为空）；§5.4 双层 redaction；§7.3/7.4-5 grep 断言 |
| 4 | 尝试通过接口读取 vault 外文件被拒绝 | §4.6 白名单无文件操作，结构性 `unknown_operation`/`malformed_request`；§7.4-4 实机复现 |

---

## 9. 开放问题（需裁决）

| # | 问题 | 建议 | 理由 |
|---|---|---|---|
| Q1 | 端口是否可配置（§7 设置表只有 `remoteControlEnabled`/`remoteControlBindAddress`，无端口项） | **v1 固定 4105**，不加 `remoteControlPort`；冲突显式报错 | 外部驱动需要稳定端点；少一个设置面；真实冲突报告出现再立项 |
| Q2 | 指令轮限时默认值（需求未规定） | **15 分钟**，到期 abort + `terminalState: "timeout"` 返回已聚合摘要 | 兜住失控轮又不误伤长任务；常量先行，可配置化后议 |
| Q3 | 关闭功能时是否清除令牌 | **不清除**；吊销走"重新生成" | 关闭≠吊销；反复开关不应打断外部驱动程序的配置 |
| Q4 | 令牌存于 vault 内 `.opencodian/settings.core.json`（与既有 apiKey 同步盘暴露面一致）是否接受 | **v1 接受**（沿用既有凭据路径，不发明新存储）；文档明示风险 | OS 钥匙串引入新原生依赖，收益有限（同 OS 用户本可读全部现有密钥）；列为后续可选硬化 |
| Q5 | 审计是否保留"显式开启调试采集存全文"的豁免通道 | **v1 不实现内容采集**，条款空转 | 摘要（长度+哈希）已满足对账需求；少一个能把敏感全文落盘的开关就少一类事故 |
| Q6 | 审计"来源"在环回下只有端口对+Host，是否足够 | **v1 接受并如实写进二次确认文案** | 无多用户/身份模型（§11 非目标）下无法更强；升级身份模型属新需求 |
| Q7 | 非环回确认时间戳跨地址变更的失效策略 | 改回环回即清除；每次改非环回都重新确认 | 防止"确认一次、永久放行"的陈旧授权 |

---

## 10. 实施注意事项（交接给实现子智能体）

1. 新 owner 注册：`architecture-owners.config.json` 增 `core.remotecontrol`（含 include 子树、allowedOwnerDependencies、focused tests），跑 `npm run check:owner-manifest`；同步 `docs/architecture/owners/` 与 `docs/modules/**` 新页。
2. 设置四件套：`src/core/types/settings.ts`（`remoteControlEnabled`、`remoteControlBindAddress`、内部字段 `remoteControlToken`、`remoteControlNonLoopbackAcknowledgedAt` 的默认值+归一化）+ 设置 UI（归属既有分区，非环回二次确认模态）+ `zh.ts`/`en.ts` 双语。
3. `main.ts` 只做构造/转发/dispose；任何监听、鉴权、白名单逻辑不得进入 `OpenCodianView` / `main.ts` / `OpenCodeService`。
4. 动 `OpenCodeService` 时 CodeGraph `callers`/`impact` 先行（预期本设计**零改动** `OpenCodeService`——只用其既有公开 API）；若证实必须动，收窄为只读接线并单独说明。
