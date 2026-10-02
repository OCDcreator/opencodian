# 六后端辅助查询审计（T06）

源码：`scripts/audit/run-aux-query-audit.mjs`、`scripts/audit/aux-query-audit.entry.ts`、`scripts/audit/opencode2-aux-query-audit.entry.ts`。

统一 runner 默认按顺序调度 `opencode / opencode2 / claude-code / codex / pi / zcode`，也允许任意已知后端组合。完整参数列表在创建缓存、打包或启动任何后端之前校验；未知 backend / option 立即失败。OpenCode 2 继续使用独立 native entry 和 HTTP bridge，不能用通用后端 proof 替代其版本、正控和 wildcard deny 读回。

## 离线验收与真实验收

`node scripts/audit/run-aux-query-audit.mjs --bundle-only` 只编译六个调度结果，不启动后端 CLI、不请求模型。编译成功退出 0，但报告仍为 `status: blocked, passed: false, execution: bundle-only`；编译成功不能记作真实模型审计 pass。

`node scripts/audit/run-aux-query-audit.mjs --preflight` 编译并启动审计用 Node 子进程，只读取路径和配置。它不启动后端 CLI、不握手 app-server、不发送模型请求，因此没有模型调用成本。配置齐全时依然返回 blocked / exit 2，说明真实验收尚未执行。聚焦测试通过 preload 拦截器禁止后端进程、fetch 和 HTTP/network 调用；仅允许编译器和审计 Node 子进程。

没有 offline flag 才是 real-model 模式，必须单独获得真实模型测试授权。模型和 vision 模型必须显式配置，支持 `AUDIT_AUX_MODEL_<BACKEND>` / `AUDIT_AUX_VISION_MODEL_<BACKEND>`，backend 后缀大写，连字符换为下划线；兼容无后缀变量。OpenCode / OpenCode 2 / Pi / ZCode 使用 provider/model；Claude Code / Codex 使用裸 model id。OpenCode 2、Pi 可配置 `OPENCODE2_BIN` / `PI_BIN`，ZCode 使用 `ZCODE_BIN` 经现有 resolver 解析，Codex 使用现有 resolver 的 `CODEX_BIN`。

四个原通用后端保留 OpenCode 的共享诱导写入正控，使用显式 `AUDIT_AUX_CONTROL_MODEL`（仅 OpenCode 可回退自身已显式配置的 model）；preflight 与实际 HTTP 请求复用同一选择规则。显式 control 设置优先；无效显式值不得静默 fallback，其他后端不得借用 OpenCode model fallback。请求发送实际选定的 providerID/modelID，报告记录 `modelSource` 与该请求 model JSON 的 `modelProfileSha256`，不输出原始模型选择字符串。各后端的安全证明仍单独来自其 native 路径。ZCode 和 OpenCode 2 有自己的 native 正控。正控成功不能替代任一后端安全读回、工具事件审计或字节检查。

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

测试覆盖六后端默认/混合调度、未知 backend、互斥 offline flag、failed/blocked precedence、负向 report schema、ZCode provider/model 和 generic/sessionless 区别、当前回合 native 读回负向样例、严格字节快照、带禁止 native/network 拦截器的六后端 preflight、OpenCode 2 native 验收保留。追加回归覆盖 Codex start 成功后 active/archived 分别拒绝、stop 恰好一次且必须等待、stop 自身拒绝仍保留原错误，以及显式 control/OpenCode 专属 fallback 的实际 HTTP 请求 JSON 与配置摘要匹配。测试 bundle 只在测试中暴露审计函数并注入 client/process/HTTP seams，不改变运行入口或启动真实 CLI。测试中的合成结构只证明契约逻辑，不能作为 real-model pass 的证据。

2026-10-02 T06 本轮只执行 offline bundle/preflight、聚焦契约及入口类型检查；六后端真实模型 gate 均未运行。
