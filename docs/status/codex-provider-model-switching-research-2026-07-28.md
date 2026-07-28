# Codex 后端 Provider / 模型切换能力调研报告

> **状态**: 调研快照，供 Codex 执行者审阅敲定现状，**非规范文档**
> **日期**: 2026-07-28
> **范围**: Codex 后端的 provider 切换、模型切换、第三方 endpoint 接入、配置文件分层
> **方法**: 官方文档（learn.chatgpt.com）+ OpenAI GitHub issue + 插件源码交叉核实
> **结论性质**: 事实陈述 + 可行性分级判定，**不含**实现决策

---

## 0. TL;DR（审阅者先看这段）

| 维度 | 现状 | 判定 |
|------|------|------|
| Codex 后端能否切模型 | 能（Settings 下拉 / 会话设置覆盖 / CLI `--model`） | ✅ 已实现，入口藏在 Settings |
| composer 内联模型选择器 | **隐藏**（`CODEX_CAPABILITIES` 不含 `Models`） | 设计如此，可重新评估 |
| 第三方 API endpoint 接入 | 仅 `~/.codex/config.toml`，**插件不提供 UI** | 设计如此（G16 边界） |
| 读取全局 config.toml 显示 | **未实现**（纯只读 UX 增益） | 🔵 可做，低风险 |
| 项目级 `.codex/config.toml` | Codex 官方支持，但**禁止覆盖 provider/auth** | ⚠️ 受 Codex 安全模型限制 |
| 手动切 provider（app-server 路径） | **被上游 bug #23417 阻塞**，未修复 | 🔴 等上游修复 |
| 手动切 provider（exec 路径） | 理论可行（profile/-c 在 exec 模式正常） | ⚠️ 需架构评估 |

**审阅者需要敲定的核心问题**:
1. 是否补做"全局 config.toml 只读摘要面板"？（低风险纯增益）
2. 是否给 Codex 加 `AgentCapability.Models`，把模型切换入口暴露到 composer？
3. provider 切换是否进入 roadmap（依赖上游 #23417 修复）？

---

## 1. 调研背景

用户反馈：使用第三方 API 连接（未登录 ChatGPT 账号）时，Windows 上的 Codex 后端看起来"没有模型切换"。调研目标：

- Codex 后端到底支持哪些模型/provider 切换？
- 插件目前的实现边界在哪？
- 哪些"看起来该有但没有"的功能是**插件偷懒**，哪些是**Codex 上游限制**？

---

## 2. Codex 官方能力（事实层）

### 2.1 配置文件分层

Codex 官方支持三层配置，按优先级递增：

| 层级 | 位置 | 说明 |
|------|------|------|
| 全局 | `~/.codex/config.toml`（或 `$CODEX_HOME/config.toml`） | provider / auth / 遥测的核心归属 |
| Profile | `$CODEX_HOME/<name>.config.toml` | 通过 CLI `--profile <name>` / `-p <name>` 激活 |
| 项目级 | `<project>/.codex/config.toml` | **受信任机制约束**，且**不能覆盖** provider/auth/通知/遥测 |
| CLI flag | `-c key=value` / `--model` / `-p` | 单次调用覆盖 |
| 环境变量 | `OPENAI_API_KEY` 等 | provider 的 `env_key` 指向 |

**来源**: [Configuration Reference](https://learn.chatgpt.com/docs/config-file/config-reference)、[Advanced Configuration](https://learn.chatgpt.com/docs/config-file/config-advanced)

### 2.2 CLI 关键 flag

| flag | 作用 |
|------|------|
| `-m, --model <string>` | 覆盖配置里的 model |
| `-p, --profile <string>` | 叠加一个命名 profile |
| `-c, --config key=value` | 单次覆盖配置（按 TOML 解析） |
| **没有 `--provider`** | provider 选择只能靠 profile 或 `-c model_provider=xxx` |

**来源**: [Developer commands](https://learn.chatgpt.com/docs/developer-commands)

### 2.3 第三方 endpoint 的三种官方写法

**方式 1 — 覆盖内置 openai provider 的 base_url**（最简）:

```toml
openai_base_url = "https://your-proxy.example.com/v1"
```

> ⚠️ 不能写成 `[model_providers.openai]`——内置 ID（`openai`/`ollama`/`lmstudio`）是预留的。

**方式 2 — 定义新 provider**（推荐）:

```toml
model = "gpt-5.4"
model_provider = "proxy"

[model_providers.proxy]
name = "OpenAI using LLM proxy"
base_url = "http://proxy.example.com"
env_key = "OPENAI_API_KEY"
```

**方式 3 — Azure / 复杂 query_params**:

```toml
[model_providers.azure]
name = "Azure"
base_url = "https://YOUR_PROJECT.openai.azure.com/openai"
env_key = "AZURE_OPENAI_API_KEY"
query_params = { api-version = "2025-04-01-preview" }
wire_api = "responses"
```

### 2.4 `[model_providers.<id>]` 完整字段

| 字段 | 默认 | 说明 |
|------|------|------|
| `name` | — | 显示名 |
| `base_url` | — | API 端点 |
| `env_key` | — | 读 API key 的环境变量名 |
| `wire_api` | `responses` | 协议（目前只支持 `responses`） |
| `query_params` | — | 附加 query 参数 |
| `http_headers` / `env_http_headers` | — | 静态 / 环境变量 HTTP 头 |
| `auth.command` / `auth.args` / `auth.timeout_ms` / `auth.refresh_interval_ms` | — | 命令行获取 bearer token（与 `env_key` 互斥） |
| `request_max_retries` | `4` | HTTP 重试 |
| `stream_max_retries` | `5` | SSE 流中断重试 |
| `stream_idle_timeout_ms` | `300000` | SSE 空闲超时 |

### 2.5 关于"模型列表"的澄清

**Codex 官方文档里没有一个"模型列表"配置键**。模型选择机制：

- 顶层 `model = "xxx"` 配默认模型
- CLI `--model <name>` 或插件透传覆盖
- Codex **不会从 provider 拉取模型目录**——运行时把模型名字符串发给 `base_url`，**由第三方后端决定接不接受**

这跟 OpenCode 的"拉取 provider 模型目录"是**完全不同的设计**。所以插件里 Codex 的模型下拉靠 `codex debug models` 命令（只读诊断工具），不是从 provider 同步。

### 2.6 🔴 关键上游 bug：Issue [#23417](https://github.com/openai/codex/issues/23417)

**标题**: app-server thread/start ignores profile model_provider from -p

**现象**:
- 启动 `codex -p myprofile app-server`（profile 里 `model_provider = "codex-lb"`）
- 通过 JSON-RPC `thread/start` 建线程
- **返回的 `modelProvider` 是 `"openai"`，不是 profile 配的 `"codex-lb"`**
- 结果：连错 provider → 401 Unauthorized

**关键事实**:
- 同一个 profile 用 `codex exec`（每轮子进程）模式**完全正常**
- 即只影响 app-server / `thread/start` 这一路径
- OpenAI 员工**至今未回复**，issue 仍 Open
- 标签: `bug`

**对插件的影响**: 插件的 app-server 路径（`CodexAppServerTransport.ts` spawn `codex app-server`）即便传 `-p` 或 `-c model_provider=xxx`，thread/start 也会丢掉。**插件层无法绕开，必须等上游修复**。

---

## 3. 插件当前实现（源码核实）

### 3.1 模型切换 — 已实现，入口分散

**入口 1 — Settings → Codex → Connection 的 Model 下拉**
- 文件: `src/features/settings/SettingsCodexSection.ts:300-352`
- 数据源: `CodexAdapter.getModelList()`（优先 app-server `model/list`，回退 `codex debug models` CLI）
- 有 "Custom..." 选项可手动输入任意模型名
- 写入: `CodexBackendSettings.model` → `applyCodexRuntimeUpdates()` → `adapter.updateModel()`

**入口 2 — 会话设置弹窗的 per-session 覆盖**
- 文件: `src/features/chat/ui/ConversationSessionSettingsModal.ts:450-510`
- 字段: `codexModelOverride`
- 同样支持下拉 + Custom 文本输入
- 运行时: `applyCodexRuntimeOverrides` → `adapter.updateModel(overrides.model)`（`OpenCodianView.ts:776-803`）

**透传路径**:
- app-server: `CodexAdapter.ts:1772` — `...(opts.model ? { model: opts.model } : {})`
- SDK exec: `CodexAdapter.ts:2464-2465` — `...(this.options.model ? { model: this.options.model } : {})`

**关键约束 — next-thread boundary**:
- `updateModel()` 只改 `this.options`，**不影响已缓存 Thread**（SDK 冻结 thread options）
- 要让新模型在当前会话生效，需调 `invalidateLiveThread(sessionId)`（`CodexAdapter.ts:1145-1152`）
- **操作建议**: 切模型后新建会话或重启 thread

### 3.2 composer 内联模型选择器 — 故意隐藏

- `CodexAdapter.ts:315-327` 的 `CODEX_CAPABILITIES` **不含 `AgentCapability.Models`**
- `OpenCodianView.ts:941`: `showModels` 受 capability gate → Codex 被隐藏
- `loadModelCatalogData`（`OpenCodianView.ts:1187-1213`）**只有 Claude/OpenCode 两个分支，没有 Codex 分支**
- 对比: `OpenCodeAdapter.ts:74, 277-290` 实现了 `AgentModelCapability`

**文档与实现的偏差**:
- 设计稿 `docs/requirements/multi-agent-foundation/05-codex-adapter.md:28-40` 把 `'models'` 写进了 capability
- **实际代码没落地**——设计文档过期/未实现

### 3.3 第三方 endpoint — 插件不提供 UI

- `CodexBackendSettings`（`src/core/types/settings.ts:182-212`）字段只有: `executablePath, apiKey, model, pricingProviderId, pricingEndpoint, sandboxMode, modelReasoningEffort, additionalDirectories, networkAccessEnabled, webSearchMode, approvalPolicy`
- **没有** `baseUrl` / `provider` 字段
- 第三方连接**唯一入口**是 `~/.codex/config.toml`
- i18n 文案明确（`src/i18n/locales/en.ts:2758-2759`）:
  > "Codex still owns the request endpoint through `model_provider` / `openai_base_url` in `~/.codex/config.toml`."

### 3.4 鉴权来源（3 选 1，优先级递减）

1. 插件 Settings 的 `apiKey`（`CodexBackendSettings.apiKey`）
2. 环境变量 `OPENAI_API_KEY`
3. `codex login` 的 ChatGPT 会话（写 `~/.codex/auth.json`）

### 3.5 关键运行时陷阱（devlog L374 真实案例）

- 用 **ChatGPT 账号**鉴权时，自定义模型名会被拒:
  > "The 'o4-mini-custom' model is not supported when using Codex with a ChatGPT account"
- 用 **API key（含第三方代理）**时，模型名可以是**任意后端接受的字符串**
- **本报告调研的用户场景（第三方 API + 未登录）属于后者**，模型名可自由填写

### 3.6 配置文件归属边界

- 插件**绝不写** `~/.codex/config.toml` / `~/.codex/auth.json`
- G16 (Codex Profiles) 标为 `BLOCKED / CURRENT CONTRACT CHANGED`（`capability-exposure-gap-map-2026-07-23.md:112, 141`）
- 原因: 0.144.1 拒绝 legacy `profile = "name"`，官方 V2 方式是 `$CODEX_HOME/<name>.config.toml` + CLI `--profile`，但 app-server / thread route **没有** profile 选择参数

### 3.7 Windows 特殊处理

全部集中在 `src/core/agents/backend/CodexCliResolver.ts`（207 行），**纯 CLI 二进制发现**，不改变模型/鉴权语义:
- win32 用 `path.win32`、`;` 分隔符
- 解析 `.cmd` npm shim → `@openai/codex-win32-{x64|arm64}/vendor/<triple>/bin/codex.exe`
- 找 `codex.exe` 而非 `codex`
- Windows 与其他平台在模型切换语义上**完全一致**

---

## 4. Codex vs OpenCode 能力对比

| 维度 | OpenCode | Codex |
|------|----------|-------|
| capability 声明 | implements `AgentModelCapability` | **不含** `AgentCapability.Models` |
| composer 内联选择器 | 显示（多 provider 分组） | **隐藏** |
| 模型列表 API | `getAvailableModels` / `getProviderDirectory` 等 | `getModelList()`（诊断/设置用，非 catalog） |
| catalog 系统 | 完整（local/server/merge 三模式） | 扁平 `CodexModelSummary[]` |
| provider 概念 | 多 provider，可切 | 单 provider，无切换 UI |
| base_url 配置 | provider preset / `ANTHROPIC_BASE_URL` | 仅 `~/.codex/config.toml`（插件只读） |
| 切换粒度 | 每 tab / 每 session 切 provider+model | 只透传 model 名，next-thread boundary |
| OAuth/鉴权流程 | `authorizeProviderOAuth` 等 | 无（`codex login` CLI 拥有） |
| 配置文件归属 | 插件可读写 | `~/.codex/config.toml` **插件只读** |

---

## 5. 用户建议的可行性分级

### ✅ 建议 1: 读取全局 config.toml 显示（纯只读摘要面板）

**判定**: 完全可行，低风险高收益

**理由**:
- 纯只读 TOML 解析，零写入风险
- 用户一眼看到"我当前 provider / base_url / 默认 model 是啥"
- i18n 已有相关文案（`en.ts:153` "Read-only: this is a diagnostic view"）
- 与 G16 边界不冲突（G16 禁的是**写**，不是读）

**实现轮廓**: 在 Settings → Codex 下新增"全局配置摘要"卡片，解析 `~/.codex/config.toml`，只读展示 `model_provider` / `openai_base_url` / `model` / 各 provider 的 `base_url`。

### ⚠️ 建议 2: 默认继承全局 + 项目级配置

**判定**: 半可行，受 Codex 官方安全模型限制

**理由**:
- Codex 官方支持项目级 `.codex/config.toml`
- **但官方明确禁止**项目级覆盖 provider / auth / 通知 / 遥测（防止恶意项目劫持凭据）
- 项目级能覆盖的只有: `model`、sandbox、approval_policy、reasoning_effort 等行为参数

**插件层能做的**:
- 在 vault 目录写 `.codex/config.toml`（vault 目录，**不是** `~/.codex/`，不违反"绝不写 ~/.codex/"原则）
- 但只能让用户改 model 和行为参数，**不能让用户在项目级切 provider**

**待敲定**: 是否值得为"多 vault 不同 model/sandbox 配置"做项目级配置 UI？还是把这个能力留给用户手写 `.codex/config.toml`？

### 🔴 建议 3: 手动切 provider

**判定**: 方向正确，但**当前被上游 bug #23417 阻塞**

**理由**:
- 插件主力路径是 app-server（`CodexAppServerTransport.ts` spawn `codex app-server`）
- Issue #23417: app-server 模式下 `thread/start` 忽略 profile 的 `model_provider`
- **即便插件把 `-p` 或 `-c model_provider=xxx` 传给 app-server，thread/start 也会丢掉**
- OpenAI 员工未回复，修复时间未知
- 插件层无法绕开

**可选路径**（需架构评估）:
- 改走 `codex exec` 每轮子进程模式 → profile 正常生效，但这是较大的架构变动
- 等 #23417 修复后再做

### ✅ 建议 4: 手动切模型（已实现，仅入口隐藏）

**判定**: 插件已实现，只是入口藏在 Settings

**理由**:
- `CodexAdapter.updateModel()` 已存在
- Settings 下拉 + 会话设置覆盖都可用
- 只差给 `CODEX_CAPABILITIES` 加 `AgentCapability.Models`，让 composer 显示选择器

**待敲定**:
- 是否给 Codex 加 `AgentCapability.Models`？
- 如果加，需要同步: `OpenCodianView.ts` 的 `loadModelCatalogData` 加 Codex 分支、`CODEX_CAPABILITIES` 声明、设计文档与实现对齐

---

## 6. 待审阅敲定的问题清单

请 Codex 执行者就以下问题给出判定:

1. **全局 config.toml 只读摘要面板**（建议 1）是否进入 roadmap？
   - 优先级建议: 高（低风险纯增益）

2. **Codex 模型选择器暴露到 composer**（建议 4 后半）是否进入 roadmap？
   - 优先级建议: 中（已有能力，纯 UI 暴露，但需评估与 next-thread boundary 的交互说明）

3. **provider 切换**（建议 3）是否进入 roadmap？
   - 优先级建议: 低（依赖上游 #23417 修复）
   - 是否需要预备方案（如 exec 路径评估）？

4. **项目级配置 UI**（建议 2）是否进入 roadmap？
   - 优先级建议: 低（受 Codex 安全模型限制，能力有限）

5. **设计文档与实现的偏差**（`05-codex-adapter.md` 写了 `models` capability 但代码没落地）如何处理？
   - 选项 A: 更新文档，删掉 `models` capability（承认现状）
   - 选项 B: 实现该 capability（落实文档）

---

## 7. 关键文件路径汇总（供执行者核实）

**Codex 适配器与 app-server**:
- `src/core/agents/backend/CodexAdapter.ts` — `getModelList` L611-630, `updateModel` L1182-1187, `invalidateLiveThread` L1145-1152, `CODEX_CAPABILITIES` L315-327, `buildThreadOptions` L2459-2486, `buildAppServerThreadOptions` L1765-1778
- `src/core/agents/backend/CodexAppServerClient.ts` — `listModels` L814-823, `getModelProviderCapabilities` L870-882
- `src/core/agents/backend/CodexAppServerTransport.ts` — app-server 进程/WebSocket 生命周期
- `src/core/agents/backend/CodexCliResolver.ts` — Windows CLI 二进制发现
- `src/core/agents/backend/AgentAdapterWiring.ts` — `wireHiddenAdapters` L54-55 注入 codexSettings.model

**Settings 类型与 UI**:
- `src/core/types/settings.ts` — `CodexBackendSettings` L182-212（无 baseUrl/provider）
- `src/features/settings/SettingsCodexSection.ts` — Model 下拉 L300-352
- `src/features/chat/ui/ConversationSessionSettingsModal.ts` — per-session `codexModelOverride` L450-510
- `src/features/chat/ui/modelSelector/` — composer 内联选择器（Codex 不用）

**Capability 与对比**:
- `src/core/agents/AgentCapability.ts` — `AgentCapability.Models` 定义
- `src/core/agents/backend/AgentService.ts` — `AgentModelCapability` 接口 L190-193
- `src/core/agents/backend/OpenCodeAdapter.ts` — implements `AgentModelCapability` L74, L277-290
- `src/features/chat/OpenCodianView.ts` — `loadModelCatalogData` 无 Codex 分支 L1187-1213, `showModels` capability gate L941, `applyCodexRuntimeOverrides` L776-803

**文档与状态**:
- `docs/requirements/multi-agent-foundation/05-codex-adapter.md` — 设计稿，`models` capability 与实现不符 L34
- `docs/status/capability-exposure-gap-map-2026-07-23.md` — G16 Codex Profiles BLOCKED L112/L141, G9 三方 Provider L137
- `devlog.md` — L374 ChatGPT 账号拒绝自定义模型, L48 G16 profile 阻塞, L2078-2094 Round 2 模型选择器产品化
- `src/i18n/locales/en.ts` — L2758-2759 config.toml 是 provider 唯一入口, L153 modelList 只读说明

---

## 8. 参考来源

**官方文档**:
- [Advanced Configuration — ChatGPT Learn](https://learn.chatgpt.com/docs/config-file/config-advanced)
- [Configuration Reference — ChatGPT Learn](https://learn.chatgpt.com/docs/config-file/config-reference)
- [Developer commands — ChatGPT Learn](https://learn.chatgpt.com/docs/developer-commands)

**上游 issue**:
- [#23417 — app-server thread/start ignores profile model_provider](https://github.com/openai/codex/issues/23417) 🔴 **关键阻塞**
- [#2760 — Config.toml updated keys](https://github.com/openai/codex/issues/2760)
- [#11698 — Allow overriding base URL for OpenAI](https://github.com/openai/codex/issues/11698)

**社区参考**（非权威，仅辅助理解）:
- [MorphLLM — Codex 自定义 Provider 6 步](https://www.morphllm.com/codex-provider-configuration)
- [ofox.ai — Codex CLI 多 Provider 配置](https://ofox.ai/blog/codex-cli-custom-model-providers-byo-setup/)

---

## 附录 A: 用户场景的最小可用配置（Windows + 第三方 API + 未登录）

```toml
# C:\Users\<用户名>\.codex\config.toml

model = "gpt-5.4"                    # 改成第三方 API 支持的模型名
model_provider = "myproxy"

[model_providers.myproxy]
name = "My Third-party Proxy"
base_url = "https://你的第三方地址/v1"
env_key = "OPENAI_API_KEY"
```

PowerShell 永久设置 API key:

```powershell
[Environment]::SetEnvironmentVariable("OPENAI_API_KEY", "sk-你的key", "User")
```

或在插件 Settings → Codex → Connection → API Key 填入（优先级最高，覆盖环境变量）。

排查命令:

```powershell
Test-Path ~/.codex/config.toml
Test-Path ~/.codex/auth.json
codex debug models
```
