# ChatHeaderPresenter

> **源码**: `src/features/chat/services/ChatHeaderPresenter.ts`
> **状态**: [REVIEW]

## 概述

`ChatHeaderPresenter` 承接聊天视图 header 与 server status shell 的 DOM / lifecycle ownership，避免 `OpenCodianView` 继续直接维护 header button refs、status interval 和品牌资源刷新。

它负责：

- 创建 title logo、wordmark、header tab bar slot 和 header actions
- 渲染 server status badge、状态 class 与本地/远端文案
- 管理 status polling、手动 refresh 和 locale refresh
- 绑定 new-tab、current-tab、history、conversation session settings、settings 与 server-section action callbacks
- 在 css-change 时刷新 logo/wordmark，并通知 view 做 color/layout sync

## 公开接口

```typescript
export type ChatServerAvailability =
  | 'checking'
  | 'running'
  | 'starting'
  | 'offline'
  | 'external';

export interface ChatHeaderPresenterHost {
  setTooltipLabel(...): void;
  registerCssChangeListener(listener: () => void): void;
  resolveAssetUrl(relativePath: string): string | null;
  scheduleChatSurfaceColorSync(): void;
  scheduleComposerLayoutSync(): void;
  resolveServerAvailability(): Promise<ChatServerAvailability>;
  isLocalServerMode(): boolean;
  refreshContextUsageIndicator(): void;
  openServerSettings(): void;
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
  startServerStatusLoop(): void;
  stopServerStatusLoop(): void;
  refreshServerStatusBadge(): Promise<void>;
  destroy(): void;
}
```

## 关键行为

- `build()` 组装完整 header DOM，并把 header tab bar slot 暴露给 `OpenCodianView` 的 tab layout 逻辑；header actions 现在包含 history → session settings → global settings 这条会话/全局配置链路
- `startServerStatusLoop()` 立即刷新一次 status badge，然后每 5 秒重新查询 host 的 server availability
- `refreshServerStatusBadge()` 更新 `is-running` / `is-offline` 等状态 class，并根据 local/remote mode 选择 status 文案
- `applyLocaleTexts()` 刷新所有 header tooltip，并按最后一次 availability 立即重算 status label
- `destroy()` 停止 polling 并释放 presenter 内部 DOM refs

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 只创建 presenter、提供 host callbacks，并保存 `getTabBarSlotEl()` 的返回值供 tab bar layout 使用
- server manager、OpenCode service health check、settings tab 打开逻辑仍留在 view / plugin 层，通过 host seam 注入
- Presenter 不接触 model selector、permission selector、composer input 或 send pipeline 语义

本模块推进 master plan 的 P1 `OpenCodianView header / server status shell` lane：把 header/status DOM 细节和 polling lifecycle 从主集成点迁出，但不改变 server lifecycle service 或 OpenCode service 行为。
