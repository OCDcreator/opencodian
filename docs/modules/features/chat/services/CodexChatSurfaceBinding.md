# CodexChatSurfaceBinding

> **源码**: `src/features/chat/services/CodexChatSurfaceBinding.ts`
> **状态**: [ACTIVE]

## 概述

`CodexChatSurfaceBinding.ts` 拥有 Codex 专属的聊天表面生命周期，把两件会让受保护的 `OpenCodianView` 壳增长 net-new runtime ownership 的行为收口到独立 owner：

1. 订阅 Codex adapter 的 `skills/changed` 信号 → 立即失效共享 slash 命令菜单缓存（而非仅靠 120s TTL）。
2. 当 Codex 为活跃后端、用户键入 `@` 时，显示可操作提示（Codex 无原生 agent 派发 API），并提供进入 Codex 资源管理设置的入口。
3. 当用户打开 Codex skill 选择器（`/skills` 或 `$`）但无 runtime skill 时，显示可操作空态提示（原因 + 管理项目 skills 的设置入口）。

view 仅组合本 binding（构造、`syncSkillsChangedSubscription()`、`notifyAgentMentionUnavailable()`、`dispose()`），不再直接持有 subscription/disposable 或 Notice DOM。

## 导入关系

上游: `obsidian`（Notice）、`core/agents/backend`（Disposable 类型）、`i18n`
下游: `OpenCodianView`（组合）

## 核心导出

| 导出 | 说明 |
|------|------|
| `CodexChatSurfaceBinding` | Codex 聊天表面绑定；`syncSkillsChangedSubscription()`、`notifyAgentMentionUnavailable()`、`dispose()` |
| `CodexChatSurfaceBindingHost` | `{ getCodexAdapter, invalidateSlashCommandMenuCache, openPluginSettings, isCodexActive }` |

## 核心行为

- `syncSkillsChangedSubscription()`：幂等；仅 Codex 活跃时订阅 adapter `onSkillsChanged` → 失效缓存；非活跃或已订阅时安全 no-op/dispose。
- `notifyAgentMentionUnavailable()`：显示 6s Notice + "打开 Codex 资源" 按钮（点击打开插件设置）。
- `notifySkillsEmpty()`：显示 6s Notice + "管理 Codex 技能" 按钮（Codex `/skills`/`$` 无 runtime skill 时的可操作空态）。
- `dispose()`：清理 skills/changed 订阅。

## 注意事项

- 本 owner 存在的理由是把受保护壳文件的 runtime ownership 增长隔离出来；新增 Codex 聊天表面行为应扩展本 owner，而非回灌 `OpenCodianView`。
- runtime 真相仍由 `CodexAppServerClient.listSkills()` / `skills/changed` 驱动；本 binding 仅负责失效信号与 UI 提示。
