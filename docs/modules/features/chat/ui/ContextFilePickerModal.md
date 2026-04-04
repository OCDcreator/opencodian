# ContextFilePickerModal

> **源码**: `src/features/chat/ui/ContextFilePickerModal.ts`
> **状态**: [DRAFT]

## 概述

Obsidian Modal，用于从 Vault 文件列表中选择文件作为消息的上下文附件。提供异步加载的文件目录（catalog）、搜索框、后缀名过滤器、分页渲染（最多 `MAX_RENDERED_FILES=200`）。对外暴露 `chooseContextFile()` 函数，返回 `Promise<TFile | null>`。

## 导入关系
上游: `obsidian`（App、TFile、Modal）、`i18n`
下游: 被 `OpenCodianView` 的内联上下文文件选择器调用

## 核心类型 / 接口

```typescript
interface ContextFileEntry {
  file: TFile;
  lowerPath: string;
  lowerBasename: string;
  lowerExtension: string;
  extension: string;
}

interface ContextFileExtensionBucket {
  value: string;
  count: number;
}

interface ContextFileCatalog {
  entries: ContextFileEntry[];
  extensions: ContextFileExtensionBucket[];
}

function chooseContextFile(app: App, loadCatalog: () => ContextFileCatalog | Promise<ContextFileCatalog>): Promise<TFile | null>
```

## 核心逻辑

### 异步目录加载

`loadCatalogData()` 在 modal 打开后异步调用外部 `loadCatalog` 函数。加载完成前显示 loading 状态，搜索框 disabled。加载完成后启用搜索框并自动聚焦。

### 搜索与过滤

- `query`: 用户输入的小写搜索词
- `selectedExtension`: 当前选中的后缀名过滤器（`__all__` 表示全部）
- 过滤逻辑：匹配 `lowerPath`、`lowerBasename`、或 `lowerExtension`
- 使用 `requestAnimationFrame` 节流渲染（`scheduleRender()`）

### 后缀名过滤器栏

动态生成按钮组：一个"全部"按钮 + 每个后缀名一个按钮（显示后缀和文件数）。点击切换 `selectedExtension`。

### 渲染上限

`MAX_RENDERED_FILES = 200`，超出部分仅显示计数提示。

## 关键方法

| 方法 | 说明 |
|------|------|
| `chooseContextFile(app, loadCatalog)` | 静态入口函数，创建并打开 modal，返回 Promise |
| `onOpen()` | 设置标题、创建搜索框/过滤器栏/列表容器，触发异步加载 |
| `onClose()` | 清理 rAF、DOM、标记 `isClosed` |
| `loadCatalogData()` | 异步调用 `loadCatalog()`，更新内部 catalog 状态 |
| `scheduleRender()` | rAF 节流，避免连续渲染 |
| `render()` | 清空并重建过滤器栏、文件列表、计数摘要 |
| `getFilteredEntries()` | 根据 query 和 selectedExtension 过滤 catalog |
| `finish(file, shouldClose)` | 一次性决议函数，调用 `onResolve` 回调 |

## 数据流

```
外部 loadCatalog() → ContextFileCatalog
        ↓
用户输入 query / 选择 extension filter
        ↓
getFilteredEntries() → filtered ContextFileEntry[]
        ↓
render() → 文件按钮列表
        ↓
用户点击文件 → finish(TFile) → Promise resolve
```

## 与其他模块的交互

- **OpenCodianView**: 调用 `chooseContextFile()`，传入 Vault 文件目录加载器
- **Vault 文件目录**: 由 `OpenCodianView` 构建的缓存目录（排除隐藏路径）

## 配置项

- `MAX_RENDERED_FILES = 200`: 单次渲染最大文件数
- `ALL_EXTENSION_FILTER = '__all__'`: "全部"过滤器的特殊值

## 注意事项

- `settled` 标志确保 Promise 只被决议一次
- `isClosed` 标志防止异步加载完成后操作已关闭的 modal
- 搜索输入以 `toLowerCase()` 处理，匹配大小写不敏感

## 待补充
- [ ] Catalog 的构建逻辑（在 OpenCodianView 中如何生成）
- [ ] 隐藏路径排除规则的详细说明
