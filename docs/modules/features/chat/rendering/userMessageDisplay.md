# userMessageDisplay

> **源码**: `src/features/chat/rendering/userMessageDisplay.ts`
> **状态**: [REVIEW]

## 概述

这个模块负责用户消息的展示前处理：一部分把 HTML 片段改写成“适合展示的 Markdown 文本”，另一部分把 OpenCode native `agent` part 的 source span 与用户原文里真实命中过的 skill token 投影成可包裹的文本高亮范围。它不是通用 sanitizer，也不负责最终 DOM 结构；这些 helper 专门服务于 `UserMessageContentRenderer`。

2026-11-10 起，已发送用户文字的**展示层凭据遮罩**由同 owner 的 `userMessageSecretMask.ts` 实现（见 `userMessageSecretMask.md`），本模块经 re-export 暴露其公共接口并负责把掩码 `•` 连续段投影为 secret 高亮 span。

## 导出

```typescript
prepareUserMessageMarkdownForDisplay(markdown: string): string
extractUserMessageTextHighlightSpans(visibleText: string, parts: unknown): UserMessageTextHighlightSpan[]
applyUserMessageTextHighlightSpans(container: HTMLElement, visibleText: string, spans: readonly UserMessageTextHighlightSpan[]): boolean
// re-exported from ./userMessageSecretMask:
maskUserMessageSecretsForDisplay(text: string): string
USER_MESSAGE_SECRET_MASK_TEXT: string
```

## 转换顺序

`prepareUserMessageMarkdownForDisplay()` 的处理顺序是固定的：

1. 如果输入为空，直接返回
2. 用 `replaceOutsideMarkdownCode()` 保护已有的行内代码和 fenced code block
3. 把 `<style>...</style>` 转成 `css` fenced code block
4. 把 `<script>...</script>` 转成 `javascript` fenced code block
5. 把整段 HTML 块转成 `html` fenced code block
6. 对剩余 HTML 标签做 `<` / `>` 转义

## 关键实现点

### 代码区保护

`replaceOutsideMarkdownCode()` 会先找出：

- 三反引号 fenced code block
- `~~~` fenced code block
- 行内反引号代码

只有代码区外的文本会继续做 HTML 相关替换。

### HTML 块识别

`HTML_BLOCK_REGEX` 支持这些结构：

- 成对标签
- 自闭合标签
- `<!DOCTYPE ...>`
- 注释
- CDATA
- 处理指令

但会排除 `style` 和 `script`，因为它们前面已经单独处理。

### 标签转义

最后一步的 `escapeHtmlTags()` 只对剩余标签 token 转义，所以最终 Markdown 里保留的是“按代码/文本显示的 HTML”，而不是可被浏览器继续解释的标签。

## 凭据展示遮罩（2026-11-10，实现见 userMessageSecretMask.md）

`maskUserMessageSecretsForDisplay()`（实现在 `userMessageSecretMask.ts`）对已发送用户文字做**纯展示层**遮罩：固定 8 个 `•` 的掩码替换识别到的凭据值。持久化消息、模型输入、rewind/fork/编辑源均不经过此函数。默认复制按钮内容跟随遮罩后文本（所见即所复制）；选中复制同理，因为 DOM 里只有掩码文本。

检测契约：

- 复用 `src/shared/diagnosticSecretSanitizer.ts` 的 `DIAGNOSTIC_REDACTION_PATTERNS`（只读取子集，索引由测试钉住），**不修改共享 sanitizer 行为**；
- 刻意排除两条对普通散文误伤的共享模式（独立 `bearer <词>`、裸 `key=<20+字符>`）；
- 展示侧新增高精度 provider 形态（`sk-`/`ghp_`/`github_pat_`/`glpat-`/`xox[baprs]-`/`AKIA…`/`AIza…`/`hf_`/JWT/`<32hex>.<16>`），无需字段名即可识别；
- 追加 env 行（`DB_PASSWORD=…`、`db_password: …`）与 JSON 引号字段（`"apiKey": "…"`）命名赋值检测，字段名由 `isCredentialFieldName()` 判定（snake/kebab/camel/SCREAMING_SNAKE `_KEY`）；
- `typed` 值要求可打印 ASCII、≥6 字符；引号解析成功的值（`"…"`/`'…'`/反引号）允许空格并整段遮蔽（保留引号/转义结构）；未加引号的 `:`/空格分隔形式跳过“词典词”形态（`secret: always…` 不遮）；`=` 赋值视为配置语法，词典词也遮（`password=hunter` 遮）；
- 占位符保护：`${VAR}`、`$VAR`、`%VAR%`、`{{var}}`、`<your-key>`、`[REDACTED]`、`your_api_key`、已知填充词、低熵填充（`xxxxxxxx`）不遮；掩码本身幂等；
- 重叠范围合并为最大跨度；URL userinfo/query 值不设最短长度。

`UserMessageTextHighlightSpan.kind` 新增 `'secret'`：`extractUserMessageTextHighlightSpans()` 会在掩码文本上把 `•`×4+ 连续段投影为 secret span（`value` 是掩码串本身，绝不是原凭据），DOM 包裹类名为 `opencodian-message-highlight-secret`，无 `title`/`aria-label` 属性。注意：由于 agent span 携带原始偏移，掩码会使同一消息中位于凭据之后的 `@agent` 高亮被丢弃（fail-closed，不误包）；slash skill 高亮基于文本正则，不受影响。

## 模块关系

- 上游依赖：`./userMessageSecretMask.ts`（同 owner，遮罩实现）；遮罩检测另只读复用 `src/shared/diagnosticSecretSanitizer.ts`（shared.foundation）
- 下游消费者：`UserMessageContentRenderer`
- 这些 helper 是发送后用户气泡里的 inline invocation highlight 基础设施；它们与 HTML/markup code-block 预处理解耦，最终是否包裹 span 取决于渲染后 `textContent` 能否与原始 visible text 对齐

## 注意事项

- 实际启用开关是 `OpenCodianView` 读取的 `plugin.settings.renderUserMarkupAsCodeBlocks`，不是模块内部配置。
- `buildCodeFence()` 会去掉被包裹内容首尾多余空行，再生成带语言标识的 fenced block。
- slash 高亮不会盲目匹配任意 `/xxx`。它会先从 `message.parts` 里的 synthetic `text` parts 读取 `metadata.kind === 'skill-expansion'` 与 `metadata.skillName`，只把这些真实 expanded skill 对应的 `/skill` 或 `/skills skill-name` token 包成 skill highlight；`//comment` 或不存在的 `/not-a-skill` 都不会着色。
- agent span 提取只信任 `part.type === 'agent'` 且 `source.value/start/end` 与当前 visible text 完全匹配的范围；过期、越界、重叠范围会被忽略，并与 slash spans 一起做统一去重。
- span DOM 包裹会先检查渲染容器的 `textContent` 是否仍等于原始 visible text，避免 markdown 输出改变文本后把高亮包到错误位置。

## 目录定位（2026-10-23）

- 源码位置：`src/features/chat/rendering/userMessageDisplay.ts`。
- 原位置：`src/features/chat/userMessageDisplay.ts`；文件名、导出接口与业务职责保持不变。
