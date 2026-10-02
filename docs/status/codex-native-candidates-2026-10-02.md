# T11 Codex native candidates — freeze（2026-10-02）

T11 的版本探测、接口设计和专属离线契约测试已收口。外部 CLI **0.160.0** 的 Gateway 只读 RPC 为 **observed**；`mcpAppUi` 与 `disabledPluginIds` 为 **advertised**。保存 disabled plugin 选择在固定上游版本中**不会过滤插件能力**。本交付没有实现插件生产接线，也没有验收 OAuth 登录、真实模型、MCP widget、Obsidian UI 或禁用执行效果。三个候选默认关闭，Configuration Loop 不声明完整。

唯一工作区：`C:/Users/lt/.codex/worktrees/backend-integration-completion/opencodian`。仅新增下文四个专属文件；其他 agent 的 backend/settings/chat 和既有工作区改动保留。没有 init/sync/graphify/全量 verify/build/deploy，没有改 package/lock/locales/总方案/owners，没有提交。

## 1. 冻结安装身份与 profile

最终原生采集时间：`2026-10-02T13:09:04.277Z`（北京时间 2026-10-02 21:09:04）。

| 项目 | 实证 |
| --- | --- |
| PATH 入口 | `C:/Users/lt/AppData/Roaming/npm/codex.cmd` → 全局 npm `@openai/codex/bin/codex.js` |
| 实际外部二进制 | `C:/Users/lt/AppData/Roaming/npm/node_modules/@openai/codex/node_modules/@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe` |
| `--version` / npm 包 | `codex-cli 0.160.0` / `@openai/codex` 0.160.0 |
| 二进制 SHA-256 | `fdda5fa3cf3fb3d000b876720742857676293e4315e4b045fae6f8bd7e866d1d` |
| native profile | Windows x64；自有 app-server；`stdio://`；隔离 CODEX_HOME/cwd；临时 `t11_offline` provider；endpoint `http://127.0.0.1:1`；无凭据环境注入 |
| handshake profile | `experimentalApi:true`、`explicitGatewayOauth:true`；初始化响应 `opencodian_t11_audit/0.160.0 ...`；只发送 initialize、initialized、account/gatewayOAuth/read |
| 当前 worktree SDK | `@openai/codex-sdk` 0.158.0；它不是上面的原生 CLI 版本 |
| 排除的 profile | PATH 后面的桌面内置 codex.exe、SDK fallback、插件 WS/reconnect、remote/adopted app-server 均未做 runtime 验收 |
| 进程收口 | 最终 PID 36328，exit code 0，closed true；前期自有 PID 31800、17392、34864 也 exit 0；另留 OS 进程/直接子进程闭合证据 |

`app-server --help` 与 `app-server generate-json-schema --help` 实际运行成功。稳定、`--experimental` 两组 schema 都由上述**同一安装二进制**在本轮生成；不使用项目 SDK 的字符串清单代替协议。版本一致只说明报告的版本一致，不声称 tag SHA 是该二进制的可复现构建证明。

第一次握手已返回有效 read 结构，但旧审计解析器只认 codex 前缀，因服务端以 clientInfo.name 命名 userAgent 而保守判 unknown。证据 `installed-probe-01/` 保留。修正为精确 client name 的前缀解析并加回归后，复采结果为 observed；最终冻结以 `installed-probe-final/` 为准。

## 2. 官方固定 source，与安装证据分列

固定官方仓库 `openai/codex`：tag **rust-v0.160.0**；annotated tag object **79b1b666f2e8551f8abbbca34957227f67f3f553**；解析到 commit **a956835d020762cb2b570053af06f643a11c0ecc**。GitHub 官方 tag API 的两级解析原文已保存。这里只把固定 source 用作协议解释/设计依据；advertised 与 observed 来自安装版生成和原生响应。

以下均固定到同一 commit；完整源码和逐文件 SHA-256 见证据 `official-sources.json`、`official-sources/`：

- [app-server README](https://github.com/openai/codex/blob/a956835d020762cb2b570053af06f643a11c0ecc/codex-rs/app-server/README.md)：Gateway OAuth、MCP App UI、线程插件选择的行为边界。
- [protocol/v1.rs](https://github.com/openai/codex/blob/a956835d020762cb2b570053af06f643a11c0ecc/codex-rs/app-server-protocol/src/protocol/v1.rs)：初始化能力结构。
- [protocol/common.rs](https://github.com/openai/codex/blob/a956835d020762cb2b570053af06f643a11c0ecc/codex-rs/app-server-protocol/src/protocol/common.rs)：RPC/notification 路由与实验字段。
- [protocol/v2/account.rs](https://github.com/openai/codex/blob/a956835d020762cb2b570053af06f643a11c0ecc/codex-rs/app-server-protocol/src/protocol/v2/account.rs)：Gateway readiness 类型。
- [protocol/v2/item.rs](https://github.com/openai/codex/blob/a956835d020762cb2b570053af06f643a11c0ecc/codex-rs/app-server-protocol/src/protocol/v2/item.rs)：工具事件 `mcpAppUi` 与 display mode。
- [protocol/v2/thread.rs](https://github.com/openai/codex/blob/a956835d020762cb2b570053af06f643a11c0ecc/codex-rs/app-server-protocol/src/protocol/v2/thread.rs)、[turn.rs](https://github.com/openai/codex/blob/a956835d020762cb2b570053af06f643a11c0ecc/codex-rs/app-server-protocol/src/protocol/v2/turn.rs)：disabled plugin 选择/回读。
- [app-server/message_processor.rs](https://github.com/openai/codex/blob/a956835d020762cb2b570053af06f643a11c0ecc/codex-rs/app-server/src/message_processor.rs)：原生请求分派。

另用 web 访问了 [OpenAI App Server 官方文档](https://developers.openai.com/codex/app-server)，当前跳转 `learn.chatgpt.com/docs/app-server`；它是动态文档，不作为 frozen schema。初次猜测的 `protocol/initialize.rs`、未拆分 `protocol/v2.rs` 在固定 SHA 返回 404，记录保留；已改用上述实际源路径，不将 404 当成能力缺失。

## 3. 能力分层与 unavailable 边界

| 候选 | 安装 stable schema | 安装 experimental schema | runtime 冻结结论 | unsupported / 未验收边界 |
| --- | --- | --- | --- | --- |
| gatewayOAuth / explicitGatewayOauth | 初始化 boolean + read/login/cancel 路由与 readiness 响应 | 同样宣告 | **observed，仅 read RPC 与 explicit-mode 协议支持** | login/cancel/changed UI、网关认证、真实请求未验收；不是“OAuth 配置完成” |
| mcpAppUi | `item/completed → ThreadItem[mcpToolCall] → mcpAppUi` 的可空结构 | 同样宣告 | **advertised**；runtimeAvailable false | 没有实际 MCP 工具事件、widget 或 resource runtime 验收；不是“已有 App UI renderer” |
| disabledPluginIds | turn/start 请求、thread/start 回读数组；不宣告 thread/settings/update 路由 | 增加 thread/settings/update 路由和同名数组 | **advertised，仅保存选择协议**；runtimeAvailable false | 稳定协议包不提供实验 update 路由；固定上游明确未做能力过滤；没有真实线程保存/resume/fork 验收 |

最终原生 read：`{providerId:"t11_offline", providerName:"T11 offline probe", required:false, status:null, error:null}`。官方固定 source 将 read 和 explicitGatewayOauth 支持作为成对协议，因此在 required=false 时仍可确认协议支持；它不证明有 gateway_oauth provider 或有效网关凭据。审计没有运行 model/list、thread/start、turn/start、MCP discovery/tool call、login/cancel、配置 mutation。

审计裁决规则：

- **unknown**：安装/schema 版本缺失或不一致；不完整 schema；仅 initialize ACK；过期连接；错误/超时且没有准确 missing-method 证据。
- **unsupported**：完整结构不满足目标协议，或同版本/同连接目标 RPC 返回 `-32601`。仅错误文本含 unsupported、auth/config error、`-32600`/`-32000` 不够。
- **advertised**：在方法 discriminator、参数/响应 `$ref`、属性类型与指定工具 variant 上通过结构验证。未连接的 definition 或 description 同名字符串不够；runtimeAvailable 保持 false。
- **observed**：同安装/schema/runtime 版本、同 initialized connection 的目标只读 RPC 成功，且返回经过类型校验。当前只允许 Gateway read 升级；初始化响应不升级全部能力。

没有测试其他已安装版本，不能用 0.160.0 证据推导 0.158/0.159、预发布、SDK fallback 或远程 server 的 runtime 支持。切换二进制/版本/连接后重新探测；无支持候选继续 default off。实验 schema 宣告与服务器实验 opt-in 要分列。disabledPluginEnforcement 的 unsupported 只绑定固定官方 0.160.0 source，不给未知未来版本下结论。

## 4. 给 parent / Euler 的精确接口与集成建议

以下为交接设计，没有改动相关 source。只读检查时，`CodexAppServerTransport` 初始化已带 experimentalApi，但没有 explicitGatewayOauth；`CodexAppServerClient` 已有 plugin/list 与 resource/read 包装，`AppServerPluginSummary.id` 已保留准确 ID。三个候选字段在所检 Codex transport/client/types/normalization/adapter/settings 文件中尚无显式接线；只读快照 SHA 见 `read-only-plugin-profile.json`，后续其他 agent 修改可能使该快照过期。

### Gateway OAuth

建议延伸现有 transport/client/account surface：

```ts
// 初始化能力字段，注意 OAuth 路由和 Oauth capability 的大小写差异。
capabilities: { experimentalApi: true, explicitGatewayOauth: true }
// 三条请求无 params；不能用 mcpServer/oauth/login 代替。
'account/gatewayOAuth/read'
'account/gatewayOAuth/login'
'account/gatewayOAuth/cancel'
type GatewayRead = {
  providerId: string; providerName: string; required: boolean;
  status?: 'notReady' | 'started' | 'succeeded' | 'failed' | null;
  error?: string | null;
};
// account/gatewayOAuth/changed
// {providerId, status, authUrl?: string|null, error?: string|null}
```

若实现显式登录面，每条新连接/重连必须先初始化并成功 read，再允许 model/list 或认证推理请求。read 方法缺失需要升级；其他失败保持 blocked/unknown，不能回退自动打开浏览器。explicit opt-in 是 server process 内共享 gateway runtime 状态，后连客户端无法撤销；因此只有完整显式登录流程就绪后再启用。

login 回执为空对象；启动 URL 来自 initiating connection 的 changed/started notification。不要 opt-out 该通知；取消使用同一连接并等待原生 cancel 返回；连接关闭也会取消该连接登录。网关 status succeeded 只表示本地凭据可用，真实网关请求仍单独验收。providerId 变化须重新读，失去连接/切 provider 不复用 readiness；token/authUrl 不进入诊断持久化。测试需覆盖 reconnect read-before-model、缺方法、取消竞态和 provider 切换；真实 OAuth 另安排。

### MCP App UI

```ts
type McpAppUi = {
  resourceUri: string;
  preferredModelDisplayMode: 'inline' | 'fullscreen';
};
// ThreadItem 的 type=mcpToolCall 分支：
// mcpAppUi?: McpAppUi|null; mcpAppResourceUri?: string|null
// item/started、item/completed 和 saved history 都应保留可空元数据。
```

建议在既有 Codex event/history normalization 保留结构，再由既有 chat rendering owner 消费。优先 mcpAppUi.resourceUri；旧历史/未声明 mode 允许保持 null，旧 URI/catalog discovery 继续可用。display mode 是 descriptor 偏好，不能凭 metadata 宣告 widget 渲染已验收。

安装版 `mcpServer/resource/read` 精确 required params 为 `{server:string, uri:string}`；可选 `threadId`、`originCallId`、`connectorId`、`target:{connectorId,linkId}`。未来若读资源，保留 originating thread/call/account 范围。实际资源获取、宿主消息桥和安全渲染须由对应 owner 单独设计/验收，不能把 HTML 直接注入稳定聊天面。本轮不调用 MCP 工具/资源。

### Disabled plugin 选择

```ts
// 来自 plugin/list 的准确 PluginSummary.id：<plugin-name>@<marketplace-name>
// 不由 name/displayName 合成，不把 catalog enabled 当成线程选择回读。
{threadId, disabledPluginIds?: string[] | null} // thread/settings/update（experimental）
{threadId, input, disabledPluginIds?: string[] | null} // turn/start
```

omitted/null 保留旧列表，`[]` 清空，非空列表替换；不要用 length>0 的归一函数丢掉空数组。catalog 不可用或 ID 不存在时拒绝候选请求，保留原状态；审计离线 encoder 还拒绝重复 ID。

权威回读来自 `thread/settings/updated.params.threadSettings.disabledPluginIds`，或 thread/start/resume/fork response 顶层 disabledPluginIds。字段遗漏是 unknown/unavailable，不能从请求数组或 schema default 造回读。ACK 不算 readback；按准确 threadId 更新既有 per-session 状态并防旧连接/别的 tab 覆盖。持久化选择与真正工具禁用分开记录；**当前不得宣告 DisabledPluginIds 是安全隔离或禁用执行能力**。后续仅保存选择的接线可以评审，但有效 disable 面需要原生 enforcement 证据后再开放。

## 5. 已实现、测试与图门禁

已实现的是独立审计与离线契约：结构化 JSON schema `$ref`/variant 检查；unknown/unsupported/advertised/observed 四级裁决；精确 CLI/handshake 版本绑定；目标方法错误判定；disabled plugin 选择语义；隔离 home 的可选只读握手；证据不覆写与 owned process 收口。无生产 imports、无候选自动开启。

专属新增 paths：

1. `scripts/audit/codex-native-candidates.mjs`
2. `scripts/audit/codex-native-candidates.test.mjs`
3. `tests/unit/infrastructure/codex-native-candidates.test.mjs`
4. `docs/status/codex-native-candidates-2026-10-02.md`

聚焦验证：Node 契约 **17/17 passed（含真实安装 schema 离线重放，0 skipped）**；专属 scripts Jest **1 suite / 1 test passed**；三文件 ESLint **0 errors / 0 warnings**；审计入口 `node --check` 成功。常规离线执行不设置 saved schema 时为 16 passed + 1 可选 replay skipped。测试覆盖描述字符串假阳性、循环 ref/错误类型/partial schema、版本和连接 mismatch、初始化 ACK、准确 -32601 与其他错误、gateway readiness 与 protocol 区分、omitted/null/[]/replace、catalog identity 与 default off。没有用 fake/mock 测试宣告 runtime 通过。

前置已读 Graphify 报告（CodexAdapter god node，CodexAppServerClient community 16）、CONTEXT、ADR 0001、backend owner overview。`inspect:owner` 对新 audit/test 路径没有 owner 映射；core.backend owner 用作只读 source/未来交接。

CodeGraph 1.5 status 可用；没有改既有源码函数。创建及修改新审计文件时，新专属路径及 parseCodexVersion/inspectCandidateSchema/classifyCandidate 查询没有本文件定义；loadBundle 搜索仅返回不相关 icon 符号，未冒充目标 ID。该阶段 **callers、唯一 symbol ID、finite impact depth/size 均 N/A**，不编造 0 caller 或 risk 等级。未运行 init/sync。

收尾时共享索引已更新到 `2026-10-02T13:09:22.758Z`，本 agent 再次只读查询解析到 `inspectCandidateSchema` 唯一函数 ID **function:bc245a654c5876b396947478edec6592**，root file 为专属 audit 脚本。CLI 不接受直接 ID，故用唯一 name 查询并核对 impact root：distinct function/method direct caller **1**（run；排除 test file 节点）；有限 depth **2**；返回 blast-radius **4 nodes / 4 edges**，包含 root，范围仅两个专属 audit 文件。此检查在 source freeze 后，之后只编辑本报告；CodeGraph 没有输出 risk 等级，不补造。

按要求执行全工作区 diff→affected，返回其他 agent 的 67 changed files、1688 traversed dependents 和 918 affected tests，该结果不能归因于本 agent。专属四 paths 初次 affected 返回两个测试、0 traversed；共享索引更新后的最终结果仍是两个专属测试、**1 traversed**。本 agent 不修改索引，也不把两次索引结果混作 runtime 验收。共享 `git diff --check` 另出现既有 Graphify 文件 CRLF/trailing-whitespace 大量输出并超出缓冲，未宣告该全工作区检查通过，也未修他人文件；四个专属新增文件的独立 whitespace 检查通过。

## 6. 证据与重放

根目录：`C:/Users/lt/.codex/artifacts/opencodian/backend-integration-2026-10-02/final-expansion/codex-t11/`。

- `installed-identity.json`、`installed-command-*.json`：最初外部 CLI 解析、帮助、schema 命令。
- `official-tag-ref.json`、`official-annotated-tag.json`、`official-sources.json`：固定官方引用与本地 source 副本。
- `installed-probe-final/summary.json`、`commands.json`、`native-read-only.json`、两组 schema：最终安装/runtime/profile。前期 probe-01/02/03 留作历史证据。
- `read-only-plugin-profile.json`：当前 SDK 与只读相关 source SHA 快照。
- `focused-node-tests-final.json`、`focused-jest-tests-final.json`、`focused-lint-final.json`、`owned-process-closure-final.json`：最终聚焦检查与退出。
- `codegraph-affected-workspace.json`、`codegraph-affected-t11-final.json`、`codegraph-final-symbol.json`、`freeze-manifest.json`：图范围与最终专属文件/evidence 摘要。初次 Node→PowerShell shim 调用保存的 `codegraph-affected-t11.json` 为无 stdout 的无效读数，最终直接 Node 入口重采文件才是有效证据。

```powershell
node --test scripts/audit/codex-native-candidates.test.mjs
node node_modules/jest/bin/jest.js --selectProjects scripts --runInBand --runTestsByPath tests/unit/infrastructure/codex-native-candidates.test.mjs
# 若需重放已保存 schema，先设置专属环境变量 CODEX_T11_SCHEMA_DIR。
# 若需重采原生证据，--output 必须是未存在的新目录；默认不做 handshake。
node scripts/audit/codex-native-candidates.mjs --executable <resolved-native-codex.exe> --output <fresh-evidence-directory> --read-only-handshake
```

真实 model、实际 Gateway OAuth 账户、MCP App widget、线程选择持久化及 UI **均未验收**；本次设计/探测完成不能转写为三个候选“已完整接入”。
