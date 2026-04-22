# OpenCodian 接入 OpenCode 原生自动压缩方案报告（2026-04-22）

> 基线：`C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode` 已 fast-forward 到 `origin/dev` `266e96557`（`packages/opencode/package.json` 版本 `1.14.20`）。
>
> 目标（2026-04-22 审计时）：让 OpenCodian 使用 OpenCode 后端的原生自动压缩链路，并在 UI 中正确展示“正在压缩”“压缩分隔/标记”“压缩报告”，同时让当前项目的压缩设置在可行时立即对当前后端实例生效。

## 一、结论摘要

- **2026-04-23 当前状态**：OpenCodian 已完成项目级 compaction 对齐；compaction 配置现在写入项目 `.opencode/opencode.json`，会话设置不再承载 compaction 字段，`OpenCodeService.applyCompactionConfig()` 已删除。
- OpenCode 的“正在压缩”不是通过 `session.status` 暴露，而是通过 `Session.time.compacting` 暴露；下文中“当前 OpenCodian 未接入”的描述应视为 2026-04-22 审计时的历史基线。
- OpenCode 的压缩完成后会留下两类会话工件：
  - 一条 **user compaction part**（`type: "compaction"`，带 `auto` / `overflow` / `tail_start_id`）
  - 一条 **assistant summary message**（`summary: true`，正文就是压缩报告）
- 2026-04-22 审计时的 OpenCodian：
  - 只把压缩设置写到 `.opencode/opencode.json`
  - 还没有把项目级 compaction reload、compaction transcript 工件和相关状态展示完全接上
- 当前实现已经收敛为 **项目级文件真相源 + scoped instance reload**，而不是继续维持 per-session/backend-first apply 语义。

---

## 二、OpenCode 1.14.20 的原生压缩契约

### 2.1 配置面

OpenCode 当前公开的 compaction 配置字段包括：

- `compaction.auto`
- `compaction.prune`
- `compaction.tail_turns`
- `compaction.preserve_recent_tokens`
- `compaction.reserved`

来源：

- `packages/sdk/js/src/v2/gen/types.gen.ts`
- `packages/opencode/src/config/config.ts`

其中 2026-04-22 审计时的 OpenCodian UI 只暴露了两项：

- `autoCompactionEnabled` → `compaction.auto`
- `compactionReservedTokens` → `compaction.reserved`

这意味着当时的插件还没有覆盖 `prune` / `tail_turns` / `preserve_recent_tokens`；当前实现已把这些字段纳入项目级设置编辑器。

### 2.2 自动触发链路

OpenCode 会在 prompt 循环里做上下文溢出判定：

- `packages/opencode/src/session/overflow.ts`
- `packages/opencode/src/session/prompt.ts`

关键点：

- `compaction.auto === false` 时不自动压缩
- 达到可用上下文上限时，`session/prompt.ts` 会调用 `compaction.create(...)`
- 后续由 `SessionCompaction.process(...)` 执行真正的压缩

### 2.3 手动触发链路

OpenCode SDK 已支持手动 compact / summarize：

- `sdk.session.summarize({ sessionID, providerID, modelID, auto? })`

TUI 当前就用这条接口做手动 compact：

- `packages/opencode/src/cli/cmd/tui/routes/session/index.tsx`

OpenCodian 当前也已经有 facade：

- `src/core/opencode/OpenCodeService.ts`
- `src/core/opencode/OpenCodeSessionControlOrchestrator.ts`

但没有任何插件 UI/命令真正调用它。

### 2.4 “正在压缩”信号

OpenCode 原生“正在压缩”信号不在 `session.status` 内，而在：

- `Session.time.compacting`

来源：

- `packages/sdk/js/src/v2/gen/types.gen.ts`
- `packages/opencode/src/session/session.ts`
- `packages/opencode/src/cli/cmd/tui/context/sync.tsx`

TUI 的状态判断逻辑是：

1. 先看 `session.time.compacting`
2. 再看消息最后一条推断 `working`

这说明：**如果插件只订阅 `session.status`，无法可靠知道当前正在做 compaction。**

### 2.5 压缩完成信号

OpenCode 会发出：

- `session.compacted`

公开 SDK/OpenAPI 暴露的事件负载很轻，只保证有 `sessionID`。
内部 v2 session event 还保留了 `auto` / `overflow`，但这些细节并没有完整透传到当前公开 SDK 事件模型。

这意味着插件如果想区分“自动压缩 / 手动压缩 / overflow 触发”，**不能只依赖公开事件**，还需要结合消息工件本身。

### 2.6 压缩后的会话工件

OpenCode 会留下三类与 compaction 直接相关的内容：

1. **User compaction message**
   - part `type: "compaction"`
   - 包含 `auto` / `overflow` / `tail_start_id`
2. **Assistant summary message**
   - `summary: true`
   - 正文文本就是压缩报告
3. **自动续跑 synthetic user follow-up**
   - `metadata.compaction_continue = true`
   - 内容通常是 “Continue if you have next steps...”

TUI 当前的展示方式是：

- user compaction message：插入一个可见的 `Compaction` 分隔
- assistant summary：按普通 assistant 文本渲染
- `session.time.compacting`：驱动“compacting”状态

---

## 三、OpenCodian 当前现状审计

## 3.1 已接入的部分

### A. 设置层

OpenCodian 已提供两处 compaction 设置入口：

- 全局默认：`src/features/settings/SettingsConversationSection.ts`
- 会话覆盖：`src/features/chat/ui/ConversationSessionSettingsModal.ts`

并通过：

- `src/features/chat/services/ConversationSessionSettingsCoordinator.ts`
- `src/core/config/OpencodeConfigManager.ts`

把 effective compaction 配置写入项目 `.opencode/opencode.json`。

### B. 手动 summarize facade

OpenCodian 已经有：

- `OpenCodeService.summarizeSession(...)`
- `OpenCodeSessionControlOrchestrator.summarizeSession(...)`

说明 SDK facade 层不是阻塞点。

---

## 3.2 关键缺口

### 1. 当前会话设置不保证立即生效

当前 compaction 设置保存路径是：

1. 插件直接写 `.opencode/opencode.json`
2. 重新应用 view runtime state
3. **没有调用 OpenCode 后端 `config.update()`**
4. **没有触发 `Config.invalidate()` / `Instance.dispose()` / server-side instance reload**

而 OpenCode 后端的配置读取是 instance-cache 模式：

- `packages/opencode/src/config/config.ts`
- `packages/opencode/src/effect/instance-state.ts`

如果走后端 `config.update()`，OpenCode 会在写完配置后 dispose 当前 instance；
如果只在插件侧直接改文件，则当前活跃 instance 很可能继续吃旧配置。

**结论：当前“保存 compaction 设置”只能算文件层生效，不算活动后端实例即时生效。**

### 2. 本地 `Session` 类型丢失 `time.compacting`

OpenCodian 当前 `Session` 接口只有：

- `time.created`
- `time.updated`

定义位置：

- `src/core/opencode/OpenCodeSessionLifecycleCoordinator.ts`

这会直接导致：

- `session.get()` 拿到的 `time.compacting` 没有地方存
- 当前 view / coordinator 不可能基于 typed data 展示“正在压缩”

### 3. `session.status` 被压扁成 `idle | busy | retry`

OpenCodian 当前的 `SessionActivityStatus` 与归一化逻辑只接受：

- `idle`
- `busy`
- `retry`

位置：

- `src/core/opencode/OpenCodeSyncEventRuntimeCoordinator.ts`
- `src/core/opencode/OpenCodeService.ts`

而 OpenCode 上游本来就没有把 compaction 放进 `session.status`；
所以当前状态链路天然无法表达 “compacting”。

### 4. sync runtime 没有接 `session.compacted`

当前 `SessionSyncEventUpdate` 只覆盖：

- `message.updated`
- `message.removed`
- `message.part.updated`
- `message.part.removed`
- `message.part.delta`
- `session.diff`

未包含：

- `session.compacted`

位置：

- `src/core/opencode/OpenCodeSyncEventRuntimeCoordinator.ts`

结果是压缩完成后，插件不会有一条明确的“compaction finished”轻事件来驱动 UI 收尾刷新。

### 5. `compaction` part 当前被完全忽略

OpenCodian 的 user/assistant 文本归一化目前只显式处理：

- user/assistant `text`
- user `file`（作为上下文附件）
- assistant `reasoning`
- assistant `tool`

位置：

- `src/core/opencode/OpenCodeMessageContextOmoAssembler.ts`
- `src/core/opencode/OpenCodeMessageNormalizationMapper.ts`

对 `part.type === "compaction"` 没有任何专门处理。

结果：

- OpenCode 原生那条“Compaction 分隔/标记”在插件里不会被正确还原
- user compaction message 大概率只会变成一条空白或无意义的 user turn

### 6. assistant `summary` 标记当前也没有保留

OpenCodian 本地 `Message` 类型没有 `summary?: boolean`。
所以即便压缩报告正文文本最终能显示，插件也无法知道：

- 这是不是 compaction report
- 是否需要额外 badge / notice 样式

结果：

- 现状最多只能“像普通 assistant 回复一样看到一段总结”
- 不能像上游语义那样把它标为 compaction report

### 7. `compaction_continue` synthetic user follow-up 当前未去噪

OpenCode 自动压缩后，可能插入一条 synthetic user 文本继续驱动后续推理：

- `metadata.compaction_continue = true`

OpenCodian 目前没有识别这个 metadata。

结果：

- 这条内部续跑提示有机会以普通 user message 形态泄露到插件聊天记录里
- 对最终 UI 会形成噪音

### 8. `sdk-v2-rollout.md` 已过时

当前仓库文档仍把 `session.summarize()` 写成“未实现”，但 facade 实际已存在。
这属于文档漂移，应该在实施时顺手修正。

---

## 四、可选方案对比

## 方案 A：保留本地文件写入，保存后强制重启本地 OpenCode 服务

### 做法

- 继续使用 `OpencodeConfigManager.updateCompactionConfig()`
- 保存后自动重启本地 managed server
- 用“服务重启中”来近似“设置已生效”

### 优点

- 改动小
- 不需要先补后端 config facade

### 缺点

- 只适合本地 managed server
- 对 remote/external server 不成立
- 粒度太粗：为了 compaction 设置改动重启整个服务
- 语义上仍然不是“当前 instance 热切换”

### 结论

- 可作为兜底 fallback
- **不建议作为主方案**

## 方案 B：后端优先（推荐）

### 做法

- compaction 设置改为通过 OpenCode 后端 `config.update` 写入
- 让后端负责持久化并 dispose 当前 instance
- 插件随后刷新当前会话元信息 / 状态 / UI

### 优点

- 语义正确，和 OpenCode 原生行为一致
- 本地/远端都可以成立（前提是后端配置接口可写）
- 当前会话“立即生效”的故事最清晰
- 后续能顺路扩展更多 backend-scoped session config

### 缺点

- 需要补 service/config runtime adapter
- 需要处理写入后 instance dispose 带来的短暂 reconnect/refresh

### 结论

- **推荐作为主方案**

## 方案 C：只补 UI 展示，不修即时生效

### 做法

- 只处理 `time.compacting` / `session.compacted` / compaction report UI
- 继续保留本地文件写入

### 优点

- UI 见效快

### 缺点

- 用户仍然会遇到“设置改了但当前会话不一定生效”
- 核心体验问题没解决

### 结论

- 不建议单独采用
- 最多作为方案 B 的第一阶段切片

---

## 五、推荐方案（B）的具体设计

## 5.1 后端配置应用：从“写本地文件”改为“写当前 backend 配置”

### 目标

让当前活动会话的 compaction 设置在 **当前 backend 实例** 上真正生效，而不是只在磁盘文件上生效。

### 设计

新增一条 backend-scoped compaction 应用通路，推荐放在 OpenCode service/config owner 内，而不是继续把 compaction 写入留在纯文件工具层。


> **2026-04-23 update**: This design has been implemented and evolved. Compaction config is now project-scoped (`.opencode/opencode.json`), no longer per-session/per-conversation. `SettingsConversationSection` writes via `OpencodeConfigManager.updateCompactionConfig()`, then calls `reapplyCompactionConfigFromProjectConfig()`. `applyCompactionConfig()` was removed.

Current ownership:

- `SettingsConversationSection` writes compaction config to `.opencode/opencode.json` via `OpencodeConfigManager`
- `OpenCodeService.reapplyCompactionConfigFromProjectConfig()` disposes scoped instance and verifies reload
- `applyCompactionConfig()` has been removed from `OpenCodeService`

### 为什么推荐后端写入

OpenCode 上游 `config.update()` 路径会：

1. 写配置
2. dispose 当前 instance
3. 后续请求自动在新 instance 上读取新配置

这才是真正的“当前会话配置即时生效”。

### Fallback 策略

如果 backend config update 不可用：

- **不要假装已经对当前会话生效**
- UI 必须明确区分：
  - `Applied to backend now`
  - `Saved locally / deferred until backend reload`

推荐行为矩阵：

| 场景 | 推荐行为 |
|---|---|
| 本地 managed server，可用 `config.update` | 立即应用到 backend |
| external/remote server，但 `config.update` 可写 | 立即应用到 backend |
| backend 不可达 / 不支持写入 | 标记为 deferred，不宣称即时生效 |

## 5.2 扩展会话元信息模型

需要补齐至少两类上游字段：

### Session 侧

- `Session.time.compacting?: number | null`
- 可顺带保留 `archived?`
- 可选保留 `summary?` / `share?` / `version?`，避免后续继续掉字段

### Message 侧

- `Message.summary?: boolean`

### Part 侧

`Part` 当前是宽接口，可直接容纳：

- `auto?: boolean`
- `overflow?: boolean`
- `tail_start_id?: string`
- `metadata?: Record<string, unknown>`

但还需要在归一化层真正消费这些字段。

## 5.3 实时 compaction 状态：不要再只靠 `session.status`

### 事实

- OpenCode `session.status` 没有 `compacting`
- 真实 compaction 运行态在 `Session.time.compacting`

### 推荐实现

对当前活动 tab 增加一条 **session meta refresh** 通路，来源优先级：

1. `session.get(sessionID)` / `session.list()` 的 `time.compacting`
2. `session.compacted` 事件触发的收尾刷新
3. 现有 `session.status` 仅继续用于 `busy / retry / idle`

### 推荐复用点

当前最接近的现成通路是：

- `ActiveTabContextUsageCoordinator.refreshFromServer()`
- `OpenCodeSessionControlOrchestrator.getSessionContextUsageSnapshot()`

因为它已经会读：

- `getSessionInfo(sessionId)`
- `getSessionMessages(sessionId)`
- `getAvailableModels()`

短期建议：

- 在现有 `SessionContextUsageSnapshot` 中补 `compactingAt?: number | null`
- 先复用这条 refresh 通路把 compaction 元信息带进 UI

中期建议：

- 若发现这条 snapshot 太重，再拆成更轻量的 `SessionPresentationSnapshot`

## 5.4 增量事件：增加 `session.compacted`

### 原因

仅靠轮询或被动刷新，UI 收尾会慢半拍；
`session.compacted` 可以作为：

- 停止“正在压缩”提示
- 触发一次 authoritative message/meta refresh
- 清理临时 UI 状态

### 推荐做法

在 `OpenCodeSyncEventRuntimeCoordinator` 里把 `session.compacted` 纳入 raw event union，并向上发一个轻量 update。

即便公开 SDK 事件里只有 `sessionID`，它仍然足够作为：

- “压缩完成，立刻 refresh 当前 session” 的触发信号

## 5.5 transcript 适配：把 compaction 工件还原成用户看得懂的 UI

### A. user compaction message

推荐不要把它当普通空 user 消息。

应渲染成一个专门 notice/divider，例如：

- 标题：`Context Compaction`
- 副文案：
  - `Automatic compaction`
  - `Manual compaction`
  - 如果 `overflow === true`，再追加 `Triggered after context overflow`

必要元信息：

- `auto`
- `overflow`
- `tail_start_id`（通常仅内部使用，不必直接暴露）

### B. assistant summary message

assistant summary 的正文本来就是压缩报告，应继续正常显示正文，但增加可识别语义：

- badge：`Compaction report`
- 可用 `summary: true` 作为标记

推荐不要把报告折叠到 tooltip 或只做隐藏 metadata。
它本来就是继续会话的重要上下文摘要，应该直接可读。

### C. `compaction_continue` synthetic user message

推荐不要把它当普通用户输入裸展示。

可选方案：

1. **隐藏**（推荐）
   - 当 `metadata.compaction_continue === true` 时，不作为普通 user bubble 渲染
2. **折叠为系统 notice**
   - 例如：`OpenCode resumed after compaction`

不建议：

- 继续显示成“用户说了一句 Continue...”

## 5.6 当前 UI 的具体呈现建议

### 1. 顶部/会话状态

在当前 active conversation 的 header / 会话状态区域新增：

- `Compacting…`

来源：

- `session.time.compacting` 存在时

文案建议：

- 中文：`正在压缩上下文…`
- 英文：`Compacting context…`

### 2. 上下文环 / 上下文详情

当前 `ContextRing` 与 `ContextDetailModal` 已有现成入口，可增加：

- tooltip 中的 `Compacting…`
- detail modal 中的 `Compaction in progress`
- 最近一次 compaction 完成时间（如果后续愿意持久化）

### 3. 聊天记录

建议新增两种可识别展示：

- `compaction notice card/divider`
- `assistant compaction report badge`

视觉上应保持现有 chat style，不要做全新大组件体系。

---

## 六、实施切片建议

## Slice 1：类型与文档基线补齐

目标：

- 让 OpenCodian 至少能拿到并保留 upstream compaction 元字段

范围：

- `OpenCodeSessionLifecycleCoordinator.Session`
- `OpenCodeSessionLifecycleCoordinator.Message`
- 相关 facade / snapshot types
- `docs/status/sdk-v2-rollout.md` 更正文档漂移

## Slice 2：backend-first compaction config apply

目标：

- 让当前会话 compaction 设置在 backend 真正即时生效

范围：

- OpenCode config runtime/service owner
- `ConversationSessionSettingsCoordinator`
- 保存成功后的 refresh/reconnect 逻辑
- deferred fallback 文案

## Slice 3：compaction live state

目标：

- 在插件 UI 中显示“正在压缩”

范围：

- `Session.time.compacting`
- active tab meta refresh
- `session.compacted` 事件接入
- status/header/context ring 显示

## Slice 4：transcript compaction artifacts

目标：

- 用户能看到“压缩发生了”和“压缩报告内容”

范围：

- `compaction` part 归一化
- assistant `summary` badge
- `compaction_continue` 去噪

## Slice 5：手动 compact UX（可选）

目标：

- 提供与上游 TUI 一致的“Compact session now”

范围：

- header action / slash command / session action menu
- 复用现有 `summarizeSession()` facade

---

## 七、验证要求（后续实施时）

## 功能验证

- 修改当前会话 `auto` / `reserved` 后，不手动重启插件，下一次 prompt 进入新阈值
- active session compaction 期间，header/status 明确显示 `Compacting…`
- compaction 完成后，聊天记录出现：
  - 一条 compaction notice
  - 一条可读的 compaction report
- `compaction_continue` 不以普通用户消息泄露
- 手动 compact（若实现）能走通

## 回归验证

- 普通非 compaction user message 渲染不受影响
- 上下文附件恢复与 OMO 渲染不回退
- `session.status` / `todo` / `diff` 现有逻辑不被破坏
- reload / hydration / 多 tab 同步继续正常

## 建议触达文件（实施期）

- `src/core/opencode/OpenCodeSessionLifecycleCoordinator.ts`
- `src/core/opencode/OpenCodeSessionControlOrchestrator.ts`
- `src/core/opencode/OpenCodeSyncEventRuntimeCoordinator.ts`
- `src/core/opencode/OpenCodeService.ts`
- `src/core/opencode/OpenCodeMessageContextOmoAssembler.ts`
- `src/core/opencode/OpenCodeMessageNormalizationMapper.ts`
- `src/features/chat/services/ConversationSessionSettingsCoordinator.ts`
- `src/features/chat/services/ActiveTabContextUsageCoordinator.ts`
- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/ui/ContextRing.ts`
- `src/features/chat/ui/ContextDetailModal.ts`
- `src/i18n/locales/en.ts`
- `src/i18n/locales/zh.ts`
- `docs/status/sdk-v2-rollout.md`

---

## 八、推荐决策

**推荐按以下顺序推进：**

1. 先做 **Slice 1 + Slice 2**
   - 先把“当前会话 compaction 设置立即生效”修正到正确语义
2. 再做 **Slice 3**
   - 补上 `time.compacting` / `session.compacted`
3. 最后做 **Slice 4**
   - 让 transcript 里的 compaction notice 与 report 语义完整

这样可以避免先做 UI、再发现底层状态源不对而返工。

---

## 九、当前判断

如果今天直接进入实现，**最值得先动的不是 UI，而是设置应用链路**：

- 现在最大的用户感知风险，不是“看不到压缩报告”
- 而是“设置明明改了，但当前后端实例不一定真的吃到了”

只有把这个底层语义修正为 backend-first，后面的 `Compacting…` 状态和 report 展示才不会建立在错误假设上。
