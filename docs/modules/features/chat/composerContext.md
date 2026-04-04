# composerContext

> **源码**: `src/features/chat/composerContext.ts`
> **状态**: [REVIEW]

## 概述

这个模块封装了 composer 上下文 chip 的纯状态计算，不负责读取文件、操作编辑器或更新 DOM。`OpenCodianView` 持有实际的 tab 级状态，然后调用这里的函数做去重、预览保留和渲染顺序计算。

## 核心类型

```typescript
interface FocusContextPreview {
  kind: 'current_note' | 'selection';
  path: string;
  label: string;
  lineRange?: PromptContextLineRange;
  textSnapshot?: string;
}

interface ComposerContextChipState {
  key: string;
  kind: PromptContextItem['kind'];
  path: string;
  label: string;
  lineRange?: PromptContextLineRange;
  attached: boolean;
  preview: boolean;
}
```

## 关键行为

### 目标键

`getContextTargetKey()` 用 `path:startLine-endLine` 生成目标键；没有行范围时，结果会是 `path:`。  
`getPromptContextTargetKey()` 只是把 `PromptContextItem` 适配到同一套键规则。

### 草稿上下文去重

`upsertDraftContextItem()` 会删除同目标键的旧项，再把新项追加到数组末尾。  
`removeDraftContextItemsByTarget()` 则按目标键过滤移除。

### 焦点预览创建与保留

`createFocusContextPreview()` 根据路径、可选行范围和可选文本快照构造预览对象：

- 有 `lineRange` 时，`kind` 为 `selection`
- 没有 `lineRange` 时，`kind` 为 `current_note`

`resolveFocusContextPreview()` 只有在 `retainSelectionPreview` 为真，并且“新预览是同一路径的当前笔记、旧预览是选区”时，才继续保留旧的选区预览。

### chip 列表构建

`buildComposerContextChipStates()` 会把“焦点预览 + 已附加项”合并成最终渲染序列：

- 预览 chip 始终优先出现在前面
- 如果预览目标已经在已附加项里，返回的是一个 `attached: true, preview: false` 的真实附件 chip
- 如果当前笔记预览所在文件已经有某个 `selection` 附件，则该 `current_note` 预览会被隐藏，避免和更具体的选区信息重复

## 模块关系

- 上游依赖：`../../core/types`、`../../shared`
- 下游消费者：`OpenCodianView`

## 注意事项

- 这个模块只处理数组和轻量对象，不负责持久化。
- `textSnapshot` 只有选区预览会自动保留；当前笔记预览不会填充 `textSnapshot`。
