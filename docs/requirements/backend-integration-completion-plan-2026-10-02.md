# 六后端完善接入与全流程测试方案

日期：2026-10-02。状态：**本轮代码、独立复核与完整门禁已收尾（964 suites／9924 tests、15 gates PASS）；两端正常 Test Vault 真实加载 HEAD.202610022256。用户要求提交推送并同步 Mac，Codex forget/page UI 与 T12/T13 余下实机验收转交 Mac 续做**。64 canonical cases／17 profiles 不由局部测试推定全通过；详见 [最终实施记录](../status/backend-integration-implementation-2026-10-02.md) 与 [Mac 续做交接](../status/backend-integration-mac-continuation-2026-10-02.md)。

目标：OpenCode 1、OpenCode 2、Codex、Claude Code、Pi、ZCode 的已承诺功能都能通过真实产品流程完成；有版本/平台/原生能力边界的功能显示真实状态；新增上游业务能力有可追踪的接入、验证和发布路径。

本方案不以“六个后端拥有同样数量的接口”为完成条件。完整配置遵循 CONTEXT/ADR 0001 的 persistence → application → runtime readback；文件变更遵循 ADR 0002 的 Turn Change Record 与 Session Change Sidebar 两种所有权。

## 1. 完成判据

一个已承诺功能必须满足：

1. **能力身份正确**：绑定 backend、运行模式、CLI/SDK/协议版本、平台和配置作用域；明确 native、plugin adapter、extension 或 unavailable。
2. **用户可达**：稳定 UI/命令入口可操作；需要 native ID 时不能用临时数组索引替代。
3. **配置闭环**：持久化、实际请求应用、原生回读三轴分别有证据；不支持回读时诚实 unavailable，不伪造 verified。
4. **执行闭环**：受理 ACK、执行进度、终态、最终回读分开；压缩/登录/安装/后台取消不能只凭 ACK 标成功。
5. **故障恢复**：取消、超时、权限拒绝、进程丢失、插件重载后状态和下一轮操作正确。
6. **结果保存**：native history、插件 metadata、变化记录、附件和树/父子关系可以恢复。
7. **隔离正确**：会话、后端、vault、配置层和辅助查询互不串扰。
8. **发布可复现**：干净锁文件安装、发行包运行、真实 host/build readback 都有证据。

任何必要场景缺环境/账号/host，记录 blocked 或 unverified。不能把 skip、mock、脚本调用或旧构建截图算作新构建 UI pass。

## 2. 版本与环境准备

### 2.1 基线记录

每次运行先保存 manifest：

- 插件 HEAD、工作区 source digest、BUILD_ID、发行包 SHA256。
- package.json、lock integrity、实际安装 SDK/client 版本；不得只记录 semver 范围。
- CLI 路径类别与版本、协议握手、安装来源；路径仅在本地受限证据保留。
- host OS/arch、Node/Electron/Obsidian、Test Vault 身份、Git/non-Git 状态。
- backend 配置作用域；凭据只记录身份类型和认证结果，不保存值。
- upstream 固定 commit/tag 与 installed-runtime 两个独立基线。

当前工作区先修复审查报告的依赖不一致，再启动 native 验收。优先在非同步的独立工作树恢复 lock 安装，不在审查期间顺手改 lock/升级所有 CLI。项目 `.scratch` 的 symlink 未恢复前只维护 docs 任务表，不能把普通目录当 tracker。

### 2.2 必须覆盖的运行 profile

| 后端 | profile | 必须保留的差异 |
| --- | --- | --- |
| OpenCode 1 | 本地 SDK v2；本地 legacy HTTP/SSE；远程 URL/密码 | fallback 只能在允许边界发生；目录作用域、managed server 身份独立 |
| OpenCode 2 | 本地原生 client；远程 URL/密码 | 独立 v2 runtime/session/config，不复用 v1 ID |
| Codex | app-server 主路径；SDK fallback | Context/steer/goal/review/MCP 等按实际路径探测，fallback 不冒充 app-server |
| Claude | 新建 persistent query；resume；受控非持久查询 | `settingsSources`、sessionStore、resume 和热修改边界明确 |
| Pi | 当前 SDK；最低支持 SDK；旧/新品牌 npm shim | 命令/schema 按安装版本探测，外部 Node 与插件宿主分开 |
| ZCode | 官方安装；Node bundle；本地补丁 bundle；有/无桌面 TaskIndexRepo | durable background readback 与删除索引不是每种安装都具备 |

Windows/macOS 是当前必须的真实 Obsidian host。Linux 做传输/路径/协议自动化；只有准备真实 Obsidian host 后才宣称 Linux UI 验收。P1 流程在所有声称支持的 profile 上运行；次要 schema 参数使用等价类/成对组合，避免无意义笛卡尔积。

## 3. 能力和证据目录

扩展现有 `AgentCapability`、`AgentServiceRegistry`、Capability Lab 与 backend diagnostics，维护一份机器可读目录，不再用多份文档中的数字代表现状。只在 3+ 消费面复用或隔离高风险协议边界时新增文件，其余放在现有 owner。

每个 feature 记录：

```json
{
  "backend": "opencode2",
  "profile": "local-native",
  "feature": "inline-edit.model-override",
  "contractVersion": 1,
  "source": "native",
  "availability": "available",
  "configuration": {
    "persistence": "verified",
    "application": "verified",
    "runtime": "verified"
  },
  "execution": {"admission": "verified", "terminal": "verified", "readback": "verified"},
  "ui": "verified",
  "recovery": "verified",
  "evidence": ["S05", "B11", "U03"],
  "buildId": "captured-from-loaded-runtime",
  "sdkVersion": "captured-from-installed-package",
  "runtimeVersion": "captured-from-handshake"
}
```

配置状态沿用 `verified/pending/unavailable/failed/not-applicable`；availability 与 evidence 分开。用户输入和请求 echo 只能证明 application，不能证明 runtime。暂存设置等待下一轮时是 pending。实验功能的开关、版本要求和运行时证据分别展示。

功能目录至少覆盖以下业务族：

| 业务族 | 必须记录的子能力 | 特别边界 |
| --- | --- | --- |
| 启动/连接 | discovery、override path、auth、握手、health、owned process | 不终止外部共享进程 |
| 模型/provider | 完整目录、过滤、默认、会话覆盖、思考档位 | 空目录/读取失败/无权限不同 |
| 认证 | API key、OAuth、刷新、撤销、MCP/gateway auth | 真实账号与 fixture 分开 |
| 配置 | global/project/local/session、CRUD、revision、effective readback | managed policy 高于用户覆盖 |
| 会话 | new/list/read/import/rename/archive/delete/resume | native 删除与本地忘记分开 |
| 会话树 | fork/clone/branch/navigation/label/children | 不是每后端都提供 branch tree |
| 对话 | streaming、error、cancel、retry、user identity | cancelled/failed/completed 不混用 |
| 活动输入 | native steer、follow-up queue、queue inspect/clear | queue 不能标 steer |
| 上下文 | 文件/选区/文件夹、图片、引用、system、structured output | 不支持形态应拒绝而非丢弃 |
| 用量 | tokens/cache/reasoning/context/cost/rate limits | 无实际成本为 null，估算单独标记 |
| 压缩 | auto/manual、取消、终态、上下文回读 | admitted 不等于 completed |
| 工具 | catalog、模型工具集、执行、结果、文件/Shell | 展示工具与管理工具分别记录 |
| 审批/问答 | permission、question、elicitation、forms、user dialog | 请求身份、恰一次回答与取消 |
| TODO/plan | native todos、turn plan、目标、build/plan 状态 | 不从自然语言伪造 native TODO |
| 子代理/后台 | child ID、状态、产物、恢复、按 ID 取消 | 前台 idle 不代表后台完成 |
| MCP | declarations、runtime、tools/resources、OAuth、App UI | extension 来源明确 |
| 扩展 | skills、commands、agents、hooks、plugins、热刷新 | 声明/effective/observed 三层 |
| 改动 | immutable turn records、session sidebar、diff、checkpoint | Git/non-Git 与文本回退分开 |
| 分享/导出 | Markdown/native transcript/HTML/share | 后端不支持分享时保留 unavailable |
| Aux/edit/completion | 只读证据、模型覆盖、preview/accept/reject、取消 | 唯一编辑写点及 dirty snapshot |
| 控制/实验 | PTY、worktree、control plane、review、realtime 候选 | 保持原有 default-off 与动作边界 |
| 诊断/兼容 | redacted trace、unknown events、版本不支持、迁移 | secrets/prompt/image 不进普通报告 |

capability 大类不足以证明具体子功能：例如 MCP tool consumption、MCP 管理和 MCP App UI 是不同 feature。不要为了让 UI 出现而给 backend 整体增加 `Mcp/Hooks/Subagents` 声明。

## 4. 测试分层与真实证据

| 层 | 环境 | 证明什么 | 不证明什么 |
| --- | --- | --- | --- |
| L0 契约/归一化 | unit、固定 schema 和状态事件 | mapping、状态机、revision、脱敏、负向分支 | 真实 CLI 或 UI 成功 |
| L1 transport/protocol | 真实 client/transport + 本地可控协议 server | NDJSON/SSE/JSON-RPC、分页、错误和取消、握手 | 外部模型与真实账号 |
| L2 真实 SDK/CLI fixture | 实际安装的 SDK/CLI + localhost provider/MCP fixture | SDK/CLI 真执行、原生会话/工具/usage/读取 | 外部供应商认证和模型行为 |
| L3 真实 backend/model | 隔离账号、临时项目、真实模型 | 真实 auth、模型/权限/工具/图片/压缩/后台 | 用户从 UI 发起的可达性 |
| L4 Obsidian UI | Test Vault，真实输入/点击/原生回读 | 保存→加载→请求→执行→恢复产品流程 | 未执行的其他 host/profile |
| L5 发行安装 | 干净三文件包、已安装外部 CLI、真实 host | bundle/路径/资源/外部依赖、BUILD_ID | 只读源码目录能运行的特例 |

L0/L1 先失败后修复，以回归测试保留证据。L2 使用真实 SDK，不 monkeypatch SDK 实现。L3 模型输出不要求逐字固定，使用唯一 nonce、工具 side effect 和 native IDs/终态作为断言；localhost fixture 可逐字匹配以确保稳定。

沿用现有 `claude-code-smoke.mjs`、`codex-sdk-smoke.mjs`、`pi-rpc-smoke.mjs`、`pi-sdk-acceptance.mjs`、`pi-sdk-modern-acceptance.mjs` 与 aux audit，统一 manifest/report/output，不另造完整后端运行框架。增补 OpenCode 1/2、ZCode native acceptance 入口；共享测试程序只依赖能力端口，后端专属步骤放在现有适配器/脚本 owner。

## 5. Fixture 与生命周期

提供独立的 Git vault 和 non-Git vault，各含 Unicode/空格路径、Markdown 长文、明确选区、PNG/JPEG、权限测试文件、外部只读路径与可控目录。121 active/121 archived 会话由 fake protocol fixture 构造；无需真实模型创建几百会话。

可控 provider 支持流式文本、工具调用、usage、429/401/400、延迟、断流、畸形 chunk。MCP fixture 支持 stdio/http、工具/资源/表单、认证超时、敏感参数和 URL userinfo。后台 fixture 的执行者写带 native ID 的终态，不能由测试观察器自行补 completed。

run manifest 记录本轮拥有的 process/session/file ID。停止和清理仅处理本轮创建对象；配置变更使用专用 allowlisted 根及 before/after revision；真实用户全局目录只读。源码/worktree/测试 scratch 位于非同步工作区，递归删除边界遵守 AGENTS；无法安全清理时保留证据并报告 residue，不扩大删除范围。旧验收脚本运行前审查其 mutation/teardown 范围。

认证阶段使用专门测试账号及原生 credential store。只由人工完成必要的浏览器登录，不把真实 key 写进聊天、日志、测试输出或 plugin settings。额度上限在启动 L3 前由测试运行配置确定；耗尽/账号缺失记 blocked，不能自动换用户全局供应商。

## 6. 全流程场景目录

每个 case 必须绑定 setup、用户动作/协议动作、native expectation、产品断言、恢复与清理、证据文件。以下给出必跑语义；backends 不支持的子能力使用 §9 例外规则。

### 6.1 基线、配置和目录

| ID | 测试动作 | 原生与产品验收 |
| --- | --- | --- |
| S01 | manifest/lock/npm installed、CLI/握手/profile 检查 | 不一致立即停止 native pass；报告具体缺项 |
| S02 | GUI PATH 缺失、显式路径有空格/Unicode、Windows npm shim | 准确选择已配置 runtime；不存在不静默换包 |
| S03 | 同时保存 global/project/local/session 不同值 | 逐层 effective readback 符合 precedence；继承清除可恢复 |
| S04 | 同页连续改多个字段、快改、外部 revision 变更 | 不覆盖新值；冲突明确拒绝；ZCode F-ZC-01 回归 |
| S05 | OpenCode 2 edit/completion 覆盖表单保存/关闭/重载 | 值保留，真实 aux/completion 采用覆盖模型；默认聊天模型不受影响 |
| S06 | model/provider/MCP/session 目录 > 两页，重复项、页2失败 | 完整/partial 明确；稳定去重/排序；cursor 不丢 |
| S07 | 模型过滤/disabled/default/会话 override/原生档位切换 | UI 目录、实际 request、native model 一致；不合法值拒绝 |
| S08 | MCP 敏感旗标+独立值/等号值/URL userinfo/query | UI、复制、报告、错误均不含凭据；F-PI-01 回归 |
| S09 | 空目录、读取失败、权限拒绝、旧版本 method absent | 四种结果区分；不会将失败显示为“配置为空” |
| S10 | 同 vault 变更 cwd/config/mode 后重连 OpenCode 本地 4096 | managed signature 不符重新建立正确 owned 服务；目录 forward slash 正确 |

### 6.2 会话、stream 和恢复

| ID | 测试动作 | 原生与产品验收 |
| --- | --- | --- |
| B01 | 新建/发送→关闭 view→重载插件→resume→追问 nonce | 同 native ID 恢复历史；非新会话伪装续聊 |
| B02 | rename/archive/unarchive/delete；原生 false/error/unsupported | 成功必须回读；失败保留 ID/可恢复；本地忘记另标 |
| B03 | fork before message、clone、tree navigate、label | 真实 branch/entry/parent IDs；父会话未被修改 |
| B04 | 三 tab 同时流；切 tab/关一 tab/切 backend | 每会话隔离；仅目标取消；后台会话可继续 |
| B05 | 正常 stream、中途断流、SDK→fallback 边界 | 一次用户提交至多启动一次 native generation；不重复 final/usage |
| B06 | cancel 在 start 前/工具中/终态前/终态后竞态 | late chunks 不污染；同 session 下一轮成功；pending ask 落定 |
| B07 | kill owned process→断连→重连→native history read | 状态诚实恢复，无卡死 stream；未获终态保持 unknown |
| B08 | active steer / follow-up queue / queue clear | steer 进入当前 turn；无原生 seam 明确 queue；重复 steering/turnId 竞态可控 |
| B09 | 历史 part removal、authoritative sync、前台增量、重载 | 无已撤回文本复活；immutable Turn Change Records 保留 |
| B10 | 401/429/400、结构化 native error、未知 notification | 用户看到正确可恢复结果；拒绝重试状态不会冒称成功 |
| B11 | 同 backend 不同模型/effort/模式覆盖的两会话 | 两条原生请求与回读独立；主默认不被覆盖 |
| B12 | backend/vault 切换及 unload→reload | 外部服务不被终止；本轮 owned handles、订阅、弹窗释放 |

### 6.3 权限、问答、工具和扩展

| ID | 测试动作 | 原生与产品验收 |
| --- | --- | --- |
| I01 | 权限 once/always/deny、拒绝消息、退出时未回答 | 请求 ID 稳定、恰一次应答；拒绝后无工具 side effect |
| I02 | 单选/多选/自定义输入/form、reject、超时、重复提交 | 原生 schema、答案、继续生成正确；不跨 tab 弹卡 |
| I03 | Claude user dialog/elicitation、Codex tool user input、ZCode host ask | 按各自协议归一；未知 schema fail-closed |
| I04 | 文件写/Shell/MCP task 等工具与结果 | tool call ID、参数、结果、错误、持续状态关联；不中断主 stream |
| I05 | 修改 command/skill/agent 配置并刷新后执行 | 目录 cache invalidated；真实展开/child execution 回读；无 TTL 假等待 |
| I06 | MCP connect/disconnect/OAuth/resource/tool、重载 server | runtime tools/auth/readback 变化正确；部分失败单独列出 |
| I07 | plugins install/remove/reconcile、hooks start/fail | declarations/effective/observed 分层；副作用只在测试根 |
| I08 | Claude 单 server default/auto/null 权限覆盖 | 只能收紧权限；不存在 server warning 可见；管理策略不被绕过 |
| I09 | Claude 写新 style 文件→原生 reload→目录/下一有效边界 | reload 方法缺失为 unavailable；目录刷新与 prompt 真正应用分开 |
| I10 | Codex gateway OAuth、MCP App UI 候选 | 版本探测、取消/恢复、resource identity、native result；未支持时保留候选状态 |
| I11 | Pi 九种标准扩展 UI、启动 ask、cancel request、custom message | 双向桥接真实 SDK；只刷新当前会话组件；终端自定义布局不伪装支持 |
| I12 | Pi get_entries since / get_available_thinking_levels | native entry 身份/分支 leaf 正确；显示当前模型允许档位；旧版降级 |
| I13 | ZCode plugin/MCP/hooks 声明写入→重连→运行 | 安装版本 source/effective/tool readback；授权头缺失不能静默当认证通过 |

### 6.4 上下文、用量、压缩和后台

| ID | 测试动作 | 原生与产品验收 |
| --- | --- | --- |
| C01 | 选区/笔记/多文件/目录、Unicode、附件顺序 | 原生 parts/text 和行范围准确，远程文本限制符合现有契约 |
| C02 | 32×32 图像、正常 PNG/JPEG、错误 mime/base64、文本模型 | 图像实际 native attachment；坏输入发送前拒绝；重载保持 |
| C03 | schema structured output / noReply / system/agent 选择 | 已接入参数实际应用；不重新实现已存在映射；unsupported 模型明确失败 |
| C04 | tokens/cache/context/实际费用/零费用/未知费用 | native 使用量与单位对应；未知成本 null；缓存和推理不重复累加 |
| C05 | manual/auto compaction、cancel、failed/skipped、重连 | native operation/turn ID、completed 与后续上下文回读；ACK 不等于成功 |
| C06 | native todo/plan/goal pause/resume/clear | 更新与历史恢复正确；无原生 todo 的后端不从文本伪造 |
| C07 | child/subagent 成功/失败/并发、父 foreground 完成 | 真实 parent/child IDs；前台状态与后台状态独立 |
| C08 | background start→强杀→监督执行者终态→重连查询 | sessionId/taskId 一致；官方/补丁 ZCode 分开记录；unknown 不能猜 |
| C09 | 精确 ID 取消后台 task、错误 ID、重复取消 | 只取消目标；terminal readback；其他 task/session 继续 |
| C10 | Git diff 与 non-Git file hints；parent/child changes | 当前 session projection 与 per-turn immutable record 一致；不把 hint 当 diff |
| C11 | rewind/checkpoint dry-run、apply、脏文件冲突 | 文件和对话回退分别定义；实际 bytes 与 native 证据一致 |
| C12 | Markdown/native JSONL/HTML 导出与导入/历史分页 | native identity/branch 可保存；导出内容不泄漏 credential metadata |

### 6.5 辅助查询、编辑和补全

| ID | 测试动作 | 原生与产品验收 |
| --- | --- | --- |
| E01 | 六后端 aux 正常首轮/追问/图片 | native 只读证明与当前 turn 工具表；无主聊天 side effect |
| E02 | 写诱导、Shell/MCP/package/subagent 要求、插件保留 MCP | 无写副作用；不能把空 request tools 当证明；工具面变宽立即失败 |
| E03 | selected text → preview → accept、reject、clarify | accept 仅 editor.replaceRange；reject 零写；dirty snapshot 拒绝 |
| E04 | 同 backend 多 editor、快速切 selection、timeout/cancel/dispose | 不回填旧编辑器/旧选择；主会话不受影响，资源按拥有权释放 |
| E05 | Alt completion→Tab insertion，模型覆盖与新 session/重用 | native 采用覆盖；只有显式 Tab 写编辑器；过期结果不出现 |
| E06 | ZCode sessionless completion 与 generic aux 分开审计 | text-only/tools[]/operationId 与 native session tool-readback 各自证明 |
| E07 | plugin reload/unload、未知 backend/version | 无孤儿 aux session/进程；证据缺失拒绝启动，不能降级为提示词只读 |

### 6.6 认证、真实 UI 和发行

| ID | 测试动作 | 原生与产品验收 |
| --- | --- | --- |
| A01 | 测试 API key 保存→native credential activation→真实请求→撤销 | 保存不等于认证；撤销后请求拒绝；用户其他凭据不变 |
| A02 | 真实 OAuth 打开浏览器→人工授权→native callback→请求 | success/cancel/timeout/session reload 全覆盖；Pi/v2 pending 收口 |
| A03 | 刷新/过期/多账号/二次 gateway/MCP auth | provider/backend/会话身份正确；不能以账号存在代替授权成功 |
| U01 | 两 host 的设置导航/真实输入/保存/关闭重开 | native persistence/application/readback；DOM 内部赋值不算用户路径 |
| U02 | backend/model/mode switch、chat、权限、问答、命令、图片 | 所有关键动作真实鼠标/键盘；对应原生请求/ID/终态 |
| U03 | 两 host 的 E03/E05、重载与跨会话覆盖 | 完成 v2 未验收项；真实 editor 文本/模型回读 |
| U04 | 双 tab、后台 badge/卡片、变化 sidebar、fork/recovery | 状态和 scroll restore 按现有 owner；无跨会话残留 |
| P01 | 干净发行目录仅标准包+用户外部 CLI | Pi 服务内嵌路径可运行，不依赖源码/开发 assets；缺 CLI 诚实提示 |
| P02 | 分别 build→copy→load→BUILD_ID/hash | 磁盘和 loaded runtime 同构建；旧 renderer 不被误认为部署成功 |
| P03 | 插件升级与旧设置/旧会话迁移 | backup/revision/identity 保留；unknown 字段不随意删；逐版本例外更新 |

## 7. 后端专项接入设计

### 7.1 OpenCode 1/2

保留 OpenCode 1 facade、SDK namespace wrapper、session/event owner 与 legacy fallback；格式/agent/noReply 已有映射只补验收。OpenCode 2 配置、credential、session、native diff 与 v1 独立。优先修 F-OC2-01，再完成 A01/A02/U03；v2.0.18 的原生例外按版本列明，不做假 adapter 回填。

前台流和 authoritative sync 使用事件 fixture 验证删除/撤回/去重/重载。服务器健康失败、目录切换及旧 managed server identity 用真实 server readback；Windows directory 使用 forward slash。实验 PTY/control-plane/project-copy/background 继续遵守现有 gate，只审计已开启路径。

### 7.2 Codex

为 thread/model/permission/MCP/loaded catalogs 保留 cursor 与 partial status；沿用 items/turns 的页接口风格。lifecycle 操作返回可区分 admitted/verified/failed/unavailable 的结果，保留原生回读身份，不用 void 完成表示远端成功。

native app-server 与 SDK fallback 分开声明能力；反复测试 -32601 后 UI 动态撤除 unsupported capability。新增 gatewayOAuth/MCP App 业务入口只在安装 CLI 报告相应能力时启用；线程插件选择不能承担上游尚未实现的权限过滤职责。

### 7.3 Claude Code

从官方锁定 SDK declarations 生成 Query/control/messages 差异表。现有队列、persistent runtime、permission/elicitation、context/checkpoint、trace owner 保持责任边界。新增 tighten-only MCP override 和 style reload，按会话应用并给出原生状态或 unavailable。已有 reloadSkills/MCP 刷新不重写。

逐项验收 runtime settings/options，区分 SDK option wiring 和 CLI 真正应用，尤其 session prompt cache/compaction 边界。插件拥有 MCP server 不能靠 setMcpServers({}) 清除，aux 工具回读与 denied tools 必须覆盖此组合。

### 7.4 Pi

PiProtocol/PiSessionRuntime 以 installed SDK union 与握手生成支持目录。接入 get_available_thinking_levels/get_entries；UI 使用实时允许集合，历史使用 native entries/since/leaf。旧 SDK 不支持时返回 unavailable 或明确 full-history fallback。

配置 schema 对照当前 Settings/ModelRuntime 类型，新增字段保持 JSON round-trip，避免旧 51 字段编辑器清掉新字段。优先修 MCP argv/URL 脱敏。MCP extension 配置声明与实际 tool/status 仍是不同证据层；标准扩展 UI 与 TUI-only 组件范围独立。

### 7.5 ZCode

优先修设置更新快照；模型/思考/模式的配置三轴与原生回读联动。将原生插件/MCP/hooks 配置加入现有 settings/catalog/secure-write 流程，先只读探测，再按版本提供 mutation；不写硬编码机器路径或复制真实 provider key。

官方/源码补丁/桌面索引分别建 profile。背景持久终态缺方法时显示 unavailable/unknown，删除缺索引时明确失败。将 generic aux 接入统一 audit；sessionless text completion 维持独立证明，不将 tools:[] request 转成 verified native tool enumeration。

## 8. 实施任务和依赖

所有任务开始前先 `inspect:owner`，修改函数前 CodeGraph callers/有限 depth impact；报告 function/method 直接调用者和 blast-radius size。歧义或跨任务范围依规则暂停该修改并形成审查续做边界。下表 owner 为路由起点，具体文件仍由 inspector 确认。

| 任务 | 内容/产出 | 依赖 | owner/主要文件 | 验收 |
| --- | --- | --- | --- | --- |
| T00 | 锁文件一致环境、六 runtime/profile manifest、fixture 根 | 无 | infrastructure，package/lock/现有 smoke scripts | S01/S02/P01 |
| T01 | 功能目录、三轴证据、version-bound 例外清单 | T00 | core.agents/core.backend、AgentCapability/registry/Capability Lab | 不再以静态 Set 判定已验收 |
| T02 | OpenCode 2 override 归一化/保存回归 | T00 | core.types/feature.settings-shell/feature.inline-edit | F-OC2-01，S05/B11/E03/E05 |
| T03 | ZCode 设置快照/异步保存修复 | T00 | feature.settings-shell，SettingsZCodeSection | F-ZC-01，S04/B11 |
| T04 | Pi MCP argv/URL/错误输出脱敏 | T00 | core.backend-pi，PiMcpConfigService、SettingsPiSection | F-PI-01，S08 |
| T05 | Codex catalog 分页与 lifecycle 结果回读 | T00/T01 | core.backend，Codex client/types/adapter/routing | F-CX-01/02，S06/S09/B02 |
| T06 | 六后端 report/contract/native harness 与 aux gate | T01 | infrastructure + 各 backend owner；现有 audit/smoke 脚本 | L1/L2、E01/E02/E06/E07 |
| T07 | Pi RPC/schema 增量、旧/新 SDK 兼容 | T01/T04/T06 | core.backend-pi + 现有 Pi settings/workbench | I11/I12/S03/S07 |
| T08 | Claude control/settings 回读/样式/MCP tightening | T01/T06 | core.backend + Claude settings/interaction owner | I03/I08/I09/E02 |
| T09 | ZCode 管理面与官方/补丁/桌面组合 | T01/T03/T06 | core.backend + ZCode settings/catalog/secure-write | I13/C05/C08/C09/E01 |
| T10 | OpenCode1/2 event/fallback/目录差异回归 | T01/T02/T06 | core.opencode/core.backend + chat sync owner | S10/B05/B09/C10 |
| T11 | Codex gatewayOAuth/MCP App 候选的版本探测与设计 | T01/T05/T06 | core.backend + 已有 Codex/settings/chat owner | I10/A03；无支持不强行实现 |
| T12 | 双平台真实模型/auth 与 Obsidian 产品验收 | T02–T10 的必需功能完成 | QA/Test Vault，现有 UI/diagnostics surfaces | L3/L4、A01/A02/U01–U04 |
| T13 | 干净发行包/迁移/部署和验收收口 | T12 + 必要 T11 子项 | build/package/release owner | L5、P01–P03、所有 P1 闭合 |

先并行推进不重叠任务 T02/T03/T04/T05，再进入后端专项。T11 中实验/无原生支持项可保留经审查的延期；不得用延期掩盖 T02–T10 已承诺流程。用户后续授权子代理展开工作；当前首批改动、测试及仍未闭合的任务以实施记录为准，设计表本身不作为验收通过证据。

## 9. 例外、覆盖率和失败归因

每个 case 结果限定为：passed、failed、blocked、unverified、not-applicable。availability=unsupported 的 feature 必须带 runtime/version/source；它可以令 native 执行 case not-applicable，但对应 UI 的诚实 unavailable 和零危险 dispatch 测试仍必跑。

分别报告：接口映射覆盖率、配置三轴完成率、真实 backend 场景通过率、UI 场景通过率、Windows/macOS/profile 覆盖。分母列出 feature IDs，不把 unsupported/skipped 或 mock 计入实机 pass。

失败归因至少区分：plugin mapping/state、protocol/version、provider/auth/model availability、host/path、fixture/harness。保留最初失败与后续修复/换可用模型的结果，不能覆盖原证据。429/401 或模型不支持协议不是一律适配器失败；页2/原生 mutation 失败也不能一律归环境后忽略。

上游不能提供 runtime readback 时保留 unavailable，列出 replacement evidence 与产品边界。没有成本、TODO、分享、LSP、桌面删除索引或 TUI 布局的 runtime，不补造“同名功能已通过”。

## 10. 证据输出与发布门禁

每个 run 保存 `manifest.json`、`feature-ledger.json`、`cases.json`、脱敏原生 request/response/event、UI 动作记录/截图、文件前后 SHA、配置 revision、native ID 关系、cleanup/residue。报告记录 loaded BUILD_ID，磁盘 bundle hash 只是其中一项。

证据引用必须能回到 case/profile/版本。event trace 使用固定分类与脱敏 collector；不得把整段 prompts、base64 图像、token、headers 或 SDK 环境变量写入普通报告。

实施完成时按顺序执行：

1. 各 owner 聚焦回归，特别是本轮三项离线复现对应的正式测试。
2. CodeGraph sync/affected；若改 `src`，运行 `npm run graphify:update:src` 后检查 freshness。
3. `npm run verify`：lint 0 errors/0 warnings、typecheck、全量 tests、architecture、module docs、Graphify、production build；模块行为文档同步。
4. 执行完整六后端 aux/native audits，保存 profile manifest；L3/L4 用真实版本/host 补足证据。
5. runtime/settings/theme/style/manifest/assets 等相关变更按 AGENTS 先 `npm run build`；成功后立即顺序部署标准 Test Vault 的 `dist/main.js`、`manifest.json`、`styles.css`，bundled assets 有变化再复制 `dist/assets`。build、copy、verify 三步不能并行或链成一条命令。
6. 比较部署 hash 并确认载入插件的最新 BUILD_ID；在最终构建补跑受影响 UI/native 场景。不能拿旧 renderer 的成功当最终构建成功。
7. 若实际推送版本 bump，再运行 `npm run check:release-health`，核对发布和完整 assets；本方案本身不授权或执行版本发布。

现有 aux runner 的四后端默认集与 OpenCode 2 单独入口继续可用，但 T06 必须增加 ZCode 并让总报告显式枚举六后端。未知 backend/version 退出 nonzero；没有运行的条目不能留默认 passed。

最初审查轮只有 docs 与 ignored 审查证据。后续实施已经涉及 `src`、settings 与 Pi assets，必须执行 Graphify refresh、完整门禁和标准 Test Vault 部署；具体结果写入实施记录。

## 11. 最终验收模板

交付报告必须列出：

- 新修缺陷、上游增量和明确延期，引用 finding/task IDs。
- 每 backend/profile 的已实现/已原生验收/已 UI 验收/版本不可用/环境阻塞清单。
- 核心配置三轴状态；所有 mutation 的 admission/terminal/readback。
- 两 host 的 BUILD_ID 与最终构建 evidence；发行包安装结果。
- P1 未闭合项必须为零；真实 auth 缺账号等 blocked 项不得写“完整验收完成”。
- 全局配置/测试会话/owned process/file 的恢复与 residue。
- native/model/token/cost 和实验 gate 的实际限制。

这样每次新增或升级后端，都能重复执行同一套流程，同时保留后端各自的原生能力和证明边界。
