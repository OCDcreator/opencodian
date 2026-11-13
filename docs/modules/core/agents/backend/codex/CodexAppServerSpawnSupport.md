# CodexAppServerSpawnSupport

> 2026-11-13（审查收紧）：**无认证回退从"退出码"改为"参数解析器拒绝证据"**。`waitForAppServerWsUrl` 现在捕获 stdout/stderr 文本（64KB 尾部有界缓冲）；非零退出时 reject 的 `AppServerFlagExitError` 仅当捕获文本包含"命名 `--ws-auth`/`--ws-token-sha256` 且同行含解析器拒绝措辞"的行（clap 3/4 `unexpected argument` / `Found argument ... which wasn't expected`，及 unknown option/argument/flag、unrecognized 等同义词）才带 `wsAuthParserRejection: true` 证据。`isUnsupportedFlagExit` 只认该证据属性——裸非零退出（配置/权限/崩溃/端口占用）、仅 Usage/帮助提及 flag 的行、spawn ENOENT、启动超时、已出 URL 后的失败全部保持硬失败，绝不降级。回退证明链：真实进程探针（`tests/fixtures/codex-old-cli-emulator.mjs` + `CodexAppServerTransport.wsAuthLive.test.ts`）证明 clap 式 exit 2 触发恰好一次无认证重试，exit 78 配置错误与 ENOENT 不降级；拒绝行匹配与 Usage 行不误报由 `hasWsAuthParserRejection` 纯函数单测固定。

> **源码**: `src/core/agents/backend/codex/CodexAppServerSpawnSupport.ts`
> **状态**: [RUNTIME_ADJUNCT]
> **Owner**: `core.backend`（随 `CodexAppServerTransport` 拆出，2026-11-13）

## 概述（2026-11-13，Codex 0.169.0）

owned app-server 的 spawn 支撑模块，从 `CodexAppServerTransport` 外移，隔离两类高风险职责：

1. **Secret 边界**：loopback WebSocket capability-token（`--ws-auth capability-token`）。
2. **Spawn readiness**：listening-URL 发现与"旧 CLI 参数解析器拒绝认证 flag"的证据级分类。

每个导出函数对 token 状态都是无副作用的总函数；raw token 只存在于调用方内存与 upgrade header，本模块不记录、不落盘、不传输。

## 职责

- `generateWsCapabilityToken()`：256-bit base64url token，每次 spawn 重新生成。
- `capabilityTokenArgvSuffix(token)`：spawn argv 后缀 `--ws-auth capability-token --ws-token-sha256 <digest>`；argv 只含 SHA-256 摘要（256-bit 随机 token 下摘要不可逆），进程列表不泄露 token。
- `capabilityTokenAuthorizationHeader(token)`：upgrade 头 `Authorization: Bearer <token>`；token 仅经此路径出内存。
- `buildAppServerSpawnArgs(wsAuthToken)`：完整 argv（`app-server --listen ws://127.0.0.1:0` + 条件认证后缀）。
- `hasWsAuthParserRejection(text)`：行级匹配——行内同时出现认证 flag 名与解析器拒绝措辞才算证据；Usage/Options 帮助行虽含 flag 但无拒绝措辞，不误报。
- `isUnsupportedFlagExit(error)`：仅当 error 是 `AppServerFlagExitError` 且带 `wsAuthParserRejection === true`（该属性只可能由 `waitForAppServerWsUrl` 在有证据时附加）。
- `waitForAppServerWsUrl(proc, hooks)`：从 stdout/stderr 双流扫描 `ws://127.0.0.1:<port>` URL（15s 启动超时；error/非零退出 reject）。非零退出按捕获文本附加（或不附加）`wsAuthParserRejection` 证据。`observerAvailable` 为 true 时把 stderr/stdout chunk 交给 `onServiceOutput` sink（由 transport 的 `notifyServiceOutput` 守护 observer 异常），stderr `Error:` 行按 sink 结果决定是否写日志；false 时保留 legacy 无 observer 行为。诊断 scope 与 transport 相同（`CodexAppServerClient`），日志输出字节一致。

## 维护约束

- 本模块不得引入 token 的持久化、日志或网络旁路；新增导出前先检查是否扩大 secret 面。
- **回退触发条件是证据链**：`PARSER_REJECTION_PATTERN`（拒绝措辞）、`WS_AUTH_FLAGS`（flag 名单）与 `AppServerFlagExitError.wsAuthParserRejection` 的赋值点必须三者同步修改；放松任何一个都等于把任意失败降级为无鉴权 socket。禁止把分类改回"仅退出码"。
- URL 扫描正则（`ws://127.0.0.1:\d+`）与 spawn 的 `--listen ws://127.0.0.1:0` 端口分配是同一契约；改 listen 地址需同时改两处。
- 纯支撑模块：不持有连接状态、不发起 JSON-RPC；生命周期与重连仍归 `CodexAppServerTransport`。

## 消费方

- `CodexAppServerTransport`（唯一消费方）：`doStart`（argv + URL 等待 + flag-exit 分类）、`connectAndInitialize`（Authorization 头）、`waitForWsUrl`（observer 语义适配）。
- `tests/unit/core/agents/backend/CodexAppServerTransport.wsAuth.test.ts`：spawn argv 摘要、header、一次性回退、非 flag 失败不回退、token 不入诊断日志、stop 后 token 轮换。
