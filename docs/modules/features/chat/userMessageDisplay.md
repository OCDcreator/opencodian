# userMessageDisplay

> **源码**: `src/features/chat/userMessageDisplay.ts`
> **状态**: [DRAFT]

## 概述

用户消息 Markdown 预处理工具。在用户消息内容交给 Markdown 渲染器之前，将原始 HTML/CSS/Script 标签安全转换为 Markdown 代码围栏，并对剩余 HTML 标签进行转义。确保用户输入中的 HTML 片段被安全地显示为代码块而非被浏览器解析执行。

## 导入关系

**上游**: 无外部导入。

**下游**: `OpenCodianView` — 在渲染用户消息前调用 `prepareUserMessageMarkdownForDisplay()`。

## 核心类型 / 接口

无自定义类型。

## 核心逻辑

### 安全转换管线
`prepareUserMessageMarkdownForDisplay()` 对输入 Markdown 执行以下转换管线：

1. **保护代码区**: 识别行内代码（`` ` ``）、围栏代码块（` ``` ` / `~~~`）并保护其内容不被后续转换影响
2. **`<style>` → CSS 代码围栏**: 将 HTML style 块转为 ` ```css ` 围栏
3. **`<script>` → JS 代码围栏**: 将 HTML script 块转为 ` ```javascript ` 围栏
4. **HTML 块 → HTML 代码围栏**: 将独立 HTML 标签块转为 ` ```html ` 围栏
5. **HTML 标签转义**: 对剩余的 HTML 标签（`<div>`, `<span>` 等）进行 `&lt;`/`&gt;` 转义

### HTML 块检测
使用复杂正则 `HTML_BLOCK_REGEX` 匹配多行 HTML 结构，支持配对标签、自闭合标签、处理指令、CDATA、注释等。排除 `<style>` 和 `<script>`（已在前序步骤处理）。

### 代码区外操作
`replaceOutsideMarkdownCode()` 工具函数将 Markdown 文本按代码区分割，只对非代码区部分执行替换操作。

## 关键方法

| 方法 | 说明 |
|------|------|
| `prepareUserMessageMarkdownForDisplay(markdown)` | 预处理用户消息 Markdown（HTML→代码围栏 + 标签转义） |

## 数据流

```
用户输入 Markdown（可能含 HTML）
  → prepareUserMessageMarkdownForDisplay()
    1. 保护代码围栏内容
    2. <style> → ```css```
    3. <script> → ```javascript```
    4. HTML 块 → ```html```
    5. 残余标签 → &lt; &gt; 转义
  → 安全的 Markdown 字符串
  → MarkdownRenderService.renderMarkdown()
```

## 与其他模块的交互

- **OpenCodianView**: 在 `renderUserMessage()` 中调用，是用户消息渲染管线的前置步骤
- **MarkdownRenderService**: 接收此模块处理后的安全 Markdown

## 配置项

由 `plugin.settings.userMarkup` 控制是否启用此预处理（在 OpenCodianView 中判断）。

## 注意事项

- 正则处理顺序关键：必须先保护代码区，再处理 HTML 转换，最后转义残余标签
- `<style>` 和 `<script>` 必须在通用 HTML 块检测之前处理，避免被错误归类
- `MARKUP_BODY_PATTERN` 使用具名捕获组 `pairedTag` 和 `selfClosingTag`，需支持 ES2018 命名捕获组
- 内容首尾空白通过 `trimFenceContent()` 清理

## 待补充

- [ ] `userMarkup` 设置的完整取值与行为映射
- [ ] 边界情况测试（嵌套代码围栏、HTML 内嵌 Markdown 等）
- [ ] 性能考量（正则复杂度对大消息的影响）
