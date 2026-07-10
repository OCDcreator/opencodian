# ComposerContextPickerActionService

> **源码**: `src/features/chat/services/ComposerContextPickerActionService.ts`
> **状态**: [REVIEW]

## 概述

`ComposerContextPickerActionService` 负责 composer file-context picker 的单一职责编排。它把 picker 打开/关闭生命周期、catalog 懒加载、file `PromptContextItem` 构建，以及 draft 写回集中到独立 service，让 `ComposerContextActionService` 收窄回活动编辑器入口动作。

## 导入关系

上游: `obsidian`（App）、`core/types`、`ContextAttachmentBuilder`、`ContextFileCatalogService`、`ui/ContextFilePickerModal`
下游: `OpenCodianView`、`ComposerContextHostAdapter`

## 公开接口

```typescript
interface ComposerContextPickerActionServiceHost {
  addDraftContextItem(item: PromptContextItem): void
  beginContextPickerInteraction(): void
  completeContextPickerInteraction(): void
}

class ComposerContextPickerActionService {
  addChosenFileContextToActiveTab(): Promise<boolean>
}
```

## 核心逻辑

### picker 生命周期

- 在真正打开 `ContextFilePickerModal` 之前，先调用 `beginContextPickerInteraction()`，把 retained-selection handoff / UI writeback 准备收束到 host
- 无论 picker 成功、取消还是抛错，都会在 `finally` 里调用 `completeContextPickerInteraction()`，确保 composer preview refresh 不依赖 view 内的散落回调

### 文件附件写回

- `addChosenFileContextToActiveTab()` 统一调用 `chooseContextFile()`，并把 `ContextFileCatalogService.getCatalog()` 作为懒加载 catalog provider 传进去
- picker 取消时直接返回 `false`，不触发额外附件构建或 draft 变更
- 选中文件后继续复用 `ContextAttachmentBuilder.buildFileContextItem()`，避免 view 重新拼装 file context

## 与其他模块的交互

- **OpenCodianView**：只保留 add-context 按钮装配，把 picker 行为委托给这里
- **ComposerContextHostAdapter**：负责把 picker open/close 生命周期与 focus preview/runtime 的 retained-selection seam 装配成窄 host
- **ContextFileCatalogService**：提供 picker 所需的缓存 catalog
- **ContextFilePickerModal**：负责 UI 层的文件选择交互

## 注意事项

- service 不直接依赖 `OpenCodianView` 或 tab runtime；draft item 去重与 active-tab rerender 仍由 shared runtime store 统一维护
- host 必须保证 begin/complete 成对出现时不会重复写 UI，避免 picker cancel 与异常路径留下 stale preview

### Server reference context (optional port)

现在接受可选的 `ServerReferenceContextService` 注入，用于在 context picker 中显示 server-side read-only hint。不影响 vault 文件选择行为。
