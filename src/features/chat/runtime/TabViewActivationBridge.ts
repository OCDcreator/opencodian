import type { TabId } from '../tabs';

export interface TabViewActivationBridgeHost {
  setActiveMessagesPane(tabId: TabId): void;
  refreshActiveFocusContextPreview(): void;
  renderQuestionDock(): void;
  updateSessionTodoDockForTab(tabId: TabId): void;
}

export class TabViewActivationBridge {
  constructor(private readonly host: TabViewActivationBridgeHost) {}

  applyActivationPreflight(tabId: TabId): void {
    this.host.setActiveMessagesPane(tabId);
    this.host.refreshActiveFocusContextPreview();
    this.host.renderQuestionDock();
    this.host.updateSessionTodoDockForTab(tabId);
  }
}
