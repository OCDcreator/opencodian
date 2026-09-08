# 后端 SDK 升级调研报告（2026-09-02）

> 2026-09-08 执行更新：发布收口时重新查询 npm，最终目标刷新为 Claude Agent SDK `0.3.263`、Codex SDK `0.153.4`、OpenCode SDK `1.18.29`。下文版本矩阵保留 2026-09-02 调研快照；实际接入与暂缓项以 `devlog.md` 的 2026-09-08 条目为准。

调研范围：OpenCodian 对接的三个后端（OpenCode / Claude Code / Codex）各自的 **SDK 依赖版本** 与 **本地 CLI 运行时版本**，评估是否有必要升级、升级风险与收益。本报告只做调研结论，不改任何依赖。

## TL;DR

- **三个 SDK 全部落后于最新版**，其中 Claude Agent SDK 落后最多（107 个 patch 版本），且它对应的本地 CLI（2.1.204）已经远新于 SDK 所处时代，存在"新 CLI 协议面、旧 SDK 客户端"的错配。
- **三个升级都没有破坏性变更命中插件的使用面**（被删除/收紧的类型插件均未使用）。
- 建议：**三个都升**。Codex 与 OpenCode 风险极低、属于"顺手对齐"；Claude Agent SDK 升级收益最实际（上下文用量协议化、新控制消息类型），但需要完整回归。
- 本地 CLI 侧：opencode 已是最新（1.18.25）；claude（2.1.204）与 codex（0.151.0）略落后，CLI 有自己的更新通道，与插件升级解耦。

## 版本矩阵

| 后端 | SDK 依赖（package.json） | 实际安装（node_modules） | npm 最新 | 落后幅度 | pin 引入时间 |
| --- | --- | --- | --- | --- | --- |
| OpenCode | `@opencode-ai/sdk` `1.18.3`（精确 pin） | 1.18.3 | 1.18.25（2026-09-01 发布） | 22 个 patch | 2026-03-29（SDK v2 迁移） |
| Claude Code | `@anthropic-ai/claude-agent-sdk` `^0.3.145` | 0.3.145 | 0.3.252 | 107 个 patch | 2026-05-20（首次集成） |
| Codex | `@openai/codex-sdk` `0.139.0`（精确 pin） | 0.139.0 | 0.152.0（stable） | 13 个 minor | 2026-06-11（能力面产品化） |

本地 CLI（插件运行时实际 spawn 的后端进程）：

| CLI | 本地版本 | 最新 | 说明 |
| --- | --- | --- | --- |
| `opencode` | 1.18.25 | 1.18.25 | 已最新；经 fnm shim 解析，`~/.opencode/bin/opencode` 也在插件候选路径内 |
| `claude` | 2.1.204 | 2.1.252 | Claude Code 有自动更新机制，通常自行追平 |
| `codex` | 0.151.0 | 0.152.0 (stable) | 落后 1 个 stable |

## 架构前提（决定了升级的影响面）

- 插件**不捆绑任何后端二进制**：
  - OpenCode：`LocalSidecarLauncher.findOpenCodeBinary()` 按候选路径解析用户安装的 `opencode` CLI（macOS 候选含 `/opt/homebrew/bin`、`~/.opencode/bin`、PATH 等）。
  - Claude：`ClaudeCodeAdapter` 通过 `pathToClaudeCodeExecutable` 走外部 `claude` CLI；AGENTS.md 明确规定**不**部署 SDK 的平台二进制包（`@anthropic-ai/claude-agent-sdk-<platform>/`）。
  - Codex：`CodexCliResolver` 从配置路径/PATH 解析外部 `codex` CLI；codex-sdk npm 包本身不捆绑 CLI。
- 因此 **SDK 升级 ≠ 后端升级**：后端版本由用户 CLI 决定（本机已是新版）；SDK 升级改变的是**客户端协议层**——旧 SDK 配新 CLI 时，新 CLI 发出的新协议消息（控制请求、事件类型）旧 SDK 无法识别或无法暴露给插件。

## 各后端差异详情

### 1. OpenCode：`1.18.3 → 1.18.25`，风险极低，收益偏类型对齐

对两个版本 npm 包做了全量 diff：

- **运行时代码（`dist/v2/gen/sdk.gen.js`）零差异**，唯一变化是一行注释（upgrade 接口的 doc 文案）。
- 类型差异仅 3 处（`dist/v2/gen/types.gen.d.ts`）：
  1. `interleaved` reasoning 字段形态放宽：`true | {field...}` → `boolean | "reasoning" | "reasoning_content" | "reasoning_text" | string | {field...}`（新增 `reasoning_text` 字段名）；
  2. 对应 `field` 联合类型同步扩展；
  3. `/global/upgrade` 请求体的 `target` 从可选变必填（`target?: string` → `target: string`）。
- 插件源码未引用 `interleaved`/`reasoning_details`/`reasoning_text`，也未直接调用 `global.upgrade`（升级由 CLI 自身通道完成），**无破坏面**。
- 注意：`OpenCodeSdkCapabilityRegistry` 是基于 SDK 1.17.18 surface 的静态清单（能力 ID / sdkPath / 探测策略），1.18.25 未改任何方法签名，registry 不需要随之改动。

**结论**：可升级，属于低价值低风险的版本对齐；让 SDK 类型声明与本地 1.18.25 服务端完全同代。

### 2. Claude Code：`0.3.145 → 0.3.252`，落后最多，升级收益最实际

类型面 diff（`sdk.d.ts`，5797 行 → 8562 行）：

- **新增 29 个导出类型**，对本插件有直接价值的包括：
  - `SDKContextUsage` / `SDKContextUsageCategory` / `SDKControlGetUsageResponse`：**上下文用量协议化**。新类型提供了远超当前用法的结构化数据：估算 token、autocompact 窗口（`raw_max_tokens`）、超限信息（`over_limit` + `hard_limit`/`compaction_window` 分类）、按 MCP 工具/记忆文件/子代理/skills 分类的 token 占用明细、会话级成本与用量。插件的 `ClaudeCodeAdapter` 已在调用 `query.getContextUsage()`（`ClaudeCodeAdapter.ts:1677`），当前拿到的是旧协议形态；升级后可获得完整类型化数据，可反哺 `ContextUsageService`。
  - `OnUserDialog` / `UserDialogRequest` / `UserDialogResult` + `Options.onUserDialog`：CLI 的阻塞式对话框（如 refusal fallback）宿主应答机制。
  - `SDKBackgroundTasksChangedMessage`、`SDKThinkingTokensMessage`、`SDKModelRefusalFallbackMessage`、`SDKConversationResetMessage`、`SDKWorkerShuttingDownMessage`、`SDKCommandsChangedMessage` 等新消息类型。
- **删除 4 个类型**：`ConnectRemoteControlOptions/Result/Error`、`InboundPrompt`。**插件源码零引用，无破坏面。**
- 插件直接 import 的类型（`Query`、`SDKUserMessage`、`ElicitationRequest/Result`、`SDKMessage`）与 `query()` 函数在 0.3.252 全部健在。
- 行为澄清（升级时留意）：`Options.env` 语义明确为**整体替换**子进程环境而非与 `process.env` 合并。插件当前传的就是完整 `env: process.env`（`ClaudeCodeAdapter.ts:3147,3299`），语义兼容，但如果后续有人改成传部分变量就会踩坑。
- **版本错配风险（升级的主要动机）**：本地 CLI 已是 2.1.204，远新于 0.3.145 时代。新 CLI 会发出旧 SDK 不认识的控制请求/消息；`ClaudeCodeSdkLoader` 的 facade 已经是可选透传设计（`sdk.listSessions ? {...} : {}`），升级只需重跑验证，不需要改 facade 结构。

**结论**：建议升级，但作为独立变更走完整回归（见验证清单）。收益是协议对齐 + 上下文用量/新消息类型可用。

### 3. Codex：`0.139.0 → 0.152.0`，风险极低，纯增量

对两个版本 npm 包全量 diff（`dist/index.d.ts` 276 → 285 行，`dist/index.js` 仅 28 行差异）：

- 类型变化全部为**增量**：
  1. token 用量新增 `cache_write_input_tokens`（prompt cache 写入量，`turn.completed` 时 SDK 自动补 0）；
  2. `ThreadOptions` 新增 `configOverrides?: string[]`（原样透传 `--config key=value` 给 CLI）；
  3. `ModelReasoningEffort` 新增 `"max" | "ultra" | "persistent"` 三档；
  4. 新增 `threadSource?: string`（`--thread-source` 透传）。
- 无任何删除或签名收紧；插件使用的 `Codex`、`Thread`、`ThreadEvent`、`ThreadOptions`、`UserInput` 均不受影响。
- 连带机会（非升级必需）：reasoning effort 新枚举若要在设置 UI 暴露，需要 `src/core/types/settings.ts`、设置界面、locale 联动——这是独立的产品决策，不随 SDK 升级自动发生。

**结论**：可升级，顺手对齐。本地 codex CLI（0.151.0）与 SDK 0.152.0 同代配套。

## 升级建议与优先级

| 优先级 | 动作 | 理由 |
| --- | --- | --- |
| 1 | `@anthropic-ai/claude-agent-sdk` → `0.3.252` | 差距最大；消除新 CLI（2.1.x）协议面与旧 SDK 的错配；解锁结构化上下文用量 |
| 2 | `@openai/codex-sdk` → `0.152.0` | 纯增量、零破坏；与本地 CLI 同代 |
| 3 | `@opencode-ai/sdk` → `1.18.25` | 零运行时差异；类型声明与服务端同代 |

建议分两次提交：① claude-agent-sdk 单独一次（回归面最大）；② opencode + codex 一次（机械升级）。

**升级时保留现有 pin 风格**：opencode/codex 继续精确 pin（当前惯例），claude 已是 `^` 范围、锁文件跟随即可；如继续用 `^0.3.x`，注意 0.x 的 caret 只允许 0.3.x 内升级。

### 验证清单（每次升级后）

1. `npm run verify`（lint + typecheck + 全量测试 + 生产构建）——typecheck 是第一道关：任何 facade/类型断裂会在这里暴露。
2. Capability Lab 冒烟（设置 → Capability Lab）：确认 OpenCode 能力探测/回退策略不回归。
3. 三后端各跑一轮真实对话冒烟：流式渲染、工具调用、elicitation/问题卡、上下文用量显示。
4. Claude 后端额外验证：`query.getContextUsage()` 返回的新结构在 `getSessionContextUsageSnapshot` 里的归一化是否仍正确（新结构字段更多，旧归一化应兼容但要确认）。
5. Test Vault 部署 + BUILD_ID 验证（`src/core/**` 改动涉及运行时文件时按 AGENTS.md 流程执行；纯 package.json + lockfile 升级会进 `dist/main.js`，属于部署相关）。

## 风险与不做的事

- **不做**：不升级 SDK 平台二进制包的部署策略（AGENTS.md 规定 claude 平台包不进 Test Vault）；不随 SDK 升级自动暴露 reasoning effort 新档位（独立产品决策）；不动 capability registry 的 1.17.18 基准。
- **已知残留风险**：claude SDK 107 个版本跨度的行为变化无法只靠类型 diff 完全排除（例如 stream-json 协议细节、超时/重试语义）；上表验证清单第 3、4 条就是为它准备的。
- 本地 CLI（claude 2.1.204 / codex 0.151.0）是否更新由用户自行决定，与本次 SDK 升级解耦；opencode CLI 已最新。

## 附录：调研方法

- SDK 包对比：`npm pack` 两个版本后对 `*.d.ts` / 运行时 js 做全量 diff（存放于 `/tmp/oc-sdk-compare`、`/tmp/claude-sdk-cmp`、`/tmp/codex-sdk-cmp`）。
- 插件使用面：`rg` 确认插件 import 的每个 SDK 类型在新版本中的存留；确认删除类型零引用。
- pin 历史：`git log -S <dep> -- package.json`。
- 本地 CLI：`opencode --version` / `claude --version` / `codex --version`；最新版以 npm registry（`@anthropic-ai/claude-code`、`@openai/codex` dist-tags、`@opencode-ai/sdk`）为准。
