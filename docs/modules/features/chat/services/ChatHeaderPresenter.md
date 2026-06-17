# ChatHeaderPresenter

> **源码**: `src/features/chat/services/ChatHeaderPresenter.ts`
> **状态**: [REVIEW]

## 概述

`ChatHeaderPresenter` 承接聊天视图 header、server status shell 与 LSP status lifecycle 的 DOM / polling ownership，避免 `OpenCodianView` 继续直接维护 header button refs、status interval、LSP refresh coordinator 和品牌资源刷新。

它负责：

- 创建 title logo、wordmark、header tab bar slot 和 header actions
- 渲染 server status badge、LSP status indicator、状态 class 与本地/远端文案
- 管理 server/LSP status polling、手动 refresh 和 locale refresh
- 绑定 new-tab、current-tab、history、conversation session settings、settings 与 server-section action callbacks
- 在 css-change 时刷新 logo/wordmark，并通知 view 做 color/layout sync

## 公开接口

```typescript
export type ChatServerAvailability =
  | 'checking'
  | 'disabled'
  | 'running'
  | 'starting'
  | 'offline'
  | 'external';

export interface ChatHeaderPresenterHost {
  setTooltipLabel(element: HTMLElement, label: string, position?: 'bottom' | 'left' | 'right' | 'top'): void;
  registerCssChangeListener(listener: () => void): void;
  resolveAssetUrl(relativePath: string): string | null;
  scheduleChatSurfaceColorSync(): void;
  scheduleComposerLayoutSync(): void;
  resolveServerAvailability(): Promise<ChatServerAvailability>;
  isLocalServerMode(): boolean;
  isOpenCodeBackend(): boolean;
  getActiveBackendDisplayName?(): string;
  /** Canonical active backend kind for stable attributes and CSS hooks. */
  getActiveBackendKind?(): AgentBackendKind;
  refreshContextUsageIndicator(): void;
  onServerAvailabilityRefreshed?(): void;
  openServerSettings(): void;
  openLspSettings?(): void;
  createConversationInNewTab(): Promise<void>;
  createConversationInCurrentTab(): Promise<void>;
  showConversationHistory(event: MouseEvent): void;
  openConversationSessionSettings(): void;
  openSettings(): void;
}

export class ChatHeaderPresenter {
  build(headerEl: HTMLElement): void;
  getTabBarSlotEl(): HTMLElement | null;
  applyLocaleTexts(): void;
  updateLspStatus(status: LspStatusSummary): void;
  startServerStatusLoop(): void;
  startLspStatusLoop(getStatus: () => Promise<unknown>, openSettings: () => void): void;
  stopServerStatusLoop(): void;
  refreshBackendChrome(): void;
  refreshServerStatusBadge(): Promise<void>;
  destroy(): void;
}
```

## 关键行为

- `build()` 组装完整 header DOM，并把 header tab bar slot 暴露给 `OpenCodianView` 的 tab layout 逻辑；header actions 现在拆成 `opencodian-header-status-group`、`opencodian-header-conversation-group`、`opencodian-header-config-group` 三段。server status 与 LSP status 留在 status group，`new-current-tab` / `new-tab` / `history` 留在 conversation group，`session-settings` / `settings` 留在 config group，让状态、会话操作和配置入口不再混成一串同权按钮
- LSP status indicator 展示 `lsp.status()` 的 server connection summary；`startLspStatusLoop()` 在 presenter 内创建并持有 `LspStatusRefreshCoordinator`，把状态更新转发给 UI 组件，并在 `destroy()` 中停止轮询
- header action 现在都是真正的 `button[type="button"]`，带稳定 `data-action`（`new-tab`、`new-current-tab`、`history`、`session-settings`、`settings`）和同步 locale 的 `data-tooltip`；可访问名称通过 `ConversationRenderService.setTooltipLabel()` 注入的隐藏 label + `aria-labelledby` 提供，避免在 Obsidian/Electron 里再冒出一层原生 hover tooltip。host 的显式 tooltip placement 支持 top/bottom/left/right，真实 UI 验收脚本可以直接按这些 locator 点击，不再依赖图标 SVG 或按钮顺序
- “新建标签”圆形加号带有 `opencodian-header-btn--new-tab` class；当 `ConversationTabRuntimeCoordinator` 给聊天容器加上 `opencodian-container--tabs-disabled` 时，core CSS 会隐藏这个入口，只保留“当前标签新建会话”入口，避免禁用标签后 header 上出现两个等价的新建按钮
- `startServerStatusLoop()` 立即刷新一次 status badge，然后每 5 秒重新查询 host 的 server availability
- `refreshServerStatusBadge()` 更新 `is-running` / `is-disabled` / `is-offline` 等状态 class，设置 `data-active-backend` 为当前 canonical backend kind（优先使用 host 的 `getActiveBackendKind`，未实现时从全局插件设置读取 active backend），并根据 local/remote mode 选择 status 文案；如果 async availability 返回时 header 已销毁，会重新检查 DOM refs 并跳过写入，避免设置页/视图切换期间的空节点错误
- `build()` / `startLspStatusLoop()` / `refreshBackendChrome()` 现在会先检查 `isOpenCodeBackend()`；当当前 active backend 不是一个真正启用中的 OpenCode surface 时，不再挂载或轮询 LSP 状态，避免 disabled-backend 场景继续打无意义运行时请求。后端切换时 view 会调用 `refreshBackendChrome()`，让 OpenCode-only LSP chrome 随 active backend 重新挂载或移除。
- 非 OpenCode backend 的可用状态会先由 active adapter 的 `status` 映射；`connected` 才显示为 backend connected，`connecting` 显示为 starting，`disconnected` / `error` 显示为 offline。`offline` 现在也会带出 backend 名称（例如 `Claude Code offline`），这样 Claude Code 断开时不会再被标题栏伪装成无主的 generic offline。状态徽标 tooltip 也继续使用 backend settings copy，点击仍通过 host seam 进入对应 backend 的 runtime settings，而不是固定打开 OpenCode server section。`data-active-backend` 同步设置为当前 canonical backend kind，为 CSS 和 UI 验收脚本提供稳定 hook。
- `applyLocaleTexts()` 刷新所有 header tooltip，并按最后一次 availability 立即重算 status label
- `destroy()` 停止 polling 并释放 presenter 内部 DOM refs

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 只创建 presenter、提供 host callbacks，并保存 `getTabBarSlotEl()` 的返回值供 tab bar layout 使用；LSP lifecycle 只通过 `startLspStatusLoop(getStatus, openSettings)` 注入 service/query 与 settings callback
- server manager、OpenCode service health check、settings tab 打开逻辑仍留在 view / plugin 层，通过 host seam 注入
- Presenter 不接触 model selector、permission selector、composer input 或 send pipeline 语义

本模块推进 master plan 的 P1 `OpenCodianView header / server status shell` lane：把 header/status DOM 细节和 polling lifecycle 从主集成点迁出，但不改变 server lifecycle service 或 OpenCode service 行为。
