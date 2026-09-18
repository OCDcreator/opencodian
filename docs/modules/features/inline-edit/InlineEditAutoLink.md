# InlineEditAutoLink

> **源码**: `src/features/inline-edit/InlineEditAutoLink.ts`
> **状态**: [REVIEW]

## 概述

R-B1「生成内容自动内链」的后处理层。生成结果经过严格解析后、构建 diff 预览 payload 前，把生成文本中与**参考笔记已验证标题**精确匹配的词句转为 vault 内链——链接在 diff 中可见、可拒绝，绝不落盘时静默改写。

「宁可不链，不产生死链」：链接目标只可能来自调用方提供的 `CachedMetadata.headings` 验证列表，构造上不可能产生死链。提示词只作辅助，本模块是唯一机制。

## 公开接口

```typescript
type AutoLinkStyle = 'wiki' | 'markdown';
interface AutoLinkReferenceNote { readonly path: string; readonly headings: readonly string[] }
interface AutoInternalLinkOptions { readonly style: AutoLinkStyle; readonly excludedTerms: readonly string[] }
interface AutoInternalLinkResult { readonly text: string; readonly insertedCount: number }

applyAutoInternalLinks(text, references, options): AutoInternalLinkResult
normalizeAutoLinkKey(raw: string): string        // 去层级号 + trim + 全半角/大小写折叠
createInlineEditAutoLinkProcessor(deps: {
  app: App;
  isEnabled: () => boolean;                       // autoInternalLinkEnabled
  getExcludedTerms: () => readonly string[];      // autoInternalLinkExcludedTerms
}): (text, attachedNotes) => string               // 关闭/无参考时逐字节原样返回
```

## 核心逻辑

1. **候选构建**：标题 key 归一化（剥 `#`、trim、逐码点 NFKC + lowercase）；跨笔记同 key 视为歧义整体跳过；命中排除词表（同样归一化后比较）跳过；区分度阈值——CJK ≥2 字符或西文 ≥4 词（`AUTO_LINK_MIN_CJK_CHARS` / `AUTO_LINK_MIN_WESTERN_WORDS`）。
2. **保护区**：围栏代码块（行扫描，``` / ~~~）、行内代码、已有 wikilink / markdown 链接内永不插链接。
3. **匹配**：折叠文本 + 逐折叠字符的原坐标映射（indexOf 扫描，西文要求词边界 `\p{L}\p{N}_` 前后都不是词字符；CJK 子串即匹配）；候选按 key 长度降序，保证「注意力机制」优先于「注意力」；重叠跳过。
4. **插入**：显示文本 = 生成文本原文措辞。`[[路径#标题]]`（措辞与标题一致时）或 `[[路径#标题|显示]]`；markdown 样式输出 `[显示](路径#标题)`（目标含空格/括号时尖括号包裹）。`style` 由 `app.vault.getConfig('useWikiLinks')` 决定。
5. **Obsidian 胶水**（文件底部唯一非纯部分）：`createInlineEditAutoLinkProcessor` 解析附加条目（目录条目不参与——没有可验证标题）→ `metadataCache.getFileCache().headings` → 调用纯函数。设置关闭、无参考、无匹配时逐字节返回输入。

## 依赖

```text
上游: obsidian（仅工厂部分）、无其他运行时依赖（纯函数可单测）
下游: src/main.ts（host 桥接）
```

## 维护约束

- 匹配语义（阈值、词边界、歧义跳过、排除词）是 R-B1 验收与误报控制的核心，改动需同步 tests/unit/features/inline-edit/InlineEditAutoLink.test.ts；
- 关闭路径必须保持逐字节一致（回归由 flow 测试锁定）；
- 不得在本层写入文件或触碰编辑器——只返回字符串。
