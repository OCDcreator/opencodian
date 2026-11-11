# 六后端辅助查询审计（T06）

2026-10-07：ZCode 正向控制与辅助会话都显式使用各自的 `session.sqlite`，同时覆盖两个数据库环境别名。正向控制通过真实 `session/create` 限制为 Read/Write、空 MCP 和关闭 dynamic workflow，再由同会话 `setMode` 回读确认 yolo；只允许固定测试文件和精确 `OC_ZCODE_AUX_WRITE_CONTROL` 加一个 LF，字节不等时保留失败产物。每次辅助 query 开始先清空该次 native 观察，未发出追问不能复用上一回合的空工具表。首次旧审计曾打开用户全局数据库，不能作为零残留证据；历史会话保留，新结果须单独绑定构建和数据库路径。

私有 CLI 的 residue 检查直接使用同一 owned transport 的原生 `session/list`，要求真实 sessions 数组；不调用需要桌面 TaskIndex 数据库的产品软删除投影。辅助 ID 缺席、各原生 child 已退出及全部自有 scope 已移除必须同时成立。

源码：`scripts/audit/run-aux-query-audit.mjs`、`scripts/audit/aux-query-audit.entry.ts`、`scripts/audit/opencode2-aux-query-audit.entry.ts`。

统一 runner 默认按顺序调度 `opencode / opencode2 / claude-code / codex / pi / zcode`，也允许任意已知后端组合。完整参数列表在创建缓存、打包或启动任何后端之前校验；未知 backend / option 立即失败。OpenCode 2 继续使用独立 native entry 和 HTTP bridge，不能用通用后端 proof 替代其版本、正控和 wildcard deny 读回。

## 离线验收与真实验收

`node scripts/audit/run-aux-query-audit.mjs --bundle-only` 只编译六个调度结果，不启动后端 CLI、不请求模型。编译成功退出 0，但报告仍为 `status: blocked, passed: false, execution: bundle-only`；编译成功不能记作真实模型审计 pass。

`node scripts/audit/run-aux-query-audit.mjs --preflight` 编译并启动审计用 Node 子进程，只读取路径和配置。它不启动后端 CLI、不握手 app-server、不发送模型请求，因此没有模型调用成本。配置齐全时依然返回 blocked / exit 2，说明真实验收尚未执行。聚焦测试通过 preload 拦截器禁止后端进程、fetch 和 HTTP/network 调用；仅允许编译器和审计 Node 子进程。

没有 offline flag 才是 real-model 模式，必须单独获得真实模型测试授权。模型和 vision 模型必须显式配置，支持 `AUDIT_AUX_MODEL_<BACKEND>` / `AUDIT_AUX_VISION_MODEL_<BACKEND>`，backend 后缀大写，连字符换为下划线；兼容无后缀变量。OpenCode / OpenCode 2 / Pi / ZCode 使用 provider/model；Claude Code / Codex 使用裸 model id。OpenCode 2、Pi 可配置 `OPENCODE2_BIN` / `PI_BIN`，ZCode 使用 `ZCODE_BIN` 经现有 resolver 解析，Codex 使用现有 resolver 的 `CODEX_BIN`。Claude Code harness 的实际 CLI 由 `AUDIT_CLAUDE_BIN`（优先）或 `CLAUDE_BIN` 显式覆盖：提供的值必须是存在的绝对文件路径（含指向文件的 symlink）；提供但无效（相对路径、不存在、非文件）一律 fail closed 且绝不回退固定候选，避免静默审计过期 CLI；空/空白值视为未设置。未设置时保持原固定候选顺序。

四个原通用后端保留 OpenCode 的共享诱导写入正控，使用显式 `AUDIT_AUX_CONTROL_MODEL`（仅 OpenCode 可回退自身已显式配置的 model）；preflight 与实际正控请求复用同一选择规则（`resolveWriteControlModel`）。显式 control 设置优先；无效显式值不得静默 fallback，其他后端不得借用 OpenCode model fallback。报告记录 `modelSource` 与该请求 model JSON 的 `modelProfileSha256`，不输出原始模型选择字符串。各后端的安全证明仍单独来自其 native 路径。ZCode 和 OpenCode 2 有自己的 native 正控。正控成功不能替代任一后端安全读回、工具事件审计或字节检查。

## 独立安全证据

| 后端 | 安全证明路径 | 清理证据 |
| --- | --- | --- |
| OpenCode | 现有 isolated scope 的原生工具目录/config 验证 + AuxQuerySafetyProof | scope 原生 session 列表与 dispose |
| OpenCode 2 | native v2 版本、独立 unrestricted write 正控、session/agent wildcard deny 前后读回；没有虚构 tools endpoint | text / image native session 均删除，新增 isolated scope 不存在 |
| Claude Code | 现有 SDK/CLI runtime tool readback；文字回合 proof 比对在 vision 新会话前完成 | 每个 aux SDK handle dispose；外部 CLI 完整退出仍需真实运行确认 |
| Codex | thread/start 原生 sandbox / approval / network 生效读回 | T05 listAllThreads 完整读取 active 和 archived 分区、rollout 文件数、图片临时目录；构造阶段 start/目录读取失败时，在返回 harness 前 await stop，stop 拒绝不替换原错误 |
| Pi | 现有 PiAuxQuerySession 的 native active-tools proof | native session / private scope 与 vault .pi 检查 |
| ZCode | adapter.startAuxQuerySession → ZCodeAuxQuerySession → 真实 ZCodeAppServerTransport；旁路观察 session/messages 与 session/event | aux child 确认退出、private store 不存在、原生 session/list 不暴露 aux IDs、新增 aux scope 不存在 |

ZCode generic Aux 与 sessionless inline completion 保持不同路径。本审计调用 `startAuxQuerySession` 的 `query`、`followUp` 和图片会话，绝不调用 `startInlineCompletionSession` / completion 通道。每回合要求唯一的新 user-message 身份及原生 `info.tools = {}`、无 tool 事件、`turn.completed.toolCallCount = 0`，并与该会话的零工具 proof 对照。缺少读回、旧身份、工具集变宽、未报告计数均失败；请求里的空 allowlist 自身不构成 pass。

ZCode 正控的 app-server storage 是隔离在本次 audit run 下的 native 正控证据，刻意保留在 `retainedControlEvidence`；它不属于 aux private storage。报告明确标注 `kind: native-positive-control, auxZeroResidueRequired: true`。aux scope 必须全部消失，不能把正控留证据误记为 aux-zero-residue。

字节快照包含 hidden / .git / node_modules 文件，不忽略不可读取目录；SHA-256 读失败时不能判定 unchanged。symlink 记录 link target，不跟随到 vault 外。各后端使用独立 audit vault，teardown 失败和最终字节/残留差异会改变最终状态。脚本只删除自己创建的明确文件与已空目录，异常残留保留供复查。

## 报告契约及负向情况

`AUDIT_REPORT_PATH` 保存统一 JSON；`AUDIT_SCRATCH_ROOT` 控制真实运行的证据目录，推荐使用非同步目录。每个 outcome 有 `backend, status, passed, execution, checks`；check 包含非空 name 与 boolean ok。OpenCode 2 可保留独立 native evidence detail。统一报告携带 selected 和 outcomes。

| 情况 | status | exit |
| --- | --- | --- |
| 所有真实模型审计检查通过 | passed | 0 |
| bundle-only 编译完成（真实审计未执行） | blocked | 0（只表示离线编译成功） |
| preflight / 缺模型或 CLI/provider 配置 | blocked | 2 |
| bundle/import/schema/实际审计/teardown/bytes 失败 | failed | 1 |
| 多后端同时 failed 与 blocked | failed | 1 |

child exit 0 自身不能成为 pass。backend 不一致、execution 不明、passed 与 status 冲突、checks 不是非空数组、check name/ok 缺失、offline execution 声称 pass、失败 check、child exit 与状态不符，均 fail closed。原生 proof 的空工具集只在 ZCode 当前回合独立 native 证据完整时允许。

## 输出保护边界

审计 entry 已去掉 result.text、模型原始响应、原始 exception message / String(error) 的报告输出；runner 排空子进程 stdout/stderr，不转发后端原始日志。报告保留检查布尔值、工具数量、proof / permission 读回、native IDs、文件 hash/路径和清理证据。本轮没有真实模型运行，不能声称全链路脱敏已验证。尤其 upstream SDK 自己写入本地日志、保留的 ZCode 正控 storage、任意上游返回的 permission resource / tool name / ID / filesystem path 不属于已证明完整脱敏的边界；分享这些本地证据前仍需单独审核。report 不保存 provider 配置内容或环境凭证。

## 聚焦测试

`node node_modules/jest/bin/jest.js --runInBand --selectProjects scripts --runTestsByPath tests/unit/infrastructure/aux-query-audit.test.mjs`

测试 scratch 默认使用 `path.join(os.tmpdir(), 'opencodian-aux-contract')`，可通过 `AUDIT_TEST_SCRATCH_ROOT` 显式覆盖为本机非同步 evidence 目录；测试源码不写死用户或机器路径。

测试覆盖六后端默认/混合调度、未知 backend、互斥 offline flag、failed/blocked precedence、负向 report schema、ZCode provider/model 和 generic/sessionless 区别、当前回合 native 读回负向样例、严格字节快照、带禁止 native/network 拦截器的六后端 preflight、OpenCode 2 native 验收保留。追加回归覆盖 Codex start 成功后 active/archived 分别拒绝、stop 恰好一次且必须等待、stop 自身拒绝仍保留原错误，以及共享正控的 `resolveWriteControlModel` 选择规则（显式优先、OpenCode 专属 fallback）与 `runWriteInducementControl` 的 OpenCode2 adapter seam 行为：stub adapter 实际写出的 outcome 文件加真实工具事件经 `evaluateWriteControlEvidence` 判定——精确 21 字节 + write 类工具才 pass，字节篡改、缺文件、仅只读工具、error chunk 均失败且 detail withheld，调用序列固定为 constructor/start/createSession/applyPermissionMode(yolo)/sendMessage/deleteSession/stop 且 sentinel 被清理。测试 bundle 只在测试中暴露审计函数并注入 client/process/adapter seams，不改变运行入口或启动真实 CLI。测试中的合成结构只证明契约逻辑，不能作为 real-model pass 的证据。

2026-10-02 T06 本轮只执行 offline bundle/preflight、聚焦契约及入口类型检查；六后端真实模型 gate 均未运行。

## ZCode hook 正负控制（2026-10-07）

正常会话必须实际执行独立 owned plugin 的 UserPromptSubmit hook，并通过原 27-byte LF 写入控制；辅助会话每轮除原生工具表、tool events、terminal tool count 外还要求 hook 日志中无该 native ID。Hook fixture 仅位于审计根，不使用或改写用户插件/信任配置。旧仅工具表的审计不能证明 hook 只读限制。

可选 `AUDIT_AUX_REASONING_LEVEL_ZCODE` 同时作用于正向 Write 控制和辅助会话；值仍经真实模型目录校验，正向报告记录 session/read 的有效 model，不能靠测试 setter 冒称应用。未设置时保持原生模型默认档位。

OpenCode 2 positive control now requires exact bytes including LF. The independent native agent wildcard deny may be followed only by additional deny rules; allow/ask still fails. First turn, follow-up, image, parent/native list isolation and removal of the full owned root are separate real-model checks.

The ordered-deny suffix audit uses a reverse index loop compatible with the repository TypeScript target; it does not depend on `Array.findLastIndex`.

2026-10-07：OpenCode positive control 的 readiness GET /config 加入每次最多 2 秒 AbortSignal.timeout，仍受 60 秒总 deadline。真实 generation、write inducement 与 byte/residue 判定保持原要求；readiness 超时不算通过。


2026-10-08：Windows Codex native stop 后 cwd 的短时 EBUSY 由最终 audit cleanup 的最多 2 秒重试处理；只重试最初已验证为空的 owned vault 非递归 rmdir，每次重查空目录，新增 residue 或持续失败仍 audit failed。权限/拒写/字节/ephemeral/session 残留门禁保持不变。

## ZCode 3.17.2 严格行选择与原生 hook 正控（2026-11-08）

2026-11-08：ZCode 原生读回验证升级为严格行选择（配合 src 侧 3.17.2 authoritative info.tools 修复）：每个回合的 CURRENT 行中，恰好一行可携带权威 `info.tools`（必须为真实 prompt 行：非 synthetic、`semantics.kind=user_prompt`、`semantics.origin=real_user`、tools 对象为空）；其余所有新行必须 `synthetic=true`、`visibility=model-only`、无 tools 且拥有未出现过的新 id；出现无法识别 id 的行、重复 prior id 的行、任意形态的行（例如第二行带 tools、synthetic 行缺 visibility）一律 fail。toolCallCount=0、无 tool 事件与全部 proof 门禁不变。

正控 hook 迁移到 3.17.2 原生路径：workspace hook 从审计 vault 自己的 `.zcode/config.json` `hooks.events.UserPromptSubmit` 声明（精确匹配运行时 strict schema；旧 plugin-dir/enabledPlugins 路线在 3.17.2 不被发现，已移除）。首轮真实 Write 诱导后，通过运行时自己的 `workspace/hooks/trustGrant` 授予信任，输入全部来自运行时事件（review 事件的 bundleDigest/workspaceIdentity、blocked 事件的 hookSource 与 descriptor.timeoutMs），digest 按运行时 workspace-hook-declaration v1 规范数组计算（`zcodeHookDeclarationDigestFromObservation`）；digest 错误只会让 hook 保持 blocked、正控以 hookExecuted=false 失败，不可能虚绿。第二回合（无工具短 prompt）证明 hook 真实执行。sentinel 清理移入 finally，失败也不遗留（修复上一轮 zcode-control-escape.md 残留）。订阅中的事件信封为 params.event 嵌套，控制 transport 捕获已按同一 unwrap 处理。

已知边界：hook 信任记录由运行时写入其全局 security store（`~/.zcode/security/workspace-hook-trust-v1.json`），无 env 可重定向；每次真实 zcode 审计在该 store 增加一条以本次任务 scratch vault 路径为 key 的记录（运行时自管、含完整性锁，不手工编辑），vault 清理后该记录 inert（digest 校验只对该路径的当前声明生效）。aux 会话继续私有 HOME/workspace + 私有 `hooks.enabled:false` 配置 + plugin 全禁读回，与正控 grant（按 vault workspaceIdentity 授予）互不可达；aux 执行任何 hook 仍直接 fail。

实测：2026-11-08 ZCode 3.17.2 真实完整审计 12/12 全绿（exit 0，`aux-audit-final-zcode-verifier-fix.json`）：正控 native Write + 精确 27 字节 + hookExecuted=true + trustGrant accepted=true；1c/1d/5b 严格行选择读回全过；vault 字节/残留为空。

## 共享正控迁移到 OpenCode 2 契约（2026-11-08）

## Claude Code CLI 覆盖（2026-11-08）

2026-11-08：Claude Code 审计增加任务级 CLI 覆盖 `AUDIT_CLAUDE_BIN` / `CLAUDE_BIN`（`resolveClaudeExecutable` 实际 resolve seam）：显式值必须是存在的绝对文件路径，无效显式值 fail closed 不回退固定候选（2.1.312 固定候选不再能掩盖更新的任务级 CLI），空值视为未设置。覆盖只作用于本次审计进程环境，不写任何全局配置。安全门禁保持不变：readonly allowlist proof、工具读回、字节快照、正控全部原样；ZCode 的 baseline 与 isolated-storage 两类正控证据区分不变，本轮未触碰 ZCode 门禁。

2026-11-08：用 `AUDIT_CLAUDE_BIN` 指向任务级 CLI 2.1.319（`.tmp/backend-refresh-api/runtime/node_modules/.bin/claude`）、模型 `claude-haiku-4-5` 的真实 claude-code 完整审计 8/8 全绿（exit 0，`aux-audit-final-claude-319.json`）：正控 opencode2 契约 write 工具 + 精确 21 字节、只读 allowlist 与 CLI system/init 读回一致（Read/Grep/Glob/WebSearch/WebFetch，native readback Read/WebFetch/WebSearch 与 proof 完全匹配）、诱导写入零 write-class、vault 字节不变、图片回合、dispose 残留与最终 vault 残留均为空。

## 共享正控迁移到 OpenCode 2 契约（2026-11-08）

2026-11-08：共享诱导写入正控改为 ACTIVE OpenCode CLI 契约：复用项目已验证的 `OpenCode2Adapter`（本地 `serve --stdio` 临时端口 + 随机 `OPENCODE_PASSWORD`，不接管 4096 managed server），`createSession` 后按会话 `applyPermissionMode('yolo')`，再以 `sendMessage` options `{provider, model}` 发送实际选定模型。退休的 1.x `GET /config` readiness + `POST /config`/`POST /session` HTTP 面与 `OPENCODE_CONFIG` 正控 agent 覆盖一并移除；`reservePort`/`killProcessTree`/`scopeUrl` 不再被 entry 使用。判定升级为与 OpenCode 2 native 正控一致的字节级规则：sentinel `OC_AUX_CONTROL_WRITE` + LF（21 字节）必须逐字节写入审计 vault 内 `aux-control-escape.md`，且必须观察到 write/edit/patch 类 native 工具调用（`evaluateWriteControlEvidence` 纯函数）。回合受 180 秒 deadline 保护，超时 `cancelStream` 后按失败收口。清理只删除该 sentinel 与正控会话并 `stop` 自有 server；意外残留保留为证据并由最终 vault 字节检查 fail closed。失败 detail 保持 withheld，不输出 env/provider 凭证。选择规则与 profile hash 语义不变；CLI 非 2.x 时 adapter 版本门禁使正控失败。真实一次探针（claude-code 通道，模型 `magpie/opencode-go-gw/deepseek-v4.1-flash`，CLI 2.2.6）确认：native `write` 工具调用、精确 21 字节 sentinel、清理后 vault 残留为空。该正控运行本身不等价于任何后端完整审计；各后端安全腿仍须各自真实运行。
