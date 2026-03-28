# Context Usage Indicator — 功能需求规格

> 状态：**核心规格已落地，剩余为增强项**
> 创建：2026-03-28
> 参考：OpenCode Desktop `session-context-usage.tsx`、`session-context-tab.tsx`、`progress-circle.tsx`

---

## 1. 概述

在聊天工具栏中添加一个**上下文占用指示器**，以环形进度条的形式实时展示当前会话的上下文窗口使用百分比。点击可打开详情弹窗，展示详细的 token 统计和上下文拆分信息。

---

## 2. 核心组件

### 2.1 ContextRing — 圆环指示器

**位置**：工具栏（`opencodian-input-toolbar`），EffortSelector 旁边

**视觉规格**：

| 属性 | 值 |
|------|-----|
| 尺寸 | 28×28 px |
| SVG viewBox | 16×16 |
| 描边宽度 | 3px |
| 进度动画 | `transition: stroke-dashoffset 0.35s cubic-bezier(0.65, 0, 0.35, 1)` |
| 内部文字 | 百分比数字（如 `45`），字号 11px，居中 |

**实现方式**：SVG 圆环，通过 `stroke-dasharray` + `stroke-dashoffset` 控制进度

```
圆周长 = 2 × π × radius
offset = circumference × (1 - percentage / 100)
```

**颜色语义**（根据占用率动态变色）：

| 占用率 | 圆环颜色 | 说明 |
|--------|----------|------|
| 0–60% | `var(--text-success)` / 绿色 | 正常 |
| 60–85% | `var(--text-warning)` / 橙黄色 | 接近上限 |
| 85–100% | `var(--text-error)` / 红色 | 即将耗尽 |
| 无数据 | `var(--text-faint)` / 灰色 | 不可用 |

**状态行为**：

| 状态 | 显示 |
|------|------|
| 服务器未连接 | 灰色空环，内部显示 `—` |
| 模型未选择 | 灰色空环，内部显示 `—` |
| 新会话（0 token） | 0% 空环 |
| 流式响应中 | 实时更新百分比（方案 A 预估） |
| 消息完成后 | 校准为精确值（方案 B） |

**当前对齐规则（以 OpenCode Desktop 为准）**：

- `总 Token` 使用 `input + output + reasoning + cacheRead + cacheWrite`
- `使用率` 使用上述 `total / limit × 100%`
- Tooltip 当前展示 `总 Token`、`使用率`、`成本`
- 不复制 OpenCode Desktop 已知的 `limit.context` 缺失导致 `上下文限制 = 0 / 使用率 = —` 的 bug；若插件已正确解析到 `limit.context`，则优先显示真实值

**Hover Tooltip**：

```
总 Token: 45,230
使用率: 23%
成本: $0.12
```

### 2.2 ContextDetailModal — 详情弹窗

**触发方式**：点击圆环指示器

**弹窗标题**：上下文使用详情

**统计信息区域**（两列网格布局）：

| 标签 | 数据来源 |
|------|----------|
| 会话标题 | `Session.title` |
| 消息数 | `messages.length` |
| 提供商 | 当前模型的 provider name |
| 模型 | 当前模型的 model name |
| 上下文限制 | 模型 `limit.context`（如 `200,000`） |
| 总 Token | input + output + reasoning + cacheRead + cacheWrite |
| 使用率 | `total / limit × 100%` |
| 输入 Token | `tokens.input` |
| 输出 Token | `tokens.output` |
| 推理 Token | `tokens.reasoning` |
| 缓存 Token | `tokens.cache.read / tokens.cache.write` |
| 用户消息数 | `messages.filter(role === 'user').length` |
| 助手消息数 | `messages.filter(role === 'assistant').length` |
| 创建时间 | `session.time.created` 格式化 |
| 最后活动 | 当前上下文对应 assistant message 的 `time.created` |
| 总成本 | USD 格式（如 `$0.12`） |

**上下文拆分进度条**：

一个水平进度条，用不同颜色段表示上下文中各类内容的占比：

| 类别 | 颜色 | 计算方式 |
|------|------|----------|
| System（系统提示） | 蓝色 `var(--text-info)` | 系统提示字符数 ÷ 4 估算 |
| User（用户消息） | 绿色 `var(--text-success)` | 用户消息文本字符数 ÷ 4 |
| Assistant（助手回复） | 紫色 `var(--text-accent)` | 助手文本字符数 ÷ 4 |
| Tool（工具调用） | 橙黄色 `var(--text-warning)` | 工具调用输入输出字符数 ÷ 4 |
| Other（其他） | 灰色 `var(--text-faint)` | input - (system + user + assistant + tool) |

> **估算逻辑**：字符数 ÷ 4 ≈ token 数（与 OpenCode Desktop 一致）。如果估算总量 ≤ 实际 input，差额归入 Other；如果超过，按比例缩放。

进度条下方显示图例（每项：色块 + 类别名 + 百分比）。

---

## 3. 数据流设计

### 3.1 方案 C：混合模式

```
┌─────────────────────────────────────────────────┐
│                  流式期间（方案 A）                │
│  SSE usage chunk → 累加 inputTokens/outputTokens │
│  → 除以本地 contextWindow → 预估百分比            │
│  → 实时更新圆环                                   │
├─────────────────────────────────────────────────┤
│                 消息完成后（方案 B）                │
│  从服务器获取 Session 数据 → 读取精确 tokens       │
│  → 校准百分比和所有统计数据                        │
│  → 更新圆环 + 弹窗数据                            │
└─────────────────────────────────────────────────┘
```

### 3.2 需要新增的数据获取

| 数据 | 当前状态 | 需要做什么 |
|------|----------|-----------|
| 模型 `limit.context` | API 已返回但未解析 | 扩展 `getAvailableModels()` 解析 limit 字段 |
| SSE `usage` 事件 | 已解析为 StreamChunk | 需要累计存储到每个 Tab 的状态 |
| Session `tokens` 聚合 | 未获取 | 消息完成后调用 session API 获取 |
| Session 元数据（标题、时间等） | 部分获取 | 需要扩展 session 数据获取 |

### 3.3 每个 Tab 的状态存储

```typescript
interface TabContextState {
  // 累计 token（流式预估）
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  streamInputTokens: number;
  streamOutputTokens: number;
  // 精确 token（完成后校准）
  preciseTokens?: {
    total: number;
    input: number;
    output: number;
    reasoning: number;
    cacheRead: number;
    cacheWrite: number;
  };
  totalCost?: number | null;
  // 模型与会话元数据
  contextWindow: number;
  percentage: number;
  provider: string | null;
  providerName: string | null;
  model: string | null;
  modelName: string | null;
  sessionId: string | null;
  sessionTitle: string | null;
  createdAt: number | null;
  updatedAt: number | null;
}
```

---

## 4. 多标签页行为

- 每个标签页（Tab）维护独立的 `TabContextState`
- 切换标签时，圆环更新为对应标签的占用数据
- 新建标签页时，状态初始化为 0
- 关闭标签页时，对应状态清理

---

## 5. 国际化

新增以下 i18n key：

```
context.usage.title         = "上下文使用详情" / "Context Usage"
context.usage.totalTokens   = "总 Token"
context.usage.usage         = "使用率"
context.usage.inputTokens   = "输入 Token"
context.usage.outputTokens  = "输出 Token"
context.usage.reasoningTokens = "推理 Token"
context.usage.cacheTokens = "缓存 Token"
context.usage.cacheReadTokens = "缓存 Token（读）"
context.usage.cacheWriteTokens = "缓存 Token（写）"
context.usage.contextLimit  = "上下文限制"
context.usage.cost          = "总成本"
context.usage.session       = "会话"
context.usage.messages      = "消息数"
context.usage.provider      = "提供商"
context.usage.model         = "模型"
context.usage.userMessages  = "用户消息"
context.usage.assistantMessages = "助手消息"
context.usage.createdAt     = "创建时间"
context.usage.lastActivity  = "最后活动"
context.usage.unavailable   = "不可用"
context.breakdown.system    = "系统提示"
context.breakdown.user      = "用户"
context.breakdown.assistant = "助手"
context.breakdown.tool      = "工具"
context.breakdown.other     = "其他"
context.breakdown.note      = "* 基于字符估算"
```

---

## 6. 需要新建/修改的文件

### 新建

| 文件 | 职责 |
|------|------|
| `src/features/chat/ui/ContextRing.ts` | 圆环指示器 UI 组件 |
| `src/features/chat/ui/ContextDetailModal.ts` | 详情弹窗 UI 组件 |
| `src/features/chat/services/ContextUsageService.ts` | Token 累计、校准、百分比计算 |

### 修改

| 文件 | 变更 |
|------|------|
| `src/features/chat/OpenCodianView.ts` | 集成圆环到工具栏、处理 usage chunk 累计 |
| `src/features/chat/tabs/Tab.ts` 或 `TabManager.ts` | 每个 Tab 存储 `TabContextState` |
| `src/core/opencode/OpenCodeService.ts` | 扩展 `getAvailableModels()` 解析 limit 字段；新增获取 session token 数据的方法 |
| `src/core/types/chat.ts` | 新增 `TabContextState` 类型（或放到 types 下合适的位置） |
| `src/i18n/locales/en.ts` | 新增 context.usage.* key |
| `src/i18n/locales/zh.ts` | 新增 context.usage.* key |
| `styles.css` | 圆环、弹窗、进度条样式 |

---

## 7. 参考文件

| 参考 | 路径 |
|------|------|
| SVG 圆环 | `reference-projects/opencode/packages/ui/src/components/progress-circle.tsx` |
| 圆环 CSS | `reference-projects/opencode/packages/ui/src/components/progress-circle.css` |
| 指示器集成 | `reference-projects/opencode/packages/app/src/components/session-context-usage.tsx` |
| 详情标签 | `reference-projects/opencode/packages/app/src/components/session/session-context-tab.tsx` |
| 指标计算 | `reference-projects/opencode/packages/app/src/components/session/session-context-metrics.ts` |
| 上下文拆分 | `reference-projects/opencode/packages/app/src/components/session/session-context-breakdown.ts` |
| 格式化 | `reference-projects/opencode/packages/app/src/components/session/session-context-format.ts` |

---

## 8. 开发进度记录

更新时间：2026-03-28 19:45:00 +08:00

### 本轮已完成

- 已在聊天输入工具栏加入 `28x28` 的 context usage 圆环按钮，位置在 `EffortSelector` 和发送按钮之间。
- 已实现每个 tab 独立维护 context usage 状态，切换 tab 时会切换显示。
- 已新增并接通 `ContextRing`、`ContextDetailModal`、`ContextUsageService`。
- 已接入流式期间的 `usage` 更新。
- 已补上消息完成后和载入旧会话时，从 session message 精确校准 token / cost / provider / model / context limit / 时间的逻辑。
- 已修复模型 `limit.context` 在 catalog 合并过程中丢失的问题，不再总是回退到默认 `128K`。
- 已修复 context ring 悬浮时重复出现两个 tooltip 的问题。
- 已修复 context ring 悬浮内容不显示总成本的问题，tooltip 现为多行展示：
  - total tokens
  - usage
  - total cost
- 已补全详情弹窗的主要统计字段：
  - session
  - messages
  - provider
  - model
  - context limit
  - total tokens
  - usage
  - input
  - output
  - reasoning
  - cache tokens（读 / 写）
  - user messages
  - assistant messages
  - total cost
  - created at
  - last activity
- 已将当前显示口径重新对齐 OpenCode Desktop 参考实现：
  - `总 Token` 按 `input + output + reasoning + cache.read + cache.write`
  - `使用率` 按上述 total 计算
  - `消息数` 显示会话总消息条数
  - `缓存 Token` 以 `read / write` 合并显示
  - `最后活动` 取当前上下文对应 assistant message 的时间
- 已确认不复制 OpenCode Desktop 自身可能出现的 `context limit = 0 / usage = —` 元数据解析 bug；如果插件已拿到模型上限，则显示真实上限。
- 已补最小单元测试：
  - `ContextUsageService`
  - `OpenCodeService.getAvailableModels()` 的 `limit.context` 解析
- 已补上 context breakdown 水平进度条与图例：
  - system
  - user
  - assistant
  - tool
  - other
- 已将 breakdown 估算逻辑对齐到「字符数 ÷ 4」近似 token，并在估算超出真实 `input tokens` 时按比例缩放。
- 已将详情弹窗时间格式调整为更接近 OpenCode Desktop 的中等日期/时间格式。
- 已补单元测试覆盖：
  - session usage 校准逻辑
  - breakdown 估算逻辑
  - `last assistant with tokens` 选择逻辑

### 当前实现行为

- 圆环显示当前 tab 的上下文使用率。
- Hover tooltip 当前展示：
  - total tokens
  - usage
  - total cost
- 点击圆环会弹出详情弹窗。
- 详情弹窗当前字段已基本与 OpenCode Desktop 对齐：
  - session
  - messages
  - provider
  - model
  - context limit
  - total tokens
  - usage
  - input tokens
  - output tokens
  - reasoning tokens
  - cache tokens（read / write）
  - user messages
  - assistant messages
  - total cost
  - created at
  - last activity
- 详情弹窗当前已包含 context breakdown 进度条与图例。
- 当前“上下文指标”的来源语义与 OpenCode Desktop 一致：
  - 取 **最后一条带 tokens 的 assistant message** 作为当前上下文快照
  - 不是整个 session 所有轮次的简单累加
- 当前 `messages / userMessages / assistantMessages` 仍按整个会话消息列表统计。

### 本轮新增/改动的关键文件

- `src/features/chat/services/ContextUsageService.ts`
- `src/features/chat/ui/ContextRing.ts`
- `src/features/chat/ui/ContextDetailModal.ts`
- `src/features/chat/OpenCodianView.ts`
- `src/core/opencode/OpenCodeService.ts`
- `src/core/config/modelConfig.ts`
- `src/core/config/ModelConfigService.ts`
- `src/core/types/chat.ts`
- `src/features/chat/tabs/Tab.ts`
- `src/features/chat/tabs/TabManager.ts`
- `src/features/chat/tabs/types.ts`
- `src/i18n/locales/en.ts`
- `src/i18n/locales/zh.ts`
- `styles.css`

### 已确认的实现细节

- OpenCode 的流式 `usage` 不能完全依赖，因此当前方案是：
  - 流式期间用 SSE `usage` 做估算更新。
  - 消息结束后再读取 session message 的 `info.tokens` 做精确校准。
- 当前已确认 OpenCode Desktop 参考实现 `session-context-metrics.ts` 的总量口径为：
  - `input + output + reasoning + cache.read + cache.write`
  - 并非原始 `tokens.total`
- 精确校准当前依赖 OpenCode session message 中最后一条 assistant message 的这些字段：
  - `providerID`
  - `modelID`
  - `cost`
  - `tokens.input`
  - `tokens.output`
  - `tokens.reasoning`
  - `tokens.cache.read`
  - `tokens.cache.write`
- 当前 context usage 百分比按 `input + output + reasoning + cacheRead + cacheWrite` 除以模型 `limit.context`。
- 当前 `最后活动` 为当前上下文 assistant message 的时间，而不是 `session.time.updated`。
- 当前 `消息数` 显示总消息条数；`用户消息数` 与 `助手消息数` 分列显示。

### 完成度检查

以下按本规格正文逐项核对：

- 已实现：
  - 工具栏圆环指示器
  - 按占用率变色
  - 无数据 / 无模型时灰色不可用态
  - 流式期间 usage 预估更新
  - 消息完成后 session snapshot 精确校准
  - 每个 tab 独立维护上下文状态
  - 点击圆环打开详情弹窗
  - 详情弹窗主要统计字段
  - context breakdown 进度条与图例
  - `limit.context` 解析与 catalog 透传
  - 中英文本地化
  - 基础单元测试
- 尚未做成更完整能力，但不阻塞当前规格验收：
  - 像 OpenCode Desktop 那样继续扩展 raw context / raw messages 级别的上下文检查视图
  - 针对更多 provider / tool part 差异，补更细的 breakdown 估算兼容

### 当前结论

- 按这份规格第 1-6 节的“核心功能”来看，当前已经没有明显未实现的阻塞项。
- 现在剩下的是“继续向 OpenCode Desktop 细节对齐”的增强工作，不是最小可用版本缺失。

### 剩余待办

- 继续向 OpenCode Desktop 细节靠齐：
  - 需要时补 raw messages / system prompt 等更完整的 context tab 能力
  - 如后续发现 provider 返回的 tool part 结构存在差异，再补更细的 breakdown 估算兼容
- 如果后续要继续做增强，优先级建议如下：
  - 先补更完整的 raw context 检查视图
  - 再补 provider/tool part 差异兼容
  - 最后再考虑更细的可视化优化

### 当前已部署验证信息

- 已部署到 Test Vault 插件目录：
  - `C:\Users\lt\Desktop\Write\testvault\.obsidian\plugins\opencodian\`
- 最近一次确认的已部署 `BUILD_ID`：
  - `main.202603281941`

### 给下个会话的接手提示

- 如果发现某些 provider 仍然显示 token 为 `0`，优先检查该 provider 返回的 assistant message `info.tokens` 结构是否与当前假设一致。
- 如果发现 context limit 仍回退为默认值，优先检查：
  - `/config/providers` 返回里是否真的带了 `limit.context`
  - `ModelConfigService` 的 server/local/merge catalog 是否继续保留了 `contextWindow`
- 如果后续继续做 OpenCode 对齐，优先读这些参考文件，不要靠猜：
  - `reference-projects/opencode/packages/app/src/components/session-context-usage.tsx`
  - `reference-projects/opencode/packages/app/src/components/session/session-context-tab.tsx`
  - `reference-projects/opencode/packages/app/src/components/session/session-context-metrics.ts`
  - `reference-projects/opencode/packages/app/src/components/session/session-context-breakdown.ts`
- 已确认一个关键原则：
  - **对齐 OpenCode Desktop 的显示语义**
  - **但不复制 OpenCode Desktop 已知的 metadata 解析 bug**
