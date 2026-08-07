# 会话渲染链路审查 · 同行复核与补充报告

> 本文是对 Codex《会话渲染链路审查报告》（Obsidian 1.13.4 / OpenCodian 1.1.10，只读实机审查）的独立复核。
> 复核方式：只读代码审查，逐条核对原报告论断与源码事实，并排查原报告未覆盖的环节。
> 结论先行：**原报告的核心论断基本属实，但有 5 处归因/措辞需要修正；另有 3 个比已列问题更严重的正确性缺陷（会产生错误 DOM）被遗漏，建议插到修复优先级最前。**

---

## 1. 原报告论断逐条核实

| # | 原论断 | 判定 | 关键证据与修正 |
|---|--------|------|----------------|
| 1 | 会话激活清空并重建全部消息 | 部分属实 | 清空属实（`ConversationTransitionBridge.ts:74` 无条件 `clearMessagesContainer()`）。但逐条 `await` 重建的实际位置是 `ConversationRenderRuntime.ts:392-394`（经 `ConversationHydrationOutcomeBridge.ts:53` 调用），`ConversationViewStateService.ts:154` 只是激活步骤入口。 |
| 2 | `preserveScrollPosition` 跳顶根因 | 属实 | 顺序确认：begin（含 clear）→ render → restore（`ConversationViewStateService.ts:160-183`）。清空前只记录标量 `previousScrollTop`（`ConversationHydrationRenderBridge.ts:43-48`），完整锚点快照在渲染**之后**捕获（`:81-85`），`preserve-anchor` 分支算出 delta=0 停在顶部（`ScrollManager.ts:149-157`）。 |
| 3 | 现有测试 mock 掩盖问题 | 属实 | `tests/unit/features/chat/ConversationHydrationRenderBridge.test.ts:5-16` mock 了 `captureElementScrollRestoreSnapshot` 等三个函数；`:100` 的断言甚至固化了"快照在 restore 阶段才捕获"的行为。 |
| 4 | 权威同步 fallback 全量重建 | 属实 | 触发条件 `ConversationRenderRuntime.ts:21-56`；fallback `ConversationRenderService.ts:236` 起。签名内容见 §2.3 修正。 |
| 5 | 伪流式 900ms / 12 字符重渲染 | 部分属实 | 参数对（`ConversationRenderRuntime.ts:270-297`），但作用域被夸大，见 §2.4。 |
| 6 | thinking 更新无节流 | 属实 | `ThinkingBlockRenderer.ts:111-114` 每 chunk 对全文重渲染；调用方 `StreamController.ts:193` 无缓冲，与文本流式的 ~96ms 合帧（`:402-442`）不对称。 |
| 7 | 入场动画缺 reduced-motion | 属实 | `chat-assistant.css:19`（overshoot，1.56>1）；全 `src/style` 仅 14 处 media block，均不覆盖 `messageSlideIn`；`core.css:1860-1862` 的 `is-rehydrating` 属实。 |

## 2. 需要修正的措辞/归因（5 处）

### 2.1 逐条重建的归因
真正的逐条异步重建循环在 `ConversationRenderRuntime.ts:392-394`，不是原报告标注的 `ConversationViewStateService.ts:154`。

### 2.2 "无增量机制"的表述不准确
已存在受限的 keyed 更新：按 `data-message-id` 定位尾部元素做内容替换（`ConversationRenderRuntime.ts:190-199`、`ConversationRenderService.ts:310-358` + `ConversationTrailingAssistantPatchPlanner`），用户消息也有按 id 的就地重渲染（`ConversationRenderRuntime.ts:319-329`）。原建议 2 应是"**扩展**现有按 id 机制"而非新建。

### 2.3 签名比较的内容与方式
`getMessageVisualSignature`（`ConversationIdentityRuntime.ts:76-115`）**包含** contentBlocks 的完整工具状态（`toolStatus`/`toolResult`/`toolInput`/`toolMetadata`/`toolResultVisibility`），不含原始 `message.parts`。比较是**按索引**的（`ConversationRenderRuntime.ts:38-50`）——任何中部插入/删除（live compaction 分隔线注入 `renderGroups.ts:94-103`、notice 可见性变化）都会索引错位回退全量。keyed reconcile 必须用稳定 message id 而非索引做 key。

### 2.4 伪流式作用域
仅作用于增量同步路径中 **append 的纯文本 assistant 消息**（可多条，顺序逐条）：`shouldPseudoStreamSyncedAssistantMessage`（`ConversationRenderRuntime.ts:225-239`）排除 notice/question/summary 及含工具块的消息；尾部 patch 不伪流式；**历史会话重载不触发**（走 `renderPersistedMessage`，`:378-384`）。900ms 是目标值，12ms/chunk 下限使长消息实际更久（200 chunks ≈ 2.4s），且不含每次 Markdown 渲染本身耗时。

### 2.5 两条全量重建路径的滚动快照质量不对称（原报告只笼统说 fallback "较正确"）
- sync fallback（`ConversationRenderService.ts:259-267`）：清空前捕获真实 message-id 锚点，**正确**；
- hydration 路径（`ConversationHydrationRenderBridge.ts:81-85`）：重建后才捕获，**有缺陷**。

修复方向是后者对齐前者。另外 distance 兜底分支本身也有问题：`ScrollManager.ts:72` 用**新** scrollHeight 配**旧** scrollTop 计算 `distanceFromBottom`。

## 3. 遗漏的正确性缺陷（建议最高优先级）

### 3.1 设置开关触发双并发全量重建 → 消息重复（新发现，修复成本最低）
`SettingsConversationSection.ts:1315-1316`（`questionCardPosition`）和 `:1331-1332`（`showAnsweredQuestionCards`）连续调用 `refreshConversationRendering()` + `refreshQuestionUi()`（`OpenCodianView.ts:2901-2907, 3024-3029`），两者各发一次 `void rerenderConversationMessages(...)`，无 in-flight 防护。两次全量重建交错可在 DOM 产生重复消息。修复：合并为一次调用，或对 rerender 加串行化。

### 3.2 可见会话 sync 缺 `isHydratingConversation` 防护（竞争窗口）
`ConversationSyncRuntimeCoordinator.ts:135` 的锁只检查 `isStreaming || isConversationSyncInFlight`。2s 轮询/SSE 同步在水合的逐条 await 窗口（百 ms 级）内完成时，`applySyncedConversationUpdate`（`ConversationSyncVisiblePostSyncRouter.ts:50,65`）会往同一容器追加/全量重建，与水合渲染循环交错。对比：后台任务 live signal 恰恰有 hydration 防护（`BackgroundTaskLiveSignalCoordinator.ts:136,159`、`BackgroundTaskTimelineService.ts:167,184`）——主同步路径防护不对称。修复：跳过条件补上 hydration，或 sync 结果在水合期间入队延后。

### 3.3 `loadConversation` 无代际令牌 → 快速切换跨会话混杂 DOM
水合循环（`ConversationRenderRuntime.ts:392-394`）和伪流式 sleep 链（`:241-268`）均无取消/`isConnected` 检查；`loadConversation`（`ConversationViewStateService.ts:115-194`）与 `applyLoadedConversationOutcome`（`ConversationHydrationOutcomeBridge.ts:46-59`）没有任何代际校验。快速连点两个会话：A 渲一半被 B clear，A 的循环继续把 A 的消息 append 进 B 的容器 → 两会话 DOM 混杂。修复：per-tab load generation，渲染前校验；sleep 链加 `messageEl.isConnected` 早退。

### 3.4 水合恢复覆盖用户中途滚动意图
`ConversationHydrationRenderBridge.ts:77-79` 用**捕获时刻**的 `shouldStickToBottom` 覆盖 `autoScrollEnabled`，水合期间用户上滑的意图被丢弃。恢复时应优先用户在水合期间的滚动方向/位置。

### 3.5 反例与例外（原报告未列全）
- **反例：点击当前已激活的 tab 仍全量重建。** `TabBar.ts:240` 无条件 `onTabClick`；`TabManager.ts:45-58` 的 `switchToTab` 对已激活 tab 无短路。这是最常见的误触场景，应加短路。
- 例外（不重建的路径）：流式 tab 激活走 `applyStreamingConversationActivation`（`TabConversationActivationBridge.ts:92-104`）保留 DOM；历史下拉有 `isActive` 守卫（`ConversationHistoryActionsCoordinator.ts:149-153`）。
- per-tab pane 缓存已存在（`TabMessagesPaneCoordinator.ts:103-182`），是"同会话未变则跳过 rebuild"的现成挂点。

## 4. 遗漏的第二类滚动问题：恢复后漂移（与跳顶机制不同）

跳顶是快照捕获时机问题；以下是**恢复完成后**的继续漂移，需单独修：

- 嵌入图片 `loading="lazy"` 且无 width/height（`src/utils/markdown/imageEmbed.ts:75-79`），CSS 只给 `max-width`（`markdown.css:107-117`）；用户缩略图解码前高度为 0（`chat-assistant.css:2972-2979`）。这是原实测 `scrollHeight` 818 → ~20000 的主要机制（mermaid/math 的贡献依赖用户核心插件设置，无法在本仓库证实）。
- 滚动恢复只施加两次：同步一次 + 一个 rAF（`ScrollManager.ts:169-172`）。之后图片加载撑高内容**没有任何二次校正**；用户停在中部时视口内容被顶走（`TabMessagesPaneCoordinator.ts:280-315` 只在 autoScroll 时响应）。
- collapsible 的 `ResizeObserver` 回调（`src/features/chat/rendering/collapsible.ts:100-103`）在内容撑开后把长用户消息**事后**折叠到 168px——高度双向漂移。

便宜的缓解：图片写尺寸或 `aspect-ratio` 占位；恢复后短窗口内监听 pane 的 `load` 事件（capture）重放 anchor 恢复。

## 5. 遗漏的成本与资源问题

### 5.1 折叠内容 eager 渲染浪费
工具调用的展开内容在 `display:none` 下仍同步完整渲染（`ToolCallRenderer.ts:423-445`，`:438-439` 无条件 `renderExpandedContent`）；thinking 块即使默认折叠也完整跑 markdown 且 `renderStored` 未 await（`ThinkingBlockRenderer.ts:182-186`）。改为首次展开时懒渲染，可直接砍掉 remount 成本的一大块，也顺带缓解 thinking 无节流问题。

### 5.2 真实内存泄漏
`setupCollapsible` 的 `ResizeObserver` 永不 disconnect、不返回清理句柄（`collapsible.ts:100-103`）；调用方为长用户消息（`UserMessageContentRenderer.ts:63-73,193-204`）和 notice 卡（`AssistantNoticeCardRenderer.ts:241-245`）。被 `empty()` 分离的整棵子树（含渲染好的 markdown）无法 GC，反复切换会话内存单调增长。修复：返回 dispose 句柄并在 remount 前调用。（pane 级 observer 的清理是正确的，见 `TabMessagesPaneCoordinator.ts:317-324`。）

### 5.3 重建丢失只活在 DOM 的 UI 状态
- 用户手动展开的 thinking/工具调用：存储渲染永远 `collapsedByDefault: true`（`AssistantShellViewHostAdapter.ts:306-311`），`isExpanded` 是渲染期局部变量（`ToolCallRenderer.ts:496`）；
- collapsible 状态每次新建（`UserMessageContentRenderer.ts:59-62`）；
- 聊天区文本选区无持久化（`RetainedSelectionHighlightService` 只保编辑器选区）。

建议按 message id 把展开状态外置到 runtime map——这是 keyed reconcile 的配套需求。

### 5.4 无 CSS containment（便宜缓解空间）
全 `src/style` 无 `content-visibility` / `contain-intrinsic-size`。长会话可用 `.opencodian-message { content-visibility: auto; contain-intrinsic-size: auto <估计高度>; }` 显著降布局成本；需与 `preserve-anchor` 恢复联调（未渲染区域 `getBoundingClientRect` 返回估计值）。

## 6. 对 "45 条持久化、31 条渲染" 的澄清（影响 keyed reconcile 设计）

不是虚拟化（仓库无任何窗口化逻辑），是 `getMessagesForRender` 的**过滤 + 合并**：

- 过滤后台任务完成提醒、隐藏 turn-change 记录、空消息（`ConversationIdentityRuntime.ts:117-152`）；
- 连续 assistant 消息经 `buildMessageRenderGroups` 合并成复合 id `id1__id2`（`renderGroups.ts:126-172`，合并 id 见 `:165`）。

影响：复合 id 会作为 `data-message-id` 进入滚动锚点，分组变化时锚点失效退化为 distance 模式（`ScrollManager.ts:158-160`）；keyed reconcile 的 key 设计必须处理 assistant 合并/拆分。

## 7. 其他全量重建触发源盘点（原报告只列了 2 个）

- 会话设置四项：`showTurnChangeRecords`（`SettingsConversationSection.ts:1298`）、`renderUserMarkupAsCodeBlocks`（`:1381`）单次全量；`questionCardPosition` / `showAnsweredQuestionCards` **双次并发**（见 §3.1）。
- 回退 / 恢复回退 / fork：`ConversationLoadRecoveryCoordinator.ts:438,480,584` → `loadConversation({forceServerSync})`。
- 后端会话浏览器打开会话（`OpenCodianView.ts:778,853`）、后端切换（`applyActiveBackendConversationSurface`，`:3331-3357`）。
- Obsidian 重启/布局恢复走同一全量路径（`ConversationLoadRecoveryCoordinator.ts:277-325`），preload 顺序竞态**已有防护**（`main.ts:401` + `conversationsLoaded` 幂等，`:934-942`），无需动作。
- 确认**不触发**的：主题/外观（只同步 CSS 变量，`OpenCodianView.ts:2897-2899`）、语言切换（`:3015-3022`）。

## 8. 修正后的建议优先级

1. **（新）正确性缺陷先行**：§3.1 双重建合并；§3.2 sync 加 hydration 防护；§3.3 loadConversation 加代际令牌 + sleep 链 `isConnected` 早退。这三个会产生错误 DOM，排在性能优化之前。
2. （原 1）清空前捕获完整快照，hydration 路径对齐 sync fallback 路径；同时修 distance 兜底的新旧 scrollHeight 混算（`ScrollManager.ts:72`），并让水合期间用户滚动意图优先（§3.4）。
3. （原 2/3）keyed reconcile：key 用稳定 message id，处理合并 assistant 复合 id（§6）；利用现有 pane 缓存做"同会话未变跳过 rebuild"（§3.5）；给已激活 tab 点击加短路；展开状态外置（§5.3）。
4. **（新）**折叠内容懒渲染（§5.1）+ ResizeObserver dispose（§5.2）。
5. **（新）**图片尺寸占位 + 恢复后二次校正（§4）。
6. （原 4）thinking 与伪流式纳入统一帧/时间预算；补真实滚动恢复集成测试（现有测试 mock 了快照捕获，§1#3）。
7. （原 5）补 `prefers-reduced-motion`；可顺带评估 `content-visibility`（§5.4）。

## 9. 验证方式

本文每条结论均附 `file:line`，可直接对照源码核实。行号基于工作树当前版本（另有 `EffortSelector` 与 Graphify 相关未提交变更，与本文涉及文件无关）。原报告的实机测量（83–105ms、79–90ms long task、175 次 mutation、scrollTop 跳 0）本次未复测，仅核实了代码机制层面的因果链。
