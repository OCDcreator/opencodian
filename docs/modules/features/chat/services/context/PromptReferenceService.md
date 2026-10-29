# PromptReferenceService

> **源码**: `src/features/chat/services/context/PromptReferenceService.ts`
> **状态**: [REVIEW]

## 职责

拥有统一 `@` 引用的稳定身份、当前 Vault 边界验证、候选目录与发送前准备。UI、发送流程和消息展示共用同一份 `PromptReference`，显示名称不能决定来源后端。

## 公开接口

- `encodePromptReference` / `parsePromptReferences` 将版本化身份保存在 `opencodian-ref:` Markdown token 中，支持中文与转义括号。token 可随草稿、复制和粘贴保留；不合法的 token 在发送前明确拒绝。
- `listCandidates(query, options)` 合并 Vault 文件/文件夹、当前插件存储中的六后端会话、目标后端运行时真实返回的插件/应用/资源。退休的 OpenCode 1、当前会话和其他 Vault 的目录不在来源中。
- `prepare(content, options)` 返回后端正文、可读展示正文、文件 context items、带来源的会话快照与 native mentions。最多接受 16 个去重引用。

## 会话准备

会话按 backend、plugin conversation ID 与 backend session ID 联合核验。必须同时存在于当前 Vault 目录及实际持久化记录，拒绝自引用或身份已变化的条目。

同后端先调用 host 的 `prepareNativeSessionReference`；仅明确返回原生表达式时使用该结果。其余引用调用来源后端的 `readSessionMessages`。后端离线或没有原生历史读取能力时，可退回当前 Vault 的插件缓存，并以 `source: plugin-cache` 持久化归属。

快照只投影 user/assistant 可见文本，排除工具、thinking、notice、OMO 与 synthetic 消息/parts，剥离已注入的 Obsidian 上下文、`OPENCODIAN MEMORY` / `OPENCODIAN OBSIDIAN TOOLING` marker 块与递归引用。默认总正文预算 48,000 字符，上限 120,000，按引用会话数分配；保留最近消息，并记录 `capturedAt`、截断与省略数量。发送正文用独立 `referenced_sessions` 块标识历史背景；展示正文仅保留 `@名称`。

## 文件与运行时能力

文件必须是非隐藏 Vault 相对路径，不能包含上级跳转；发送时对 Vault 和文件分别 realpath，拒绝越界 symlink。context item 的实际读取由现有 Obsidian context owner 负责。

插件/应用/资源引用只能交给其所属目标后端；发送时重新读取运行时目录，精确匹配 kind、backend、ID 与 native path。服务不把能力名称推断成可执行插件，也不跨后端转译插件引用。

## 依赖与验证

依赖 `core/types/chat`、共享 MIME 解析以及 Node path/realpath/UTF-8 编解码能力。host 由 chat runtime composition 注入，服务不依赖 `OpenCodianView` 或旧 OpenCode 全局目录。

聚焦测试：`tests/unit/features/chat/services/PromptReferenceService.test.ts`，覆盖六乘六来源/目标组合、身份与 Vault 边界、原生调用、离线来源、投影与预算。
