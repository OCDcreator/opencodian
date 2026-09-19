# InlineEditPrompt

> **源码**: `src/features/inline-edit/InlineEditPrompt.ts`
> **状态**: [REVIEW]

## 概述

inline edit 与模型之间的请求构造与响应解析，采用 Claudian 验证过的 XML 标签协议并按审查意见加固（`docs/requirements/inline-edit.md` §6）。全部为纯函数，协议可完整单测。

## 职责

- `buildInlineEditSystemPrompt(locale)`：zh/en 两份系统提示词；只负责质量（风格模仿、保留 markdown 结构、只读工具静默使用、禁止元评论），**不是安全层**。含 R-A4 图片语义段（条件式措辞：仅当请求附带图片时适用——按图片内容直出最终文本、公式默认 LaTeX、定界符按请求注明的锚点形态）
  - **输出顺序要求（flowtext-parity R-A3 验收 1）**：带标签的回复必须**先输出开标签**——`<replacement>`（或 `<insertion>`）是回复的最开头字符，正文在标签内撰写，闭合标签是回复的最结尾字符。这是对"正文何时可得"的排序约束，不改变标签文法；渐进解析（`78eeef05`）只有在轮内真的存在部分标签体时才有东西可渲染——若模型先思考、最后一次性吐出整块带标签正文，预览会从 `busy` 直接跳到完整结果。
- `buildInlineEditImageNote(locale, request)`（纯，R-A4）：带图请求追加在 prompt 末尾的锚点形态注记——`cursor-inline` → 行内 `$…$`；`cursor-inbetween` 与 `selection` → 行间 `$$…$$`（OCR 常见场景：改写块独立成行）
- `buildInlineEditRequestForAnchor(anchor, instruction, contextFiles)`（纯）：锚点 → `InlineEditRequest`（从 controller 搬来，控制其行数预算）；附件仍是路径制清单
- `buildInlineEditRequest()`：按形态生成请求
  - 选区：`<editor_selection path lines>选区原文</editor_selection>`
  - 光标：`<editor_cursor path line>前文|后文 #inline|#inbetween</editor_cursor>`
- 加固规则：`path` 属性转义 `& " < >`；正文原样嵌入；正文出现字面量闭合标签时直接拒绝（不发明新协议）；选区 ≤ 20,000 字符、上下文 ≤ 40,000、路径 ≤ 500
- `parseInlineEditResponse()`：严格解析
  - 唯一顶层 `<replacement>` 或 `<insertion>`；多标签/异类混用/同名嵌套 → `multiple-tags`
  - 未闭合 → `unclosed-tag`；空响应/空内容 → 报错；结果 > 40,000 → 拒绝
  - 完全无标签 → `clarification`（进入澄清循环，不盲目替换）
  - 标签内容**原样保留**（不做反转义）
- `normalizeInsertionText()`：只去掉插入文本首尾的空行，保留缩进
- `classifyInlineEditClarification()`（纯，§6.4/§6.7）：无标签回复进入澄清通道前的防泄漏分类——命中工具调用标记（`<|` 特殊标记族如 `<|tool call>` / `<|tool invoke …>`，**含全角竖线 `｜`（U+FF5C）的 `<｜…` 与 `</｜…` 形态**、antml `<function_calls>` / `<invoke …>`、通用 `<tool_call>`/`<tool_use>`/`<tool_result>` 系，**标签名允许空格分隔与复数形式**如 `tool calls` / `tool invoke` / `tool parameter`）→ `unrenderable/tool-call`；含协议标签截断片段（`<replacement`、`</insert` 等，≥3 字母前缀匹配，普通散文 `<div>`、`a < b` 不误伤）→ `unrenderable/protocol-fragment`；其余为 `prose` 原样放行。工具调用形态优先于片段，用户得到更有解释性的提示
  - **全角/空格形态是实机回归的教训**：首版只匹配 ASCII `<|` 与下划线标签名，单测夹具也照此书写，于是测试全绿而实机面板依旧显示原始标记。实机模型（opencode + `deepseek/deepseek-v4-flash`）实际吐出的是 `<｜tool calls> <｜tool invoke name="read"> <｜tool parameter name="file_path" …>…</｜tool invoke> </｜tool calls>`。夹具现已改为**逐字复制实机字符串**。
- `describeInlineEditFailure()`：把失败原因映射为翻译键

## 依赖

- `src/i18n`（仅类型：`Locale`、`TranslationKey`）

- 附加上下文：请求可带 `attachedNotes`（路径数组），渲染为 `<attached_context>` 块置于指令与目标块之间，**只列路径**（§6.1：不注入 vault 正文，读取交给只读工具）；系统提示词（zh/en）新增一句说明该块是"去读"的清单。校验 fail-closed：数量 ≤ `INLINE_EDIT_MAX_ATTACHED_NOTES`(5)、单路径 ≤ 500 字符、路径不得含 `<`/`>`，违规分别报 `too-many-attached-notes` / `attached-note-path-too-long` / `attached-note-path-invalid`。

> 2026-09-18 (R-A6/R-A7)：请求侧新增 `document` 形态（`<editor_document path lines="1-N">` 整块嵌入，输出契约仍复用 `<replacement>`，解析器零改动）；`INLINE_EDIT_MAX_DOCUMENT_CHARS = 200_000`，超限拒绝**不分块**；正文含字面量 `</editor_document>` 或 `</replacement>` 沿用 fail-closed 拒绝。`attachedNotes` 改为 `InlineEditAttachedNote[]`（`{path, kind?: 'file'|'folder'}`），`<attached_context>` 中目录条目渲染 `[folder]` 前缀；计数语义为**每条目各计 1**（目录不展开），路径规则（≤500、不含 `<>`）对目录同适用。系统提示词新增整篇形态语义（允许调整结构、不得丢弃信息）与目录语义（按需读取、不要全量读取）。

> 2026-09-18 (澄清通道防泄漏)：新增 `classifyInlineEditClarification()`。实测（附加上下文流）中模型会用只读工具先读附件，其 `text` 回传工具调用转录标记，严格解析判为 `clarification` 后原始标记直出回复区。该分类器在 controller 的两处回复区写入点统一拦截（后端无关），不改动严格解析器的权威，也不削弱只读契约；诚实文案见 `inlineEdit.reply.*`（zh/en）。

> 2026-09-18 (R-A3 输出顺序要求)：系统提示词新增一条排序约束——先开标签、标签内写正文、闭合标签收尾（zh/en 各一句，见上方职责节）。背景：`0fada4d1` 让 OpenCode aux 会话轮内轮询历史并喂 `onTextChunk`，渐进渲染已就位，但实机三种配置仍只有 `busy` → 完整预览两个状态（rAF 已排除采样假象）——模型先思考、最后一次性吐出整块 `<replacement>` 正文，轮内不存在可供渲染的部分标签体。本约束只影响**部分正文何时可得**（渲染预览），严格解析器（completed-token + 脏检查）仍是唯一写权威，未被削弱。**各后端事实**：四条 aux/补全会话缝（OpenCode 历史轮询、Claude `stream_event` text_delta、Codex app-server 通知 chunk、Pi `text_delta`）都能在轮内送达内容增量，因此排序约束对四后端都可能生效；约束本身是软约束（提示词是质量层），模型是否遵守只能实测，不能由此断言所有模型/提供方都逐步吐出正文。

## 维护约束

- 长度上限是协议的一部分，改动需同步 `docs/requirements/inline-edit.md` §6.1 与单测
- 解析必须保持"严格 + 绝不猜测"：宁可报错让用户重试，也不要对畸形响应做部分应用
- 标签内容是原样使用；不要顺手 trim 或反转义（insertion 的首尾空行归一化由 `normalizeInsertionText` 单独承担）
- 系统提示词里不要写入安全承诺，只读约束属于 backend 层
