# TabActivationBridgeHostFactory

> **源码**: `src/features/chat/runtime/TabActivationBridgeHostFactory.ts`
> **状态**: [REVIEW]

## 概述

`TabActivationBridgeHostFactory` 把 `OpenCodianView` 里原本分散的 `TabViewActivationBridgeHost` 与 `TabConversationActivationBridgeHost` 闭包装配，收束成同一个 activation host factory。这样 view 只需要提供一份更窄的 activation writeback seam：active-tab lookup、pane 切换、composer/model/send-button 刷新，以及消息区清空 / turn reset / settled-scroll 调度；真正分发到两个 bridge 的 host shape 由本 factory 统一派生。

## 公开接口

```typescript
export interface TabActivationBridgeHostFactoryHost {
  getActiveTabId(): TabId | null;
  setActiveMessagesPane(tabId: TabId): void;
  scheduleComposerLayoutSync(): void;
  updateModelSelectorDisplay(): void;
  updateSendButtonState(): void;
  clearMessagesContainer(): void;
  resetTurnState(): void;
  scheduleSettledScrollToBottom(tabId: TabId | null): void;
}

export interface TabActivationBridgeHosts {
  tabViewActivationBridgeHost: TabViewActivationBridgeHost;
  tabConversationActivationBridgeHost: TabConversationActivationBridgeHost;
}

export function createTabActivationBridgeHosts(
  host: TabActivationBridgeHostFactoryHost,
): TabActivationBridgeHosts;
```

## 关键行为

- `tabViewActivationBridgeHost` 只暴露 pane 激活与 composer/model/send-button writeback，继续服务 `TabViewActivationBridge`
- `tabConversationActivationBridgeHost` 只暴露 active-tab 查询、消息区 shell reset 与 settled-scroll 调度，继续服务 `TabConversationActivationBridge`
- 两个 bridge 共享的 `updateModelSelectorDisplay()` 不再由 `OpenCodianView` 维护两段平行闭包
- 这样后续若继续沿 P1 收紧 activation ownership，可以先在同一个 factory seam 上扩展，而不必回到 view 构造函数里继续堆叠 host wiring

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 继续保留真实的 DOM、scroll、selector 与 turn-state 实现
- 本 factory 只负责把这些 view-level writeback 适配成两个 activation bridge 需要的 host 形状
- 这条边界推进的是 master plan 的 P1 `tab / pane / conversation activation` ownership 迁移
