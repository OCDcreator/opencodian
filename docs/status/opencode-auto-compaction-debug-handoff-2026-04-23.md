# OpenCodian / OpenCode 原生自动压缩调试交接报告（2026-04-23）

> 目标：为下一次新会话提供足够完整的背景、现状、证据、可复现路径和调试方向，使大模型能直接进入“分析 + 调试”而不是重新摸底。

## 1. 背景

当前任务是让 `OpenCodian` 正确适配 `OpenCode` 的原生自动压缩（auto compaction）能力，重点不是做 UI 美化，而是先把**契约、runtime 信号、transcript 工件、backend 生效语义**接对。

本轮之前的基线报告在：

- `docs/status/opencode-auto-compaction-adaptation-report-2026-04-22.md`

上游参考仓库：

- `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode`

已核实上游基线：

- `dev` 已在 `266e965572ccc499b585e4a3558b93e56625e10d`
- `packages/opencode/package.json` 版本为 `1.14.20`

## 2. 这轮已经完成的实现

### 2.1 Slice 3：live state / refresh

已落地：

- 接入 `session.compacted`
  - `src/core/opencode/OpenCodeSyncEventRuntimeCoordinator.ts`
  - `src/features/chat/services/ConversationSyncBridge.ts`
- 接入 `Session.time.compacting -> compactingAt -> context usage summary`
  - `src/core/opencode/OpenCodeSessionControlOrchestrator.ts`
  - `src/features/chat/services/ContextUsageService.ts`
  - `src/features/chat/services/ContextUsageDisplayService.ts`
  - `src/features/chat/ui/ContextRing.ts`
  - `src/features/chat/ui/ContextDetailModal.ts`

当前语义：

- `session.compacted` 会在 visible current conversation 上**强制走 server reload**
- `compactingAt` 目前只接入了**最小必要展示链**（context ring / detail modal）
- 没有扩 scope 到更大的 header polish

### 2.2 Slice 4：transcript compaction artifacts

已落地：

- `compaction` part -> 可读 user marker
- assistant `summary: true` -> 本地 `ChatMessage.summary`
- assistant summary 不再与普通 assistant merge，也不走 pseudo-stream
- summary 正文上方显示 `Compaction report / 压缩报告` badge
- `metadata.compaction_continue` synthetic user follow-up 去噪

主要落点：

- `src/core/opencode/OpenCodeMessageContextOmoAssembler.ts`
- `src/core/opencode/OpenCodeMessageNormalizationMapper.ts`
- `src/core/types/chat.ts`
- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/renderGroups.ts`
- `src/features/chat/services/ConversationRenderRuntime.ts`
- `src/i18n/locales/en.ts`
- `src/i18n/locales/zh.ts`

## 3. 已验证通过的静态 / 单测 /构建状态

本地已通过：

- `npm run check:module-docs`
- `npm test`
- `npm run build`
- `npm run verify`
- `graphify update .`

历史构建 BUILD_ID（当时验证过部署）：

- `main.202604222343`

## 4. 真实 smoke 测试结论

## 4.1 先说结论

结论分两层：

1. **OpenCode backend 的原生 auto compaction 是真实可触发的**
2. **OpenCodian 对 compaction transcript 的适配是有效的**

但还有一个未完全收口的问题：

3. **OpenCodian / sidecar 路径里的 backend-first compaction apply 仍有可疑的不一致**

## 4.2 最终成功验证的真实路径

不是直接通过 OpenCodian UI 触发，而是通过：

- 修改 `Test Vault` 的 `.opencode/opencode.json`
- 选择合适模型
- 用 `opencode` CLI 在真实 backend session 中连续运行
- 导出该 session
- 再把这条 session 拉回 OpenCodian 验证 UI / transcript 结果

### 为什么一开始没触发？

一开始用的是：

- provider/model: `zhipuai-coding-plan/glm-4.5-air`

后来确认上游 overflow 判定逻辑里：

- `reserved` 只有在 `model.limit.input` 存在时才真正参与可用上下文阈值计算
- 否则走的是 `context - maxOutputTokens` 分支

上游证据：

- `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\opencode\src\session\overflow.ts:12`
- `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\opencode\src\session\overflow.ts:14`

这意味着：

- 对 `glm-4.5-air` 这种没有 `limit.input` 的模型，单纯把 `compaction.reserved` 调大，并**不会**像预期那样显著降低 overflow 阈值

### 最终能稳定触发的模型

最终改用：

- `opencode/gpt-5-nano`

并把 `Test Vault` 配置临时改成：

- `compaction.auto = true`
- `compaction.reserved = 260000`

在该条件下，真实 backend session 已出现：

- `type: "compaction"` part
- assistant `summary: true`
- `metadata.compaction_continue = true`

导出证据：

- `C:\Users\lt\Desktop\Write\testvault\.obsidian-debug\cli-nano-export.json:230`
- `C:\Users\lt\Desktop\Write\testvault\.obsidian-debug\cli-nano-export.json:245`
- `C:\Users\lt\Desktop\Write\testvault\.obsidian-debug\cli-nano-export.json:352`
- `C:\Users\lt\Desktop\Write\testvault\.obsidian-debug\cli-nano-export.json:540`
- `C:\Users\lt\Desktop\Write\testvault\.obsidian-debug\cli-nano-export.json:555`
- `C:\Users\lt\Desktop\Write\testvault\.obsidian-debug\cli-nano-export.json:726`
- `C:\Users\lt\Desktop\Write\testvault\.obsidian-debug\cli-nano-export.json:898`
- `C:\Users\lt\Desktop\Write\testvault\.obsidian-debug\cli-nano-export.json:913`
- `C:\Users\lt\Desktop\Write\testvault\.obsidian-debug\cli-nano-export.json:1065`

## 4.3 拉回 OpenCodian 后的适配结果

将这条已发生 compaction 的真实 session 拉入 OpenCodian 后，应用内结果为：

- `summaryCount = 4`
- `compactionMarkerCount = 4`
- `continueLeakCount = 0`

直接证据：

- `.obsidian-debug/auto-compaction-load-cli-session.log`

关键行：

- `.obsidian-debug/auto-compaction-load-cli-session.log:25`

DOM 证据：

- badge 抓取：`.obsidian-debug/auto-compaction-badges.summary.json:8`
- badge 文本：`.obsidian-debug/auto-compaction-badges.txt:1`
- 消息区文本抓取：
  - `.obsidian-debug/auto-compaction-message-content.txt:5`
  - `.obsidian-debug/auto-compaction-message-content.txt:8`
  - `.obsidian-debug/auto-compaction-message-content.txt:257`
  - `.obsidian-debug/auto-compaction-message-content.txt:260`

这说明 OpenCodian 当前已经能正确做到：

- 把 `compaction part` 变成可读 marker
- 把 assistant `summary` 变成独立 report + badge
- 把 `compaction_continue` synthetic user 文本隐藏掉

## 4.4 live `time.compacting` 的情况

这次真实 smoke **没有可靠捕捉到插件内实时的 `time.compacting` 可见瞬间**。

现状判断：

- 代码链路已经接上了
- 但在真实 smoke 中没有稳定看到它进入 UI 可见态

可能原因包括：

- compaction 太快，active tab refresh 窗口没撞上
- `session.compacted` 触发后立即 reload，导致只看到收尾状态
- 仍缺一个更直接的 active-session meta refresh/observe 时机

所以当前对 Slice 3 的判断是：

- **契约接入完成**
- **收尾 refresh 接入完成**
- **实时观测 `compacting` 的用户可见性仍需继续调**

## 5. 当前最值得追的可疑点

## 5.1 backend config apply / config read-write investigation

> **2026-04-23 更新**: `applyCompactionConfig()` 已删除。Compaction 配置现在通过 `SettingsConversationSection` 直接写入 `.opencode/opencode.json`，再由 `reapplyCompactionConfigFromProjectConfig()` 让 sidecar 重读。如果 config scope 问题仍然存在，新的调查路径应聚焦于 `OpencodeConfigManager.updateCompactionConfig()` + `OpenCodeService.reapplyCompactionConfigFromProjectConfig()` 链路。

之前的调查方向（已归档）：

- `src/core/opencode/OpenCodeService.ts`
  - `getBackendResolvedConfigForUpdate()` (已删除)
  - `updateBackendResolvedConfig()` (已删除)
  - `applyCompactionConfig()` (已删除)
- sidecar 实际打到的：
  - `/config`
  - query `directory`
  - `sdk.config.get/update`
- CLI 的：
  - `opencode debug config`
  - 与插件 sidecar 的 scope 是否完全一致

## 5.2 `glm-4.5-air` 这类模型上对 `reserved` 的预期误判

这个不是插件 bug，而是上游契约理解坑。

如果下次再做 smoke，不要再默认拿：

- `zhipuai-coding-plan/glm-4.5-air`

去验证 “把 `reserved` 调大就更容易自动压缩”。

因为对这类模型：

- `reserved` 不一定是主要控制杆

更适合的 smoke 模型是：

- 明确存在 `limit.input` 的模型

## 5.3 真实 `compacting` 可见态仍需单独追

本轮能确认：

- compaction 后 transcript 适配是好的
- 但实时 “正在压缩” 可见性没有拿到很漂亮的用户态证据

建议下一轮不要一上来再做 transcript 适配，而是聚焦：

- 如何在真实 compaction 发生期间把 `time.compacting` 撞进 active-tab UI

## 6. 当前相关代码触点

建议下一轮优先读这些文件：

### OpenCodian

- `src/core/opencode/OpenCodeService.ts`
- `src/core/opencode/OpenCodeSyncEventRuntimeCoordinator.ts`
- `src/core/opencode/OpenCodeMessageContextOmoAssembler.ts`
- `src/core/opencode/OpenCodeMessageNormalizationMapper.ts`
- `src/core/types/chat.ts`
- `src/features/chat/services/ConversationSyncBridge.ts`
- `src/features/chat/services/ContextUsageService.ts`
- `src/features/chat/services/ContextUsageDisplayService.ts`
- `src/features/chat/services/ActiveTabContextUsageCoordinator.ts`
- `src/features/chat/ui/ContextRing.ts`
- `src/features/chat/ui/ContextDetailModal.ts`
- `src/features/chat/renderGroups.ts`
- `src/features/chat/services/ConversationRenderRuntime.ts`
- `src/features/chat/OpenCodianView.ts`

### OpenCode upstream

- `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\opencode\src\session\overflow.ts`
- `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\opencode\src\session\prompt.ts`
- `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\opencode\src\session\compaction.ts`
- `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\opencode\src\server\routes\instance\config.ts`
- `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\sdk\js\src\v2\gen\sdk.gen.ts`
- `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\sdk\js\src\v2\gen\types.gen.ts`

## 7. 已生成/可复用的本地证据文件

### 插件部署 / reload

- `.obsidian-debug/auto-compaction-reload.log`
- `.obsidian-debug/auto-compaction-reload.summary.json`

### 插件内 smoke 探针

- `.obsidian-debug/auto-compaction-probe.log`
- `.obsidian-debug/auto-compaction-smoke.log`
- `.obsidian-debug/auto-compaction-smoke-file-config.log`
- `.obsidian-debug/auto-compaction-load-cli-session.log`

### DOM 抓取

- `.obsidian-debug/auto-compaction-badges.txt`
- `.obsidian-debug/auto-compaction-badges.summary.json`
- `.obsidian-debug/auto-compaction-message-content.txt`
- `.obsidian-debug/auto-compaction-message-content.summary.json`

### CLI / backend 真值

- `C:\Users\lt\Desktop\Write\testvault\.obsidian-debug\cli-nano-export.json`
- `C:\Users\lt\Desktop\Write\testvault\.obsidian-debug\cli-nano-1.jsonl`
- `C:\Users\lt\Desktop\Write\testvault\.obsidian-debug\cli-auto-export.json`
- `C:\Users\lt\Desktop\Write\testvault\.obsidian-debug\cli-auto-1.jsonl`
- `C:\Users\lt\Desktop\Write\testvault\.obsidian-debug\cli-auto-2.jsonl`
- `C:\Users\lt\Desktop\Write\testvault\.obsidian-debug\cli-auto-3.jsonl`

## 8. 本轮最关键的结论摘要

1. **OpenCodian 的 transcript 适配已经基本正确**
   - `compaction` marker 正常
   - `summary` badge/report 正常
   - `compaction_continue` 去噪正常

2. **OpenCode backend 的 auto compaction 已真实复现**
   - 但最终是通过 CLI + 合适模型 + 临时 project config 触发的

3. **OpenCodian 里最可疑的未解点不是 transcript，而是 backend-first apply / config scope**
   - 插件路径下的 config apply/read 行为和 CLI `debug config` 表现不完全一致

4. **`time.compacting` 的实时可见态还需要继续调**
   - 代码链路接了
   - 但本轮没拿到强力的实时用户证据

## 9. 建议下一轮调试策略

下一轮不要再把时间花在“是否支持 compaction transcript”上，这一层已经有真实 smoke 证明可以工作。

更值得的顺序是：

### 第一步：查清 config scope / apply 口径

> **2026-04-23 更新**: `applyCompactionConfig()` 已删除。Compaction 现在通过 `OpencodeConfigManager.updateCompactionConfig()` 直接写入 `.opencode/opencode.json`，再由 `reapplyCompactionConfigFromProjectConfig()` 重读。如果 scope 问题仍存在，新的比较基线应为：
> - `OpencodeConfigManager.updateCompactionConfig()` 写入后的文件内容
> - `OpenCodeService.reapplyCompactionConfigFromProjectConfig()` 的 read-back 结果
> - `opencode debug config` 的输出
> - 三者的 `directory` scope 是否一致

之前的比较方向（已归档）：
- ~~OpenCodian `applyCompactionConfig()`~~ (已删除)
  - HTTP `PATCH /config?directory=...`
  - `sdk.config.get/update`
  - `opencode debug config`
- 目标：
  - 搞清楚为什么插件路径里“写成功但读回不稳定/不对称”

### 第二步：在 sidecar 模式下稳定复现真实 auto compaction

- 选一个有 `limit.input` 的模型
- 不要继续依赖 `glm-4.5-air` 去证明 `reserved` 行为
- 确保 compaction 配置确实作用在当前 running instance

### 第三步：只调 `time.compacting` 的实时可见性

- 一旦能在 sidecar 模式稳定触发 compaction
- 再专门调 active-tab refresh 时机
- 目标是拿到：
  - compaction 期间 `isCompacting === true`
  - compaction 完成后 `session.compacted` 收尾清理

---

## 10. 可直接用于新会话的提示词

下面这段可以直接复制到新会话中：

```text
请在 `C:\Users\lt\Desktop\Write\custom-project\opencodian` 接手调试 OpenCodian 对 OpenCode 原生自动压缩（auto compaction）的适配问题。

先读：
- `AGENTS.md`
- `docs/status/opencode-auto-compaction-adaptation-report-2026-04-22.md`
- `docs/status/opencode-auto-compaction-debug-handoff-2026-04-23.md`

上游基线：
- `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode`
- `dev` 已到 `266e965572ccc499b585e4a3558b93e56625e10d`
- 版本 `1.14.20`

当前已知事实，请先核实，不要盲信：

1. Slice 3 + Slice 4 代码已经基本落地：
   - `session.compacted` 已接入 sync/runtime
   - `Session.time.compacting -> compactingAt -> ContextUsageSummary` 已接入最小展示链
   - `compaction` part 已适配成可读 marker
   - assistant `summary` 已保留并显示 `Compaction report / 压缩报告` badge
   - `metadata.compaction_continue` 已去噪

2. 本地验证已通过：
   - `npm run verify`
   - `graphify update .`

3. 真实 smoke 的关键结论：
   - OpenCode backend 的原生 auto compaction 已真实触发成功
   - 真实证据见：
     - `C:\Users\lt\Desktop\Write\testvault\.obsidian-debug\cli-nano-export.json`
   - 其中存在：
     - `type: "compaction"`
     - `summary: true`
     - `metadata.compaction_continue = true`
   - OpenCodian 把这条 session 拉回后，当前 UI 适配结果是：
     - `summaryCount = 4`
     - `compactionMarkerCount = 4`
     - `continueLeakCount = 0`
   - 证据见：
     - `.obsidian-debug/auto-compaction-load-cli-session.log`
     - `.obsidian-debug/auto-compaction-badges.summary.json`
     - `.obsidian-debug/auto-compaction-message-content.summary.json`

 4. 当前最可疑的未解点：
    - OpenCodian / sidecar 路径里的 config apply 可能存在 config scope / read-write 不一致
    - **注意**: `applyCompactionConfig()` 已删除；现在的链路是 `OpencodeConfigManager.updateCompactionConfig()` 写入 `.opencode/opencode.json` + `reapplyCompactionConfigFromProjectConfig()` 重读
    - 如果 scope 问题仍存在，比较：
      - `OpencodeConfigManager.updateCompactionConfig()` 写入后的文件内容
      - `reapplyCompactionConfigFromProjectConfig()` 的 read-back 结果
      - `opencode debug config` 的输出
    - 怀疑点集中在：
      - `src/core/opencode/OpenCodeService.ts` 的 `reapplyCompactionConfigFromProjectConfig()`
      - sidecar 的 `/config` scope / `directory` query
     - `sdk.config.get/update` 与 CLI `debug config` 的口径差异

5. 另一个重要坑：
   - 不要再默认用 `zhipuai-coding-plan/glm-4.5-air` 来证明“调大 reserved 就更容易 auto compact”
   - 上游 `packages/opencode/src/session/overflow.ts` 里，`reserved` 只有在 `model.limit.input` 存在时才直接参与阈值计算
   - 对 `glm-4.5-air` 这类模型，这条直觉并不成立
   - 这次真正触发 compaction 的模型是 `opencode/gpt-5-nano`

这次新会话的目标不是重做 transcript 适配，而是聚焦：

优先级 1：
- 查清 OpenCodian sidecar 路径下 `OpencodeConfigManager.updateCompactionConfig` / `reapplyCompactionConfigFromProjectConfig` / `GET /config` / CLI `opencode debug config` 的 scope 和行为差异

优先级 2：
- 让 OpenCodian 自己（不是只靠 CLI）在 sidecar 模式下稳定复现真实 auto compaction

优先级 3：
- 一旦 sidecar 下能稳定复现，再继续调 `Session.time.compacting` 的实时可见性，让 active tab 真正显示“正在压缩上下文…”

请注意：
- 遵守 repo maintainability guardrails
- 不要扩 scope 到大范围 UI polish
- 不要修改 `reference-projects/`
- 如果触及源码，务必同步对应 `docs/modules/**`
- 如果改了代码，结束前跑：
  - 最小相关测试
  - `npm run check:module-docs`
  - `npm test`
  - `npm run build`
  - 能过则 `npm run verify`
  - 若改了代码文件，再跑 `graphify update .`

交付时请明确给我：
1. 你确认了哪些已知事实，哪些被推翻
2. backend-first apply 的真实问题根因是什么
3. OpenCodian sidecar 路径下现在是否能稳定触发 auto compaction
4. `time.compacting` 是否已在真实 runtime 中可见
5. 你用了哪些本地证据文件和代码位点
```

## 2026-04-23 补充：项目级压缩配置对齐已完成

以下语义纠偏已经落地到本 worktree：

- `ConversationSessionSettings` 已移除 compaction 字段，只保留 `chatFontSizePx`
- `OpenCodianSettings` 已移除 `autoCompactionEnabled` / `compactionReservedTokens`
- 会话设置弹窗不再出现 compaction 分组
- 设置页 compaction 控件现在直接编辑项目 `.opencode/opencode.json`，覆盖全部 upstream 字段（`auto`, `prune`, `tail_turns`, `preserve_recent_tokens`, `reserved`）
- 保存 compaction 后走项目级 instance reload（`reapplyCompactionConfigFromProjectConfig`），不再走 per-session runtime apply
- `OpenCodeService.applyCompactionConfig()` 已删除

未来调试压缩行为时，请以项目 `.opencode/opencode.json` 为压缩配置真相源，不再从会话设置或插件 settings 里找 compaction 参数。
