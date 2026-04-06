# OpenCodian Obsidian 联动 MVP 开发状态

> 更新日期：2026-03-30
>
> 这份文档面向后续开发接力，说明当前这期 Obsidian 联动 MVP 的目标、范围、实现状态、关键文件和下一步建议。它不是产品说明文档，而是开发状态文档。

---

## 1. 当前结论

- 本期目标是“聊天侧 Obsidian 联动 MVP”，不做 `inline edit` 编辑器内联工作流。
- 本地完整存储是硬约束，不做 `metadata-only` 会话瘦身。
- 上下文采用“显式、单次发送态”策略，不自动注入，不跨轮次继承。
- OpenCode Server 负责执行、同步、补齐服务端信息，但不是本地历史的唯一真相来源。

---

## 2. 方案目标

本期要解决的是：让 OpenCodian 在聊天场景里真正和 Obsidian 工作流接上，而不是只做一个普通的 AI 聊天框。

具体目标如下：

1. 用户可以把当前笔记、当前选区、某个 vault 文件显式加入本次发送上下文。
2. 上下文既能在本地模式下走真实文件引用，也能在远程模式下安全降级。
3. 用户消息要把这些上下文完整落盘，后续 reload 还能恢复。
4. 服务端会话同步不能把本地 UI 专属字段和上下文标记抹掉。
5. `question.asked`、`file.edited` 这类 SDK 事件要进入聊天 UI，而不是只留在底层日志里。
6. 继续复用现有 Markdown 联动能力，不重做一套单独渲染链。

---

## 3. 范围与非目标

### 3.1 本期范围

- 聊天输入区增加 Obsidian 上下文 tray
- 新增“当前笔记 / 当前选区 / 选择文件”三种上下文入口
- 新增两个编辑器命令，把当前笔记或选区送入当前 tab 的草稿上下文
- 发送态上下文映射到 `QueryOptions.contextItems`
- 本地完整持久化 `contextAttachments`
- `question.asked` 渲染为问题卡片并支持回复/拒绝
- `file.edited` 触发 `session.diff()` 并生成持久 notice

### 3.2 本期明确不做

- `inline edit`
- metadata-only 会话存储
- 自动注入当前笔记或当前选区
- 跨轮次继承上下文
- 图片、PDF、音频等多媒体上下文
- 用 `Conversation.externalContextPaths` 承担本期的新联动能力

---

## 4. 方案总览

本期采用的是“视图层显式收集上下文，发送时按运行模式转换”的方案。

### 4.1 发送前

- 每个 tab 的运行态新增 `draftContextItems`
- 输入区上方渲染 context tray
- 用户可显式加入：
  - 当前笔记
  - 当前选区
  - 选择文件

### 4.2 发送时

- `OpenCodianView` 从当前 tab 读取 `draftContextItems`
- 将其转换为本地持久化用的 `contextAttachments`
- 同时把原始 `PromptContextItem[]` 通过 `QueryOptions.contextItems` 传给 `OpenCodeService`
- 本次发送结束后，draft context 会清空

### 4.3 服务层映射

- 本地模式：
  - `current_note` / `file` 转为真实 `file://` `FilePartInput`
  - `selection` 也转为 `file://`，并追加 `?start=&end=` 行号
  - `selection` 额外补 `source.text` 快照，便于恢复和展示
- 远程模式：
  - 不发送 `file://`
  - 所有上下文降级为 synthetic text part
  - 统一包裹为 `<obsidian_context ...>...</obsidian_context>`
  - 仅允许文本文件，大小上限 `64 KB`

### 4.4 同步与回填

- 从服务端 hydration user message 时，尝试从 file part 或 synthetic text part 恢复 `contextAttachments`
- 如果本地 optimistic message 已有 `contextAttachments`，但服务端 hydration 结果缺失，则保留本地版本
- 插件自有 notice 消息继续作为本地持久消息，不因服务端同步被删除

---

## 5. 集成功能

### 5.1 显式上下文选择

- 输入区新增 context tray
- 入口固定为：
  - `当前笔记`
  - `当前选区`
  - `选择文件`
- 每个 tab 独立维护当前草稿上下文，不互相污染

### 5.2 命令集成

已新增两个命令：

- `Add current note to OpenCodian context`
- `Add selection to OpenCodian context`

它们会先激活 OpenCodian 视图，再把上下文加入当前 tab 的 draft context。

### 5.3 类型与本地持久化

新增类型：

- `PromptContextItem`
- `MessageContextAttachment`

上下文字段固定为：

- `id`
- `kind`
- `path`
- `label`
- `mime`
- `lineRange?`
- `textSnapshot?`

其中 `ChatMessage.contextAttachments?` 会随 `messages[]` 一起完整落盘到本地。

### 5.4 本地模式与远程模式映射

| 运行模式 | 上下文传输方式 | 说明 |
| --- | --- | --- |
| 本地服务器 | `file://` file part | 真实文件路径，`selection` 带 1-based 行号，且附加选区快照 |
| 远程服务器 | synthetic text part | 不暴露本地文件 URL，只传文本内容和上下文标签 |

### 5.5 问题事件联动

- 不再忽略 `question.asked`
- 统一转成 `StreamChunk.question_request`
- 聊天流里渲染 inline question card
- 当前支持：
  - 单选
  - 多选
  - 自由输入
  - reject

### 5.6 文件变更通知

- 当前 turn 内收到 `file.edited` 时，先记录编辑过的文件
- assistant 完成后，基于当前 user `sourceMessageId` 调用 `session.diff()`
- 结果以持久 notice 追加到会话中，方便之后 reload 继续看到

### 5.7 Markdown 联动复用

本期没有重写渲染链，而是继续复用现有实现：

- wikilink 点击
- 图片嵌入
- notice / diff / question 内容统一走同一渲染流程

---

## 6. 已实现状态

| 项目 | 状态 | 说明 |
| --- | --- | --- |
| context tray 运行态 | 已实现 | `OpenCodianView` 为每个 tab 增加 `draftContextItems` |
| 当前笔记上下文 | 已实现 | 可从活动编辑器提取当前 note |
| 当前选区上下文 | 已实现 | 支持行号范围与文本快照 |
| 文件选择器 | 已实现 | 可从 vault 文本文件中选择并加入上下文 |
| 两个上下文命令 | 已实现 | 已在 `main.ts` 注册 |
| `PromptContextItem` / `MessageContextAttachment` | 已实现 | 已接入类型系统与消息存储 |
| 本地模式 `file://` 映射 | 已实现 | `selection` 追加 `start/end` 行号 |
| 远程 synthetic text fallback | 已实现 | 文本文件限定，`64 KB` 上限 |
| `contextAttachments` 本地持久化 | 已实现 | 继续完整保存 `messages[]` |
| hydration 恢复 context attachments | 已实现 | 支持 synthetic tag 与 file part 解析 |
| 同步保护本地 UI 字段 | 已实现 | 不允许 hydration 抹掉本地上下文附件 |
| `question.asked` -> 问题卡片 | 已实现 | 支持 reply / reject |
| `file.edited` -> diff notice | 已实现 | 追加持久 notice 消息 |
| Markdown 联动复用 | 已实现 | 不重写 wikilink / 图片嵌入处理 |
| `inline-edit` | 未实现 | 仍然是占位命令 |

---

## 7. 尚未实现与后续待做

### 7.1 明确未做

- 真正的 `inline edit` 编辑器工作流
- 图片 / PDF / 音频等非文本上下文
- 自动注入当前文件、当前选区或最近文件
- 跨轮次上下文继承与上下文历史面板
- 基于 `Conversation.externalContextPaths` 的新上下文工作流

### 7.2 可以作为下一阶段的候选项

1. 文件选择器支持最近文件、按目录分组、批量添加。
2. context tray 支持更丰富的预览，例如选区首行、字节数、来源说明。
3. diff notice 增加文件跳转、打开差异、按文件折叠展示。
4. 远程模式支持更细粒度的文本截断与超限提示。
5. 为 question card 增加更完整的结果持久化展示。
6. 在聊天联动稳定后，再单独开启 `inline edit` 产品线。

---

## 8. 存储与同步原则

### 8.1 本地完整存储不变

- `StorageService` 继续完整保存会话 JSON
- 每个会话文件仍包含完整 `messages[]`
- 新增的 `contextAttachments`、notice、question 相关消息都属于本地持久数据

### 8.2 服务端同步不是唯一真相

- optimistic user message 发送后立刻本地写盘
- 服务端 hydration 只做“就地补全”
- 不允许同步过程覆盖本地 UI 专属字段
- 不允许服务端历史把本地 notice / diff / 上下文标记误删

### 8.3 角色分工

| 数据来源 | 负责内容 |
| --- | --- |
| 本地 `StorageService` | 完整聊天历史、本地 UI 专属字段、插件 notice |
| OpenCode Server | 执行、真实 parts、tool / OMO 信息、`sourceMessageId`、diff 能力 |

---

## 9. 关键文件与职责

| 文件 | 职责 |
| --- | --- |
| `src/features/chat/OpenCodianView.ts` | context tray、草稿上下文、发送态集成、question card、diff notice、同步保护 |
| `src/core/opencode/OpenCodeService.ts` | `contextItems` 映射、本地/远程上下文转换、question/file.edited 事件接入、hydration 恢复 |
| `src/core/types/chat.ts` | `PromptContextItem`、`MessageContextAttachment`、`question_request` 等核心类型 |
| `src/shared/obsidianContext.ts` | `file://` URL、synthetic tag、上下文附件解析/构建工具 |
| `src/features/chat/ui/ContextFilePickerModal.ts` | 文件选择器 UI |
| `src/main.ts` | 命令注册 |
| `src/core/storage/StorageService.ts` | 本地完整会话落盘与 reload |
| `src/utils/markdown/MarkdownRenderer.ts` | 继续承接统一 Markdown 渲染链 |
| `styles.css` | context tray、question card、notice 等样式 |
| `tests/unit/core/opencode/OpenCodeService.test.ts` | context 映射、question、diff 等服务层测试 |
| `tests/unit/core/storage/StorageService.test.ts` | `contextAttachments` 本地持久化回归测试 |

---

## 10. 已知限制

1. 远程模式当前只支持文本类上下文，不支持二进制文件。
2. 远程模式单个上下文内容上限为 `64 KB`，超限会直接阻止发送。
3. `selection` 依赖发送时保存的文本快照；如果源文件之后被改动，历史消息展示的是当时的快照，不一定等于当前文件内容。
4. 本期上下文是一次性发送态；发送后会清空，不会自动保留到下一轮。
5. `inline-edit` 命令仍为占位，不能代表编辑器联动已经完成。

---

## 11. 建议阅读顺序

后续接手这块开发时，建议先按下面顺序阅读：

1. `src/core/types/chat.ts`
2. `src/shared/obsidianContext.ts`
3. `src/core/opencode/OpenCodeService.ts`
4. `src/features/chat/OpenCodianView.ts`
5. `tests/unit/core/opencode/OpenCodeService.test.ts`
6. `tests/unit/core/storage/StorageService.test.ts`

如果是继续做 UI 交互，优先从 `OpenCodianView.ts` 和 `styles.css` 入手；如果是继续做上下文协议或 SDK 事件映射，优先从 `OpenCodeService.ts` 入手。

---

## 12. 当前验证状态

本轮实现完成后的最近一次完整验证结果为：

- 通过：`npm run typecheck`
- 通过：`npm run lint`
- 通过：`npm run test`
- 通过：`npm run build`
- 最近一次已验证部署的 `BUILD_ID`：`main.202603301906`

本次文档补充本身是 docs-only 变更，没有重新触发 build/deploy。
