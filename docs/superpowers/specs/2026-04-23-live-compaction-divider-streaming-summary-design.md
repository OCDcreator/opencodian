# Live Compaction Divider + Streaming Summary Design

## Goal

让 OpenCodian 的自动压缩体验对齐 OpenCode：压缩一开始就让用户在聊天流里看到明确但轻量的“正在压缩上下文”分隔，并让压缩摘要在其下方实时生成，而不是等压缩结束后才突然出现结果。

## Chosen Approach

采用“同一视觉组件同时承接 live 与 transcript”方案：

- 当当前会话进入 `compacting` 时，在所属会话 tab 的聊天流中插入一条临时 compaction divider。
- 当服务端真正产出 user `compaction` part 后，不再把它降级成普通 user markdown 文本，而是映射成同一种 compaction divider 视图模型。
- assistant `summary: true` 继续保持独立 assistant 消息，但在当前会话渲染路径里允许实时增长，形成可见的摘要流式生成体验。
- `session.compacted` 继续负责最终一致性收尾，但不能把刚出现的 live compaction UI 立刻冲掉。

## Why This Approach

- 直接解决“用户不知道系统在干什么”的问题。
- 视觉风格更适合 Obsidian：保留边界感，但不引入又重又吵的系统提示卡。
- 避免 live 与 reload 各搞一套 compaction 呈现，减少后续维护分叉。
- 与 upstream OpenCode 的核心感知一致：先看到 compaction 分隔，再看到摘要内容。

## Scope

### In Scope

- 聊天流中的轻量 compaction divider
- `compactingAt` 驱动的 live compaction 可见态
- `summary: true` 摘要消息的实时可见增长
- user `compaction` part 的专门 transcript 渲染
- tab 切换 / tab 关闭期间的 compaction UX 规则
- 对应测试与模块文档同步

### Out of Scope

- 修改 OpenCode backend 的 compaction 触发时机
- 修改项目级 compaction 配置保存 / reload 逻辑
- 改造底部 context ring 的整体交互
- 更换现有 summary 内容生成提示词

## UX Details

### 1. Live divider

- 文案：`正在压缩上下文`
- 形态：两侧细线 + 中央轻量胶囊标签
- 进行中态可以带一个很轻的活动指示，但不能像 warning / error notice 那样抢眼
- 它不是普通 notice card，也不是普通 user message markdown

### 2. Completed divider

- compaction 完成后，这条分隔保留在 transcript 中
- 文案切成静态完成态，例如 `上下文已压缩`
- 若服务端 compaction marker 已经落库，应以服务端 transcript 为真相源继续渲染

### 3. Summary rendering

- divider 下方直接出现 compaction summary assistant 消息
- 该消息在当前会话 tab 中允许实时增长
- 不再只在完成后以“整条落地”的方式出现
- 原有 `压缩报告` 语义可以保留，但应弱化为轻量 metadata，不再另起一个很重的标题块

### 4. Tab behavior

- **切换 tab**：允许。compaction live UI 绑定在所属 tab 上，不漂移到别的会话；切回时应恢复到最新状态。
- **关闭 tab**：若该 tab 正在 compaction / summary 流式过程中，沿用现有 busy 保护，不允许关闭。

## Implementation Notes

- 当前 `compactingAt` 已经进入 `ContextUsageSnapshot`，但只投影到底部 context usage UI；需要把这条状态桥接到聊天渲染 runtime。
- 当前 `part.type === "compaction"` 仍被文本化；需要改成结构化 compaction render model，而不是继续塞回普通 user content。
- 当前 `message.summary` 会被排除在 pseudo-stream 之外；需要为 compaction summary 增加可控的 live render 路径，但不要误伤普通 summary / notice / question resolution。
- `session.compacted` 目前会驱动 visible conversation 直接走 server reload；需要确保 reload 不会闪掉刚刚出现的 compaction divider / live summary。

## Files Expected

- Modify: `src/core/types/chat.ts`
- Modify: `src/core/opencode/OpenCodeMessageNormalizationMapper.ts`
- Modify: `src/core/opencode/OpenCodeMessageContextOmoAssembler.ts`
- Modify: `src/features/chat/OpenCodianView.ts`
- Modify: `src/features/chat/renderGroups.ts`
- Modify: `src/features/chat/services/ConversationRenderRuntime.ts`
- Modify: `src/features/chat/services/ConversationSyncBridge.ts`
- Modify: `src/features/chat/services/ContextUsageService.ts`
- Modify: `src/features/chat/services/ContextUsageDisplayService.ts`
- Modify: `src/features/chat/ui/ContextRing.ts`
- Modify: `src/features/chat/ui/ContextDetailModal.ts`
- Modify: `src/i18n/locales/zh.ts`
- Modify: `src/i18n/locales/en.ts`
- Modify: `src/style/**/*.css` or the owning style source that currently defines chat message shells
- Modify: `tests/unit/**` around chat normalization / render runtime / compaction transcript behavior
- Modify: `docs/modules/features/chat/**`
- Modify: `docs/modules/core/opencode/**`

## Verification

- 先补 failing tests，覆盖 live divider、summary 实时增长、compaction marker transcript、tab 切换/关闭规则
- 跑 targeted Jest，确认新行为成立且旧行为未回退
- 跑 `npm run verify`
- 如行为明显变化，再做一次 Test Vault 部署验证
