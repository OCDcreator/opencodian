# ConversationKeyedReconcileDelegate

> **源码**: `src/features/chat/services/ConversationKeyedReconcileDelegate.ts`
> **状态**: [REVIEW]

## 概述

`ConversationKeyedReconcileDelegate` 按稳定 message identity 对 synced update 做 keyed reconcile：不再清空并整体重挂消息区，而是让未变化的消息保留自己的 DOM 节点（连同折叠/展开状态、scroll anchor 与 tool-call 子树），只有真正新增、变化、移除或重排的条目才触碰 DOM。

它由 `ConversationSyncedUpdateApplyDelegate` 在 incremental 判定为 `null` 时先尝试；任何结构异常都返回 `false`，调用方随后回退 full rerender，由全量重建重新建立渲染不变量。

## 公开接口

```typescript
export class ConversationKeyedReconcileDelegate {
  constructor(
    host: ConversationRenderHost,
    messageRenderer: ConversationMessageRenderDelegate,
  );
  tryApply(previousMessages: ChatMessage[], nextMessages: ChatMessage[]): Promise<boolean>;
}
```

## 关键行为

### 前置校验（captureReconcileContext）

只在 DOM 可证明与 previous render list 完全一致（同样的 message 元素、同样的顺序）时才信任 DOM；以下任一情况都返回 `null` 走全量 fallback：

- 缺失 messages container 或 current conversation
- 容器内存在 `.is-streaming` 或 `[data-canonical-sync-pending="true"]`（streaming shell 与 pending canonical takeover 归 streaming path 所有，不在其周围 reconcile）
- 容器内没有 `.opencodian-turn`
- previous / next rendered 列表为空（空态由 empty-conversation notice 的专门渲染拥有）
- next 列表出现重复 message id
- DOM 中 `.opencodian-message[data-message-id]` 的数量或逐条 `data-message-id` 顺序与 previous render list 漂移

### reconcile 过程

- 先同步 background-task runtime、捕获 scroll 快照，并用 `beginConversationHydration` / `endConversationHydration` 包裹整个过程
- `removeStaleMessages()`：移除 message 已消失的元素，保留节点不动
- `replayNextRenderList()`：按 next render list 顺序 keep / update / insert / 移动每条消息
  - 未变化（visual signature 相同）：直接保留既有 DOM node identity
  - user 消息变化：`rerenderSingleUserMessage()` 就地重渲
  - assistant 消息变化：先在 detached turn/body 中等待 `renderMessage()` 完成，再在 ownership 仍有效时 `replaceWith()` 原位替换，避免异步 markdown 提前落入当前 turn 或底部
  - 新消息：渲染后插入最终位置
  - 连续 assistant 合并进同一 turn body，形成复合 id 的合并/拆分也按此回放；assistant-only 单元头落入他人 turn body 时，为其创建 `opencodian-turn--assistant-only` 独立 turn shell；turn 级移动通过 `insertBefore` 相对参考节点完成
- `pruneEmptyTurnShells()`：移除失去全部消息的 turn 壳
- `resetCurrentTurnBody()`：把 per-tab runtime 的 `currentTurnBodyEl` 重置指向最后一个 turn 的 body，保证后续 append 落点正确
- 刷新 background-task indicator，并按快照恢复滚动（带 late-content reapply 窗口）
- 过程中任何异常都会被 catch 并返回 `false`：部分应用的 reconcile 仍然安全，因为调用方的全量重建会清空并重新建立整体不变量
- detached assistant staging 在 pane ownership 失效后不会按 message id 查询或删除节点，避免误删新一轮已合法渲染的同 ID 节点

## 与 `ConversationRenderService` 的边界

- `ConversationRenderService` 构造时把本 delegate 注入 `ConversationSyncedUpdateApplyDelegate`
- synced update 的 incremental 判定为 `null` 时先 `tryApply()`，返回 `false` 才调用 `rerenderConversationMessages()` 全量重建
- 全量重建永远是安全网；delegate 不试图覆盖 streaming、空态或 DOM 漂移场景
