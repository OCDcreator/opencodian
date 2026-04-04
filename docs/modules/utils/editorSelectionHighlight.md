# Editor Selection Highlight

> **源码**: `src/utils/editorSelectionHighlight.ts`
> **状态**: [DRAFT]

## 概述

使用 CodeMirror 6 的 `StateField` 和 `Decoration` API 在 Obsidian 编辑器中高亮选中文本。当 AI 聊天引用编辑器中的文本范围时（如 context-aware 操作），提供视觉反馈标记。支持显示和隐藏两种操作，每个编辑器实例仅安装一次扩展。

## 导入关系
上游: `@codemirror/state` (RangeSetBuilder, StateEffect, StateField), `@codemirror/view` (Decoration, EditorView)
下游: `OpenCodianView` (引用选中文本时调用)

## 核心类型 / 接口

### StateEffect 定义

```typescript
showHighlightEffect: StateEffect.define<{ from: number; to: number }>
hideHighlightEffect: StateEffect.define<null>
```

### CSS Class
高亮使用 `opencodian-selection-highlight` CSS class。

## 核心逻辑

### StateField 定义

`selectionHighlightField` 使用 `StateField.define<DecorationSet>`：
- **create**: 返回 `Decoration.none`
- **update**: 
  - 收到 `showHighlightEffect` → 创建 `Decoration.mark({ class: 'opencodian-selection-highlight' })` 单范围 DecorationSet
  - 收到 `hideHighlightEffect` → 返回 `Decoration.none`
  - 其他 → `decorations.map(transaction.changes)` 保持位置同步
- **provide**: `EditorView.decorations.from(field)` 将 decoration 注入视图

### 延迟安装

`ensureSelectionHighlightField()` 使用 `WeakSet<EditorView>` 跟踪已安装的编辑器：
- 首次调用时通过 `StateEffect.appendConfig.of` 安装 StateField
- 后续调用直接跳过

### 操作函数

`showSelectionHighlight(editorView, from, to)` → 确保安装 → dispatch show effect
`hideSelectionHighlight(editorView)` → 检查安装 → dispatch hide effect

## 关键方法

| 方法 | 说明 |
|------|------|
| `showSelectionHighlight(editorView, from, to)` | 高亮指定范围 |
| `hideSelectionHighlight(editorView)` | 清除高亮 |

## 数据流

```
OpenCodianView (用户引用编辑器选区)
  → showSelectionHighlight(editorView, from, to)
    → ensureSelectionHighlightField(editorView)
      → editorView.dispatch({ effects: StateEffect.appendConfig.of(...) })
    → editorView.dispatch({ effects: showHighlightEffect.of({ from, to }) })

取消引用/操作完成:
  → hideSelectionHighlight(editorView)
    → editorView.dispatch({ effects: hideHighlightEffect.of(null) })
```

## 与其他模块的交互

- **OpenCodianView**: 在用户通过上下文菜单引用编辑器选区时调用

## 配置项

无可配置项。CSS class `opencodian-selection-highlight` 在 `styles.css` 中定义样式。

## 注意事项

- 使用 `WeakSet` 跟踪已安装编辑器，不会造成内存泄漏
- `from`/`to` 参数为 CodeMirror 文档偏移量（0-based），非行号
- 每次 `showHighlightEffect` 只创建单个范围，之前的范围被替换
- 不支持多个同时高亮区域

## 待补充
- [ ] 多范围高亮支持
- [ ] 高亮样式自定义配置
- [ ] 与 Obsidian 原生搜索高亮的协调
