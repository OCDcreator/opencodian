# AssistantAutoInternalLinkService

> **源码**: `src/features/chat/services/AssistantAutoInternalLinkService.ts`
> **状态**: [REVIEW]

## 概述

R-B1「生成内容自动内链」的**聊天侧边界**（此前仅行内编辑接线）。当本轮请求携带非空参考笔记集合（附加上下文 + R-B2 上下文组）时，在本轮 assistant 最终文本上插入指向参考笔记已验证标题的内链。

核心规则（与 `InlineEditAutoLink` 共用同一 processor seam，不复制匹配语义）：

- 参考集合只取本轮 `contextItems` 中 `file` / `current_note` 的手动附加条目；目录、PDF、选区片段与 R-C1 检索片段不参与。processor 仍会用 metadata cache 校验每个路径的标题，「宁可不链，不产生死链」不变。
- 只处理**本轮**、**已完成**的 assistant 消息：仅扫描最后一条 user 消息之后的区域，跳过 notice 行；`streamState === 'interrupted'` 的部分文本绝不改写。
- 不逐帧改写：流式渲染保持原样，改写只发生在 finalization 阶段（sync 之后、最终保存与 render apply 之前），持久化文本与渲染文本始终一致。
- 参考集合非空但无匹配（或标题不存在）是正常 no-op，不给用户发通知；processor 缺失属于组合错误，通过 finalization trace 如实上报（§6.7），不静默。

## 边界决策（为何在 finalization 处理）

| 路径 | 最终文本来源 | 处理时机 | 渲染一致性 |
|---|---|---|---|
| opencode 干净完成 | canonical/服务端 sync 合并后的消息 | sync 返回后、`applySyncedConversationUpdate` 前；插入链接时强制 `needsForegroundRenderSync` | render apply 的 canonical 投影由渲染服务重放同一 pass（见下），DOM 与存储同为链接文本 |
| 本地持久化路径（claude-code / codex / pi；opencode 中断） | `persistLocalStreamOutcome` 已写入 `conversation.messages` 的本地消息 | 最终保存前；前台会话用 `applySyncedConversationUpdate` 重渲尾部 | 服务返回的 `previousMessages` 含被改写消息的**改写前克隆**，render apply 能看到真实 before/after diff（尾部 patch 或 full rerender 兜底） |

## 改写的存活：合并重放 + 投影重放

finalization 的改写是对 `conversation.messages` 的就地改写，而 opencode 的权威合并以服务端文本为准、canonical 渲染投影也从原始服务端 parts 重建——两处都会"看不见"本地内链。为此同一 pass 在两个消费点重放（`applyToTurnMessages`）：

- **权威合并重放**（`ConversationAuthoritativeSyncCoordinator`，可选第二构造参数）：`mergeSyncedConversationMessages` 采纳服务端文本后、指纹计算前，对合并结果重放 pass。finalization 的同步、会话重载 resync、sync-event 同步全部经过这一入口，因此存储文本始终携带内链（重载不再还原）。
- **canonical 投影重放**（`ConversationRenderService`，可选第三构造参数）：`resolveConversationRenderMessages` 的 canonical 分支在投影建好后重放 pass。finalization render apply、全量重渲、tab 切换共用该入口，因此渲染输入与存储文本一致。

两处引用集合都从**当轮 user 消息的持久化 `contextAttachments`**（`file` / `current_note`，排除 `vault-retrieval`）派生——这是随会话持久化、能穿越服务端 round-trip 的记录。opencode 发送路径把附件作为 file parts 上送、hydration 会重建 `contextAttachments`，因此 resync 能复现同一改写；若某条路径真的丢掉了附件记录，pass 找不到引用集即不改写（fail-closed：整轮退回无链接的服务端文本，芯片与链接同态消失，不会出现"文本单独失去链接"的静默分叉）。pass 幂等（已链接文本是保护区），重放不会产生双重链接。

## 公开接口

```typescript
class AssistantAutoInternalLinkService {
  // processor 来自 main.createAutoInternalLinkBridge()（与行内编辑共用）
  constructor(processor: AutoInternalLinkProcessor | null | undefined);
  applyToConversationTail(
    conversation: Conversation,
    contextItems: readonly PromptContextItem[] | undefined,
    logStage: (stage: string, payload?: Record<string, unknown>) => void,
  ): ChatAutoInternalLinkOutcome;   // { changed, reason, referenceCount, previousMessages }
  // 合并/投影消费的窄端口：按轮派生引用集（user 消息 contextAttachments）、
  // 就地重放 pass；跳过 notice 与 interrupted；幂等；无 processor 时结构化 no-op。
  applyToTurnMessages(messages: ChatMessage[]): boolean;
}
type AutoInternalLinkTurnRewriter = Pick<AssistantAutoInternalLinkService, 'applyToTurnMessages'>;
```

`reason`: `processor-unavailable` / `no-references` / `no-completed-assistant-message` / `unchanged` / `applied`。

## 文本改写规则

- 每个 `type: 'text'` 的 contentBlock 单独过 processor（结构化渲染路径按块渲染）。
- `content` 保持与块一致：当 `content === join(块文本)`（本地持久化不变式）时改写后仍取 `join(新块文本)`；否则（如服务端同步来的无块消息）`content` 独立过 processor。两条渲染路径看到的都是已存储的同一文本。

## 依赖

```text
上游: src/features/inline-edit/InlineEditAutoLink.ts（仅 AutoInternalLinkProcessor 类型）
下游: MessageFinalizationService（finalization 尾部 pass）、ConversationAuthoritativeSyncCoordinator（合并重放）、ConversationRenderService（canonical 投影重放）、ChatRuntimeComposition（共享装配）
```

## 维护约束

- 不得在此复制/修改匹配、阈值、死链拒绝语义——那是 `InlineEditAutoLink` 的职责，本服务只做边界与一致性编排。
- `changed` 必须真实反映改写：`false` 时调用方不得触发 render apply（保证关闭态逐字节回归）。
- 三个消费点（finalization 尾部、合并重放、投影重放）必须共享同一 service 实例（`ChatRuntimeComposition.getAutoInternalLinkService()`）；新消费点必须复用 `applyToTurnMessages`，不得另写派生逻辑。
- `applyToTurnMessages` 只处理"最终文本"：`streamState === 'interrupted'` 与 notice 行是硬排除，投影路径天然只含服务端已定稿帧。
- 本服务不改写 vault 文件；聊天消息属于插件存储，不涉及唯一写路径与脏检查。
