# 六后端会话标题与 OpenChamber 小模型审计（2026-10-30）

## 结论与证据边界

当前 OpenCodian 尚未形成六后端一致的“原生优先 → AI 辅助生成 → 确定性回退”链路。首条消息的共享标题入口只允许旧 OpenCode、OpenCode 2 和 Claude Code；旧 OpenCode 已退出可选后端，因此六个可选后端实际只有两个进入该入口。原生读取函数却只映射旧 OpenCode、Claude Code 和 DSH，没有映射 OpenCode 2、Codex、Pi、ZCode。

本次为源码与受控运行审计：运行现有 6 个测试套件（26 项通过），另将未修改的生产 `TitleGenerationService` 和 `AgentBackendRouting` 打包，注入受控适配器复现分支；没有派发真实模型请求、创建或删除原生会话，没有修改业务源码、设置或部署产物。受控探测证明插件分支行为，不能当作六后端真实模型生成成功的证明。

工作区基线为 `135e67acc58e686fdacc32da06e9733739ab6dc4`，包含本聊天此前未提交的标签和历史面板改动。审计保留这些改动。

## 版本范围

| 对象 | 检查范围 |
| --- | --- |
| OpenCodian | 2.1.4 当前工作区；`@opencode/client` 2.2.0、旧 `@opencode-ai/sdk` 1.19.5、Claude Agent SDK 0.3.312、Codex SDK 0.165.0 |
| OpenCode 2 | 安装 CLI 2.2.2；本地源码 2.2.2，`f71cee98046fe17a55d27dcdbfcbce077b29c9f9` |
| Claude Code | 安装 CLI 2.1.312；当前 SDK 声明与 CLI 二进制中的生成能力标记；额外本地参考源码 2.1.88-source.0，不能用旧源码断言当前辅助模型仍固定为 Haiku |
| Codex | 安装 CLI 0.165.0；官方 `rust-v0.165.0`，`360319d8dee62d87e2d59fc0c21805d79519cfed` |
| Pi | 安装 `@earendil-works/pi-coding-agent` 1.4.0；本地同版本源码 `f09d01b85e0384647fcab6779d35ab9dabe04be3` |
| ZCode | 本地源码 3.16.2，`3c5b227649371507ddc4eb46ac5133afe6db1cab`；本轮未证明已安装运行包与该检出逐字一致 |
| DSH | 安装 0.2.1-rc.4；使用匹配标签 `dsh-v0.2.1-rc.4` 的 `504a01a9578abc2c6f1fb896b1dc322c9fe24f66` 核对核心标题服务，不将本地较新的 0.2.2-alpha.2 直接当作安装版本 |
| OpenChamber | 远端 main 核对到 `703d98b788756d1ae4721ca30f75b705f6c9e564`（提交时间 2026-10-29T21:04:23Z），取该提交原文；没有更新本地 OpenChamber 检出 |

OpenCode 原生逻辑按 2.2.2 源码审查，不沿用 source-compass 技能里的旧 1.14.19 架构。客户端与服务端有 2.2.0 / 2.2.2 的补丁版本差异；没有将这项差异本身归因为标题缺陷。

## 六后端矩阵

这里“AI 兜底”指原生标题不可用后，插件主动调用模型生成；“规则回退”指不用模型的首条消息提取。适配器拥有重命名接口不等于拥有自动生成入口。

| 后端 | 原生能力 | 当前插件原生优先接入 | AI 兜底 | 失败／无生成时的标题 |
| --- | --- | --- | --- | --- |
| OpenCode 2 | 有原生 title agent。显式 title 模型优先，否则同 provider 小模型／低推理变体，再回主模型；首选调用没有有效标题时可再尝试主模型 | 不完整。`readBackendSessionTitle` 未映射 opencode2；首条消息之前写入规则标题还会使原生 session 不再满足 untitled 自动触发条件 | 有 `client.generate.text`；但直接用聊天模型，跳过 `aiTitleModel` 的解析与可用性校验 | 先保存首条消息标题；AI 出错标记 failed，保留已有规则标题；没有额外模型失败重试 |
| Claude Code | CLI 有原生标题生成能力；SDK `summary` 是显示标题，可能来自自定义标题、生成摘要或首条 prompt，不专指 AI 结果 | 只轮询 summary，没有主动调用原生生成。autoTitle 创建时留空，却被首条消息规则标题重新填入 session state，并可能作为首轮 SDK title 传入 | 没有。summary 为空后直接返回规则标题，并标记 success | 通常保留首条消息规则标题；非空“新对话”也会被当作原生标题接受；无统一重试 |
| Codex | 原生 TUI 有生成逻辑，客户端创建临时结构化 thread；当前 app-server ClientRequest 有 name/set，没有独立 name/generate | 没接 TUI 标题任务。通知已映射为 thread_renamed，适配器记录 trace，但聊天消费者没有据此更新 conversation.title | 没有进入共享生成入口 | 新建本地记录可停留“新对话”；原生浏览器能显示 name / preview，不等于标签自动生成已接好 |
| Pi | 当前核心提供 session name 保存／读取、RPC set_session_name，没有找到内置自动 AI 标题生成；扩展可以另外实现 | 没有原生 AI 生成可直接等待；共享标题读取也没映射 Pi | 没有进入共享生成入口 | 创建适配器设置 `New Pi chat`，本地会话初值是“新对话”；没有统一首条消息规则回退 |
| ZCode | 有原生异步标题 sidecar、可独立选模型、60s 默认期限；root interactive 首轮生成，短输入保留现有语义，custom 来源受保护；原生存在 first_input / generated / custom 来源 | 原生创建没有禁用 title generation；但共享读取未映射 ZCode，普通聊天标题更新没有消费原生标题结果 | 没有进入共享生成入口 | 原生可保留 first_input 等已有标题；本地标签不一定同步，可能仍是“新对话” |
| DSH | 有原生确定性首条消息标题服务；可注册 first-prompt / all-prompts LLM provider，显式 provider+model 或使用主请求路由，失败保留规则标题；用户 rename 具有优先权 | 共享读取映射了 `.title`，但发送链路没有启动该后端标题流程；不能因“可读”就视为“已接入” | 没有进入共享生成入口；原生是否启用 LLM provider 取决于配置 | 原生规则标题可用，模型 provider 可选；聊天标签的本地回退和同步不完整 |

## 插件内确认的问题

1. **四后端不进入首条消息标题入口。** `MessageSendPreparationService.ts:640–651` 限定 backend；`:1036–1041` 再次限定 AI 开关。Codex、Pi、ZCode、DSH 既没有这里的原生等待，也没有这里的规则回退。后端浏览器导入、手动重命名、fork 另有初始标题路径，不能据此声称新建普通聊天完整。
2. **OpenCode 2 原生读取漏接。** `AgentBackendRouting.ts:192–236` 只处理 opencode / dsh / claude-code。受控适配器返回正确 `.title` 时，opencode2 仍得到 null；默认配置可能轮询 12 次、间隔 1.5s，增加约 16.5s 无效等待后才发起插件 AI 生成（不计 RPC 耗时）。
3. **过早同步 fallback 到原生破坏“原生优先”。** `OpenCodianView.ts:4539–4544` 调用 `updateConversationTitleState`；`:4632–4637` 把该规则标题发给原生重命名。OpenCode 2 的自动入口只在 untitled 时启动，规则重命名发生在首轮发送前，因此会抑制该自动入口。Claude `updateSessionTitle` 又写入 session state，首轮 options.title 会取这个值；创建时的空 title 本身不足以证明自动生成仍能触发。
4. **OpenCode 2 的专用标题模型设置未消费。** `TitleGenerationService.ts:85–101` 在 `resolveModel` 前提前返回，传递 `currentModel.provider/model`。受控探测配置 cheap-title-model，实际调用参数仍是 large-chat-model，且 catalog 校验次数为 0。`resolveModel` 只剩旧 OpenCode 分支在使用。
5. **成功状态无法区分标题来源。** Claude `summary` 可以只是 firstPrompt / customTitle；当前归一化仅拒绝旧 OpenCode 时间戳占位格式。受控 `summary:'新对话'` 被接受；空 summary 返回 deterministic fallback 也标 success。现有 success 不能解释为“AI 摘要生成成功”。
6. **回退覆盖和失败恢复不完整。** OpenCode 2 AI 报错会留下发送前保存的规则标题，这层有用；但没有统一生成重试、晚到原生标题接管或四后端规则兜底。取消标记能阻止回调写回，OpenCode 2 generateTitle 接口没有接收这条 AbortSignal，不能据此宣称模型请求已取消。规则标题只取首句前 50 个 UTF-16 单元，句子边界只含英文 `. ! ?` 和换行；图片专用首发没有文本时会落入未命名。

人工改名保护有一部分：生成回调只在原标题仍等于预期 fallback 且状态仍 pending 时提交。这应保留，同时从“文本相等”提升为明确的来源／生成代次保护。

## OpenChamber 的 Small Model 机制

### 模型选择

当前实现 `packages/web/server/lib/small-model/index.js:220–294` 按以下顺序解析：

1. 单次请求明确指定的模型及 variant。
2. OpenChamber Small Model 设置覆盖；启用默认时不使用覆盖值。
3. OpenCode 原生 title agent 配置的模型／variant（兼容从旧 `small_model` 迁移的配置）。
4. 当前会话本来已使用轻量模型则沿用；否则扫描同 provider 的轻量模型；无候选则回到当前会话模型。
5. 最后查询 OpenCode 默认模型，但调用者已指定 provider 时要求仍在该 provider。

它不从任意已连接 provider 自动挑便宜模型。轻量识别依赖 family/id 的命名启发式，顺序是 `flash-lite → flash → luna → haiku`，同档优先新版本，并过滤禁用、非 active、非文本输入输出及匿名 Zen 免费条目。它没有按实时单价计算“全局最便宜”，也不保证显式配置或回落的聊天模型便宜。

### 执行与失败

服务把 system+prompt 交给运行中的 OpenCode `experimental.generate.text`，不创建用户聊天 session。OpenCode 持有 provider 凭据和请求实现；OpenChamber 复用当前目录作用域、模型目录与认证，不自行拼另一套供应商 HTTP 调用。模型目录缓存 30s，不缓存冷启动空目录。

它有输入预算裁剪／拒绝、按输入长度扩展的超时、取消信号、目录未就绪的有限退避、JSON 解析失败的一次重试，并返回最终 provider/model/source。只有目录冷启动类错误重试；不是任意模型报错都自动换模型。`maxOutputTokens` 在这条 OpenCode endpoint 上用于输入预算预留，不能当作服务端已施加真实输出上限。

首个标题通常仍由 OpenCode title agent 生成；OpenChamber 注入插件调整它的提示词，不另起重复首轮标题任务。用户手动重新生成时，取最近最多三个已完成的用户+助手最终回答回合，加入当前标题，生成后读回标题／目录／归档／revert 状态，状态已改变则放弃写回；失败保留原有标题。手动保存会取消挂起的生成。

简短回顾／下一步建议使用同一 Small Model 服务。它们在实时 session idle 后静默约 60s 再生成，不回填所有旧会话；提取受限上下文，返回 recap / suggestion，写入 OpenChamber 自己的元数据。新消息会使旧结果失效，并在提交前再次核对 session 状态。归档会话跳过。不能把这种 UI 回顾理解为主对话模型的上下文压缩或记忆写入。

### 可借鉴与不宜照搬

值得借鉴的是：一套辅助文本能力、明确模型解析、同 provider 默认边界、短上下文、异步不阻塞、限时取消、来源与失败可观测，以及提交前并发校验。OpenCodian 应由每个会话的所属后端提供执行通道，不把六后端辅助任务统一偷偷送往旧 OpenCode。

不宜照搬的部分包括：把模型名字当成价格保证、让用户显式配置失效时静默切到任意供应商、只把 JSON.parse 当作 schema 校验，以及把本地回顾等同于主对话 compaction。

## 建议的后续实现顺序

1. 先补六后端首条消息规则标题，**本地即时可见**，保留占位／规则／原生生成／辅助生成／人工等来源。原生尚在生成时，不把规则标题当成人工重命名写回。
2. 按 adapter 能力消费原生标题来源与更新事件；原生未提供明确来源时，将未知来源与“已证明 AI 生成”区分。OpenCode 2 和 Claude 的现有接入首先修正；ZCode、DSH 补消费路径。
3. 原生没有可调用能力（例如当前 Pi），或原生在有限等待后失败时，通过**所属后端**的隔离辅助生成通道补标题。Codex 借鉴 TUI 的临时结构化 thread 思路，不能仅等 app-server name/updated。
4. 统一小模型设置的作用域和可用性判定，真正消费 `aiTitleModel`；记录最终模型与 source。选模规则和运行时重试分开，允许低成本模型不存在时明确回落到规则标题。
5. 所有模型失败／超时／空响应／取消都保留可用的本地规则标题，并支持明确的重试；人工标题永不被晚到结果覆盖。晚到原生标题可以替代规则标题，但不能覆盖人工标题。
6. 验收覆盖六后端 × 原生成功／缺能力／失败／超时／空结果／专用模型不可用／人工改名／后台标签／重载恢复；真实模型验收与受控分支测试分别记录。

这是一份审计与建议，尚未执行上述业务修复。

## 源码定位与复验

插件：

- `src/features/chat/services/send/MessageSendPreparationService.ts:640`、`:1036`：触发与开关。
- `src/features/chat/services/title/TitleGenerationService.ts:73`、`:85`、`:103`、`:154`、`:266`：原生等待、分后端路径与旧选模分支。
- `src/core/agents/backend/AgentBackendRouting.ts:192`：原生标题字段映射。
- `src/features/chat/OpenCodianView.ts:4539`、`:4569`、`:4632`：规则标题、提交保护与原生回写。
- `src/main.ts:2522`、`:2855`：新建标题与无模型规则。
- `src/core/agents/backend/claude/ClaudeCodeAdapter.ts:1691`、`:1723`、`:2005`、`:5314`；SDK `sdk.d.ts:6125`：Claude 创建、回写、summary 语义。
- `src/core/agents/backend/codex/CodexAdapter.ts:2713`、`:4025`、`:4079`：rename 通知／接口／浏览器标题。
- `src/core/agents/backend/pi/PiAdapter.ts:177`；`src/core/agents/backend/zcode/ZCodeAdapter.ts:695`、`ZCodeStreamMapper.ts:148`；`src/core/agents/backend/dsh/DshAdapter.ts:349`：其他后端适配边界。
- `src/features/settings/general/SettingsConversationSection.ts:383`：标题模型设置当前产品范围。

公开一手来源（固定提交）：

- [OpenCode 2 原生选模](https://github.com/anomalyco/opencode/blob/f71cee98046fe17a55d27dcdbfcbce077b29c9f9/packages/core/src/session/context.ts#L94)、[生成及主模型二次尝试](https://github.com/anomalyco/opencode/blob/f71cee98046fe17a55d27dcdbfcbce077b29c9f9/packages/core/src/session/title.ts#L105)、[自动触发条件](https://github.com/anomalyco/opencode/blob/f71cee98046fe17a55d27dcdbfcbce077b29c9f9/packages/core/src/session/runner/llm.ts#L195)。
- [Codex 0.165.0 TUI 标题](https://github.com/openai/codex/blob/360319d8dee62d87e2d59fc0c21805d79519cfed/codex-rs/tui/src/app/thread_title.rs#L26)、[app-server 请求集合](https://github.com/openai/codex/blob/360319d8dee62d87e2d59fc0c21805d79519cfed/codex-rs/app-server-protocol/schema/typescript/ClientRequest.ts#L109)。
- [DSH 匹配版本标题服务](https://github.com/deepseek-ai/deepseek-harness/blob/504a01a9578abc2c6f1fb896b1dc322c9fe24f66/packages/session/session-title/src/index.ts)、[可选首轮 LLM provider](https://github.com/deepseek-ai/deepseek-harness/blob/504a01a9578abc2c6f1fb896b1dc322c9fe24f66/packages/session/session-title-first-prompt-llm/src/index.ts#L145)。
- [OpenChamber 统一小模型](https://github.com/openchamber/openchamber/blob/703d98b788756d1ae4721ca30f75b705f6c9e564/packages/web/server/lib/small-model/index.js#L220)、[OpenCode 通道与目录](https://github.com/openchamber/openchamber/blob/703d98b788756d1ae4721ca30f75b705f6c9e564/packages/web/server/lib/small-model/client.js#L37)、[首轮原生 title prompt](https://github.com/openchamber/openchamber/blob/703d98b788756d1ae4721ca30f75b705f6c9e564/packages/web/server/lib/opencode/session-title-plugin.js)。
- [OpenChamber 重新生成上下文](https://github.com/openchamber/openchamber/blob/703d98b788756d1ae4721ca30f75b705f6c9e564/packages/ui/src/lib/sessionTitle.ts)、[并发保存保护](https://github.com/openchamber/openchamber/blob/703d98b788756d1ae4721ca30f75b705f6c9e564/packages/ui/src/sync/session-title-generation.ts)、[回顾与建议后台调度](https://github.com/openchamber/openchamber/blob/703d98b788756d1ae4721ca30f75b705f6c9e564/packages/web/server/lib/session-assist/runtime.js)。

ZCode 的一手证据在本地参考检出 `apps/zcode-cli/packages/core/src/runtime/methods/session-title.ts`、`title-generation-sidecar.ts`、bootstrap 的 `zcode-protocol/server-operations.ts:3507`。Pi 一手证据在匹配 1.4.0 的 `packages/coding-agent/src/core/session-manager.ts:1313` 与 `src/modes/rpc/rpc-mode.ts:659`。这些文件未修改。

本机证据目录 `.obsidian-debug/session-title-audit-20261030/` 含 `existing-tests.log`、`probe.cjs` 和 `probe-results.json`；受控探测断言 OpenCode 2 选模跳过、四后端读取漏映射、Claude 占位误接收与失败分支。无需联网运行 `node .obsidian-debug/session-title-audit-20261030/probe.cjs` 可复验生产打包后的分支；打包文件为本机临时审计产物，不纳入版本库。
