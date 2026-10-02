# 六后端接入审查（2026-10-02）

审查基线：OpenCodian `1.1.36`，HEAD `ef4354f1f587fe9d0ba8175d1f3957a61c23b74d`，Windows 本地工作区。

本次交付是代码审查、离线复现和后续实施/验收方案。没有修改插件运行时代码、安装依赖、启动任何后端生成任务、消耗模型额度、操作真实凭据、部署或发布。本报告不等同于六后端实机验收通过。

实施方案见 [六后端完善接入与测试方案](../requirements/backend-integration-completion-plan-2026-10-02.md)。

## 1. 结论与证据等级

当前插件已经具有较广的后端接入。主要不足集中在配置链路断裂、原生结果没有闭环、协议增量未接入，以及测试没有贯穿设置/UI/持久化/真实后端。

发现三项由生产源码离线复现的缺陷，以及 Codex 分页和原生 mutation 结果传播的明确代码缺口。现有相关 4 个单测套件、36 个测试通过，因此单测通过不能证明这些业务链路完整。

| 标签 | 含义 |
| --- | --- |
| REPRODUCED | 本轮运行生产源码，使用合成输入复现；不声称真实 Obsidian UI 已复现 |
| CODE | 本轮源代码明确显示的行为/缺口；未运行真实 CLI 场景 |
| ACCEPTANCE | 仓库已有验收文件明确记载的未验收项；本轮未重复实机验收 |
| UPSTREAM | 与指定上游版本/commit 对照后的未接入项；仍需实际安装版本探测 |
| ENVIRONMENT | 当前工作区的执行环境问题；不能据此断言发行插件有同样问题 |

优先级 P1/P2 是本报告的实施排序，不是 CodeGraph 工具输出的风险等级。CodeGraph `status --json` 可用，索引报告 pending changes 为零；本次没有修改任何生产函数，未进行修改前 callers/impact 分析，也不把图索引作为运行时验收证据。

## 2. 必须分开的基线

### 2.1 OpenCode 1 的 SDK v2 与 OpenCode 2

- `opencode`：`@opencode-ai/sdk`，主要使用 `/v2` SDK，保留旧 HTTP/SSE fallback。
- `opencode2`：独立的 `@opencode/client`、可执行文件、协议、配置和原生会话。不是上一项 SDK 路径的开关。
- 两类后端的会话 ID、配置文件、目录作用域、默认模型和连接身份必须分开验收。

### 2.2 声明/锁文件与当前安装不一致

| 依赖 | 项目声明/锁定目标 | 当前 `node_modules` | 结论 |
| --- | --- | --- | --- |
| `@opencode-ai/sdk` | `1.18.33` | `1.18.29` | npm 报 invalid |
| `@opencode/client` | `2.0.18` | 未安装 | OpenCode 2 原生测试基线缺失 |
| `@openai/codex-sdk` | `0.158.0` | `0.153.4` | npm 报 invalid |
| `@anthropic-ai/claude-agent-sdk` | `^0.3.283`，lock `0.3.283` | `0.3.263` | npm 报 invalid |

证据命令：`npm ls @opencode-ai/sdk @opencode/client @openai/codex-sdk @anthropic-ai/claude-agent-sdk --depth=0`，退出码 1。没有执行 `npm install`/`npm ci` 修复环境，避免把审查与依赖变更混在一起。后续验收必须先恢复锁文件一致性。

### 2.3 本地参考源码与官方源码

| 参考 | 本轮确认基线 | 使用限制 |
| --- | --- | --- |
| 本地 OpenCode checkout | `4a976482b1fe23381525ed18fb08a610573cc94d`，2026-05-21 | 历史实现参考，不能覆盖当前 SDK/client |
| 本地 Pi checkout | `3d5cbe98c3bc67ef8433bdeee45fbe5f0d8a24db`，2026-05-08 | 历史实现参考，不能覆盖现在的 RPC/SDK |
| Codex 官方源码 | `rust-v0.158.0` app-server README 和生成协议类型 | CLI 与 SDK 是独立版本，部署机 CLI 版本本轮未探测 |
| Pi 官方 main 快照 | `0495646a8322ff99ce40ac2f9e15f1f49f56bb11` | 上游调研增量，不是已安装/已验收发行版 |
| ZCode 官方 main 快照 | `29628c9acdb81b703bbd4080c207a0e7ce5e276e` | 同上；不能冒充本地 v3.14.3 补丁版运行时 |
| Claude 官方 npm 声明 | `@anthropic-ai/claude-agent-sdk@0.3.283` 的 `sdk.d.ts` | 已下载仅用于静态对照，未安装/执行包 |

Windows 指定参考目录中未找到 OpenAI Codex 和官方 ZCode 的独立 checkout，故补充官方在线源码；没有替换用户的本地仓库。`claude-code-source` 的 remote 是第三方还原仓库，本轮不把它作为官方协议依据。Claude 对照以官方 Agent SDK 类型、changelog 和公开文档为准，不把 Claude Code 全部产品代码称作官方开源代码。

上游快照和 Claude 声明的哈希保存在非同步本地证据根 `%USERPROFILE%\.codex\artifacts\opencodian\backend-review-2026-10-02\upstream-baselines.json`。GitHub API 曾触发限流，随后用只读 `git ls-remote` 取得 Pi/ZCode SHA，再下载固定 SHA 的文件。

## 3. 优先修复的 findings

### F-OC2-01 · P1 · REPRODUCED：OpenCode 2 编辑/补全模型覆盖被归一化丢弃

证据：`src/core/types/settings.ts:44`、`:55`、`:79`；`src/features/settings/SettingsInlineEditSection.ts:69`、`:293`、`:346`。

设置 UI 为 `opencode2` 渲染覆盖行，但归一化白名单只包括 `opencode/claude-code/codex/pi`，补全名单仅再加 `zcode`。提交 `{opencode2:'audit/model', opencode:'control/model'}` 后，两种归一化结果均只保留 OpenCode 1 项。设置保存调用的正是这些归一化函数，所以该覆盖值无法完成持久化。

修复目标：对齐 UI、归一化、载入迁移、会话模型解析和实际请求。验收必须从真实表单开始，经保存/重载，再观察 aux/completion 请求采用选定模型，不能只观察输入框值。

### F-ZC-01 · P1 · REPRODUCED：ZCode 设置连续修改互相覆盖

证据：`src/features/settings/SettingsZCodeSection.ts:55`、`:66`、`:81`、`:93`、`:105`。

`attachBody` 捕获一次 `settings`，每个回调都用 `{...settings, changedField}` 写回。离线执行实际组件代码：先保存模型 `audit/model`，再保存思考等级 `high`，模型变回空字符串。可执行文件、模式回调有相同快照形状。

修复目标：修改时合并最新规范化状态；同时验证快速连续修改和异步保存顺序。最终重载、物化会话与原生 `session/read` 应确认所有选择同时保留。

### F-PI-01 · P1 · REPRODUCED：Pi MCP 配置展示脱敏不完整

证据：`src/core/agents/backend/pi/PiMcpConfigService.ts:136`、`:145`、`:150` 的参数展示/URL 清洗方法；`src/features/settings/SettingsPiSection.ts:174` 将 endpoint 直接进入设置说明。

`--token` 后的独立值只按自身文字检测。合成值 `audit731v8c` 不含 token/key/secret 等单词，完整出现在 endpoint 中。URL 清洗删除 query/hash，却保留 URL username/password。现有测试使用 `plain-secret`，因值本身包含 `secret` 而被遮盖，没有覆盖无敏感关键词的真实凭据形态。

修复目标：按 argv 语义遮盖敏感 flag 的下一项和 `--flag=value`；清除 URL userinfo；展示、复制、诊断导出与错误路径统一验证。复现只使用假凭据，没有读取真实 MCP 配置。

### F-CX-01 · P1 · CODE：Codex 会话及若干目录读取丢失分页信息

证据：`CodexAppServerClient.ts:688`、`:915`、`:926`、`:1123`、`:1335`；`CodexAdapter.ts:3577`。

`listThreads` 只接收 `limit/archived`，返回 `result.data`，不暴露或追读 `nextCursor`。适配器分别请求 50 个 active 和 50 个 archived；不在内存中的更早原生会话无法通过此路径被完整发现。model/permission-profile 方法虽然允许传 cursor，却丢弃响应 cursor；MCP 与 loaded threads 同样没有完整分页闭环。

官方 `ThreadListResponse` 明确包含 `nextCursor`。消息 items/turns 分页已经接入，应保留并复用其页契约，不重新设计另一套游标规则。

修复目标：完整读取或显式分页 UI；按 native ID 去重，保留过滤参数，并显示 partial/failed。用 121 active + 121 archived、重复边界项、第二页失败验证。

### F-CX-02 · P1 · CODE：Codex 原生 rename/delete 失败没有传播到调用结果

证据：`CodexAdapter.ts:3507`、`:3542`；`CodexAppServerClient.ts:1606`、`:1621`。

client 的 mutation 返回 boolean；adapter 重命名失败只记录 debug，删除忽略 boolean 并清本地状态。调用方无法从 adapter 的正常完成区分“原生变更成功”和“原生拒绝/接口缺失”。这是适配器结果契约缺口，本轮未声称已经在真实 UI 观察到删除后重新出现。

修复目标：区分 forget-local、archive-native、delete-native；原生失败明确传播。成功 ACK 后同 ID 原生读取确认名称/存在性/归档状态；失败保留恢复所需 ID，避免静默成功。

### F-AUX-01 · P1 · CODE：ZCode 不在统一只读 aux 审计入口

证据：`scripts/audit/aux-query-audit.entry.ts:730`；`run-aux-query-audit.mjs`；`ZCodeAdapter.ts:240`。

默认审计只枚举 `opencode/claude-code/codex/pi`，OpenCode 2 是独立入口。传入 `zcode` 会被判为未知；但当前 ZCode 已声明 AuxQuery/InlineCompletion，并有独立辅助会话实现及历史真实审计。因此缺口是统一回归入口和门禁覆盖，不能再沿用早期“ZCode 没有只读辅助会话”的结论。

修复目标：让六后端进入同一报告/选择/coverage 契约；保留 OpenCode 2 独立构建要求与 ZCode 两种机制的差异。ZCode generic aux 使用空工具表原生回读，sessionless completion 使用另一证明边界；两者不能互相替代。

## 4. 协议增量与产品接入缺口

### F-PI-02 · P2 · UPSTREAM：Pi 新 RPC 尚未进入版本化业务表

证据：`PiProtocol.ts:2`、`PiAdapter.ts:169`，对照 Pi 固定 SHA `rpc-types.ts:40`、`:65`。

上游存在 `get_available_thinking_levels` 和 `get_entries(since?)`；当前 RPC/SDK/config 命令表没有这两个操作，adapter 白名单会拒绝它们。`get_tree/clear_queue` 已有 SDK 补充入口，不计作漏接。

接入目标：原生模型支持的思考档位驱动选择控件；按原生 entry ID/leaf ID 获取增量历史，不以数组索引代替身份。旧 Pi 保留不支持状态和全量读取降级。安装版本必须探测后才启用新 RPC，不能按 main 快照承诺所有旧版可用。

Pi 配置 schema/验收文档仍含 0.73.1 的 29 RPC、51 字段基线，代码已兼容新品牌/0.85+ SDK；需要自动生成安装版本差异清单。Pi MCP 当前是扩展配置声明与文本状态，`PiMcpConfigService` 明确不展开祖先发现、imports/插件扩展；这属于已知展示边界，不能声称运行时完整 MCP 管理。

### F-CC-01 · P2 · UPSTREAM：Claude 部分原生控制未有业务入口

精确依据：官方 `0.3.283 sdk.d.ts` 的 `setMcpPermissionModeOverride`（2881）、`reloadOutputStyles`（3105）。本轮检索 `src/` 未找到调用。`reloadSkills` 和 `setMcpServers` 已接入，不计作缺口。

接入目标：会话内单 MCP server 的 tighten-only 权限覆盖及输出样式目录刷新；区分内存会话覆盖与文件持久配置。缺控制方法时显式 unavailable，不以重启所有会话冒充热刷新。

同版类型明确：`setMcpServers({})` 不能移除插件拥有的 MCP server。这不证明当前 aux 有漏洞，但必须纳入负向审计：不能把请求里的空对象作为零 MCP 工具的证据。

`systemPrompt/loadTimeoutMs` 等字段现有注释已经说明部分运行时行为未经独立证明。应建立逐字段三轴证据表；模型/权限/工具列表、checkpoint 和新消息事件已有大量接线，不能按旧 phase1 文档整组判为未接入。

### F-CX-03 · P2 · UPSTREAM：Codex 新原生能力还未形成插件业务流程

对照官方 `rust-v0.158.0`，当前 Codex 相关源码没有 `gatewayOAuth/explicitGatewayOauth`、`mcpAppUi`、`disabledPluginIds` 的明确接线。

候选流程：网关二次 OAuth 的状态/登录/取消/恢复；MCP App UI 的 resource URI、展示模式、历史恢复；线程插件选择的请求和回读。普通账号登录、MCP OAuth、MCP tool/resource、plugins install/read/uninstall、skills/hooks、goal、review、steering、压缩及消息分页已经接入，不计作整组缺失。

上游明确 `disabledPluginIds` 当前保存选择但尚不实际过滤插件能力，所以它只能是配置/导航候选，不能作为权限隔离措施。生物识别、realtime、远程环境等需独立产品决策，不能把全量 app-server 内部方法都列为必做。

### F-ZC-02 · P2 · UPSTREAM/CODE：ZCode 原生管理面未完整产品化

`SettingsZCodeSection` 当前主要是运行时路径、默认模型、思考、模式、连接/provider-config 诊断。官方固定 SHA README 已有 plugins、MCP stdio/http/sse 与 hooks 配置；ZCode settings/MCP/hooks/plugin 接口没有对应完整管理闭环。现有原生工具流、问题、权限、模型和斜杠执行不能代替这些管理流程。

接入目标：按安装版本核实可用的配置/查询接口，先接发现、配置来源、错误与有效工具回读，再接 allowlisted 配置写入和重连。官方 MCP 授权请求与插件目前的空 headers 应答应单独验收，不假定继承全部桌面登录状态。

### F-ZC-03 · P1 · ACCEPTANCE：本地补丁运行时与官方发行版能力不同

依据：`docs/modules/core/agents/backend/zcode/ZCodeAdapter.md` 及 `devlog.md` 的 2026-09-26 记录。强杀后的 durable background-task readback 依赖本地官方源码分支新增 `session/backgroundTaskRead`，当时官方安装包不含该接口。

必须分开验证官方安装包、Node bundle、本地补丁 bundle、桌面 TaskIndexRepo。某组合通过不能覆盖其他组合；纯 CLI 无桌面索引时删除应诚实失败。后台 `unknown` 不能变 completed，任务取消必须按 sessionId/taskId 并读回终态。ZCode 原生没有成本证据时保留 null，不能用 $0 填补。

## 5. 已有实现但验收没有完成

### F-OC2-02 · P1 · ACCEPTANCE

`docs/status/opencode2-backend-acceptance.md`（2026-09-28）明确仍待：真实 API-key/OAuth 完成及凭据激活/撤销后的成功请求；两座 Test Vault 的选区 inline edit accept/reject；编辑/补全覆盖值的 save/application。最后一项本轮已经进一步定位到 F-OC2-01。

该文件记载的 v2.0.18 share/unshare、legacy LSP、Todo 能力例外应按版本继续管理；本轮未安装对应 client，未做原生重验，不宣称所有未来 v2 也不支持。配置含 LSP/share 键不是原生功能运行证据。Git-backed snapshot diff 与非 Git file hints 分开验收。

### F-PI-03 · P1 · ACCEPTANCE

`pi-backend-acceptance.md` 明确 OAuth 采用受控回调而非真实账号成功授权。早期“仅 macOS 实机”结论已有后续 Windows shim/新 SDK fixture 验收更新，不能笼统声称 Windows 完全未测；需要补齐当前发行构建、Windows 真 Obsidian 产品流程和真实 OAuth 的新证据。不会把 localhost provider fixture 的成功计作外部供应商认证通过。

### F-OC1-01 · P2 · CODE：OpenCode 1 streaming 与 authoritative sync 的事件覆盖需闭环测试

`OpenCodeStreamEventTransformer.ts:330` 的 streaming handler 未注册 `message.updated/message.part.removed`，而 `OpenCodeSyncEventRuntimeCoordinator` 已消费它们。属于前台流与同步职责之间的覆盖差异，不是事件完全未接入。

应测试前台事件、后台同步、撤回/删除 part、重载与 16ms 合并并行发生时的最终一致性，尤其要验证旧流不覆盖新 authoritative history。OpenCode 1 已显式排除 TurnSteering；不把队列输入当作原生 steer。

### F-DOC-01 · P2 · CODE：历史能力文档会误导缺口判断

`docs/status/sdk-v2-rollout.md` 仍把 format/agent/noReply 列作未接入，而当前 `OpenCodePromptRequestBuilder` 已映射这些参数。Pi 0.73.1 文档和 ZCode 早期 fail-closed 文档也需要对应版本和后续替代记录。

修复目标：标明历史基线/当前证据入口，并从能力清单生成差异，避免下一轮重复实现已经存在的功能。

## 6. 当前能力轮廓

| 后端 | 已有基础 | 当前需要重点完善 | 不应虚构的对等能力 |
| --- | --- | --- | --- |
| OpenCode 1 | SDK v2 + HTTP/SSE fallback、会话/工具/问答/权限/模型/MCP/配置、aux | 两条事件路径一致性、目录作用域/旧 managed server、版本化证据与文档 | 无原生 steer 时明确降级队列 |
| OpenCode 2 | 原生会话/分叉/回退、stream、forms/permissions、catalog、steer、aux/completion | 覆盖值持久化、真实 auth、编辑 UI、Git/non-Git 变化证据 | 2.0.18 已登记原生例外按版本保留 |
| Codex | app-server + SDK fallback、审批/问答、fork、goal/review、compaction/steer、MCP/plugins/skills/hooks | 目录分页、mutation 结果、网关 OAuth/MCP App/线程插件增量 | SDK fallback 不等于完整 app-server 控制 |
| Claude Code | Agent SDK、persistent query、权限/问答/elicitation、context/checkpoint、MCP/skills/目录、新事件、aux | per-server 权限覆盖、样式刷新、逐字段运行时证明、新 SDK/CLI 组合回归 | 文件 rewind 与对话回退分别定义 |
| Pi | 独立 SDK 服务、RPC/SDK 工作台、树/队列/扩展 UI、配置/认证、steer、aux | 脱敏、新 RPC/新 schema、真实 OAuth、当前跨平台 UI 证据 | MCP/子代理来源于扩展时保留来源和证明边界 |
| ZCode | app-server、会话/模型/模式、原生斜杠、工具流/问答/权限、后台/子任务、aux/completion | 设置覆盖、原生管理面、统一 aux gate、官方/补丁/桌面组合 | 无成本或无桌面删除索引时诚实 unavailable |

## 7. 本轮验证与可复现边界

离线复现工具：`%USERPROFILE%\.codex\artifacts\opencodian\backend-review-2026-10-02\reproduce.mjs`（在项目根运行）。使用 esbuild 在内存加载生产模块，Obsidian Setting/DOM 与翻译做最小 stub；配置归一化与 Pi MCP reader 均为实际生产实现。三个 finding 最终均 `reproduced:true`。没有执行模型请求，也不把 stub DOM 当真实 UI 验收。

```powershell
node "$env:USERPROFILE\.codex\artifacts\opencodian\backend-review-2026-10-02\reproduce.mjs"
node scripts/run-jest.js --runTestsByPath tests/unit/core/agents/backend/pi/PiMcpConfigService.test.ts tests/unit/core/agents/backend/CodexAdapter.listSessions.test.ts tests/unit/core/agents/backend/ZCodeAdapter.aux.test.ts tests/unit/core/agents/backend/OpenCode2Adapter.test.ts
```

后者结果：4 suites / 36 tests 通过。OpenCode 2 测试 mock 了原生 client，缺安装包仍然通过；这正是需要新增原生集成层的原因。未运行全量 verify、真实 CLI/模型审计或 Obsidian UI；当前依赖不一致时不能声称完整 runtime acceptance。

当前 Windows `.scratch` 不存在，因此本轮把完整方案存入正式 docs；没有创建目录冒充 tracker symlink。证据目录位于非同步本地路径，仅保留本轮合成配置和静态上游快照；仓库仅留下文档。

## 8. 官方参考

以下参考限定到对应版本/读取快照；不以浮动 main 证明已安装版本能力。

- Codex `rust-v0.158.0`：https://github.com/openai/codex/blob/rust-v0.158.0/codex-rs/app-server/README.md
- Codex ThreadListResponse：https://github.com/openai/codex/blob/rust-v0.158.0/codex-rs/app-server-protocol/schema/typescript/v2/ThreadListResponse.ts
- OpenCode 1 SDK：https://dev.opencode.ai/docs/zh-cn/sdk/
- OpenCode 2 API：https://opencode.ai/v2/docs/api
- Pi RPC 类型：https://github.com/earendil-works/pi/blob/0495646a8322ff99ce40ac2f9e15f1f49f56bb11/packages/coding-agent/src/modes/rpc/rpc-types.ts
- ZCode CLI/MCP/hooks/plugins：https://github.com/zai-org/ZCode/blob/29628c9acdb81b703bbd4080c207a0e7ce5e276e/apps/zcode-cli/README.md
- Claude 官方 SDK：https://github.com/anthropics/claude-agent-sdk-typescript
- Claude 0.3.283 npm metadata：https://registry.npmjs.org/@anthropic-ai/claude-agent-sdk/0.3.283
