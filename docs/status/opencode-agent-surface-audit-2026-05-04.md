# OpenCode @agent 机制与 OpenCodian 接入审计

日期：2026-05-04

## 结论先行

这次对照后的主结论是：

1. 上游 OpenCode 的 `@agent` 不是“直接发一个 subtask”，而是先在 composer 里生成 `AgentPart`，再由后端把它翻译成带 `task` tool 提示的结构化发送路径。
2. OpenCodian 已经接上了 agent 目录、配置、发送请求和 child-session 图，但 composer 侧还没有做成 OpenCode 那种一等 `@agent` 交互。
3. 因此 OpenCodian 的缺口不是“完全没有 agent 能力”，而是“producer/UI 侧缺显式代理意图入口；transport、task tool 展开和 child-session 导航已经先铺好了一部分”。

## 上游 OpenCode：`@agent` 是怎么跑起来的

### 1. 桌面壳只是入口，真正 UI 在共享 app

OpenCode 有 Tauri 和 Electron 两套桌面入口，但它们都只是把壳层挂到共享的 `@opencode-ai/app` 上。

- Tauri 壳创建主窗口并加载 `/`：[`packages/desktop/src-tauri/src/windows.rs`](/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode/packages/desktop/src-tauri/src/windows.rs:52)
- Tauri 前端根节点把 `AppInterface` 挂到共享 app：[`packages/desktop/src/index.tsx`](/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode/packages/desktop/src/index.tsx:493)
- Electron renderer 也同样包了一层 `AppInterface`：[`packages/desktop-electron/src/renderer/index.tsx`](/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode/packages/desktop-electron/src/renderer/index.tsx:364)

### 2. 会话页与 composer 的落点

会话页主结构是 `MessageTimeline` + `SessionComposerRegion`，composer 区域最终落到 `PromptInput`。

- session 页面实际挂载 `MessageTimeline`：[`packages/app/src/pages/session.tsx`](/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode/packages/app/src/pages/session.tsx:1840)
- session 页面实际挂载 `SessionComposerRegion`：[`packages/app/src/pages/session.tsx`](/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode/packages/app/src/pages/session.tsx:1888)
- composer 区域在非 child / 非 blocked 情况下挂载 `PromptInput`：[`packages/app/src/pages/session/composer/session-composer-region.tsx`](/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode/packages/app/src/pages/session/composer/session-composer-region.tsx:253)

### 3. `@agent` 候选怎么来的

agent 列表来自当前目录的 `sdk.app.agents()`，前端先 normalize，再做两类过滤：

- 主 agent 选择器只保留 `mode !== "subagent"` 且非 hidden：[`packages/app/src/context/local.tsx`](/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode/packages/app/src/context/local.tsx:64)
- `@agent` 补全只保留 `!hidden && mode !== "primary"`：[`packages/app/src/components/prompt-input.tsx`](/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode/packages/app/src/components/prompt-input.tsx:560)

候选渲染也很明确：`@name` 走 brain 图标 + pill 样式。

- `@` 弹层里的 agent 候选渲染：[`packages/app/src/components/prompt-input/slash-popover.tsx`](/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode/packages/app/src/components/prompt-input/slash-popover.tsx:49)

### 4. `@agent` 在前端只是一个 part，不是直接执行

选中 `@agent` 后，输入框插入的是 `AgentPart` pill：

- `createPill()` 会把 agent 变成 `contenteditable=false` 的 pill：[`packages/app/src/components/prompt-input.tsx`](/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode/packages/app/src/components/prompt-input.tsx:673)
- 输入检测用 `@(\S*)$` 打开补全：[`packages/app/src/components/prompt-input.tsx`](/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode/packages/app/src/components/prompt-input.tsx:883)
- agent 候选选中后，`handleAtSelect()` 构造 `type: "agent"` 的 part：[`packages/app/src/components/prompt-input.tsx`](/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode/packages/app/src/components/prompt-input.tsx:567)

request builder 也不是把 `@agent` 拼回纯文本，而是把它转成原生 part：

- `AgentPart` 定义：[`packages/opencode/src/session/message-v2.ts`](/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode/packages/opencode/src/session/message-v2.ts:197)
- request builder 输出 `type: "agent"` part：[`packages/app/src/components/prompt-input/build-request-parts.ts`](/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode/packages/app/src/components/prompt-input/build-request-parts.ts:120)

### 5. 后端把 `agent` part 翻译成 task-tool 提示

真正的“让模型去调用子代理”发生在后端 prompt assembly 里：

- `prompt.ts` 给 `agent` part 追加 synthetic text，明确提示模型调用 task tool：[`packages/opencode/src/session/prompt.ts`](/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode/packages/opencode/src/session/prompt.ts:1240)
- 进入循环后，后端会先收集 `subtask` parts，再在分支里调用 `handleSubtask()`；这才是原生处理路径，而不是普通 `@agent` mention 的直接落点：[`packages/opencode/src/session/prompt.ts`](/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode/packages/opencode/src/session/prompt.ts:1416)、[`packages/opencode/src/session/prompt.ts`](/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode/packages/opencode/src/session/prompt.ts:1461)
- slash command 的 subtask 分支才会直接构造 native `subtask` part：[`packages/opencode/src/session/prompt.ts`](/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode/packages/opencode/src/session/prompt.ts:1714)

### 6. child session 的 UI 并不只是“日志”

task tool 在后端会创建 child session，并把 `sessionId` 写进 tool metadata；UI 层再把它渲染成可打开的 task 卡。

- task tool 会创建 child session：[`packages/opencode/src/tool/task.ts`](/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode/packages/opencode/src/tool/task.ts:70)
- task tool 随后把 `metadata.sessionId` 写入 tool metadata：[`packages/opencode/src/tool/task.ts`](/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode/packages/opencode/src/tool/task.ts:111)
- task tool UI 显示 subagent、description、status，并提供打开子会话按钮：[`packages/ui/src/components/message-part.tsx`](/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode/packages/ui/src/components/message-part.tsx:1713)
- task card 的交互主体在 `message-part.tsx`，CSS 里也有独立的 `task-tool-card` 样式：[`packages/ui/src/components/basic-tool.css`](/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode/packages/ui/src/components/basic-tool.css:173)
- 子会话标题会从 parent task metadata 推导，header 也保留 parent breadcrumb：[`packages/app/src/pages/session/message-timeline.tsx`](/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode/packages/app/src/pages/session/message-timeline.tsx:320)
- 子会话 composer 被禁用，逻辑上有明显的 parent/child 导航体验：[`packages/app/src/pages/session/composer/session-composer-region.tsx`](/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode/packages/app/src/pages/session/composer/session-composer-region.tsx:249)

## OpenCodian：现在怎么接 agent

### 1. 目录、配置和文件 truth 已经接起来了

OpenCodian 的 agent 面已经不是单一 config 了，而是 runtime + project config + markdown file 三层聚合：

- `AgentCatalogService` 聚合三层真相：[`src/core/agents/AgentCatalogService.ts`](/Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/src/core/agents/AgentCatalogService.ts:12)
- `MarkdownAgentWorkspaceService` 扫描四个 Markdown agent 根目录：[`src/core/agents/MarkdownAgentWorkspaceService.ts`](/Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/src/core/agents/MarkdownAgentWorkspaceService.ts:39)
- 它负责 scan，但不负责 runtime refresh，也不负责 merge：[`src/core/agents/MarkdownAgentWorkspaceService.ts`](/Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/src/core/agents/MarkdownAgentWorkspaceService.ts:205)
- Markdown agent 文件的 create/update/delete 也收在同一个 service 里：[`src/core/agents/MarkdownAgentWorkspaceService.ts`](/Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/src/core/agents/MarkdownAgentWorkspaceService.ts:333)、[`src/core/agents/MarkdownAgentWorkspaceService.ts`](/Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/src/core/agents/MarkdownAgentWorkspaceService.ts:345)、[`src/core/agents/MarkdownAgentWorkspaceService.ts`](/Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/src/core/agents/MarkdownAgentWorkspaceService.ts:357)

settings 页把 runtime、project config、file truth 一起读出来，再交给 catalog service 合并：

- `SettingsAgentsSection.refreshCatalog()` 并行拉 `sdk.app.agents()`、project config、default agent 和 markdown workspace：[`src/features/settings/SettingsAgentsSection.ts`](/Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/src/features/settings/SettingsAgentsSection.ts:278)
- 默认主代理下拉只列 `defaultEligible`：[`src/features/settings/SettingsAgentsSection.ts`](/Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/src/features/settings/SettingsAgentsSection.ts:346)

### 2. project agent 编辑器已经完整接上

`SettingsProjectAgentEditor` 负责项目级 agent 的核心字段 CRUD：

- 这里能改 `mode / description / prompt / model / temperature / top_p / steps / color / disable / task allowlist / options`：[`src/features/settings/SettingsProjectAgentEditor.ts`](/Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/src/features/settings/SettingsProjectAgentEditor.ts:478)
- 保存后通过 `OpencodeConfigManager.upsertAgentConfig()` 写回：[`src/features/settings/SettingsProjectAgentEditor.ts`](/Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/src/features/settings/SettingsProjectAgentEditor.ts:470)

### 3. 发送链路已经支持显式 agent intent

OpenCodian 这边已经有一个很完整的 transport 层：

- `SurfaceInvocationIntent` 明确有 `primaryAgent / mentions / subtasks`：[`src/core/agents/types.ts`](/Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/src/core/agents/types.ts:315)
- `AgentInvocationService` 会把它翻译成 top-level `agent` + `agent`/`subtask` native parts：[`src/core/agents/AgentInvocationService.ts`](/Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/src/core/agents/AgentInvocationService.ts:13)
- `MessageSendPreparationService` 接收 `invocationIntent` 并把解析结果塞进 structured payload：[`src/features/chat/services/MessageSendPreparationService.ts`](/Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/src/features/chat/services/MessageSendPreparationService.ts:280)
- `SendPipelineRuntime` 再把 resolved agent 写进 `sendStreamMessage()`：[`src/features/chat/runtime/SendPipelineRuntime.ts`](/Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/src/features/chat/runtime/SendPipelineRuntime.ts:197)
- `OpenCodePromptRequestBuilder` 已经支持 `agent` 和 `subtask` request parts：[`src/core/opencode/OpenCodePromptRequestBuilder.ts`](/Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/src/core/opencode/OpenCodePromptRequestBuilder.ts:36)

### 4. 但 composer 入口还没有变成 OpenCode 式的 `@agent`

这是当前最关键的缺口。

OpenCodian 的 composer 现在还是 textarea + slash command menu：

- `ComposerInputShellCoordinator` 只监听 input/keydown，并刷新 slash 菜单：[`src/features/chat/services/ComposerInputShellCoordinator.ts`](/Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/src/features/chat/services/ComposerInputShellCoordinator.ts:132)
- 菜单查询只解析 `/`，不解析 `@`：[`src/features/chat/services/ComposerInputShellCoordinator.ts`](/Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/src/features/chat/services/ComposerInputShellCoordinator.ts:478)
- `buildComposerInputSubmission()` 只区分 `shell` / `command` / `prompt`：[`src/features/chat/services/ComposerInputShellCoordinator.ts`](/Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/src/features/chat/services/ComposerInputShellCoordinator.ts:72)

也就是说，OpenCodian 现在“能发带 agent intent 的请求”，但“还没有一个可见、可点、可组合的 composer producer 去生产这些 intent”。

这里也要避免误读：这不表示 agent mention / pill / source span 的用户消息渲染已经完成。当前 OpenCodian 的 message normalization 会跳过非 text part，用户消息 renderer 主要渲染 visible text 和 context attachments；agent part 目前更多只是参与 context usage 字符统计。

- 非 text part 在 message content assembly 阶段会被跳过：[`src/core/opencode/OpenCodeMessageContextOmoAssembler.ts`](/Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/src/core/opencode/OpenCodeMessageContextOmoAssembler.ts:113)
- 用户消息 renderer 主要处理 visible text 与 context attachments：[`src/features/chat/runtime/UserMessageContentRenderer.ts`](/Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/src/features/chat/runtime/UserMessageContentRenderer.ts:38)
- agent part 当前参与 usage 字符统计：[`src/features/chat/services/ContextUsageDisplayService.ts`](/Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/src/features/chat/services/ContextUsageDisplayService.ts:354)

### 5. child-session 与 task 展示已经有，但不是上游那种一等工作流

OpenCodian 并不是没有 task / child-session UI，而是它更偏向“渲染和导航层”：

- `ToolCallRenderer` 会把 task tool 展开成 agent、description、status、session，并提供打开子会话按钮：[`src/utils/streaming/ToolCallRenderer.ts`](/Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/src/utils/streaming/ToolCallRenderer.ts:122)
- `ChildSessionGraphCoordinator` 会渲染 session tree，并且可以打开 child session：[`src/features/chat/services/ChildSessionGraphCoordinator.ts`](/Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/src/features/chat/services/ChildSessionGraphCoordinator.ts:173)
- `OpenCodianView` 把 child-session graph coordinator 接到现有 view 生命周期里：[`src/features/chat/OpenCodianView.ts`](/Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/src/features/chat/OpenCodianView.ts:1403)

所以更准确的说法是：

- 有 task card
- 有 child-session tree
- 有打开子会话的动作
- 但没有上游那种以 `@agent` / subtask 为中心的 composer 一等交互闭环

## 主要差异与不一致

### 1. 不是“没有 agent 接入”，而是“producer 和 transport 分离得很明显”

OpenCodian 的后端链路已经很完整，但用户界面层没有把 `@agent`、`subtask`、`primary agent` 统一成一条直观的聊天输入流。

### 2. `primaryAgent` 选择还不是同一个 UX 面

上游有 per-send 主 agent 选择器，和 `@agent` 候选是两个不同的过滤集合。

- 主 agent 列表排除 `subagent` 和 hidden：[`packages/app/src/context/local.tsx`](/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode/packages/app/src/context/local.tsx:64)
- `@` 候选排除 primary：[`packages/app/src/components/prompt-input.tsx`](/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode/packages/app/src/components/prompt-input.tsx:560)

OpenCodian 目前有主 agent 控件，但它是在 model/setting 层面，和 composer 的 intent 生产不是同一个东西。

### 3. `@agent` 的语义不要写成“直接发 subtask”

这点需要特别收窄措辞：

- 普通 `@agent` 先是 `AgentPart`
- `AgentPart` 进入 request payload
- 后端再用 synthetic prompt 提示模型调用 `task` tool
- 原生 `subtask` part 主要来自 slash command / 结构化 task 路径

### 4. child-session 体验不要写成“完全没有”

OpenCodian 已经能打开子会话，也有 tree，但它的形态更像“辅助视图”，而不是上游那种子会话为中心的完整 composer 流。

### 5. 一个需要保留的验证限定

OpenCodian settings 页当前读的是 `sdk.app.agents()`，这和上游 TUI 里显式 workspace 读取的写法不完全一样；如果要把“runtime catalog 完全等价”写死，最好再做一次运行时验证。

- OpenCodian settings 当前调用：[`src/features/settings/SettingsAgentsSection.ts`](/Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/src/features/settings/SettingsAgentsSection.ts:280)
- 上游 TUI 显式传 `{ workspace }`：[`packages/opencode/src/cli/cmd/tui/context/sync.tsx`](/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode/packages/opencode/src/cli/cmd/tui/context/sync.tsx:392)

## 最终判断

如果只用一句话概括：

> OpenCode 把 `@agent` 做成了 composer → request part → synthetic task hint → child session 的完整链路；OpenCodian 已经把 catalog、配置、发送和下游渲染接上了，但 composer 入口还没补成同等体验。
