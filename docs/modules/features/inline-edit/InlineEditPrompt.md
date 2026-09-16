# InlineEditPrompt

> **源码**: `src/features/inline-edit/InlineEditPrompt.ts`
> **状态**: [REVIEW]

## 概述

inline edit 与模型之间的请求构造与响应解析，采用 Claudian 验证过的 XML 标签协议并按审查意见加固（`docs/requirements/inline-edit.md` §6）。全部为纯函数，协议可完整单测。

## 职责

- `buildInlineEditSystemPrompt(locale)`：zh/en 两份系统提示词；只负责质量（风格模仿、保留 markdown 结构、只读工具静默使用、禁止元评论），**不是安全层**
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
- `describeInlineEditFailure()`：把失败原因映射为翻译键

## 依赖

- `src/i18n`（仅类型：`Locale`、`TranslationKey`）

## 维护约束

- 长度上限是协议的一部分，改动需同步 `docs/requirements/inline-edit.md` §6.1 与单测
- 解析必须保持"严格 + 绝不猜测"：宁可报错让用户重试，也不要对畸形响应做部分应用
- 标签内容是原样使用；不要顺手 trim 或反转义（insertion 的首尾空行归一化由 `normalizeInsertionText` 单独承担）
- 系统提示词里不要写入安全承诺，只读约束属于 backend 层
