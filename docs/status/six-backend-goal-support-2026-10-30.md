# 六后端 Goal 与自动循环支持核查（2026-10-30）

核查对象：`opencode2`、`claude-code`、`codex`、`pi`、`zcode`、`dsh`。

## 结论

五个后端已有第一方 Goal 能力：OpenCode 2、Claude Code、Codex、ZCode、DeepSeek Harness。DSH 通过第一方组合包实现；Pi 1.4.0 core 未发现同等的持久目标与生命周期契约，主要通过扩展提供。

**OpenCodian 尚未形成六后端统一、完整的 Goal 接入与显示。** Codex 有专用 API、读回、事件映射和会话设置 UI；ZCode 有专用原生命令桥和读回。OpenCode 2、Claude、DSH 目前主要复用通用命令/消息通道。六后端没有共同的 Goal capability、状态投影和持续显示组件。

这不是“只有 Codex 支持 Goal”。OpenCode 2 在 2026-10-29 的 v2.2.1 发布中新增原生 Goal；Claude 当前官方文档也明确支持原生 `/goal`，不能再只把它描述为 Ralph/Stop-hook 扩展能力。

本轮完成官方资料和源码核查、安装态检查、既有单测及无模型归一化复现。没有运行真实付费目标循环、安装扩展或开展 Obsidian 六后端交互验收。以下区分已证实的代码行为、上游契约和仍需实机验证的跨轮行为。

## 基线与判定方法

| 项目 | 本轮核查基线 |
|---|---|
| OpenCodian | v2.1.4；HEAD `097b0ba2d`；开始核查时工作区干净 |
| 可选后端 | `src/core/agents/backend/index.ts:13` 声明上述六个；不计已退役 OpenCode 1 |
| OpenCode 2 | 本机 CLI 2.2.2；插件 `@opencode/client` 2.2.0；上游源码 `92b2ca0dd727942e00aba3523ed141d53e78ea28` |
| Claude Code | 本机 CLI 2.1.312；安装/声明 Agent SDK 0.3.312 |
| Codex | 本机 CLI 0.165.0；插件 SDK 0.165.0；实际 Goal 控制走 app-server |
| Pi | 本机 CLI 1.4.0；官方源码 `4b535d57ea8863dbba44b89872146523da271786` |
| ZCode | 本机 PATH 未发现 `zcode`；所读本地上游源码 `3c5b227649371507ddc4eb46ac5133afe6db1cab`；不据此断言插件配置的可执行文件不存在 |
| DSH | 本机 CLI 0.2.1-rc.4；另有上游源码 0.2.2-alpha.2 / `ce7073d51254c26cd63b22a60835b8f948deb447`；版本分别记录 |

旧 `@opencode-ai/sdk` 1.19.5 服务于仓库保留的旧路径，不能用其版本与 OpenCode 2 CLI 的差异直接推断当前可选后端不兼容。Source Compass 技能的 1.14.19 基线已过时，本报告使用实际 2.x 源码。

Goal 指持久目标、明确生命周期和目标驱动的跨轮续跑。Todo、Plan、权限 auto、普通工具调用循环、定时 `/loop`、外部 supervisor 均单列。按仓库 ADR 0001，命令 ACK 不等于运行态确认；“能调用”“能回读”“能持续显示”“恢复后仍正确”分别判断。

## 第一方 Goal 对比

| 后端 | 原生控制与状态 | 续跑/完成判定 | 限制、统计、恢复 |
|---|---|---|---|
| OpenCode 2 | `/goal <objective>`、pause/resume/clear；active/paused/complete | 第一方 Goal plugin 在 idle 时做 reviewer 判定，再向同会话追加 continuation | 默认 50 轮；连续 3 次无进展暂停；等待后台工作无活动 30 分钟暂停；有 reason/rounds/maxRounds/stalls。服务器重启后暂停旧活跃目标；子会话/fork 不继承 |
| Claude Code | `/goal <condition>`、裸 `/goal` 查询、`/goal clear`；没有对应的人工 goal pause/resume 子命令 | 会话级 prompt Stop hook，独立小模型判断未满足/满足/不可能；满足或不可能会清除目标并记入 transcript | 有轮数、时间、token 基线、最近原因；连续无工具进展会返回用户并保留目标。恢复保留条件但重置计量；交互态另有错误重试、暂停及后台 check-in 语义 |
| Codex | `thread/goal/set|get|clear`；status 更新可 pause/resume；active/paused/blocked/usageLimited/budgetLimited/complete | 后端线程运行时控制；线程级目标持久化 | 原生 tokenBudget/tokensUsed/timeUsedSeconds；新 objective 重置计量；省略 objective 或重复当前非终态目标可保留计量更新状态/预算 |
| ZCode | `/goal` 查询，set/replace/pause/resume/clear；兼容 target 命名 | 运行时持有目标循环，独立无工具 completion verifier；后台任务与命令队列参与调度 | active/paused/budget_limited/complete；目标 tokenBudget、token/time 统计；以实际 snapshot/projection 为准，ACK 不能代替终态 |
| DSH | goal、tool-goal、command-goal、goal-round-driver 第一方组合；创建/edit/pause/resume/clear/query | 同会话 idle 后，目标 active 且 armed 才续轮；模型工具控制目标生命周期，不宣称有独立 evaluator | 当前上游默认 maxGoalRounds=256；有轮数/上限/blocked reason、持久状态与 revision；恢复/fork 后 active 可仍 disarmed，需要显式 resume；轮数上限不是 token/费用/时长预算 |
| Pi core | 未发现内建同等 Goal state/control RPC | 可由扩展在 `agent_settled` 后续跑 | 核心 follow-up 队列、工具循环和 compaction 的 Goal 摘要不是持久 Goal 模式 |

资料：[S1]–[S9]。Claude 的交互式重试/check-in 能力不能直接等同于 SDK/headless 的同等唤醒能力；官方明确非交互会话只在 turn 结束边界交付 check-in。不要向 Claude 展示未经支持的 `/goal pause`，该文本可能被理解成新目标。

## 插件接入与显示矩阵

| 后端 | 当前原生调用 | 当前回读/事件 | 当前显示 | 判断 |
|---|---|---|---|---|
| OpenCode 2 | 通用命令目录和 `client.session.command` 路由可达 | 没有 `opencode.goal.get` / `changed` 集成 | 没有 Goal 专用状态/控制 UI | 命令层部分支持，目标状态和显示未适配；未实机证明长目标的完整展示 |
| Claude Code | 斜杠原文经 Claude 通道发送；上游支持非交互 `/goal` | SDK 有 `active_goal`，当前 normalizer 将其丢弃 | 没有原生 Goal 指示与原因/轮数展示 | 执行可走原生通道，结构化状态未接；不能称为完整适配 |
| Codex | 专用 get/set/clear/pause/resume 方法 | `goal_updated/goal_cleared` 映射并维护 adapter cache | 会话设置显示目标、状态、token、时间和预算，支持设定/清除；无暂停/恢复按钮和常驻实时 Goal 面板 | 接入最完整，显示和生命周期仍有缺口 |
| ZCode | 专用 `session/goal`，支持 set/replace/show/pause/resume/clear | 写后 `session/read.projection.target` 校验身份及目标 | 控制结果/普通回答；没有 Goal 结构化面板 | 原生命令已接，持续状态和显示缺失；裸 `/goal` 行为有偏差 |
| DSH native | 通用 command registry 桥能执行 `/goal` | 没有 Goal 专用查询/事件转发；命令执行后立即结束当前 prompt | 可见命令直接文本；后续自动轮流式显示存在确定的生命周期缺口 | 本机已有 Goal 栈，插件仅命令入口部分支持；ACP 兼容通道另验 |
| Pi | 加载用户扩展并调用原生命令/SDK；无内建 Goal 专用方法 | 通用 extension UI 的 setStatus/setWidget/dialog 可用 | 通用扩展文本/组件可显示，非 Goal 专用投影 | 有扩展承载基础，未适配具体 Goal 扩展契约；不能算 core 原生支持 |

### OpenCode 2：可调用不等于已产品化

- `src/core/agents/backend/opencode/OpenCode2Adapter.ts:419` 获取原生命令目录，`:442` 将命令转发到 `client.session.command`。
- `src/features/chat/services/commands/SlashCommandExecutionHostFactory.ts:46` 起按 `opencode2` 路由目录和命令，未回落旧 OpenCode 执行器。
- 真正读状态的契约是 `Goal.Definition`（RPC id `opencode.goal` 的 `get` 和 `changed`），不是自行假设的 `session.goal.*`。插件源码没有该契约的消费点。
- `OpenCode2Adapter.ts:906` 的事件 mapper 处理文本、工具、执行终态，没有 Goal state/changed 分支。其 send 流以 execution 成功/失败结束；命令启动和后台续轮的持续展示尚需真实目标验收。
- 安装 client 2.2.0 比 Goal 首次发布的 CLI 2.2.1 早；这只意味着需要核对实际通用 RPC 与类型覆盖，不足以单独判定调用必然失败。

### Claude：结构化事件确实被丢弃

- `SlashCommandExecutionService.ts:291` 起将 Claude 斜杠原文留给自身发送通道，未借 OpenCode 命令执行。
- 已安装 `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts:3664` 定义 `SDKActiveGoalMessage`：顶层 `type: active_goal`，value 包含 condition/iterations/set_at/tokens_at_start/last_reason，清除时 value 为 null。
- `ClaudeCodeStreamNormalizer.ts:635` 的 `transformSDKMessage()` 未识别该类型；`:663` 的 lifecycle 入口首先要求 type=system。
- 本轮用当前 TypeScript 源码做隔离归一化复现，分别输入活动目标和清除目标，两次结果均为 `chunks: []`。只 stub 了日志/共享工具；没有调用模型或修改源码。
- 因此即使原生 Goal 正在运行，插件也没有把这份状态传给聊天显示。普通工具/assistant 输出可显示，不代表目标状态已适配。
- 用户停止会话可作为“暂停执行”入口：`ClaudeCodeAdapter.ts:5066` 的 `cancelStream()` 请求 SDK `query.interrupt()` 后调用 `closeRuntime()`，后者 abort 并关闭当前运行实例。它不等同于一个原生 goal-paused 状态；前端应分别表达“执行已停止”和“目标仍有效”，并等待停止确认。官方说明恢复仍活跃的目标会保留条件，但重置轮数、计时和 token 基线；下一条补充消息和显式继续的实际恢复序列仍需验收。不要通过清除后重建目标来伪装暂停，也不能宣称恢复保留原计量。

### Codex：专用控制已有，UI 和错误证据未闭环

- `CodexAppServerClient.ts:1443` 起实现原生 get/set/clear；`CodexAdapter.ts:1396` 起提供 pause/resume，并解析 adapter session alias。
- `CodexAppServerStreamMapper.ts:217` 起将 updated/cleared 映射成 backend_event；`CodexAdapter.ts:2728` 起维护缓存。
- `ConversationSessionSettingsCoordinator.ts:89` 打开设置时读取 Goal；`:150` 只传 set/clear callback。Modal `:752` 和 `:995` 提供目标/状态/预算/时间回读。
- `OpenCodianView.ts:5149` 对 backend_event 返回 null；未找到消费 Goal 更新以刷新常驻组件或已打开 modal 的监听。`getTrackedThreadGoal()` 也未接到产品 UI。
- 自动续轮的长生命周期尚未验收：发送期通知订阅在 `CodexAdapter.ts:3245` dispose，不能据一次 turn 流的成功推断后续 Goal turns 的显示持续正确。
- 错误会被当成空状态：client 的 get 捕获错误后返回 null，UI 不能区分无目标、方法不支持、读回失败。
- 清除失败存在可见误导：Modal `:835` 得到 false 时，仍执行 `btn.remove()` 并创建“无目标”提示；旧读回可能还在，状态会自相矛盾。设置失败也会清空输入，缺少明确错误反馈。

### ZCode：命令桥有读回，但查询和跨轮显示有缺口

- `ZCodeAdapter.ts:603` 的专用控制将命令映射到 `session/goal`，并读回 target 的 sessionId、objective、status，拒绝错会话 ACK。
- 裸 `/goal` 被解释为 set + 空 objective，在 `:612` 返回 requires an objective；上游约定裸 `/goal` 查询当前目标。插件另支持 `/goal show`，但没有保持裸命令语义。
- `streamNativeTurn()` 从匹配 targetId 的真实 turn 开始，正确跳过空 controlOnly turn；然而第一次 mapper 终态即 break（`:546` 附近），未形成跨多个自动 turn 的 Goal 生命周期。
- `ZCodeStreamMapper.ts:139` 只映射通用 turn/part/tool/session 事件；没有目标状态、预算、完成原因投影。
- 现有单测证明专用调用、同会话校验及跳过 controlOnly，不证明两个以上 Goal continuation 的持续显示。后续适配应核对当前 V4 conversation snapshot/delta 与 command inbox，而非只扩充兼容 `session/goal` 的 ACK 处理。

### DSH：rc.4 已具备 Goal，桥接提前结束

本轮直接检查本机安装包，确认 0.2.1-rc.4 已包含四个 Goal 包。`dsh-app-boot` 的 sdk 模板装配 `dsh-base` + `dsh-sdk-app`；安装态 `dsh-base/cordis.patch.yml:323` 起挂载 goal/goal-round-driver/command-goal，`:444` 挂载 tool-goal。sdk overlay 没有禁用这些行。本轮没有以新源码的能力冒充旧 CLI 的安装态。

- `assets/dsh/launcher.mjs:14` 起沿用用户 sdk profile/template 并叠加本插件 native bridge，因此通用命令执行路径确实存在。
- `assets/dsh/service.mjs:221` 执行 native command registry；输出直接文本后于 `:226` 附近返回 end_turn，没有等待 Goal activity interval 结束。
- `DshAdapter.ts:530` 起在 prompt RPC 返回后置 state.done，`:581` 从 turns Map 移除该流；`:731` 对没有当前 TurnState 的后续更新直接返回。**因此在命令 RPC 已结束后到达的 Goal 自动轮输出不会进入这个流。**这是代码路径结论；具体丢帧时序仍需实机复现。
- bridge 的 `session/event` listener（`service.mjs:147`）转发 assistant/tool/usage/turn-end，没有转发 durable `goal/change`，也没有 goal/activation-changed 或 Goal projection 读回。
- ACP 兼容通道不等同于这条 native command bridge。官方 ACP/headless 组件是否消费人类命令 registry 应按版本核实；不能把 `/goal` 原文发送自动算成原生控制成功。

旧仓库状态文档 `dsh-gap-remediation-2026-10-25.md` 关于 Goal 未挂载的记录是当时的历史证据，本轮安装态已变化；不应直接沿用。

### Pi：扩展 UI 可承载，尚无 Goal 语义

- `assets/pi/service.mjs` 加载资源/扩展；`assets/pi/commands.mjs` 提供 prompt/steer/follow_up 等通用 SDK 命令。
- `assets/pi/extension-ui.mjs` 提供 setStatus/setWidget/dialog；`src/features/chat/services/integrations/PiExtensionUiHost.ts:179` 起按会话投影这些文本并刷新聊天区域。不能说插件完全不能展示扩展状态。
- 但没有具体 Goal 扩展发现、结构化 lifecycle/readback、控制可用性或预算接入。终端 `custom()` UI 不可直接在 Obsidian 渲染，扩展需要兼容通用 UI。
- 官方 Pi 1.4.0 的完整续跑空闲边界是 agent_settled，agent_end 只代表底层一次 run。插件 service 的 settlePrompt 有自己的等待逻辑；尚未对指定 Goal 扩展验证 retries/compaction/follow-up 与多轮展示，不把此处直接判成已复现缺陷。

## 扩展与其他循环机制

| 机制 | 驱动/状态归属 | 完成与停止 | 恢复、预算和插件适配影响 |
|---|---|---|---|
| Claude 官方 Ralph Loop plugin | Stop hook 在同会话回灌相同 prompt；本地状态文件 | completion-promise 精确匹配或 max-iterations；取消命令；默认轮数不限 | 无独立完成 verifier；不能冒充 Claude native Goal；插件只能通过现有 hooks/文本观察，未接 Ralph 专用状态 |
| Claude `/loop` | bundled skill + 定时任务；按固定或动态间隔唤醒 | 取消任务、动态 loop 自行停止、到期等 | 属定时调度；每会话最多 50 项、7 日到期；fixed 与 self-paced 恢复/停止语义不同，不应映射为 Goal 完成 |
| OpenCode OMO 新 Goal | 第三方 `.omo/goal` 状态；session.idle 异步续跑；in-flight Set 防重入 | active/paused/complete，控制器提供 set/get/pause/resume/clear | 固定 SHA 下 enabled/auto_start 默认 false。配置虽声明 default_max_iterations=100，但新 Goal 装配/idle 路径未消费该字段，不能承诺已执行 100 次封顶；与 native Goal 同开需防双驱动 |
| OMO Codex Light ulw-loop | Stop 自动续跑 + `.omo/ulw-loop` 多目标证据账本 | 额外证据/gate 与 fan-out guards | 独立编排层，不等于 Codex thread Goal；插件应显示来源，不合并成一个无来源状态 |
| OMX Ultragoal | Codex 原生 Goal handoff + `.omx/ultragoal` 计划/账本 | 跨故事 checkpoints、实现与验证证据 | 原始 OMX 已在 0.21 移除 Ralph，改用 Ultragoal；不能拿旧 Ralph 文案描述当前版本 |
| Pi `@narumitw/pi-goal` | agent_settled 后续一次；session custom entries 持久化；显式 complete/blocked/wait 工具 | 默认 automaticTurns=25、noProgressTurns=3，可选 token budget；active/paused/waiting/usage-limited/budget-limited 等分别表示 | automaticTurns 统计 Goal 自动工作中的 model responses，不能误标为用户轮数；RPC 管理协议默认关闭；Pi1.4.0 组合兼容仍需实测 |
| Pi `pi-agent-goal` | branch-aware goal state、草稿审核、单次 start handoff；显式启用 continuation | stale/max-turn 等保护；默认不自动持续 | peer 要求 Pi >=0.86.0 <0.87.0，本机1.4.0不在声明范围；不可直接推荐为现成兼容接入 |
| ZCode Stop hooks | 独立于 Goal verifier 的 hook block 续跑 | 所读第一方插件文档限制连续续跑3轮 | 不是长期 Goal；不与原生目标统计混算；具体 hooks 挂载仍取决于插件实际 launch/config |
| DSH 官方 experimental Ralph | 前台固定工作流，每轮 fresh child；共享工作区和有界结构化 handoff | worker 自报 complete/blocked，或轮数预算耗尽；无独立 evaluator | 默认/部署上限256；非持久后台 job，不宣称跨进程 resume；无总 token/时间/费用预算；不等于同会话原生 Goal |
| DSH 第三方 verified Ralph | fresh child + 独立 verifier 对轨迹评估 | verified-complete/blocked/stagnated/budget-limited 等 | 可选插件及 verifier 依赖；尚未在本插件安装/验证，不能把其认证能力算进 DSH 默认 Goal |

扩展事实见 [S10]–[S19]。本轮比较的是机制及声明，不代表已验证它们与 OpenCodian 或所装后端版本的兼容性。

特别注意：原生 Goal、Stop hook、扩展 Goal 与外部 supervisor 可能分别驱动同一会话。UI 应明确 source/driver，同一 session 的自动续跑所有权需要仲裁；“已安装扩展”或“命令目录中有 /goal”均不能代替可执行的能力证据。

## 建议的接入方向与验收

以下是后续实现建议，本轮只做调研和报告。

1. **先修已确认的信息断点**：Claude active_goal 映射；DSH command ACK 与 Goal activity 的生命周期拆分及 goal/change/activation 读回；Codex 读取失败与无目标分离、清除失败不撤销 UI；ZCode 裸查询与多轮边界。
2. **在既有 owner 中补统一契约**：扩展 `AgentCapability.ts` / backend ports 与现有 chat types，复用各 adapter；不新建六套并列 UI。提供 read/subscribe 和受支持 actions，保留 raw backend status/source/reason。没有能力的操作不显示成可点击按钮。
3. **后端持有持久状态**：插件仅缓存与展示；按 backend + backendSessionId 路由。tab 切换、恢复、重连先读回再订阅/对账，不走旧 OpenCode 1，也不把上一会话状态带到新会话。
4. **显示持续目标，而非单 turn 状态**：当前目标、状态、原因、可用操作；详情显示有证据的轮数/token/time/预算。message_stop/turn.completed 不能直接当 Goal complete。复用后台任务与前台 session.status 既有边界。
5. **保留后端差异**：Claude 清除与暂停不是同一件事；DSH active 与 armed 分开；round、model response、token、秒、货币分别计量。缺失字段显示 unavailable，不捏造百分比或 ETA。
6. **扩展显式选择并单独验收**：Pi 先选一个兼容当前核心的扩展和明确协议；OMO/OMX/Ralph 显示独立来源与证据。发现 native + extension 双驱动时给出当前所有者和可用控制，不擅自替用户安装或改全局配置。

最小验收场景：六后端能力探测；已有/无目标/不支持/读失败分别显示；创建后权威读回；至少两轮自动 continuation 且无手工发送；后台任务等待；切 tab 并发隔离；暂停/恢复/清除或该后端实际替代动作；预算与无进展停止；断线重连、插件重载、会话恢复与 fork；操作失败保留正确状态；原生与扩展双驱动；Pi 扩展的 retry/compaction/follow-up settled 边界。

## 本轮验证记录

- 已读 graphify 的 god nodes/community、CONTEXT、ADR 0001；CodeGraph status 报告索引 up-to-date，并用 explore 追踪 Goal 调用。
- 未修改任何函数/类，因此未发生需要 callers/impact 前置分析的代码编辑。
- 既有聚焦单测：5 suites、42 tests 全通过；覆盖 Codex client Goal、adapter backend events、会话设置 coordinator/modal，以及 ZCode chat。没有把单测通过等同于六后端实机验收。
- Claude 当前 normalizer 隔离复现：活动 `active_goal` → `[]`；清除 `active_goal` → `[]`。
- 安装态读取确认 DSH rc.4 SDK template 及四个 Goal 组件；没有启动 Goal 或更改用户 profile。
- 本轮只新增研究文档及本地研究 outline/fields；未构建、部署、提交或推送运行时代码。

可重复的单测命令：

```bash
npm run test -- --runTestsByPath \
  tests/unit/core/agents/backend/CodexAppServerClient.threadGoal.test.ts \
  tests/unit/core/agents/backend/CodexAdapter.backendEvents.test.ts \
  tests/unit/features/chat/ConversationSessionSettingsCoordinator.codex.threadGoal.test.ts \
  tests/unit/features/chat/ConversationSessionSettingsModal.codex.threadGoal.test.ts \
  tests/unit/core/agents/backend/ZCodeAdapter.chat.test.ts
```

仓库 test wrapper 已设 maxWorkers，不要同时追加 --runInBand。

## 主要原始来源

下列链接均于 2026-10-30 查阅。固定 SHA 的事实只保证所列 revision；动态文档/default branch 需在实施前重新确认。上游设计文档内部若存在历史措辞，以具体实现和最新协议为准。

- [S1 OpenCode v2.2.1 release](https://github.com/anomalyco/opencode/releases/tag/v2.2.1)
- [S2 OpenCode Goal schema](https://github.com/anomalyco/opencode/blob/92b2ca0dd727942e00aba3523ed141d53e78ea28/packages/schema/src/goal.ts)；[Goal runtime](https://github.com/anomalyco/opencode/blob/92b2ca0dd727942e00aba3523ed141d53e78ea28/packages/core/src/plugin/goal.ts)
- [S3 Claude native Goal](https://code.claude.com/docs/en/goal)；安装 SDK 类型见本仓库 node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts
- [S4 OpenAI Codex Goal guide](https://developers.openai.com/cookbook/examples/codex/using_goals_in_codex)
- [S5 OpenAI App Server — thread goals](https://learn.chatgpt.com/docs/app-server#manage-a-thread-goal)
- [S6 ZCode Session Goal](https://github.com/zai-org/ZCode/blob/3c5b227649371507ddc4eb46ac5133afe6db1cab/apps/zcode-cli/docs/design/v2/session-target.md)
- [S7 DSH Goal driver](https://github.com/deepseek-ai/deepseek-harness/blob/ce7073d51254c26cd63b22a60835b8f948deb447/packages/goal/goal-round-driver/README.md)
- [S8 DSH Goal command](https://github.com/deepseek-ai/deepseek-harness/blob/ce7073d51254c26cd63b22a60835b8f948deb447/packages/goal/command-goal/README.md)；[Goal service](https://github.com/deepseek-ai/deepseek-harness/blob/ce7073d51254c26cd63b22a60835b8f948deb447/packages/goal/goal/README.md)
- [S9 Pi RPC lifecycle](https://github.com/earendil-works/pi/blob/4b535d57ea8863dbba44b89872146523da271786/packages/coding-agent/docs/rpc.md)
- [S10 Claude official Ralph Loop](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/ralph-loop)
- [S11 Claude scheduled loops](https://code.claude.com/docs/en/scheduled-tasks)
- [S12 OMO Goal config](https://github.com/code-yeongyu/oh-my-openagent/blob/84a4e6cdecfd3f55e30ff551cab1d6ae27ce7cdb/packages/omo-opencode/src/config/schema/goal.ts)；[hook](https://github.com/code-yeongyu/oh-my-openagent/blob/84a4e6cdecfd3f55e30ff551cab1d6ae27ce7cdb/packages/omo-opencode/src/hooks/goal/index.ts)；[assembly](https://github.com/code-yeongyu/oh-my-openagent/blob/84a4e6cdecfd3f55e30ff551cab1d6ae27ce7cdb/packages/omo-opencode/src/plugin/hooks/create-session-hooks.ts)
- [S13 OMO Codex Light](https://github.com/code-yeongyu/oh-my-openagent/blob/84a4e6cdecfd3f55e30ff551cab1d6ae27ce7cdb/packages/omo-codex/README.md)
- [S14 OMX Ralph removal / Ultragoal](https://github.com/Yeachan-Heo/oh-my-codex/blob/main/skills/ralph/SKILL.md)
- [S15 Pi goal extension](https://github.com/narumiruna/pi-extensions/blob/main/packages/pi-goal/README.md)
- [S16 Pi-Agent-Goal compatibility](https://github.com/KristjanPikhof/Pi-Agent-Goal/blob/main/package.json)
- [S17 ZCode plugin hooks](https://github.com/zai-org/zcode-plugins/blob/main/docs/PLUGIN_DEVELOPMENT.md)
- [S18 DSH experimental Ralph](https://github.com/deepseek-ai/deepseek-harness/blob/ce7073d51254c26cd63b22a60835b8f948deb447/packages/experimental/tool-ralph/README.md)
- [S19 Third-party DSH verified Ralph](https://github.com/cofy-x/dsh-verified-ralph)
