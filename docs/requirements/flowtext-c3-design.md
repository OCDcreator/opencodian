# R-C3 Alt 一键补全（ghost text）— 实施前设计

> 需求基准：`docs/requirements/flowtext-parity.md` §5 R-C3（约 :621-657）
> 共享约束：`docs/requirements/flowtext-parity-impl-plan.md` §1；需求文档 §6（尤其 §6.1 只读辅助契约不得削弱）
> 已裁决（不再重议）：本条的架构难点是**新的会话生命周期契约**——长驻/预热的只读会话，与既有 aux 会话"每次编辑新建、退出即 dispose"（`docs/requirements/inline-edit.md` §5）并存且互不削弱；ghost text 只能用 `Decoration.widget` + `EditorView.atomicRanges`，禁止 `Decoration.replace`。

---

## 1. 目标与范围

**目标**：光标处按 Alt（可改绑/关闭）→ 基于光标前文生成"完善当前句子或段落"的补全建议，以 ghost text 显示（不进文档、不动 undo 栈）；Tab 接受（单步撤销）、Esc 忽略、继续输入自动消失并取消在途请求。默认关闭（`inlineCompletionEnabled`）。

**范围内**：

1. 新的 `AgentInlineCompletionCapability` 契约 + 四后端实现（复用各自 aux 只读机制，不复制不放宽）。
2. 补全会话池（预热、TTL、中止、处置）——本文档核心。
3. CM6 ghost text 层（widget 装饰、atomicRanges、Tab/Esc/键入竞争、IME 守卫）。
4. 独立的补全输出契约（提示词 + 校验），与行内编辑 XML 契约隔离。
5. §7 设置项：`inlineCompletionEnabled`（默认 `false`）、`inlineCompletionMaxChars`（建议 300）；2026-09-19 起另加 `inlineCompletionModelOverrides`（补全专用每 backend 模型覆盖，默认 `{}` = 继承既有解析链）。

**明确不做（§11 适用）**：

1. 不做 Copilot 式自动触发（停顿即补全）——本条只做显式 Alt 触发（`docs/requirements/inline-edit.md:451` 把 ghost text 列为"后续迭代再议"，本条是该迭代的最小形态，不扩大）。
2. 不做逐块 accept/reject、多轮对话式补全、整篇续写（需求 4 明确"不是一次性续写整篇"）。
3. 不做补全结果的学习/缓存/跨会话复用。
4. 不削弱既有 `AgentAuxQueryCapability` 契约与 `run-aux-query-audit` 门禁（§6.1）。

---

## 2. 现状证据（本分支已逐条核实，2026-09-18）

| 需求文档声称 | 本分支实际情况 | 结论 |
|---|---|---|
| 全仓库无 ghost text / inline completion 实现 | 属实：`rg -i "ghost|inlineCompletion"` 无任何命中；`src/features/inline-edit/` 无相关文件 | 准确 |
| `inline-edit.md:451` 把 ghost text 列为明确不做项 | 属实：该行原文"明确不做（后续迭代再议）：流式 diff 预览、逐块 accept/reject、Copilot Edits 式多文件改动、inline completions（ghost text）、`@` 提及" | 准确（行号精确命中） |
| 辅助查询通道每次唤起新建会话、退出即 dispose | 属实：`InlineEditService.ts:4-6`（类注释"create one `AuxQuerySession` per inline edit and dispose it on every exit path"）；`dispose()` `:118-126`；turn 失败/写工具命中即 dispose（`:187`、`:194`）；每个 `ActiveEdit` 持有独立 `service`（`InlineEditController.ts:109`） | 准确——这是与补全延迟要求冲突的契约核心 |
| 契约位置 `AgentAuxQueryCapability.ts:106-122`、`findWriteToolCalls` `:177-193` | **行号漂移**：`startAuxQuerySession` 现在在 `:135-147`；`AuxQuerySession`（query/followUp/cancel/dispose）`:97-115`；`AuxQuerySafetyProof` `:79-89`；`AUX_DENIED_CAPABILITIES` `:154-162`；`findWriteToolCalls` `:202-218` | 语义不变，引用需更新 |
| 后端各自的只读机制 | 属实且可直接复用：OpenCode——隔离 scope（`OpenCodeAuxScope`，"Shared isolated scope; started on first use and **reused across sessions**"，`OpenCodeAuxQuerySession.ts:40-41`）+ 只读 agent + dispose 删会话；Claude——`tools` 白名单 + `strictMcpConfig` + `canUseTool` + `system/init` 运行时读回（`ClaudeCodeAuxQuerySession.ts:9-17`）；Codex/Pi 各有对应实现（`CodexAuxQuerySession.ts`、`PiAuxQuerySession.ts`） | 关键利好：OpenCode scope 已原生支持"跨会话复用"，长驻会话有现成地基 |
| CM6 能力 | `InlineEditWidgets.ts` 已用 `Decoration.widget`（`:87`）/`Decoration.replace`（`:93`）/`WidgetType`（`:230`）；`editor.cm` 获取有成熟封装（`InlineEditEditorView.ts:5`，undocumented but stable）；R-A1 的 `inputHandler` 门控 precedent 完整（`InlineEditAtTrigger.ts:56-61, 75-95`：注册一次、逐次调用 `canTrigger()` 门控、`view.composing` 守卫） | 全部可复用 |
| 插件注册面 | `main.ts:817-843` 既有 4 个 `registerEditorExtension`；`active-leaf-change`/`layout-change` 已驱动 `pruneDetachedEdits()`（`:848-853`）——会话池的编辑器生命周期钩子有现成事件面 | 可复用 |

---

## 3. 技术方案

### 3.1 Owner 归属（inspect:owner 实测结果）

| 模块 | Owner | 依据 |
|---|---|---|
| `src/core/agents/backend/AgentInlineCompletionCapability.ts`（新，契约 + 共享审计函数） | `core.backend`（与 `AgentAuxQueryCapability.ts` 同目录同 owner，实施时以 `inspect:owner` 为准） | 后端能力契约属于 backend 契约层 |
| 四后端会话：`auxiliary/OpenCodeInlineCompletionSession.ts`、`auxiliary/ClaudeCodeInlineCompletionSession.ts`、`auxiliary/CodexInlineCompletionSession.ts`、`pi/PiInlineCompletionSession.ts`（新） | `core.backend` / `core.backend-pi` | 与对应 aux 会话同 owner；**组合**既有 scope/queue/runtime 原语，只读机制零复制零放宽 |
| `src/features/inline-edit/InlineCompletionService.ts`（会话池）、`InlineCompletionController.ts`（状态机）、`InlineCompletionGhost.ts`（CM6）、`InlineCompletionPrompt.ts`（输出契约）、`InlineCompletionTrigger.ts`（Alt 手势） | `feature.inline-edit` | 允许依赖 `shared.foundation, shared.i18n, shared.utils-misc, core.types, core.agents, core.backend`（实测）——池与 CM6 层所需的全部依赖已合法 |
| 设置四件套 + `main.ts` 注册 | `feature.settings-shell` / `core.types` / `shared.i18n` / `app.composition` | 常规路径；`main.ts` 只注册扩展/命令并装配池，不含补全逻辑 |

**为什么是 5 个新 feature 文件而不是塞进既有文件**：每个文件承载一个独立状态域（池生命周期 / 编辑器状态机 / 装饰层 / 纯函数契约 / 触发判定），与 `src/features/inline-edit/` 既有的文件按关注点切分模式一致（`InlineEditService` vs `InlineEditController` vs `InlineEditWidgets` vs `InlineEditPrompt` vs `InlineEditAtTrigger`）；全部无"薄转发"成分。

### 3.2 新会话生命周期契约（本文档核心，逐条定案）

```ts
// src/core/agents/backend/AgentInlineCompletionCapability.ts
import type { AuxObservedToolCall, AuxQuerySafetyProof, BackendModelSelection } from './AgentAuxQueryCapability';

export interface InlineCompletionTurnRequest {
  /** 光标前文窗口（≤ PREFIX_WINDOW_CHARS = 4000，按整行边界截取）。 */
  readonly prefix: string;
  /** 光标后文窗口（≤ SUFFIX_WINDOW_CHARS = 1000）。 */
  readonly suffix: string;
  readonly maxChars: number;
  readonly signal?: AbortSignal;
  /** 首字节渐进回调：ghost text 允许按块渐进出现，以压首字节延迟。 */
  readonly onTextChunk?: (accumulated: string) => void;
}

export type InlineCompletionTurnResult =
  | { ok: true; text: string; toolCalls: readonly AuxObservedToolCall[] }
  | { ok: false; error: string; cancelled?: boolean; unsupported?: boolean };

export interface InlineCompletionSession {
  readonly queryId: string;
  /** 与 aux 完全同构的运行时只读证明；启动时读回验证，缺失即 start 失败。 */
  readonly safety: AuxQuerySafetyProof;
  complete(request: InlineCompletionTurnRequest): Promise<InlineCompletionTurnResult>;
  /** 丢弃会话内任何上下文残留（切换笔记/后端模型时调用）。 */
  reset(): void;
  dispose(): Promise<void>;
}

export interface InlineCompletionSessionConfig {
  readonly systemPrompt: string;
  readonly model?: BackendModelSelection;
  readonly effort?: string;
  readonly workingDirectory: string;
}

/** 可选能力：任何后端不满足即不注册该 capability（如实不可用，§6.5）。 */
export interface AgentInlineCompletionCapability extends AgentService {
  startInlineCompletionSession(config: InlineCompletionSessionConfig): Promise<InlineCompletionSession>;
}
```

**契约不变式（实现者必须逐条遵守，审计逐条核对）**：

1. **热会话，冷语义**：会话复用的只是 native 进程/连接（热启动），每个 turn 的语义完全由 `prefix/suffix` 请求承载，**不得依赖服务端会话记忆**（服务端上下文残留是正确性风险：上一次的补全内容可能污染下一次）。`reset()` 在笔记切换时必须调用。
2. **只读保证与 aux 等强，机制复用而非重写**：OpenCode 实现复用 `OpenCodeAuxScope` 隔离 scope 与只读 agent（scope 本就跨会话复用，session 建在 scope 内、dispose 时删除）；Claude 实现复用 tools 白名单 + `strictMcpConfig` + `canUseTool` + `system/init` 读回四层机制；Codex 复用 read-only sandbox thread（常驻不销毁，TTL 到期再销毁）；Pi 复用其 aux 只读约束。`AuxQuerySafetyProof` 结构原样复用——`enforcedPolicy`/`effectiveTools`/`deniedCapabilities` 读回验证失败 → start 拒绝（fail-closed，无提示词降级）。
3. **每 turn 审计**：`complete()` 返回的 `toolCalls` 由 feature 层过既有 `findWriteToolCalls`（`AgentAuxQueryCapability.ts:202-218`）。补全 turn 的期望是**零工具调用**——任何 write 命中 → dispose 会话 + 该后端本周期标 unsupported + UI 如实提示；命中不阻断用户输入（ghost 从未写入文档，无损害可发生）。
4. **池生命周期**（`InlineCompletionService`）：每 `backend × workingDirectory` 最多 1 个会话；预热时机 = 功能开启后首个 markdown 编辑器获得焦点（懒启动兜底：首个 Alt 触发时同步建会话）；空闲 TTL 5 分钟 dispose；设置关闭/后端或模型切换/编辑器卸载（复用 `active-leaf-change`/`layout-change` → `pruneDetachedEdits` 事件面）/插件卸载 → 立即 dispose。
5. **中止语义**：每次键入、Esc、新 Alt 触发 → 在途 turn 的 `AbortSignal` 立即 abort + feature 层 **generation counter 递增**（迟到结果按 counter 丢弃，双保险——后端 abort 不及时也不能覆盖 ghost）。取消后请求新补全无需等待旧 turn 结束（后端必须支持并发 turn 或内部串行化，OpenCode/Codex 天然支持；Claude 走 `ClaudeCodeQueue` 既有排队）。
6. **失败降级链（fail-closed，不静默）**：start 失败 → 该后端标 `unsupported`（状态栏/触发时 Notice 如实"该后端不支持快速补全"，§6.5/§6.7）；单 turn 失败 → 本次无建议（静默，补全是低打扰交互）；连续 2 次 turn 失败 → dispose + 冷启动重试一次；再失败 → 本周期 unsupported。**绝不**退化为本地伪补全或提示词-only 模式。
7. **与 aux 契约的边界**：`AgentAuxQueryCapability` 及 `InlineEditService` 的 create-per-edit/dispose-on-exit 一字不改；行内编辑活动期间（`hasActiveEdits()`）补全触发被拒绝（两个功能不并存于同一编辑器状态，避免会话与装饰互相干扰）。

**延迟预算（需求：首字节 < 800ms）**：预热把冷启动（CLI 进程/线程创建，Claude/Codex 约 1-3s 量级）移出触发路径；热 turn 首字节预算 800ms 硬超时（turn 级 timeout 4s 兜底）。各后端实测数据必须如实记录（§7/验收 1）；某后端热态仍达不到 800ms → 审计报告如实标注，不粉饰（能力可用但慢 ≠ 伪造达标）。

### 3.3 CM6 ghost text 层（`InlineCompletionGhost.ts`）

```ts
const setGhost = StateEffect.define<{ pos: number; text: string } | null>();
const ghostField = StateField.define<{ ghost: { pos: number; text: string } | null }>({ ... });

// 装饰：仅 Decoration.widget（side: 1），永不 Decoration.replace —— ghost 不进文档、不动 undo 栈
function ghostDecorations(field: { ghost: ... | null }): DecorationSet {
  if (!field.ghost) return Decoration.none;
  return Decoration.set([
    Decoration.widget({ widget: new GhostWidget(field.ghost.text), side: 1 }).range(field.ghost.pos),
  ]);
}
// atomicRanges：光标左右键跳过 ghost 文本，Backspace/Delete 一次作用到 ghost 前的文档文本
inEditorView.atomicRanges(of(ghostField))... // 由同一 field 提供 range set
```

- `GhostWidget`（`WidgetType` 子类）渲染 `span`，`eq()` 按 text 比较（比照 `InlineEditPreviewWidget`、`InlineEditWidgets.ts:230` 的 token 模式）；样式 `cm-inline-completion-ghost` 弱化色 + `styles.css`/`src/style/` 双处同步。
- **Tab 接受**：单次 `view.dispatch({ changes: { from: pos, insert: text }, userEvent: 'input.complete' })` —— 单事务 = 单步撤销（验收 3）；随后清除 ghost effect。
- **竞争清除**：`updateListener` 中任何 `docChanged` 或选区移动 → 清 effect + abort 在途 + counter 递增；`Esc` → 清 effect + abort（文档零变化，验收 4）。
- **渐进显示**：`onTextChunk` 累积文本经 `validateCompletion` 校验后以 effect 更新 ghost（首块出现即"首字节"）；turn 完成后以最终文本重设。
- **IME**：触发与 Tab/Esc 处理均带 `view.composing` + `event.isComposing` 守卫（与 `InlineEditAtTrigger.ts:78` 同纪律）；组合态不触发、组合完成不自动补触发（需求约束）。

### 3.4 触发与绑定（`InlineCompletionTrigger.ts`）

```ts
/** 纯函数：Alt 空按手势判定（keydown Alt → 期间无其他键 → keyup Alt，窗口 1000ms，非组合态）。 */
export function isAltSoloGesture(events: { key: string; type: 'keydown' | 'keyup'; isComposing: boolean }[]): boolean;
```

- 默认手势"光标处按 Alt"：`domEventHandlers` 的 keydown/keyup 序列喂给纯函数判定（CM6 keymap 无法匹配裸修饰键）。
- 同时注册插件命令 `inline-completion:trigger`——用户可在 Obsidian 热键设置中改绑任意快捷键或解绑 Alt 手势相关行为；设置页提供入口（需求"可在设置中改绑或关闭"）。
- 触发前置条件链（顺序即成本序）：`inlineCompletionEnabled` → 无活动行内编辑 → `view.composing === false` → 非 readOnly → 编辑器有宿主笔记 → 池取/建会话。
- 门控模式沿用 R-A1 precedent（`InlineEditAtTrigger.ts:56-61,75-95`）：扩展注册一次，逐次调用 `canTrigger()`；关闭时首个判断即返回。与需求"关闭时不注册 handler"的偏差见 §8 C3-Q1。

### 3.5 输出契约（`InlineCompletionPrompt.ts`，与行内编辑 XML 契约隔离）

- 系统提示词（双语，i18n）：只输出续写文本；不回显前缀；≤ maxChars；到句子/段落自然边界即停；禁止输出任何协议标签；代码上下文中保持语言一致。**不含**行内编辑的 `<im>`/`<clarify>` 标签体系。
- 请求窗口：`prefix`（光标前 ≤4000 字符，整行边界）+ `suffix`（≤1000 字符）；空文档 = 空 prefix（首行触发即续写）。
- 校验（纯函数，单测覆盖 §8.1 R-C3 两项）：

```ts
export function validateCompletion(input: {
  prefixTail: string;   // prefix 末尾 ≤200 字符，用于重复检测
  text: string;
  maxChars: number;
}): { ok: true; text: string } | { ok: false; reason: 'empty' | 'too-long' | 'prefix-duplicate' | 'protocol-tag' };
```

- `prefix-duplicate`：text 前缀与 `prefixTail` 后缀的最长重叠 > 短侧一半 → 拒绝（防"复读机"式建议）；
- `protocol-tag`：出现任何行内编辑 XML 标签（`<im`、`<clarify` 等）→ 拒绝（跨契约干扰防护，需求技术约束）；
- `too-long`：超 maxChars **先截断到 maxChars 再校验其余项**（长度上限是硬约束，验收 5）；
- `empty`：空白/纯换行 → 拒绝且不显示 ghost。
- 拒绝不 Notice（低打扰），计入 debug 日志计数。

### 3.6 文件级改动清单

| 文件 | 动作 | 内容 |
|---|---|---|
| `src/core/agents/backend/AgentInlineCompletionCapability.ts` | 新 | 3.2 契约 + 共享常量 |
| `auxiliary/OpenCodeInlineCompletionSession.ts` 等四后端会话 | 新 | 组合既有 scope/queue/runtime + 只读机制；turn = 无状态补全请求 |
| 各后端 adapter（`OpenCodeAdapter.ts`、`ClaudeCodeAdapter.ts`、`CodexAdapter.ts`、`pi/PiAdapter.ts`） | 改 | 实现/不实现新 capability（如实暴露） |
| `InlineCompletionService.ts` / `Controller.ts` / `Ghost.ts` / `Prompt.ts` / `Trigger.ts` | 新 | 3.2 池、3.3 CM6、3.5 契约、3.4 触发 |
| `src/main.ts` | 改 | `registerEditorExtension`、命令注册、池装配与卸载钩子 |
| `src/core/types/settings.ts` + 设置 UI + i18n | 改 | `inlineCompletionEnabled` / `inlineCompletionMaxChars` 四件套；2026-09-19 追加 `inlineCompletionModelOverrides`（补全延迟敏感，允许单独钉低延迟模型） |
| `scripts/audit/run-inline-completion-audit.mjs`（新，比照 `run-aux-query-audit.mjs`） | 新 | 四后端真 CLI 审计：只读证明 + 首字节延迟实测 |
| `docs/modules/**` + owner 概况 | 改 | module-docs 硬门禁 |

---

## 4. 失败语义与安全约束

1. **§6.1 不削弱**：`AgentAuxQueryCapability` 契约、`AUX_DENIED_CAPABILITIES`、`findWriteToolCalls` 阻断检查全部原样；新能力是**平行接口**，四后端各自组合既有只读机制（§3.2 不变式 2）；新增 `run-inline-completion-audit` 真机门禁（只读证明 + 延迟），不通过的后端不得启用。
2. **写路径零扩展**：ghost text 永不进文档；唯一写入是 Tab 的单事务插入，发生在**用户显式按键**时——本条不新增任何自动写路径，§6.2/§6.3 的脏检查话题不适用（无快照可脏），但 Tab 插入前仍做一次位置有效性校验（`pos` 在当前文档范围内且 `prefix` 尾部与发起时一致——发起后文档已变则丢弃建议，与键入竞争同一 counter 机制）。
3. **fail-closed（§6.4）**：只读证明缺失 → 后端 unsupported；协议校验失败 → 丢弃建议；后端不支持 → UI 如实呈现（§6.5），不伪造 ghost。
4. **能力缺失如实呈现（§6.5/§6.7）**：四后端逐一审计；达不到 800ms 的后端在审计报告与设置页能力说明中如实标注实测值。
5. **资源安全**：TTL + 事件面双保险 dispose；abort + counter 双保险防迟到覆盖；`onunload` 全量回收（无进程/连接泄漏）。

---

## 5. 测试计划

**单元**（`tests/unit/features/inline-edit/`，沿用既有命名模式）：

1. `InlineCompletionTrigger.test.ts`：`isAltSoloGesture`（纯 Alt 空按 / Alt+A / 组合态 / 超窗口 / 其他键打断）。
2. `InlineCompletionPrompt.test.ts`（§8.1 R-C3 两项）：maxChars 截断；前缀重复拒绝（重叠阈值边界）；协议标签拒绝；空建议拒绝；窗口构建（整行边界、4000/1000 上限）。
3. `InlineCompletionGhost.test.ts`：effect 设置/清除；装饰集只含 widget（结构断言禁止 `Decoration.replace` 出现）；`atomicRanges` 覆盖 ghost 区间；Tab 单事务（`changes` 数量与 `userEvent`）。
4. `InlineCompletionService.test.ts`（fake session）：预热/懒启动；TTL 过期 dispose；后端/模型切换 dispose；设置关闭立即 dispose；连续 2 次失败的降级链；`unsupported` 状态传播。
5. 迟到覆盖：abort 后 resolve 的 turn 被 counter 丢弃（验收 2 的自动化形态）。

**契约**：

6. 四后端 capability 暴露矩阵：未实现的后端在注册表如实缺位，触发路径提示 unsupported（§6.5 断言）。
7. 补全 turn 写工具审计：observed write tool → dispose + unsupported（复用 `findWriteToolCalls` 的行为断言）。
8. 与行内编辑互斥：活动编辑存在时 Alt 触发被拒绝；行内编辑关闭时补全会话不受影响。
9. Tab 接受单步撤销（CM6 事务结构断言）；Esc 文档零变化（doc 全等断言）。

**真 CLI 端到端**（新审计脚本，四后端真模型）：

10. 只读证明读回 + 补全 turn 零写工具 + 首字节延迟实测表（验收 1 的数据来源）；审计不通过的后端不启用。
11. `run-aux-query-audit.mjs` 回归：既有四项审计不受新能力影响（§6.1）。

**真机（Obsidian，主智能体执行）**：

12. 预热后 Alt → ghost 出现实测（分后端记录，验收 1）；ghost 样式/对比度目测截图。
13. 键入 → ghost 即灭 + 无迟到覆盖（观察窗口 ≥2s，验收 2）。
14. Tab → 文本入文档 → Ctrl+Z 一步回退（验收 3）；Esc → 文档零变化（验收 4）。
15. 中文 IME：组合态 Alt 不触发、组合完成不自动触发（验收 6；§8.3 清单项）。
16. 功能关闭：设置关闭后触发无效；debug 日志断言无会话创建、无网络请求；重进 vault 无残留（验收 7，按 §8 C3-Q1 裁决后的口径执行）。
17. 截图存档 `artifacts/opencodian/flowtext-parity/`。

---

## 6. 验收标准映射（需求 R-C3 验收 1-7）

| # | 验收标准 | 设计如何使其可验证 |
|---|---|---|
| 1 | Alt → 800ms 内 ghost（实测，分后端） | 预热会话把冷启动移出触发路径；审计脚本 10 输出每后端首字节数据；真机 12 复测。达不到的后端如实标注（§6.5） |
| 2 | 继续输入 → ghost 消失 + 在途取消（无迟到覆盖） | abort + generation counter 双保险；单测 5 + 真机 13 |
| 3 | Tab 接受 → 单步撤销 | 单 dispatch 事务（`userEvent: 'input.complete'`）；契约 9 + 真机 14 |
| 4 | Esc → 文档零变化 | 仅清 effect + abort；契约 9 文档全等断言 + 真机 14 |
| 5 | 长度上限 + 不重复前缀 | `validateCompletion` 硬规则；单测 2 |
| 6 | IME 组合态不触发 | `view.composing`/`isComposing` 双守卫（触发侧 + 手势判定侧）；真机 15 |
| 7 | 关闭时无后台会话或监听器 | 关闭 → 池全量 dispose + 门控短路；真机 16。**口径待裁决**：字面"不注册 handler"与 Obsidian 扩展生命周期约束冲突（§8 C3-Q1），建议按 R-A1 先例解释为"无会话、无网络、无装饰、键处理器逐次门控空转" |

---

## 7. 可行性验证结论

**已验证（本分支代码）**：

1. 长驻会话的地基存在：`OpenCodeAuxScope` 的隔离 scope 本就"started on first use and reused across sessions"（`OpenCodeAuxQuerySession.ts:40-41`），scope 内会话可按补全节奏建/删；Claude/Codex/Pi 的 aux 只读机制均可被新会话类组合复用（各 aux 会话文件已核实）。
2. CM6 全套原语在生产使用：widget 装饰、`WidgetType`、`editor.cm` 获取、composing 守卫、注册一次 + `canTrigger` 门控（R-A1 已交付）；ghost 层没有需要引入的新依赖。
3. 生命周期事件面现成：`active-leaf-change`/`layout-change` 已驱动 `pruneDetachedEdits`（`main.ts:848-853`），池的编辑器卸载处置挂同一事件。
4. 无既有实现冲突：全仓库无 ghost text 代码，无命名冲突。

**未验证 / 留给实施阶段**：

1. **各后端热 turn 首字节是否 < 800ms**——这是本条最大的技术未知。预热解决冷启动，但热态延迟取决于 CLI 往返；四后端必须实测（审计脚本 10）。某后端达不到 → 如实标注慢，不粉饰不裁剪需求（§6.5/§6.7）；若四后端全部显著超标，回到维护者裁决触发方式（见 C3-Q5）。
2. Alt 空按手势在 macOS（Option 键）与 Windows 的实际手感（系统级快捷键冲突、Option+字母组合字符）——手势判定是纯函数可单测，真机手感需实测；命令改绑路径是确定的兜底。
3. Claude 后端并发 turn 或串行排队在补全节奏下的体验（`ClaudeCodeQueue` 既有排队；若串行导致新请求等旧请求，counter 机制保证正确性，延迟需实测）。

---

## 8. 开放问题（需维护者裁决）

| # | 问题 | 建议 |
|---|---|---|
| C3-Q1 | 验收 7"关闭时不注册 handler"与 Obsidian `registerEditorExtension` 仅能在 onload 注册的约束冲突。R-A1 先例是"注册一次 + 逐次门控"。 | 建议**沿用 R-A1 先例**并把验收 7 口径改为"无会话、无网络、无装饰更新；仅存在被门控的空转键处理器（与已交付的 `@` 触发同构）"。若坚持字面零注册，唯一诚实路径是"切换后提示重启插件生效"，体验更差。 |
| C3-Q2 | 默认手势：Alt 空按 vs 默认绑定 Alt+A 这类组合键？ | 建议**Alt 空按为默认 + 命令可改绑**（本设计采用）：与 FlowText 对齐；真机步骤 12-15 若发现系统性冲突再降级默认值（设置项留有余地）。 |
| C3-Q3 | 补全使用哪个模型？ | 建议沿用行内编辑的解析链：`inlineEditModelOverrides` > 当前聊天 tab 模型 > 后端默认（`InlineEditPluginHost.resolveModel` 既有逻辑可复用），并在设置文案说明低延迟模型更合适。**2026-09-19 落地补充**：实测（同构建热会话，6 次真实 Alt 手势，`deepseek/deepseek-flash` → 1415/1835/902/798/1060/532 ms，2/6 达标）确认插件侧已就绪、残差是供应商延迟，且补全被迫与行内编辑共用 `inlineEditModelOverrides`——因此新增**补全专用** `inlineCompletionModelOverrides`，解析顺序改为：专用覆盖 > `inlineEditModelOverrides` > 当前聊天 tab 模型 > 后端默认；空映射默认下逐字节等同原链路，设置文案如实说明延迟敏感、推荐低延迟模型（不承诺具体毫秒数），800ms 指标本身不动。 |
| C3-Q4 | 预热时机：首个编辑器焦点即预热（有成本：四后端各 1 个空闲进程/连接）vs 首次 Alt 才建（冷启动 1-3s）？ | 建议**首个编辑器焦点预热 + TTL 5 分钟**：预热是 800ms 目标的前提；TTL 限制常驻成本；设置页说明。 |
| C3-Q5 | 若实测某后端热态仍 > 800ms，如何处理？ | 建议**如实标注 + 保持可用**（验收 1 要求的是"给出实测数据，分后端"）；全部后端显著超标时回到本表重新裁决（换触发形态或调整目标值），不在实现中静默放宽。 |
