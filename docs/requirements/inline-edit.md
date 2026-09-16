# Inline Edit 设计方案

- 状态：**待审查（Draft v2，已处理第一轮审查意见）**
- 日期：2026-09-15（v2 同日修订）
- 前置调研：`docs/requirements/obsidian-linkage.md`（选区上下文链路）、本文件 §2 参考实现调研

## v2 变更记录（对应审查意见）

1. **P0 只读契约**：删除"提示词约束 + 结果校验"降级方案；改为 **fail-closed + 运行时安全证明**（§5.4、§5.5、§12 M1 出口标准）。
2. **P0 生命周期矛盾**：`runAuxQuery()` 一次性接口改为 **`AuxQuerySession` 短生命周期会话对象**（`query`/`followUp`/`cancel`/`dispose`），澄清循环建立在它之上（§5.2、§7.6）；"无持久会话"改写为逐后端可验证的隔离契约（§5.3）。
3. **P1 后端/模型解析**：新增 `InlineEditHost` 宿主契约与后端归一化 `BackendModelSelection`（§5.2、§9）；明确 `editorCallback` 拿不到聊天 tab 的解决路径。
4. **P1 OpenCode 默认方案**：放弃"注入 vault `.opencode` 托管 agent"；改为**隔离执行作用域**，禁止修改用户配置、禁止进入聊天 agent 目录（§5.4）。
5. **P1 XML 契约加固**：转义、长度上限、多标签/未闭合/嵌套的拒绝策略（§6.1、§6.2）。
6. **P1 trace 矛盾**：改为分级记录策略表（§8.4）。
7. **P2 编辑器边界**：补充 Obsidian `Editor` → CM6 `EditorView` 的获取方式与失败策略（§7.4）。
8. **P2 diff 上限**：选区/生成结果大小上限、超限降级、中文分词策略（§7.7）。
9. **P2 范围矛盾**：`@` 提及从实现契约移除，仅保留在 M4 开放问题（§7.4、§13）。
10. **开放问题裁决**：全部落入正文（§5.4、§9、§8.5、§13）。

## 1. 背景与目标

在笔记编辑器内提供 VSCode Copilot Inline Chat 式的行内编辑：选中文字（或定位光标）→ 快捷键唤起内嵌输入框 → 一句自然语言指令 → AI 生成改写 → **编辑器内原位 diff 预览** → 接受/拒绝后落盘。

硬性约束（含审查裁决）：

1. **后端无关**：opencode / claude-code / codex / pi 四个后端全部可用，是验收硬指标。
2. **写回只经由插件自身**（`editor.replaceRange`）。**任何后端只要无法运行时证明"当前 query 没有写文件、Shell、MCP、包管理、子代理等任意写能力"，aux query 通道必须 fail closed，不得运行**。不接受"提示词约束 + 结果校验"作为安全证明。
3. 先审后做：本方案经审查通过后再进入实施。

## 2. 参考实现调研结论

四个项目已浅克隆到本地（只读，勿改）：

| 项目 | 本地路径 | 版本 | 调研价值 |
|---|---|---|---|
| Claudian | `reference-projects/claudian/` | 2c07ee6 (2026-09-14) | 主参考：同赛道插件（Claude/Codex/OpenCode/Pi 后端），CM6 内嵌 UI + 词级 diff + 后端无关 auxiliary 架构 |
| obsidian-copilot | `reference-projects/obsidian-copilot/` | b65a474 (2026-09-14) | 对照：Quick Ask 浮层（React overlay，无 diff，ReplaceGuard 快照校验）+ Composer ApplyView（ItemView + jsdiff 逐块接受） |
| Nova | `reference-projects/nova/` | 7a483d7 (2026-09-13) | 写作向：破坏性流式原地改写 + Smart Revision 审阅卡片（脏检查、风险分级） |
| inplace-diff-view | `reference-projects/inplace-diff-view/` | cf40ca5 (0.1.1) | 纯渲染层：`{old\|new}` 标记语法渲染，对本设计启发有限 |

### 2.1 各家实现选型对比

| 维度 | Claudian（主参考） | obsidian-copilot | Nova |
|---|---|---|---|
| UI 载体 | CM6 `StateField` + widget decoration，输入框插在选区上方 | CM6 ViewPlugin 驱动的 React DOM overlay（挂 `view.dom`，手动 `coordsAtPos` 定位） | 无独立 UI，直接改写编辑器文本 |
| diff 预览 | `Decoration.replace` 原位替换选区，词级 LCS（自研 ~50 行，无依赖）+ ✓/✕ 按钮 | 无（Quick Ask）；Composer 用独立 ItemView + jsdiff 逐块 Accept/Reject | 无（Smart Revision 有卡片式 before/after） |
| 流式 | 否——spinner 转完一次性出 diff | 流式进面板文本 | 破坏性流式：先删选区再逐 chunk 写回 |
| 输出契约 | XML 标签：`<replacement>` / `<insertion>` / 无标签=澄清 | 软约束，响应原文即替换文本 | 软约束 / Smart Revision 用严格 JSON schema |
| 后端抽象 | `ProviderExecutionBackend` + 共享 `InlineEditService`（master 现状），5 个 provider 各实现 session 创建 | LangChain 直连各家 API | provider 管理器直连 |
| 只读约束 | 独立 `opencode acp` 子进程 + 托管 agent 权限配置 + interaction port 一律拒绝 | 无（模型直出文本，不给工具） | 无 |
| 防陈旧 | decoration `map(tr.changes)` 跟随 | ReplaceGuard：替换前比对快照内容，6 项校验 | 快照字符串全等比对，变了拒绝应用 |
| 多轮 | 澄清循环：无标签回复显示在输入框上方，可续聊 | 完整多轮聊天面板 | 否 |

### 2.2 关键取舍结论

- **UI 走 Claudian 路线**（CM6 内嵌 widget + `Decoration.replace` 词级 diff）。copilot 的 React overlay 需自管定位/拖拽/resize（875 行 UI 代码），重且收益不大；Modal 路线交互割裂，放弃。
- **MVP 不做流式 diff**；破坏性流式（Nova 先删后写）与"可审阅"目标冲突，放弃。
- **脏检查必须做**（Nova/copilot 共识）：接受前比对选区原文快照，不一致则拒绝应用并提示。
- **只读约束必须在后端层硬保证**，且必须是运行时机制（权限/沙箱/无工具会话），不能只靠提示词。
- **澄清循环保留**（Claudian）：模型返回无标签文本 = 问答/澄清，可继续对话；inline edit 因此天然兼具"选中提问"能力。

## 3. 现状与差距

- [src/main.ts:623](../../../src/main.ts) 已注册 `inline-edit` 命令，但是 stub（弹 Notice，留 TODO）。这是现成挂点。**注意 `editorCallback` 只能拿到 `Editor` 与 `MarkdownView`**，拿不到聊天视图/活动 tab——后端与模型解析需要显式的宿主契约（§5.2、§9）。
- 已有可复用基建：
  - [src/utils/editorSelectionHighlight.ts](../../../src/utils/editorSelectionHighlight.ts)——CM6 `StateField`+`Decoration.mark` 选区高亮，与 Claudian 的 `SelectionHighlight` 同款机制。
  - 选区上下文链路（`addSelectionContextFromActiveEditor`，带行号+文本快照）。
  - [TitleGenerationService](../../../src/features/chat/services/TitleGenerationService.ts)——一次性辅助任务的现有范式，**但它 AI 起名只支持 opencode**（其他后端退化为默认标题）——正是本次要避免的模式。
  - 后端统一抽象 `AgentService` + 可选能力接口（`AgentChatCapability` 等）。**注意现有惯例：能力接口与 `AgentService` 是"adapter 并列实现 + capability 集合 + 类型守卫收窄"，而非继承扩展**——新接口遵循同一惯例。
  - `AgentServiceRegistry`（`getAgentServiceRegistry()`）可解析活跃 adapter。
  - `ModelConfigService` + `parseModelReference`/`resolveModelSelection` 模型解析（仅覆盖 opencode 语义的 provider/model 目录，不能直接代表全部后端，见 §9）。
- 差距：无一次性辅助查询的后端无关通道；无 diff 计算/渲染；无 inline edit 服务与 UI。

## 4. 总体架构

三层，自顶向下后端无关性递增：

```
┌─────────────────────────────────────────────────────────┐
│ UI 层  src/features/inline-edit/ui/                      │
│   InlineEditController  CM6 StateField/Effect/widget     │
│   InlineEditDiffWidget  Decoration.replace + 词级 diff   │
│   （完全不感知后端）                                      │
├─────────────────────────────────────────────────────────┤
│ 服务层 src/features/inline-edit/InlineEditService.ts     │
│   提示词契约、响应解析、澄清循环、取消、脏检查             │
│   InlineEditPrompt.ts   系统提示词 + prompt 构建（zh/en） │
│   InlineEditHost.ts     后端/模型解析宿主契约（§5.2、§9）  │
│   （只依赖下方能力接口，不感知具体后端）                    │
├─────────────────────────────────────────────────────────┤
│ 能力层 src/core/agents/                                  │
│   AgentAuxQueryCapability（新接口，§5）                   │
│   OpenCodeAdapter / ClaudeCodeAdapter / CodexAdapter /   │
│   PiAdapter 各自实现短生命周期只读会话                     │
└─────────────────────────────────────────────────────────┘
```

## 5. 能力层设计（核心决策 1：后端无关通道）

### 5.1 决策：新增 `AgentAuxQueryCapability`，不复用 `sendMessage`

- **A. 复用 `AgentChatCapability.sendMessage()`**：system prompt / 工具约束 / 模型覆盖在各后端 `options` 里语义不统一；聊天会话会进历史、触发标题生成与同步事件；取消语义面向聊天 turn。否决。
- **B.（采纳）新增可选能力接口**：辅助查询通道，语义独立。与 Claudian master 的 `ProviderExecutionBackend` + 共享服务架构一致，也为后续 title generation 统一、指令润色等留路。
- 接口形态遵循现有惯例：独立接口 + `AgentCapability.AuxQuery` 能力标识 + 类型守卫收窄，不修改 `AgentService` 本体。

### 5.2 接口草案（v2：短生命周期会话对象）

一次性 `runAuxQuery()` 与澄清循环矛盾（审查 P0），改为显式会话对象：

```ts
// src/core/agents/backend/AgentAuxQueryCapability.ts（新文件）

/** 后端归一化模型引用（审查 P1：不强加统一 provider/model 结构）。 */
export type BackendModelSelection =
  | { kind: 'opencode' | 'pi'; provider: string; model: string }
  | { kind: 'claude-code'; model: string }            // SDK alias 或完整 id
  | { kind: 'codex'; model: string; reasoningEffort?: string };

export interface AuxQueryTurnRequest {
  readonly prompt: string;
  readonly signal?: AbortSignal;
  /** 流式文本回调（累计文本）。MVP 用于 spinner 状态，后续支持流式 diff。 */
  readonly onTextChunk?: (accumulatedText: string) => void;
}

export type AuxQueryResult =
  | { success: true; text: string; toolCalls: readonly AuxObservedToolCall[] }
  | { success: false; error: string; cancelled?: boolean };

export interface AuxObservedToolCall {
  readonly name: string;
  readonly kind?: string;
}

/** 运行时安全证明（审查 P0：fail-closed 的证据载体）。 */
export interface AuxQuerySafetyProof {
  readonly backend: AgentBackendKind;
  /** 'none' = 会话无任何工具；'read-only-allowlist' = 仅只读工具白名单。 */
  readonly enforcedPolicy: 'none' | 'read-only-allowlist';
  /** 运行时实际生效的工具目录（来自后端原生枚举/配置回读，非请求参数）。 */
  readonly effectiveTools: readonly string[];
  /** 被显式拒绝或不存在的能力类别：write/shell/mcp/package/subagent 等。 */
  readonly deniedCapabilities: readonly string[];
  /** 机制描述（如 'codex read-only sandbox' / 'sdk allowedTools=[Read,Grep]'）。 */
  readonly mechanism: string;
}

export interface AuxQuerySession {
  readonly queryId: string;
  readonly safety: AuxQuerySafetyProof;
  /** 首轮。 */
  query(request: AuxQueryTurnRequest): Promise<AuxQueryResult>;
  /** 澄清循环续轮；复用后端原生会话状态（仅内存/临时态）。 */
  followUp(prompt: string, request?: Partial<AuxQueryTurnRequest>): Promise<AuxQueryResult>;
  /** 幂等取消当前轮。 */
  cancel(): void;
  /** 幂等清理：销毁后端临时会话/线程/进程，清除原生残留。 */
  dispose(): Promise<void>;
}

export interface AgentAuxQueryCapability {
  /**
   * 创建短生命周期只读辅助会话。契约：
   * 1. 无法运行时证明只读（§5.5）时必须 reject（fail closed）；
   * 2. 隔离契约见 §5.3；
   * 3. 会话原生状态只允许存在于内存/临时目录，dispose 必须清理。
   */
  startAuxQuerySession(config: {
    systemPrompt: string;
    model?: BackendModelSelection;
    workingDirectory: string;
  }): Promise<AuxQuerySession>;
}
```

能力注册：`AgentCapability` 新增 `AuxQuery: 'aux-query'`。四个 adapter **全部实现是验收硬指标**；调用侧仍按可选能力收窄，缺失时 UI 置灰并提示（防御性分支，正常不应发生）。

**宿主契约**（解决 `editorCallback` 拿不到聊天上下文的 P1）：

```ts
// src/features/inline-edit/InlineEditHost.ts
export interface InlineEditHost {
  /** 当前聊天活动 tab 的后端；无聊天视图/无 tab 时为 registry 活跃 adapter。 */
  resolveBackendKind(): AgentBackendKind;
  /** 后端归一化模型：设置覆盖 → 活动 tab 模型 → null（后端用默认）。 */
  resolveModel(kind: AgentBackendKind): BackendModelSelection | null;
  /** 取 adapter 的 AuxQuery 能力；缺失返回 null（调用侧置灰）。 */
  getAuxQuery(kind: AgentBackendKind): AgentAuxQueryCapability | null;
}
```

实现挂在 plugin 主类上（它持有 chat view 引用与 registry），`InlineEditController` 只依赖此接口，可测。

### 5.3 隔离契约（"临时会话"不等于无副作用）

`createSession()` + `deleteSession()` 不足以保证隔离。每个后端的 `startAuxQuerySession` 实现必须满足并在 §12 M1 逐项验证：

| 副作用面 | 契约 |
|---|---|
| 聊天历史/会话列表 | aux 会话不得出现在插件会话列表、后端历史读取、续聊入口；若后端原生必然产生记录，dispose 必须删除并验证不可见 |
| 聊天事件流 | 不得触发 tab 的消息同步、标题生成、通知、后台任务状态 |
| 后端原生残留 | OpenCode session（deleteSession 后确认不可列出）/ Codex thread（关闭或归档）/ Pi `.pi/opencodian-sessions` 本地状态（删除）/ Claude SDK 进程（终止），dispose 后逐项清理 |
| 诊断通道 | 不进聊天 trace；只进独立的 aux trace 通道且遵守 §8.4 分级策略 |
| 配置面 | 不得修改用户任何配置文件（vault `.opencode`、`~/.claude`、`~/.codex`、`~/.pi` 等） |

### 5.4 四后端实现矩阵（v2）

| 后端 | 会话通道 | system prompt 注入 | 只读硬约束机制 | 模型覆盖 | M1 验证项 |
|---|---|---|---|---|---|
| opencode | **隔离执行作用域**：临时配置目录（插件运行时目录或系统临时目录）+ 独立 serve 实例或独立配置作用域的临时 session；**禁止写 vault `.opencode`，禁止进入聊天 agent 目录**（审查裁决） | prompt 请求 `system` 字段 | 隔离配置内定义 read-only agent（deny write/edit/patch/task/shell/mcp）；启动后**回读生效配置**确认 | 请求级 model（provider+model） | 隔离作用域可行性；生效配置回读路径；对聊天服务器零影响 |
| claude-code | agent-sdk `query()`，进程/会话态仅内存持有，followUp 用 SDK resume | SDK `systemPrompt` | **inline 专用 `tools` 白名单（Read/Grep/Glob/WebSearch/WebFetch）——比 `allowedTools` 更严：工具直接从模型工具集缺席，而非靠 canUseTool 拦截；`disallowedTools` 二次剔除写类；`strictMcpConfig` 断掉 MCP；`canUseTool` 兜底拒绝**；`settingSources` 保留用户配置（凭据所在）；权限请求一律拒绝；禁止 bypass | SDK `model` | CLI `system/init` 回读 tools/mcp_servers/permissionMode（实测通过）；诊断路径的 bypass 选项不得泄漏进 aux 路径 |
| codex | app-server **ephemeral thread（自带生命周期，无需也不得 archive/close——archive 会把残留显式化，与隔离契约相反）** | thread/turn 指令注入点 | `read-only` sandbox + 审批一律拒绝；**验证 sandbox 实际生效而非仅参数已发送** | thread 级 model（+effort） | ephemeral thread 生命周期/成本；sandbox 生效证据 |
| pi | `PiRpcClient` 短会话，dispose 删除 `.pi/opencodian-sessions` 残留 | pi 指令通道 | **不接受提示词降级**（审查裁决）：必须找到真实的无工具/只读 allowlist（如会话级工具配置），否则该后端 M1 失败并如实上报 | RPC 参数（provider+model） | pi 协议的工具约束能力（M1 首个验证项，信息最少） |

### 5.5 fail-closed 规则与运行时审计

1. `startAuxQuerySession` 在无法构造满足 §5.3/§5.4 的会话时**必须 reject**，UI 显示原因，不静默降级。
2. 每次 query 返回的 `AuxQueryResult.toolCalls` 记录后端原生事件中观察到的工具调用；服务层断言**不含任何写类工具**（write/edit/patch/shell/mcp/package/subagent），命中即丢弃结果、dispose 会话、报错。**codex 特例（追认为有意从严）**：read-only sandbox 内仍存在 shell 工具，任何 shell 执行按写类处理直接丢轮——sandbox 理论上已禁写，但宁可丢一轮也不静默放行执行。
3. M1 出口标准（§12）包含运行时证明五项：实际生效工具目录、实际发起的工具调用、写工具被拒绝或不存在、query 前后 vault 文件系统快照无变化、不接受提示词约束作为证据。

## 6. 提示词契约（核心决策 2）

采用 Claudian 验证过的 XML 标签协议，本地化重写系统提示词（zh/en 两份，跟随 `settings.locale`），并按审查意见加固。

### 6.1 输入格式（含加固规则）

选区模式：

```
用户指令

<editor_selection path="笔记路径" lines="3-9">
选区原文
</editor_selection>
```

光标模式（行内 `#inline` / 段落间 `#inbetween`，`|` 标记光标位）：

```
用户指令

<editor_cursor path="笔记路径" line="12">
前文|后文 #inline
</editor_cursor>
```

加固规则：

- **属性转义**：`path` 属性值转义 `&` `"` `<` `>`。
- **正文原样嵌入**，但选区/上下文文本若包含字面量 `</editor_selection>`（或对应闭合标签），该次唤起直接报错拒绝（不尝试转义发明新协议）。
- **长度上限**：选区 ≤ 20,000 字符（超出拒绝并提示）；注入的周边上下文（如有）总计 ≤ 40,000 字符；路径 ≤ 500 字符。
- 不注入 vault 全文——模型需要更多上下文时通过只读工具自行读取（系统提示词要求先读再改）。

### 6.2 输出契约与解析严格规则

- `<replacement>替换文本</replacement>` —— 改写选区
- `<insertion>插入文本</insertion>` —— 光标处插入
- 无标签纯文本 —— 视为问答/澄清，进入澄清循环（§7.6）

解析器规则（全部可单测）：

1. 响应**必须有且只有一个**顶层 `<replacement>` 或 `<insertion>` 标签；出现多个同类/异类顶层标签 → 拒绝应用，按错误处理。
2. 标签未闭合（流被截断）→ 报错，允许重试。
3. 标签嵌套同名标签 → 拒绝。
4. 标签内容**原样保留**（不反转义——输入侧未转义，模型按原文输出；仅去首尾空行，见 §7.5）。
5. 生成结果 ≤ 40,000 字符，超出拒绝。
6. 空响应报错。

系统提示词要点（完整文案实施时编写）：风格模仿；只读工具静默使用；**输出只能是标签内容或回答**（列举禁止的元评论句式）；散文 vs 代码差异化处理；澄清要简短具体；模型不得输出协议标签以外的任何标记。

### 6.3 为什么不用 unified diff 或 JSON

- unified diff：模型生成行号/hunk 头不稳定，解析脆；inline edit 粒度小，词级 diff 由前端计算更准。
- JSON schema：长文本转义易破坏格式；XML 标签对模型更宽容。

## 7. 编辑器 UI 设计（核心决策 3：Claudian 式 CM6 内嵌）

### 7.1 触发入口

1. 命令 `inline-edit`（`editorCallback`，替换现有 stub），用户自绑快捷键；
2. 编辑器右键菜单项（`editor-menu` 事件）；
3. `editorCallback` 天然保证只在有编辑器时可用（Reading mode 不出现）。

唤起时通过 `InlineEditHost`（§5.2）解析后端与模型：**取当前聊天活动 tab 的后端/模型；聊天视图未打开或无 tab 时，取 registry 活跃 adapter 及其默认模型**。OpenCodian 是单聊天视图模型，不需要"编辑器 leaf → 聊天 tab"的映射；活动 tab 即全局唯一焦点。解析失败（后端未就绪、无 AuxQuery 能力）→ Notice 并中止。

### 7.2 三种唤起形态

| 形态 | 判定 | 悬浮条锚点 | 输出 |
|---|---|---|---|
| selection | 有选区 | 选区起点下方 | `<replacement>` → diff 预览 |
| cursor-inline | 无选区、行内有文本 | 当前行下方 | `<insertion>` → 插入预览 |
| cursor-inbetween | 光标在空行/段落间 | 光标行下方 | `<insertion>` → 插入预览 |

### 7.3 状态机

```
idle → input（悬浮指令条 + 选区高亮）
     → generating（spinner，输入禁用，Esc 取消）
     → diff（Decoration.replace 原位词级 diff + ✓/✕）
     → applied / rejected → idle
     ↳ clarification（agent 回复显示在输入框上方，可续聊）→ generating → …
     ↳ error（错误显示在输入框 placeholder，可重试）→ input
```

### 7.4 CM6 实现要点（含编辑器边界契约）

- **EditorView 获取**：`getEditorView(editor)` 读 `(editor as { cm?: EditorView }).cm`（Claudian、copilot 均用此内部字段；Obsidian 自 1.0 起 CM6 稳定）。**获取失败 = 功能不可用**：Notice 提示并中止，不做任何兜底猜测。这是未文档化但事实稳定的内部 API，升级 Obsidian 后在手动验收清单中回归验证。
- **选区快照**：`editorView.state.doc.sliceString(from, to)`（不用 `editor.getSelection()`——copilot 证实后者有 CRLF 坑）。快照失败同样中止。
- 预览：一个 `StateField<DecorationSet>` + 两个 `StateEffect`（showPreview / hide）驱动（`InlineEditWidgets`）；装饰 `map(tr.changes)` 跟随文档编辑；**不在 `update()` 内 dispatch**（copilot 注释证实的冲突模式）。
- **输入为悬浮面板**（`InlineEditInputOverlay`，2026-09-16 修订）：不再用 block widget 挤开正文。面板绝对定位于 `view.dom`、锚在锚点下方（`coordsAtPos` 减 `view.dom` 视口偏移后钳制），滚动跟随、文档变更经全局 `updateListener` + WeakMap 重映射锚点；测量只在 rAF 内。
- **取消路径**：任意焦点下 Escape（文档捕获态；菜单打开时先关菜单）、面板外 pointerdown、焦点移出面板（`focusout` 且 relatedTarget 在面板外；窗口切换不取消）、面板 ✕ 按钮。输入阶段与生成阶段均适用。
- **模型/努力程度选择器**：面板顶部两个 chip。模型列表按后端取（opencode=合并目录、claude=`supportedModels()`、codex=`getModelList()`、pi=无列表仅显示当前值）；选项格式同 `inlineEditModelOverrides`，选择即写回该设置（`null`=跟随聊天模型）。努力程度仅 claude（`low..max`）与 codex（`minimal..persistent`）显示，写回 `inlineEditEffortOverrides`，经 `AuxQuerySessionConfig.effort` 下发（claude→SDK options.effort，codex→turn/start effort）；会话启动后 chip 禁用（改动只影响下一次唤起）。
- `installedEditors: WeakSet<EditorView>` 保证每个 EditorView 只注入一次 field。
- 全局单例 controller：同时只允许一个 inline edit；唤起新的先拒绝旧的。
- DiffWidget：`Decoration.replace` 覆盖选区，DOM 内渲染词级 diff span + ✓/✕ 按钮；Enter=接受、Esc=拒绝挂在 ownerDocument；**键盘判定带 `!e.isComposing`**（中文输入法保护）。
- **重新划选：本期未实现**（原设计"生成前允许重新划选"延期；生成期间文档被改动由接受时脏检查拒绝兜底，已实测验证）。
- **`@` 提及：本期不做**（从实现契约移除，M4 开放问题再议）。
- 输入为单行 `input`，placeholder 区分形态（"编辑指令…"/"插入指令…"）；Enter 提交、Shift+Enter 不拦截。

### 7.5 接受/拒绝与落盘

- **接受**：装饰映射后的当前位置换算回 Obsidian line/ch → **先脏检查**（当前选区文本与快照全等比对；不一致 → Notice 拒绝应用，Nova/ReplaceGuard 模式；生成期间文档被用户改动也走同一路径）→ `editor.replaceRange(text, from, to)`（单次事务，Ctrl+Z 可撤）。
- **拒绝**：清装饰、恢复选区高亮、`session.cancel()` + `dispose()`。
- 插入/替换模式：`normalizeInsertionText` 去**首尾**空行后写入（内部空行与首行缩进保留；replacement 同样归一化，避免模型在标签内包裹的换行落入笔记）。

### 7.6 澄清循环（建立在 AuxQuerySession 上）

模型返回无标签文本 → 显示在输入框上方回复区 → 输入框恢复输入 → 用户回复走 **`session.followUp()`**（复用后端正持有的原生会话状态）。每次新唤起 inline edit 创建新 `AuxQuerySession`；UI 关闭（无论 accept/reject/Esc）必须 `dispose()`。

### 7.7 diff 计算上限与中文策略（审查 P2）

- 词级 LCS 为 O(n×m)：仅当 `选区 ≤ 20,000 字符 且 生成 ≤ 40,000 字符 且 token 数乘积 ≤ 4×10⁶` 时启用；超限降级为**整段 before/after 确认视图**（原样展示新文本 + ✓/✕，不渲染 diff）；硬性上限外拒绝。
- 分词：正则将输入切为 空白run / 单个 CJK 字符（`[\u2e80-\u9fff\uf900-\ufaff]` 等区块）/ 标点 / 其他连续非空白序列——中文按字对齐，英文按词对齐，混合文本自然兼容。
- 空白与换行作为独立 token 参与对齐，保证 markdown 结构（列表、代码块围栏）不被重排。

## 8. 安全

### 8.1 写屏障

后端只读硬约束（§5.4）+ fail-closed（§5.5）是唯一写屏障；提示词只是质量层，不是安全层。

### 8.2 落盘安全

接受前脏检查（§7.5）；接受走编辑器事务，Obsidian 原生 undo 兜底。

### 8.3 审计

`AuxQueryResult.toolCalls` 断言无写类工具调用（§5.5）；命中即丢弃结果并报错。

### 8.4 诊断 trace 分级策略（解决矛盾）

| 内容 | 策略 |
|---|---|
| queryId、backend、model、耗时、终态、取消原因、`AuxQuerySafetyProof` | **默认允许**记录（现有诊断生命周期） |
| 工具调用名列表（不含参数） | 默认允许 |
| 用户指令原文、选区原文、模型回复原文 | **默认禁止**；仅在用户在诊断设置中显式开启 aux 调试采集时记录，走现有 redaction 规则与存储生命周期，设置 UI 明示风险 |

### 8.5 用量统计（审查裁决）

inline edit **不计入**插件的会话消息、tab context usage、标题生成与插件内成本统计；设置/文档中明示这**不代表供应商侧不计费**。

## 9. 设置项与模型解析（v2：后端归一化）

新增设置（`src/core/types/settings.ts` + 设置 UI + 双语 locale）：

| 设置 | 默认 | 说明 |
|---|---|---|
| `inlineEditEnabled` | true | 总开关（关闭时命令不可用、菜单项隐藏） |
| `inlineEditModelOverrides` | `{}` | **按后端键控**：`Partial<Record<AgentBackendKind, string>>`，值格式随后端（opencode/pi: `provider/model`；claude-code: SDK alias 或完整 id；codex: model 字符串）。设置 UI 按当前后端展示对应输入项 |

模型解析顺序：`inlineEditModelOverrides[kind]` → 当前聊天活动 tab 的模型（经 `InlineEditHost`，归一化为 `BackendModelSelection`）→ `null`（后端用各自默认）。**显式配置但格式非法 → Notice 报错并中止，不静默切换**（审查裁决）。**可用性目录校验本期未接线**（`InlineEditPluginHost` 预留了 `isModelAvailable` 同步钩子，但目录查询是异步的，接线需要缓存改造）：配置了目录中不存在的模型会在后端查询期以错误形式如实失败（fail loudly），列为后续迭代项。

## 10. 模块划分与 owner

新增 owner `feature.inline-edit`（`architecture-owners.config.json` 注册 + `docs/modules/features/inline-edit/` 文档）：

```
src/features/inline-edit/
  InlineEditController.ts    # CM6 状态机、widget、单例管理
  InlineEditDiff.ts          # 分词 + LCS diff + DiffWidget 渲染（纯函数可测）
  InlineEditService.ts       # 后端无关服务：会话编排、解析、澄清循环、脏检查、取消
  InlineEditPrompt.ts        # 系统提示词（zh/en）+ prompt 构建 + 响应解析（纯函数可测）
  InlineEditHost.ts          # 宿主契约接口（实现挂 plugin 主类）
src/core/agents/backend/AgentAuxQueryCapability.ts  # 新能力接口（§5.2）
```

改动面：

- `src/core/agents/AgentCapability.ts`：+`AuxQuery`
- 四个 adapter 各 +`startAuxQuerySession` 实现（opencode 侧含隔离执行作用域的创建/销毁）
- `src/main.ts`：替换 stub 命令 + 右键菜单注册 + host 实现装配
- `src/core/types/settings.ts` + `OpenCodianSettings.ts` + `zh.ts`/`en.ts`：设置项
- `src/style/features/inline-edit.css`：diff 红绿、输入框、spinner（styles.css 走现有构建合并）
- `architecture-owners.config.json` + `docs/modules/**`：owner 与模块文档
- `AGENTS.md`：Current Architecture 加一段 inline-edit 条目

## 11. 测试计划

单元测试（纯函数层，不依赖 Obsidian）：

- prompt 构建：四形态、行号、路径属性转义、闭合标签冲突拒绝、长度上限
- 响应解析：唯一顶层标签、多标签拒绝、未闭合、同名嵌套拒绝、澄清、空响应、内容原样保留
- 分词与 diff：等价、纯插入、纯删除、混合、中英文混排、代码块/列表结构保留、超限降级判定
- 脏检查比对、replacement/insertion 首尾空行归一化
- `BackendModelSelection` 归一化与设置覆盖解析

安全审计测试（M1，每后端）：

1. 启动 aux 会话，回读**实际生效工具目录**与 `AuxQuerySafetyProof` 一致；
2. 用诱导性指令（"把结果写入 xx.md"）驱动模型，断言**观察到的工具调用无任何写类**且结果走 `<replacement>` 返回；
3. query 前后对 vault 做文件系统快照比对，**无变化**；
4. dispose 后对应原生残留（session/thread/进程/`.pi` 状态）不可见。

手动验收（每后端 × 每形态）：

- opencode / claude-code / codex / pi × selection 改写 → diff → 接受 / 拒绝 / Esc 取消 / 澄清续聊
- 中文输入法组合态 Enter/Esc 不误触
- 生成期间改动笔记 → 接受时拒绝落盘并提示
- 聊天视图未打开时唤起 → 正确落到活跃后端与默认模型
- Obsidian 升级后回归 `editor.cm` 获取路径

## 12. 里程碑

| 里程碑 | 内容 | 出口标准 |
|---|---|---|
| M1 技术验证 | 四后端 `startAuxQuerySession` 最小实现 + 只读机制落地 | **§11 安全审计四项全部通过（四后端逐一）**；任一后端无法运行时证明只读 → 该后端 fail closed 并如实上报，不进入 M2 伪装通过 |
| M2 核心闭环 | CM6 UI + selection 模式 + diff + accept/reject + 脏检查（opencode 先行） | 选区改写全流程可用 |
| M3 全后端 | claude/codex/pi 接入 + cursor 两形态 + 澄清循环（followUp） | 四后端 × 三形态全通 |
| M4 收尾 | 设置项、右键菜单、locale、文档/owner/devlog、`npm run verify` 绿 | 合并就绪 |

明确不做（后续迭代再议）：流式 diff 预览、逐块 accept/reject、Copilot Edits 式多文件改动、inline completions（ghost text）、`@` 提及。

## 13. 风险与开放问题

| 风险/问题 | 等级 | 应对 |
|---|---|---|
| opencode 隔离执行作用域的可行性（独立配置/独立 serve 对现有 ServerManager 的影响） | 高 | M1 首验；不满足 §5.3/§5.4 则 fail closed |
| pi 后端的工具约束能力未知，可能无法证明只读 | 高 | M1 次验；不允许提示词降级；失败则如实上报 |
| codex 临时 thread 启动成本影响唤起速度 | 中 | 必要时预热或复用 ephemeral thread（dispose 语义不变） |
| 模型不遵守 XML 契约 | 中 | §6.2 严格解析 + 无标签按澄清处理（不盲替换） |
| 中文 diff 粒度 | 中 | §7.7 按字分词，用例覆盖 |
| `editor.cm` 内部 API 随 Obsidian 版本变动 | 低 | 获取失败即停用 + 升级回归清单 |
| Obsidian 事务冲突 | 低 | effect 驱动，不在 update 内 dispatch |
| **已裁决**：token 统计 → 不计入插件统计，明示供应商侧照常计费（§8.5） | — | — |
| **已裁决**：模型选择 → 后端归一化 + 显式不可用即失败（§9） | — | — |
| **已裁决**：`@` 提及 → 本期不做，移出实现契约 | — | — |
| 遗留开放：`inlineEditModelOverrides` 的设置 UI 形态（每后端一个输入项 vs 仅当前后端） | — | M4 定 |
