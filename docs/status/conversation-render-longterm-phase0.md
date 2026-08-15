# 会话渲染链路长期收敛 · Phase 0 基线、契约与风险矩阵

> Worktree: `.worktrees/zcode-conversation-render-longterm`
> 分支: `zcode/conversation-render-longterm`
> 基线提交: `478ecffee882b6abeede394d86c60f55e82c1f9e` ("fix(chat): stabilize conversation rendering and hydration")
> 产出日期: 2026-08-08
> 状态: **已获 Codex 独立 APPROVED**（本文件冻结记录 2026-08-08 的 Phase 0 基线；后续 Phase 1–4 实现与验收不回写本历史快照）

---

## 0. 工作区预条件验证

| # | 条件 | 结果 |
|---|------|------|
| 1 | 当前目录是指定 worktree | ✅ `/Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/.worktrees/zcode-conversation-render-longterm` |
| 2 | HEAD = 基线 `478ecffe` | ✅ `478ecffee882b6abeede394d86c60f55e82c1f9e` |
| 3 | 分支 ≠ main | ✅ `zcode/conversation-render-longterm` |
| 4 | 无未预期用户修改 | ✅ Phase 0 前 `git status --porcelain` 干净；Phase 0 后工作树仅含预期的 `devlog.md` 修改、本证据文档（`conversation-render-longterm-phase0.md`）和 `docs/status/phase0-evidence/` 证据输出，无其他文件修改 |

主 worktree 处于 `main`，本次工作**未触碰**主 worktree / main。未 push。

## 1. 最重要的 Phase 0 发现：基线已是「修复后」状态

**补充审查报告 (`conversation-render-review-supplement.md`) 在基线中可见；基线提交 `478ecffe` 的 devlog（2026-08-06 条目）记录了完整的四阶段修复，实现了报告里推荐的绝大部分改动。** 因此 Phase 0 的任务是逐条核实哪些已关闭、哪些仍开放，并据此重新划定 Phase 1–4 的实际工作量。

### 补充报告条目 vs 基线实际状态（差异清单）

| 报告 § | 报告描述的问题 | 基线状态 | 源码证据 |
|--------|---------------|---------|---------|
| §1#1 / §2.1 | 激活清空重建全部消息 | **设计如此，但有代际保护**（不再交错追加） | `ConversationRenderService.ts:301-375` 三层 owner/generation 校验 |
| §1#2 / §2.5 | hydration 快照在重建**后**捕获 → 跳顶 | **已关闭** | `ConversationRenderService.ts:328` `captureElementScrollRestoreSnapshot` 在 `clearMessagesContainer()`(line 358) **之前**调用 |
| §1#3 | 测试 mock 掩盖快照时机 | **已关闭** | devlog 明确「移除掩盖问题的过度 mock，改用真实 DOM/真实 snapshot 函数」 |
| §2.3 | 签名按索引比较，中部插入回退全量 | **部分缓解**：keyed reconcile 用稳定 message id（不再纯索引） | `ConversationKeyedReconcileDelegate`（基线新增，doc +57 行） |
| §2.5 距离兜底 | 新 scrollHeight + 旧 scrollTop 混算 distance | **已关闭** | 快照在 clear 前捕获，含旧 scrollHeight |
| §3.1 | 设置开关双并发全量重建 → 重复消息 | **已关闭** | devlog「合并为单次 `refreshQuestionUi()`」+ rerender 串行化队列 |
| §3.2 | 可见 sync 缺 hydration 防护 | **已关闭** | `ConversationSyncRuntimeCoordinator.ts:178` `if (runtime.isHydratingConversation) deferConversationSyncUntilHydrationSettles`，有界重试 |
| §3.3 | loadConversation 无代际令牌 → 跨会话混杂 DOM | **已关闭** | `ConversationRenderService.ts:342` `shouldContinueRender: () => isRenderOwner(...) && surfaceGeneration === && paneSurfaceGeneration`；逐条渲染前后校验 |
| §3.4 | 水合恢复覆盖用户中途滚动意图 | **已关闭** | `resolveEffectiveScrollRestoreSnapshot` 以 scrollTop>0 / userScrollIntent 判定用户接管 |
| §3.5 | 点击已激活 tab 仍全量重建 | **已关闭** | `ConversationTabRuntimeCoordinator.ts:547` `if (getActiveTab()?.id === tabId) return` 短路 |
| §4 图片晚到漂移 | 无尺寸占位 → scrollHeight 暴涨 | **部分关闭** | `imageEmbed.ts:78` 显式 `\|宽x高` 设置尺寸，无显式尺寸时加 `has-intrinsic-placeholder` + `aspect-ratio: auto 16/9` 占位（注：报告说「无投机占位」，代码实际**有** aspect-ratio 占位——见下方诚实边界） |
| §4 二次校正 | 恢复后无 late-load 重放 | **已关闭** | `ScrollManager.restoreElementScrollAfterRender` `lateContentReapplyWindowMs=1500`，anchor 模式 capture 监听 load 重放 |
| §5.1 折叠 eager render | tool/thinking collapsed 下仍完整渲染 | **故意未修（开放）** | `ToolCallRenderer.ts:435,443` 仍 `renderExpandedContent` at `display:none`。devlog 明确「折叠懒渲染评估后放弃」 |
| §5.2 ResizeObserver 泄漏 | setupCollapsible 不 disconnect | **已关闭** | `collapsible.ts:147` 返回 dispose 句柄，`observer?.disconnect()`（:142），`disposeCollapsiblesWithin` 在 replaceChildren 前调用 |
| §5.3 展开状态丢失 | 只活在 DOM 的展开状态重建后丢 | **开放** | 展开状态仍是渲染期局部变量；keyed reconcile 保留未变消息的 DOM 节点（连带折叠态），但全量重建路径无状态外置 |
| §5.4 CSS containment | 无 content-visibility | **故意未修（开放）** | devlog「仅作实验项，实机验证前不提交」 |
| §6 复合 id | keyed reconcile key 必须处理合并/拆分 | **已关闭** | keyed reconcile 测试 `reconciles a mid-list assistant merge/split` |
| §7 触发源盘点 | 多个全量重建源 | **已记录**，无需动作 | — |
| §1#5/#6 帧预算 | 伪流式 / thinking 无节流 | **已关闭** | `MarkdownRenderScheduler`（96ms 预算），thinking per-state scheduler + flush |
| §7 入场动画 reduced-motion | 缺 `prefers-reduced-motion` | **已关闭** | devlog「消息入场动画补 `prefers-reduced-motion`（chat-user.css）」 |

### 诚实边界

1. **§4 图片占位措辞分歧**：devlog 说「确认图片嵌入仅在用户显式 `|宽x高` 语法时设置尺寸、**无投机占位**」，但 `imageEmbed.ts:78-79` 在无显式尺寸时**确实**附加了 `has-intrinsic-placeholder` class 与 `aspect-ratio: auto 16/9`。即 devlog 描述与代码实现存在轻微不一致——代码比 devlog 声称的更积极。这属于「证据修正」，Phase 0 不改代码，仅在此记录，供后续阶段决策时知晓真实占位行为。
2. **§5.1 折叠懒渲染**：基线**故意保留** eager render，理由（devlog）是「展开时才全文渲染会把最大单次渲染成本挪到交互时刻且错误处理移到点击路径」。这正是 spec **Phase 2** 的目标范围，需重新评估该理由是否仍然成立。

## 2. Phase 0 测试证据

### 渲染链路 focused tests（feature.chat-services / feature.chat-runtime / shared.utils-streaming）

完整命令与运行输出已保存至 `docs/status/phase0-evidence/`，可独立复核。

**Group 1（10 套件 / 92 测试，✅ 全绿）**，输出见 `docs/status/phase0-evidence/focused-tests-group1.txt`：
```
npm run test -- \
  tests/unit/features/chat/ConversationRenderService.test.ts \
  tests/unit/features/chat/ConversationRenderService.canonicalOrder.test.ts \
  tests/unit/features/chat/ConversationRenderService.canonicalReadPath.test.ts \
  tests/unit/features/chat/ConversationRenderService.compactionDivider.test.ts \
  tests/unit/features/chat/ConversationRenderService.keyedReconcile.test.ts \
  tests/unit/features/chat/ConversationRenderService.renderAbort.test.ts \
  tests/unit/features/chat/ConversationRenderService.renderFlows.test.ts \
  tests/unit/features/chat/ConversationRenderService.rerenderSerialization.test.ts \
  tests/unit/features/chat/ConversationRenderService.trailingAssistantPatch.test.ts \
  tests/unit/features/chat/ConversationRenderRuntime.test.ts
```

**Group 2（19 套件 / 155 测试，✅ 全绿）**，输出见 `docs/status/phase0-evidence/focused-tests-group2.txt`：
```
npm run test -- \
  tests/unit/features/chat/ConversationHydrationOutcomeBridge.test.ts \
  tests/unit/features/chat/ConversationHydrationRenderBridge.test.ts \
  tests/unit/features/chat/ConversationHydrationRuntimeViewHostFactory.test.ts \
  tests/unit/features/chat/ConversationViewStateService.test.ts \
  tests/unit/features/chat/ConversationViewStateService.generation.test.ts \
  tests/unit/features/chat/ConversationTransitionBridge.test.ts \
  tests/unit/features/chat/ScrollManager.test.ts \
  tests/unit/features/chat/ScrollManager.scrollRestore.test.ts \
  tests/unit/features/chat/TabMessagesPaneCoordinator.test.ts \
  tests/unit/features/chat/ConversationTabRuntimeCoordinator.test.ts \
  tests/unit/features/chat/ConversationTabRuntimeCoordinator.assembly.test.ts \
  tests/unit/features/chat/ConversationTabRuntimeCoordinator.phase.test.ts \
  tests/unit/features/chat/ConversationTabRuntimeCoordinator.followUpQueue.test.ts \
  tests/unit/features/chat/ConversationTabRuntimeCoordinator.tabsDisabled.test.ts \
  tests/unit/features/chat/ConversationTabLifecycleRecoveryCoordinator.test.ts \
  tests/unit/features/chat/ConversationTabLifecycleRecoveryCoordinator.diagnostics.test.ts \
  tests/unit/features/chat/ConversationLoadRecoveryCoordinator.assembly.test.ts \
  tests/unit/utils/streaming/MarkdownRenderScheduler.test.ts \
  tests/unit/utils/streaming/ThinkingBlockRenderer.test.ts
```

| 套件分组 | 套件数 | 测试数 | 结果 |
|---------|--------|--------|------|
| Group 1（RenderService + RenderRuntime + keyed reconcile） | 10 | 92 | ✅ pass |
| Group 2（hydration / scroll / tab / scheduler / thinking） | 19 | 155 | ✅ pass |
| **合计** | **29** | **247** | **✅ 全绿** |

### 8 个复现场景 → 现有测试映射

| # | 场景 | 现有单元覆盖 | 真实运行时验证 |
|---|------|------------|--------------|
| 1 | 同会话无语义变化 refresh | **无**（keyed reconcile 覆盖 sync 路径，但**显式 full refresh 的 no-op 短路无测试**） | 待 Phase 4 |
| 2 | 中部消息变化 sync | `keyedReconcile.test.ts`: insert/remove/edit/reorder/merge/split | 待 Phase 4 |
| 3 | rapid A→B→A | `ConversationViewStateService.generation.test.ts`; `renderAbort.test.ts` | 待 Phase 4 |
| 4 | 用户离开底部后 hydration | `ScrollManager.scrollRestore.test.ts` | 待 Phase 4 |
| 5 | hydration 期间用户真实滚动 | `ScrollManager.scrollRestore.test.ts`（jsdom 模拟） | 待 Phase 4（物理输入） |
| 6 | collapsed tool/thinking block | `ThinkingBlockRenderer.test.ts`（流式）；tool 折叠态无独立测试 | 待 Phase 4 |
| 7 | late image/content | `ScrollManager.scrollRestore.test.ts`（late reapply 窗口） | 待 Phase 4（真实图片解码） |
| 8 | 长消息 pseudo-stream | `ConversationRenderService.renderFlows.test.ts`; `ConversationRenderRuntime.test.ts` | 待 Phase 4（真实长任务） |

> jsdom 单元测试证明**机制正确**，但不证明**真实 Obsidian 运行时**无回归。真实运行时证据统一在 Phase 4 采集（spec 硬性要求「必须使用真实 Test Vault」）。Phase 0 不部署、不改码，故无新 BUILD_ID。

## 3. 门禁状态

| 门禁 | 状态 | 备注 |
|------|------|------|
| focused tests | ✅ 247/247 | — |
| `check:module-docs` | ✅ coverage 591/591, diff 0 | — |
| `check:graphify` | ❌ **stale** | 本次检查发现 stale，唯一差异为 `tool:graphify-version`。current digest 值随运行环境/时间漂移（不同环境复现得到不同 current 值），故不固定完整 current 值；stale 判断本身稳定可复现。Phase 0 未刷新（属内容变更）。归因说明：Phase 0 未改源码（`git status --porcelain -- src/` 为空），HEAD 即基线 `478ecffe`，故本次 stale 反映的是基线源码状态；完整证据见 `docs/status/phase0-evidence/graphify-baseline-attribution.txt`（`graphify-status.txt` 是更早的同内容输出）。待首个源码 Phase 随改动一起 `graphify:update:src` |
| `typecheck` / `lint` | 未在 Phase 0 单独跑（无源码改动，基线 `npm run verify` 含） | — |
| Test Vault BUILD_ID | 本次检查观察到部署构建 mtime（`2026-08-07 22:51:58`）早于基线提交（`2026-08-08 00:39:15 +0800`），即 Test Vault 当前运行的是早于基线的构建 | 完整 `stat` / SHA-256 / manifest 输出见 `docs/status/phase0-evidence/testvault-baseline.txt`。精确运行时 BUILD_ID 值因 minified bundle 无法静态提取，需 live Obsidian 探测；Phase 4 部署后重取并比对 |

## 4. 当前渲染契约（基线已建立的不变量）

Phase 1+ 不得破坏以下契约：

1. **全量重建的原子提交**：detached staging root 渲染完整历史，owner/generation 校验通过后才一次性 `clearMessagesContainer()` + `append`；失败 pass 丢弃 staging tree，不清空、不提交。
2. **三层 supersession 校验**：`isRenderOwner(conversationId, activeTabId, messagesEl, renderGeneration)` + `getConversationRenderSurfaceGeneration(host)` + `getPaneRenderSurfaceGeneration(messagesEl)`。任一失效即中止。
3. **快照先于 clear**：`captureElementScrollRestoreSnapshot` 在任何 `clearMessagesContainer()` 之前于 live DOM 捕获（含真实 message-id anchor、旧 scrollHeight）。
4. **用户滚动意图优先**：恢复时以 live `autoScrollEnabled` / `userScrollIntent` 修正快照，不覆盖 hydration 期间用户的真实滚动。
5. **late-content reapply 窗口**：anchor 模式 1500ms 内 capture 监听容器 `load` 事件重放 anchor，用户接管即 dispose。
6. **可见 sync 在 hydration 期间延后**：`isHydratingConversation` 时 defer（有界重试 40×150ms），不直接改 DOM。
7. **点击已激活 tab 短路**：`handleTabSwitch` 在 `getActiveTab()?.id === tabId` 时直接 return。
8. **keyed reconcile 在 sync 路径**：incremental 为 null 时先 `tryApply`（稳定 message id，保留 DOM node identity + 折叠态），返回 false 才全量 fallback。
9. **rerender 串行化队列**：`rerenderQueue` + `rerenderGeneration`，同 tick 重复请求合并，被 supersede 的旧请求跳过。
10. **帧预算**：`STREAMING_MARKDOWN_RENDER_MIN_INTERVAL_MS=96`，pseudo-stream / thinking / StreamController 共享 `MarkdownRenderScheduler`；stream end 必须 `flush()`。
11. **collapsible dispose**：`setupCollapsible` 返回幂等 dispose 句柄；`replaceChildren` / `empty` 前调用 `disposeCollapsiblesWithin`。
12. **跨历史会话切换默认回底部**（产品契约；若改需先提产品决策）。

## 5. 风险矩阵（开放项 → 归属 Phase）

| 风险 | 严重度 | 基线状态 | 归属 Phase | 验收方式 |
|------|--------|---------|-----------|---------|
| **显式 full refresh 无 no-op 短路**（即便无视觉变化也重建 DOM、丢折叠态） | 高 | 开放 | **Phase 1** | unchanged refresh sameNode 回归测试 + 真机 |
| **§5.3 展开状态未按 message id 外置**（全量重建丢用户手动展开） | 中 | 开放 | **Phase 1/2** | 展开状态跨 full-refresh 保留测试 |
| **§5.1 折叠 eager render**（tool/thinking collapsed 仍全文渲染） | 中 | 故意开放 | **Phase 2** | collapsed 不触发完整 render 测试 + DOM/long-task 对比 |
| **`check:graphify` 基线 stale** | 低 | 既有 | 随首个 Phase 一起刷新 | `npm run graphify:update:src` 后 `check:graphify` 绿 |
| **Test Vault 部署 < 基线**（运行旧构建） | 低 | 既有 | **Phase 4** | 部署基线/新构建后重取 BUILD_ID + SHA-256 |
| **§4 devlog/代码占位措辞分歧** | 信息 | 既有 | 记录，不改码 | — |
| **`content-visibility` 未评估** | 低 | 故意开放 | **Phase 4**（可选，需真机） | 真实布局/滚动证据证明不破坏 anchor restore |
| **伪流式/thinking 帧预算对超长消息的实际成本未实测** | 中 | 机制已修，无实测量 | **Phase 4** | 真实 long-task/CLS/MutationObserver 采样（jsdom 无法采集，见 Phase 3 核实） |

## 6. 各 Phase 验收标准（基于基线实际状态调整）

### Phase 1 — 减少 unnecessary remount，强化 keyed render transaction

**实际工作量小于 spec 原文**，因为 keyed reconcile、代际保护、tab 短路、串行化队列基线已具备。剩余核心：

- [ ] 为 `performRerenderConversationMessages` 增加 render-input fingerprint（rendered message sequence + visual signature + canonical source + 相关显示设置 hash）
- [ ] fingerprint 未变时直接 no-op（不清空、不重建、不丢失折叠态）
- [ ] 仅局部消息变化时优先 keyed reconcile（已有），但需确认从 full-rerender 入口也能走 keyed 路径而非总是 staging
- [ ] assistant 合并/拆分复合 id 的锚点退化（已有 reconcile 测试，补 full-refresh 路径测试）
- [ ] **不得**把 `OpenCodianView.ts` / `OpenCodeService.ts` 变成更厚 runtime owner
- [ ] **不得**改变「跨历史会话切换默认回底部」产品契约

回归测试（必须补）：
- unchanged refresh 保持 sameNode（**当前无测试，是 Phase 1 核心交付**）
- full-refresh 期间 stale generation 不写入当前 pane（`renderAbort.test.ts` 已覆盖 sync 路径，补 explicit-refresh 路径）
- 展开工具块/thinking 状态不因无变化 refresh 丢失（与 §5.3 联动）

### Phase 2 — 懒渲染和展开状态生命周期

- [ ] tool call expanded result 默认轻量 placeholder，首次展开才完整 render（重新评估基线「故意放弃」的理由）
- [ ] thinking stored block 默认折叠不立即完整渲染
- [ ] 展开/折叠复用已渲染内容
- [ ] message id + block id 的 runtime expansion-state ownership（配合 §5.3）
- [ ] 所有 observer/listener/scheduler/timer 可 dispose（基线已具备 collapsible dispose，补 tool/thinking lazy path）
- [ ] 可访问性不丢：header / aria-expanded / Enter/Space / pending/error

### Phase 3 — 流式调度和长会话性能

> **Phase 3 核实结论**：帧预算统一（3 路径共享 96ms）、取消语义（generation guard + isConnected + detached staging）、`prefers-reduced-motion`、`is-rehydrating`/hydration-settled 标记在基线代码层均已具备。以下两项需真实运行时，**显式移交 Phase 4**（jsdom 无法采集）：

- [x] authoritative sync / tail patch / pseudo-stream / full refresh 不交错覆盖（基线有代际保护；Phase 3 补真实 async-gate 交错集成测试 + pseudo-stream staging guard 修复）
- [x] `prefers-reduced-motion` / `is-rehydrating` / hydration-settled 标记（基线已具备；Phase 3 补 hydration-settled marker 直接断言测试）
- [ ] **（移交 Phase 4）** 真实 long-session MutationObserver / ResizeObserver / longtask / CLS / 帧采样
- [ ] **（移交 Phase 4）** 可选 `content-visibility` 评估（需真实布局/滚动证据）

### Phase 4 — 真实 Obsidian 验收

- 部署基线/新构建到 Test Vault，记录 BUILD_ID + dist/Test Vault SHA-256
- 10 个真机场景 + 每场景证据（DOM node identity、anchor rect、scrollTop、distance、~16ms layout sample、fresh-window CLS/longtask、MutationObserver、`obsidian dev:errors`）
- 最终门禁：focused tests + `verify` + `build` + module-docs + graphify + Test Vault hash 一致 + 无新增 dev errors

## 7. Phase 0 边界声明

- Phase 0 **未修改任何源码**；当前工作树仅包含预期的 `devlog.md` 修改、本 Phase 0 证据文档（`conversation-render-longterm-phase0.md`）和 `docs/status/phase0-evidence/` 下的测试/graphify 输出，未出现其他文件修改。
- 未跑 `graphify:update:src`（属内容变更，待 Codex 批准后随 Phase 改动）。
- 未部署 Test Vault（基线无源码变更，部署无意义；Phase 4 统一真机验证）。
- 真机复现场景（8 项）的**真实运行时证据**统一在 Phase 4 采集；Phase 0 仅提供单元测试映射作为机制正确性证据。
- §4 devlog/代码占位措辞分歧已记录，Phase 0 不改码。

---

**历史停止点**：Phase 0 已获独立 Codex `APPROVED`。本文件只保留当时的基线、证据边界与阶段决策；后续实现、门禁与 Test Vault 真机验收以对应提交和本次运行工件为准。
