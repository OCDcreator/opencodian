# composerContext

> **源码**: `src/features/chat/composerContext.ts`
> **状态**: [DRAFT]

## 概述

Composer 区域的上下文附件状态管理。管理用户在发送消息前可附加的文件/文本上下文，包括焦点预览（当前笔记/选区）、上下文 chip 的去重与合并、附加/移除操作。为 OpenCodianView 的 composer 底部 chip 行提供状态计算逻辑。

## 导入关系

**上游**:
- `../../core/types` — `PromptContextItem`, `PromptContextLineRange`
- `../../shared` — `formatContextLabel`

**下游**: `OpenCodianView` — composer 区域的上下文 chip 渲染与交互。

## 核心类型 / 接口

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

## 核心逻辑

### 上下文项去重
`upsertDraftContextItem()` 基于 `path:lineRange` 组合键去重，替换已存在的同目标项。`removeDraftContextItemsByTarget()` 按目标键移除。

### 焦点预览解析
`createFocusContextPreview()` 从活动编辑器路径和可选行范围创建预览。`resolveFocusContextPreview()` 处理焦点切换时的保留逻辑——当选区预览与当前笔记同路径时可选择保留选区预览，避免切回时丢失。

### Chip 状态构建
`buildComposerContextChipStates()` 合并已附加项和焦点预览，生成有序的 chip 列表。焦点预览 chip 始终排在首位；若当前笔记已有同路径的 selection 附件，则隐藏 `current_note` 类型的预览。

### 键生成
`getContextTargetKey()` 和 `getPromptContextTargetKey()` 生成 `path:startLine-endLine` 格式的唯一键用于去重。

## 关键方法

| 方法 | 说明 |
|------|------|
| `getContextTargetKey(path, lineRange?)` | 生成上下文目标唯一键 |
| `getPromptContextTargetKey(item)` | 从 PromptContextItem 生成唯一键 |
| `upsertDraftContextItem(items, item)` | 插入或替换上下文项（去重） |
| `removeDraftContextItemsByTarget(items, target)` | 按目标移除上下文项 |
| `createFocusContextPreview(path, lineRange?, textSnapshot?)` | 创建焦点预览对象 |
| `resolveFocusContextPreview(next, previous, options?)` | 解析焦点切换时的预览保留逻辑 |
| `buildComposerContextChipStates(attachedItems, focusPreview)` | 构建有序 chip 状态列表 |

## 数据流

```
活动编辑器 → createFocusContextPreview()
  → 存入 tabRuntimeState.focusContextPreview

用户附加文件 → upsertDraftContextItem()
  → 存入 tabRuntimeState.draftContextItems

渲染时:
  buildComposerContextChipStates(draftContextItems, focusContextPreview)
    → ComposerContextChipState[] → chip DOM 渲染
```

## 与其他模块的交互

- **OpenCodianView**: 持有 `draftContextItems` 和 `focusContextPreview` 状态（按标签存储），调用此模块进行状态计算
- **core/types**: `PromptContextItem` 类型定义
- **shared/formatContextLabel**: 生成 chip 显示标签

## 配置项

无直接配置，由 OpenCodianView 的 composer UI 驱动。

## 注意事项

- 键格式 `path:startLine-endLine` 中的行号为空时仅用 `path:`，确保唯一性
- 焦点预览的 `retainSelectionPreview` 选项用于编辑器→composer 切换时保留选区上下文
- `buildComposerContextChipStates()` 中 `current_note` 预览在已有同路径 `selection` 附件时自动隐藏

## 待补充

- [ ] chip 的 attach/detach 交互完整流程
- [ ] 与 ContextFilePickerModal 的集成
- [ ] 发送时 contextItems 到 SDK parts 的编码过程
