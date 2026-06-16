# CodexMcpServerDetailRenderers

> **源码**: `src/features/settings/CodexMcpServerDetailRenderers.ts`
> **状态**: ACTIVE

## 概述

`CodexMcpServerDetailModal` 的纯渲染辅助模块，负责 MCP 服务器详情弹窗中工具条目与资源条目的 DOM 构建及交互事件绑定。把它从 modal 主类中拆出来是为了控制单文件行数，同时保持渲染逻辑与 modal 生命周期/状态管理解耦。

本模块不持有任何持久状态，也不直接调用 Obsidian Modal API；它只操作传入的 `HTMLElement` 和依赖接口。

## 导入关系

上游: `obsidian`（`Notice`）、`CodexAppServerClient`（`AppServerMcpResource`、`AppServerMcpResourceReadResult` 类型）、`i18n`
下游: 被 `CodexMcpServerDetailModal` 导入使用

## 核心类型 / 接口

```typescript
export interface ExpandedState {
  sections: Set<string>;
  toolDetails: Set<string>;
  toolSchemas: Set<string>;
}

export interface RenderHost {
  readMcpServerResource(server: string, uri: string): Promise<AppServerMcpResourceReadResult | null>;
}

export interface RenderBusyState {
  busy: boolean;
}
```

- `ExpandedState`: 从 modal 透传下来的展开状态集合。
- `RenderHost`: 资源读取所需的最小 host 接口，避免把完整 `CodexMcpServerDetailModalHost` 引入渲染器。
- `RenderBusyState`: 可变的并发锁状态对象；`handleViewResource` 会在读取期间设置 `busy = true`。

为避免超过 `max-params` lint 限制，对外暴露的渲染函数使用 options 对象：

```typescript
interface RenderToolEntryOptions {
  parent: HTMLElement;
  serverName: string;
  toolKey: string;
  tool: { name?: string; description?: string; inputSchema?: unknown };
  expanded: ExpandedState;
}

interface RenderResourceEntryOptions {
  parent: HTMLElement;
  serverName: string;
  resource: AppServerMcpResource;
  host: RenderHost;
  state: RenderBusyState;
}
```

## 核心逻辑

### 工具条目渲染

`renderToolEntry(options)`:
- 每个工具默认只渲染工具名称 + "Tool details" 按钮。
- 工具描述和 inputSchema 放入 `.opencodian-codex-mcp-tool-details` 容器，默认带 `.is-hidden`。
- 点击 "Tool details" 后展开容器，显示描述和 schema toggle；再次点击折叠。
- schema toggle 再点一次才展示完整 JSON schema，保持二级展开。
- 如果 `expanded.toolDetails` 已包含当前工具 key，则默认展开详情。

### 资源条目渲染

`renderResourceEntry(options)`:
- 渲染资源名称、描述、URI、MIME 类型和 "View" 按钮。
- "View" 按钮点击后调用 `handleViewResource`，读取并展示资源内容。

`renderResourceTemplateEntry(parent, serverName, template)`:
- 渲染资源模板条目，显示名称/URI 模板、描述、MIME 类型和模板提示。

### 资源内容查看

`handleViewResource(options)`:
- 第一次点击：设置 `busy = true`，调用 `host.readMcpServerResource`，成功后内联渲染内容，按钮文案变为 "Hide"。
- 第二次点击：移除已渲染的内容，按钮文案恢复为 "View"。
- 读取失败时通过 `Notice` 提示，并恢复按钮状态。

`renderResourceContent(parent, uri, result)`:
- 文本内容 → 等宽文本块。
- 图片内容 → `data:` URL 的 `<img>`。
- 二进制/未知内容 → 仅显示 MIME 类型与字节数元数据，不暴露原始字节。

## 关键方法

| 方法 | 说明 |
|------|------|
| `renderToolEntry(options)` | 渲染单个工具条目（默认折叠，点击展开详情与 schema toggle） |
| `renderResourceEntry(options)` | 渲染单个资源条目（带查看按钮） |
| `renderResourceTemplateEntry(parent, serverName, template)` | 渲染资源模板条目 |
| `handleViewResource(options)` | 资源查看/折叠的异步处理 |
| `renderResourceContent(parent, uri, result)` | 安全渲染资源内容 |

## 数据流

```
CodexMcpServerDetailModal.renderServerContent()
  ├─ renderToolEntry()        ← 传入 this.expanded
  └─ renderResourceEntry()    ← 传入 this.host 与 { busy: this.busy }
       └─ handleViewResource() → host.readMcpServerResource() → renderResourceContent()
```

## 与其他模块的交互

- **CodexMcpServerDetailModal**: 调用本模块的渲染函数，提供 host、expanded 状态和 busy 状态对象。
- **CodexAppServerClient**: 使用其资源/服务器类型定义。
- **i18n**: 使用 `settings.codex.mcpDetail.*` 键。

## 配置项

无。

## 注意事项

- 本模块 deliberately 不感知 Modal 生命周期；所有状态变更通过传入对象完成。
- `RenderBusyState` 使用可变对象是为了让渲染器能在不持有 modal 实例的情况下同步并发锁。
- 工具 schema 仍需要用户二次点击 schema toggle 才显示，不要把 `renderToolEntry` 改成默认展开 schema。
- 资源内容渲染遵循安全原则：二进制只显示元数据，永不渲染原始 JSON dump。

## 2026-06-16 Extracted from CodexMcpServerDetailModal

将工具与资源渲染逻辑从 `CodexMcpServerDetailModal.ts` 拆出，以遵守单文件 500 行的 lint 约束，同时保持行为不变。
