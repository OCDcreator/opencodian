# 六后端接入实施记录（2026-10-02）

工作树：`C:/Users/lt/.codex/worktrees/backend-integration-completion/opencodian`。基线 HEAD：`ef4354f1f587fe9d0ba8175d1f3957a61c23b74d`。本记录继续 [审查](backend-integration-review-2026-10-02.md) 与 [实施方案](../requirements/backend-integration-completion-plan-2026-10-02.md)，不改变审查阶段的历史证据。

## 当前收尾与 Mac 续做交接

用户要求收尾当前任务、提交推送、同步 Mac，剩余实机工作移交 Mac 继续。本节是最终收尾时点，后面的“进行中”段落保留历史记录。

最终完整验证 attempt04 的 15 项门禁全部 PASS：**964 suites／9924 tests**，lint **0 errors／0 warnings**，typecheck、架构、module docs、Graphify freshness、production build 与 generated styles clean 全绿。实际工作区模块文档独立检查覆盖 41 个 targets。生产源码／assets／scripts 的 962-path 最终冻结摘要不变。BUILD_ID：**HEAD.202610022256**；插件版本仍为 **1.1.36**。失败的 attempt01（untracked 模块路径清单）、attempt02（新增类型耦合）、attempt03（两处测试设施、13 失败）均保留证据，没有删除失败断言或更新架构 baseline 掩盖问题。

独立复核全部关闭本轮 finding：Codex 本地删除须明确回读不存在，存储错误保持可重试状态；混合目标禁用；OpenCode 在途快照与迟到 part 屏障、类型拆环；Pi 未改动的既有未知 enum 可原样 roundtrip，新增或改值仍校验。OpenCode snapshot revision maps 在 live session 内按历史 ID 累积、session eviction 才释放，属于已披露的后续保留策略边界，不宣称硬内存上限。

两端正常 Test Vault 均完成四文件＋119 assets 顺序复制、123/123 SHA256 一致、**真实插件启停操作及实际 loaded BUILD_ID=HEAD.202610022256**。Windows 已恢复本轮改过的 activeBackend、enabledBackends、Codex model/sandbox 四字段，其他当前值保留；Mac 没有手工改配置，重载只更新版本检查时间。重载关闭了聊天 leaves，旧 conversation 与原生身份仍在磁盘；这里不把磁盘保留当作聊天恢复验收。

标准发行包已生成，仅 main.js／manifest.json／styles.css。Windows 与 Mac 的隔离安装库已用旧基线 HEAD.202610022038 完成信任、加载、真实 Pi nonce 和原生 UUID/entry 身份记录；**最终包升级、同 UUID 恢复与新控件操作尚未执行**，按用户收尾指令留给 Mac。三文件包不推定 optional PDF/assets 功能已验收。

T12 专项保留 15 个真实成功 nonce 响应，但不扩大为 64 canonical cases／17 profiles 全通过。OpenCode2 已有服务 401、Mac Claude 2.1.204 拒绝 reload_output_styles、无 MCP server、OAuth/widget 和完整 auxiliary 正负控制仍分别 blocked／unavailable／unverified。Codex local forget cancel→confirm→native 保留、真实跨页与 partial UI、Pi entries/since/thinking、Claude/ZCode 当前构建 UI 控件是优先续做项。

完整证据位于非同步目录 final-expansion；Mac 证据交接会复制经筛选的门禁／freeze／readback／summary，排除凭据备份与宿主 profile。验收账本子代理因外部 provider 返回 403 而退出，未生成完整账本；父代理按 canonical 定义保存保守账本，未运行项保持 unverified。

具体环境、原生身份、步骤、限制和提示词见 [Mac 续做提示词](backend-integration-mac-continuation-2026-10-02.md)。本轮提交推送源码，不作版本 bump 或新发行发布。

## UI 与 T09–T13 扩展实施（2026-10-02，历史过程）

用户继续明确授权子代理实施 Codex local forget UI、分页 API 产品消费及 T09–T13，并要求真实 CLI／模型、已加载 Obsidian 与发行安装实机证据。唯一实施工作树保持非同步位置；本节描述当前轮，后面的 reviewed continuation 与首批节保留历史时点结论。

- Codex UI 已接入本地遗忘确认、history/tab/cache 恢复与完整 catalog 结果消费，17 suites／196 tests 初轮通过。独立复审发现实际存储层吞 I/O 错误可误报遗忘成功，以及混合目标静默返回；原执行代理正在补修严格存储提交与目标反馈，未宣告最终验收完成。
- ZCode T09 已实现项目级插件 override 与 revision/archive guard、native effective catalog 重读；MCP 状态和 hook 声明只读，缺少独立原生契约继续 unavailable。实际安装 CLI 0.16.9／desktop 3.14.4 的 save→reopen→native evidence 为 verified／pending／verified。7 suites／58 tests 初轮通过；独立复审未发现额外阻断，父代理补齐中英文数量、状态与三轴文案。
- OpenCode T10 已修 v2 cursor+order 冲突、fallback prompt identity、拒绝与取消边界、权威撤回迟到回放及 legacy provider default 格式。65 suites／686 tests 初轮通过，但独立复审发现 P1：在途旧快照会给读取期间的新 sync 消息建立误删除屏障；原执行代理正在增加快照 revision 合并与 SDK/HTTP 回归，修复前证据保留。
- T11 完成 installed CLI 0.160.0 schema/只读握手、官方 rust-v0.160.0 固定 SHA、三候选分层与 17 项 Node／1 项 Jest 契约。gateway 只读 observed；MCP App 与 disabledPluginIds advertised；OAuth、widget 与真正插件禁用不由此推定。候选默认关闭，见 codex-native-candidates-2026-10-02.md。
- Pi/Claude 余下 UI 接线由独立子代理完成并审查：Pi 当前会话动态 thinking levels、entries/since 和未知 schema 值保留；Claude 两项 active query controls 的 ACK／有效状态分离。父代理把 Pi 目录绑定到本工具栏所属会话，新增不同 focused backend 与 A/B 会话回归。共享 locale、模块与 owner docs 同步。

T12 原生专属 run 已冻结，15 个真实成功响应均为受控 nonce-only。Windows 与 Mac 的 Codex app-server/SDK、Claude、Pi 有真实模型证据；Mac 现有 OpenCode 1.18.34 服务完成两轮，ZCode 正式生产 adapter 完成一轮且原生工具调用数为 0。Codex Windows 初次 gpt-5.4 的 provider 404 留存，单次现有配置模型 gpt-6.1-sol 重试通过；Mac 使用现有 gpt-6-sol。Mac Claude CLI 2.1.204 能聊天但拒绝 reload_output_styles，不能按 SDK method 存在标已生效。OpenCode 2 现有 listener 返回 401，L3 blocked；L2 fixture 10 项不代替 v2 真实认证模型验收。MCP 收紧无 server、OAuth 开启登录与 auxiliary 读写正负控制仍需独立验收。详见外部 evidence root 的 native-t12/T12-summary.json、FREEZE.json、REPLAY.md。

实机基线：Windows Test Vault 已加载 HEAD.202610022038，Mac Test Vault 加载 main.202610011039。父代理通过真实鼠标/键盘打开设置、启用并切换 Codex，保留测试前设置备份。非同步独立 Windows/Mac 验收库仅安装 main.js、manifest.json、styles.css，隔离 Obsidian profile 真实信任、加载并点击 OpenCodian ribbon；Pi 服务/模型目录可用，无开发 assets 依赖。两端 clean install 目前仍是旧基线构建，仅作为安装路径证明。最终源码冻结后必须完整门禁、顺序 build/copy/readback、最终 loaded BUILD_ID 与受影响 UI 重验；当前未提交、版本 bump、推送或发布。

外部证据根：`C:/Users/lt/.codex/artifacts/opencodian/backend-integration-2026-10-02/final-expansion/`。review 首次 findings 与修前失败保存，所有未执行 canonical case/profile 保持 unverified；局部 native/model pass 不计整份 case 套件已通过。

## Reviewed continuation（2026-10-02）

用户明确确认：允许按此前三项范围继续 reviewed continuation，并继续由子代理实施。Pi、Claude、Codex 的原执行代理已恢复，主代理负责独立整合与最终门禁。本授权覆盖下文记录的有限深度跨范围影响；不等于新增 UI、其他后端或真实模型验收的默认放行。首批图、测试、部署与未完成项作为历史证据保留。

| 续做切片 | 实施边界 | 本轮状态 |
| --- | --- | --- |
| Pi | optional 命令公共类型与 allowlist，专属回归；保留旧 mandatory handshake | 限定接线已完成并冻结；修前 12 fail / 3 pass、专属语义诊断 7；修后 4 suites / 36 tests、语义诊断 0；installed SDK 1.0.0 内存测试 8/8 无 skip |
| Claude | 已存在 active persistent query 的两项 session controls 与 native selector，正负向运行时测试 | 限定接线已完成并冻结；3 suites / 284 tests 通过（新增 controls 95、既有 adapter 180、types 9），主代理独立聚焦复跑通过 |
| Codex | native delete 失败传播、显式 local forget、删除受理与原生回读区分，单项/批量/tab/cache/重试与并发删除 | 限定实现已完成并冻结；15 suites / 279 tests 通过，聚焦 lint 0 errors / 0 warnings，typecheck exit 0；独立复审关闭三项 finding，最终全局门禁通过 |

本轮证据根为 `C:/Users/lt/.codex/artifacts/opencodian/backend-integration-2026-10-02/reviewed-continuation/`。`continuation-before.json` 保存用户授权、此前 60 个变更路径及摘要，原构建为 `HEAD.202610021920`。本轮继续保留 native/model/UI/release 的 unverified 边界；最终实作、门禁与新 BUILD_ID 将在本节追加。主代理独立复跑 Pi 公共接线、Claude controls 与类型契约，3 suites / 119 tests 全通过。

Codex 的三条复查问题均已补修：RC-CX-01 保留 pending/failed/admitted deletion 的 identity、alias 与 evidence/cache，防止 `thread/deleted` 通知使 provisional ID 重试误当 draft；RC-CX-02 在 retry delete 返回同 ID 明确 absence 后，只有再次同 ID absence 回读才 verified；RC-CX-03 在 native/storage await 后按 conversation ID 重查本地提交位置，避免并发删除误删邻项。RC-CX-01/02 修前 11 fail / 6 pass；RC-CX-03 修前 2 fail / 13 pass，修后均纳入 279 项通过回归。证据为 `codex-review-initial-findings.json`、`parent-codex-review-findings.json` 及 `codex/FROZEN_HANDOFF.md`。补修仍在已授权删除/重试切片内，Client 仅增补 delete-only absence probe，rename/archive 不变。

Codex 默认删除仅在原生 verified 或明确无 native thread 的本地草稿后提交 storage/cache 删除。admitted/pending、failed、unavailable 保留 conversation、原生身份和失败项 tab；批量仅清成功项并恢复有效 active tab，失败时不显示总成功。显式 `deleteConversation(id, { mode: 'forget-local' })` API 独立接到 `forgetSession`，不发送 native delete/archive；本轮未新增其 UI 操作，UI 暴露仍 partial，catalog Page API 的 UI 消费也仍 partial，不能据此标记 T05 全部完成。

修改前 CodeGraph 原始根已复核：PiAdapter.command 为 23 个 distinct function/method 直接 callers、depth=1、26 nodes / 32 edges；ClaudeCodeAdapter class 为 68 callers、depth=1、278 nodes / 491 edges。Codex 正确 main 根 `src/main.ts:2723` 为 0 callers、depth=1、2 nodes；此前 CLI 给出的 3/1/6 实际是 View wrapper 错根，已作废。静态零 caller 不证明没有 runtime/host 调用。其余 Codex 方法的唯一 node ID、有限半径和 owner 见 `codex/modified-methods-graph.json`，新增 helper 不虚构基线图计数。

独立只读最终复审 `codex-final-review.json` 已关闭 RC-CX-01/02/03，无新增阻断 finding；该复审不替代全局门禁或实机验收。主代理统一 CodeGraph sync 后 complete、pendingRefs=0、pendingChanges 全为零；tracked affected 为 55 文件 / 918 affected tests / 1688 dependents，包含 untracked 的补充 union 为 76 文件 / 920 affected tests / 1688 dependents。Graphify 已按 src 范围更新，独立 workspace module-doc diff 检查 13 个 required targets 通过，CRLF-aware whitespace 检查通过。

完整门禁第一次尝试的前 12 项通过，全量测试为 2 failed / 9713 passed（948 suites）。失败是既有 compaction fixture 仍以 boolean ACK 期待删除完成，以及 ChatDiagnosticsContract 硬编码旧 main 签名导致方法定位失败；已交回原执行代理，仅同步这两处测试契约，生产源码 957 个 tracked 文件的冻结摘要保持一致。首个失败日志保存在 `final-verification/attempt-01/`，当次未执行生产 build 或部署；最终重跑结果如下。

第二次完整门禁以 `node scripts/run-verify.mjs --base=HEAD` 执行，15 项全部 PASS：948 suites / 9716 tests、lint 0 errors / 0 warnings、typecheck、architecture、module docs、Graphify freshness、production build 与 generated styles clean 均通过。新 BUILD_ID 为 `HEAD.202610022038`。两处旧测试契约修前 2 fail / 31 pass，修后 2 suites / 34 tests，并新增 admitted deletion 不清 pending compaction 的负向回归；全部 trace/diagnostics 断言保留。运行时源码/资产/脚本共 957 个 tracked 文件的冻结摘要无差异。最终原始结果为 `final-verification/verify.log`、`verify-exit.json`、`verify-summary.json`，失败历史仍保留。

tests-only 修补后再次 CodeGraph sync，complete、pendingRefs=0、pendingChanges 全为零。最终 tracked affected 输入 56 文件 / 918 tests / 1688 dependents；含 untracked 的补充 union 输入 77 文件 / 920 tests / 1688 dependents。所有原始 JSON 与 workspace 13-target module-doc 独立检查见 `final-verification/post-change-gates.json` 及对应日志。Graphify 源 digest 为 `cf066ac7cf53219f3566ad5cf57f8d8252ac14b6c746fd7537368a7664e01b2f`，此次 tests-only 补修未改变 src/graph 摘要。

成功 build 后已独立顺序 copy→readback 部署 Windows Test Vault，目标 `C:/Users/lt/Desktop/Write/testvault/.obsidian/plugins/opencodian/`。main.js、manifest.json、styles.css、pdf-engine.js 及 119 个源资产逐一 SHA256 一致，main.js 含最新 `HEAD.202610022038`，磁盘部署为 verified。被覆盖的文件与源资产已备份到非同步 `final-verification/previous-deployment/`；没有删除目标额外资产。loaded renderer BUILD_ID、Obsidian UI、真实 native/model 与发行包安装仍 unverified；未提交、合并、推送、版本 bump 或发布。

本次三项限定接线已通过代码、离线回归、完整门禁与磁盘部署。六后端整体 T09–T13、T05 catalog/forget UI、T07 UI/schema 全差异与 T08 原生有效样式/权限读回等未完成项仍按方案保留。新的 baseline/acceptance map 延续 64 canonical cases / 17 profiles，native/UI/release pass 均保持 0，不以本次 mock 或部署冒充实机通过。

## 首批范围与状态（历史记录）

本节保留首批完成时的测试、部署和待续结论；其中“待 reviewed continuation／尚未应用”等描述仅指当时状态，当前三项续做结果以本文件首节为准。

用户授权子代理展开工作后，七个执行代理依次并行推进已复现修复、Codex 结果契约、六后端 aux 入口和 Pi/Claude 协议增量。主代理负责依赖基线、机器可读证据目录、整合、门禁与部署。运行时代码和证据保留在非同步工作区；原仓库只保留此前三份文档改动，没有把其他用户文件搬走或清理。

| 任务 | 实施状态 | 已有证据 | 尚需证明 |
| --- | --- | --- | --- |
| T00 | SDK 锁文件基线已恢复 | npm ci、四个 SDK lock/install 一致、win32-x64 esbuild doctor | 六 runtime 握手与测试账号、profile fixture、发行安装 |
| T01 | 证据目录基线已实现 | baseline runner：64 canonical cases、17 profiles、feature/task/case 对应、三轴 pending；4 个契约测试 | Capability Lab/registry 的逐子功能产品接入，实际运行结果导入 |
| T02 | 代码与聚焦回归通过 | OpenCode 2 override 保存/重载/模型解析链；旧 allowlist 触发回归失败 | native 模型回读、真实 Obsidian 输入/保存/加载 |
| T03 | 代码与聚焦回归通过 | ZCode 四字段最新状态合并；修复前 16 fail、修复后 16 pass | 实际磁盘保存顺序、native application/readback、host UI |
| T04 | 代码与聚焦回归通过 | Pi argv 独立敏感值、等号形式、URL userinfo 和畸形 URL；33 聚焦 tests pass | 真正设置 UI 的输出与完整真实 trace 脱敏验收 |
| T05 | Client/Adapter 限定实现通过；产品消费闭环仍 partial | 完整 catalog collectors、cursor/ID 去重/partial error；新增 Result API 区分 admitted/verified/failed/unavailable，并以相同 native ID 回读；local forget 分离；代理聚焦 277 tests pass | 新页 API/UI 消费、main 删除失败传播、真实 app-server/原生终态证据；旧 listThreads 单页契约保留 |
| T06 | 六后端审计入口限定实现通过；实机 blocked | 默认六后端及选择去重；初始 9 项契约测试通过，复查后新增 9 项离线回归，最终 18/18 通过；六 bundle 均 compiled；preflight 不启动 native/model，六后端均 blocked | real-model aux、原生只读正负控制、每 profile cleanup 与真实 native 回读 |
| T07 | 服务/optional 类型通过；公共入口待 reviewed continuation | actual-SDK feature detection、native entries/since/leaf；installed Pi SDK 1.0.0 的内存读 8/8 pass，无模型调用；旧 mandatory handshake 不变 | PiAdapter.command 跨范围接线已撤回，当前公共入口仍拒绝两项读；UI 消费、model 实机与 schema 全量差异 |
| T08 | SDK Query-derived 类型契约通过；Adapter 待 reviewed continuation | Claude SDK 0.3.283 的可选方法/结果 union；9 个契约测试及 TypeScript 正负向检查通过 | ClaudeCodeAdapter 源码未改；runtime session control、style/MCP 操作、UI/native 三轴 |
| T09–T11 | 待实施 | 上游固定来源与设计已记录 | ZCode 管理闭环、OpenCode 差异回归、Codex 实验候选 |
| T12–T13 | 待真实验收 | Windows Test Vault 目录存在，SSH Mac 返回 Darwin | 专用测试模型/账号/额度配置、真实双 host UI、干净包安装 |

依赖恢复没有修改 package/lock。只读 CLI 版本探测得到 Codex `codex-cli 0.160.0`、Claude `2.1.272 (Claude Code)`、Pi `1.0.0`；插件实际 SDK/client 为 OpenCode 1 `1.18.33`、OpenCode 2 `2.0.18`、Codex `0.158.0`、Claude `0.3.283`。这些版本输出不等于握手、认证或模型执行，不能与旧 Pi 验收 `0.73.1` 或 upstream-main 快照混为同一证据。ZCode 未在当前 PATH 发现，但 preflight resolver 未报告 runtime missing；不能据此断言未安装，仍须配置路径/profile 核查。

## 证据位置与调用方式

非同步总证据根：`C:/Users/lt/.codex/artifacts/opencodian/backend-integration-2026-10-02/`。`baseline-initial/` 保留首次结果；`baseline-final-verified/` 保存最终 manifest、feature-ledger、cases、profiles 和 coverage；运行不启动模型，不读取凭据。coverage native/UI/release 均为零，全部未执行场景为 unverified，绝不通过默认状态扩张覆盖率。

```powershell
node scripts/audit/backend-integration-baseline.mjs --output <新的非同步证据目录>
node --test scripts/audit/backend-integration-baseline.test.mjs
node scripts/run-jest.js --runTestsByPath <本轮聚焦测试文件>
```

Windows `.codex` 工作树触发了原 Jest 绝对 testMatch 的隐藏目录漏测；现已改为受 roots 约束的 suffix pattern，并以 Jest matcher 测试三项目/双平台路径及错误项目排除。未使用 passWithNoTests 掩盖漏测。

## 门禁与剩余验收

CodeGraph sync 后状态 complete，worktreeMismatch=null、pendingChanges 全为零；规定的 tracked diff affected 检查返回 39 changed files、915 affectedTests、1685 totalDependentsTraversed，新增 untracked 文件不在该次输入。Graphify 已按 src 刷新，736 files、17505 nodes、50263 edges、392 communities；freshness gate 通过。第一轮完整 verify 的 15 项门禁全部 PASS，945 suites / 9559 tests 通过，生产 build 为 `HEAD.202610021857`。PowerShell npm wrapper 消耗了显式 `--base` 参数，实际 base 为 origin/main，SHA 与 HEAD 一致；verify 的 module-doc diff 仅检查 committed scope，另以 `node scripts/check-module-doc-diff.mjs --range=HEAD` 独立确认本轮 8 个 required workspace docs 全部通过。原始日志与精确计数保存在总证据根 `verification-final/verify-initial.log` 和 `verify-initial-summary.json`。复查修复后以 `node scripts/run-verify.mjs --base=HEAD` 再次运行，最终 15 项门禁全部 PASS：945 suites / 9568 tests，lint 0 errors / 0 warnings、typecheck 通过、build `HEAD.202610021920`、generated styles clean。最终原始日志/摘要为 `verification-final/verify-final.log` 和 `verify-final-summary.json`。聚焦测试只证明对应 L0 逻辑；协议 mock 和 bundle/preflight 均不能记作 L2–L5 实机通过。

CodeGraph 阻断的续做范围有明确证据：PiAdapter.command 为 23 个 distinct function/method 直接 callers，depth=1 的 blast radius 为 25 nodes；ClaudeCodeAdapter class 为 68 个直接 callers，depth=1 为 278 nodes / 491 edges，跨 main/chat/settings/其他后端。对应生产入口改动已撤回或未落地。Claude 的具体续做 diff 与负向矩阵保留在 `docs/modules/core/agents/backend/ClaudeCodeAdapter.md`；Pi 的最小 patch、未来正向 tests 及 callers/impact 原始 JSON 保留在非同步 `C:/Users/lt/.codex/artifacts/opencodian/backend-review-2026-10-02/pi-t07-public-entry-gate-audit-ef2a9fc3/`（`PiAdapter.optional-rpc.pending.patch`、`PiSdkReadCommands.public-entry.pending.test.ts`）；Pi impact 同时返回 31 edges。主代理扩 write scope 不能替代规则要求的人类 reviewed continuation。

Codex 产品闭环的已知未闭合点：`main.ts.deleteConversation()` 仍会吞非 ZCode 的 native 删除错误并删除本地 conversation；本轮没有编辑 main。Client/Adapter 的 ACK、verified readback 和失败保留测试不能证明这条 UI 路径已闭合。首批 CLI 查询曾记录 direct callers=3、depth=1、nodeCount=6 / edgeCount=5；本轮精确 node ID 复核发现该返回根是 View wrapper，原计数已作废。正确 `src/main.ts:2723` 的 `OpenCodianPlugin::deleteConversation` 为 direct function/method callers=0、depth=1、nodeCount=2；runtime host 链路仍通过源码只读核对。首批未修改 main 的历史事实不变。

下一次 reviewed continuation 的具体范围：Pi 同时审查 `PiProtocol.optional-command-union.pending.patch` 与 `PiAdapter.optional-rpc.pending.patch`，只放行两项 optional 读及专属回归，不改变 mandatory handshake；Claude 审查模块文档中两个 public controls 与 private native-session selector 的 diff 及负向矩阵，复用现有 runtime/query，不把 ACK 当有效配置/模型输出证明；Codex 审查 native delete 与 local forget 的产品语义，在 main/chat 删除路径传播 failed/unavailable、保留 conversation/identity/alias，并对 admitted 与 verified 提供分开的 UI/回读证据。Codex 续做必须覆盖单项/批量删除、失败重试、tab/cache 保留、未创建 native thread 的本地草稿及 SDK fallback 不支持 native delete 的情况。上述为可审查方案，尚未应用。

构建成功后已按独立顺序 copy→readback 部署 Windows Test Vault：main.js、manifest.json、styles.css、pdf-engine.js 及 dist/assets。部署 readback 确认 `HEAD.202610021857` 存在，四个文件 SHA256 与 dist 一致，119 个源资产逐一匹配；之前的四个文件已在非同步证据根保存可恢复副本。最终 verify 再次构建后，已独立顺序重新 copy 并核验最新 `HEAD.202610021920`，四个文件及 119 个源资产 SHA256 仍全部一致（`deployment-copy-final.json` / `deployment-readback-final.json`）。磁盘部署状态为 verified，loaded runtime/host UI 仍为 unverified，未触发发布或修改版本号。

审计复查修复后 CodeGraph 再 sync，complete、pendingRefs=0、pendingChanges 全为零。规定的 tracked diff affected 输入为 42 文件、915 affectedTests、1685 totalDependentsTraversed；补充 union 包含 18 个 untracked 新文件，总输入 60、917 affectedTests、1685 totalDependentsTraversed。两份 raw JSON 与 union 输入保存在 `verification-final/`。src/assets 在审计补修期间未改变；Graphify 的 src digest 保持 freshness pass。

只读整合复查发现两项审计脚本问题：Codex harness 在 start 后完整 catalog 拒绝时未 stop；正控模型配置未进入实际 message 请求。T06 原执行代理已补修：初始化 start/active/archived 失败会 await stop，并保留原错误；preflight 与实际正控请求复用模型解析，显式值优先，仅 OpenCode 自身允许 fallback，无效显式值拒绝。报告以来源和请求 model JSON 的 SHA256 对齐测试配置。新增 9 项测试修前全部失败（原 9 项通过），修后 18/18 通过，含 cleanup 自身失败与异步等待。原始日志和图证据保存在 `aux/review-fixes/`。主代理复核对应源码与实际 JSON 断言，确认覆盖两项复查 finding；最终全量 tests 已包含这 18 项并全部通过。两条 audit entries 的独立 TypeScript 检查需要补入项目现有 `src/types/ws-shim.d.ts` ambient root：正确 roots 的修前/修后均 0 diagnostics，遗漏 shim 的两者均出现相同 4 条 ws/隐式 any 诊断，不是本轮新增错误。复查没有发现额外的插件运行时部署阻断项。

真实模型与账号流程遵循方案的专用账号/profile/额度/allowlisted 配置根；当前没有该验收配置，保留 unverified 或 preflight 明确 blocked。主代理不会用用户现有全局凭据默默启动批量模型验收。Mac SSH 可达不等于 macOS Obsidian UI 已验收；磁盘包部署也不等于 loaded runtime BUILD_ID 已确认。
