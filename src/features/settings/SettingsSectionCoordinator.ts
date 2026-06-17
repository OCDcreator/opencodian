/* eslint-disable max-lines -- This owner intentionally keeps settings panel scaffolding together: quick-nav, scroll restore, and the body-level tooltip overlay share the same lifecycle and should stay co-located. */
import { t } from '../../i18n';
import { createLogger } from '../../shared';

const logger = createLogger('OpenCodianSettings');

const SETTINGS_SCROLL_CONTAINER_SELECTORS = [
  '.vertical-tab-content-container',
  '.vertical-tab-content',
  '.modal-content',
] as const;
const SETTINGS_SCROLL_CONTAINER_SELECTOR = SETTINGS_SCROLL_CONTAINER_SELECTORS.join(', ');
const SETTINGS_SCROLL_RESTORE_RETRY_DELAYS = [24, 80, 160, 320] as const;
const SETTINGS_SCROLL_RESTORE_OBSERVER_WINDOW_MS = 1200;
const SETTINGS_SCROLL_RESTORE_SUCCESS_TOLERANCE_PX = 1;
const SETTINGS_SCROLL_RESTORE_IDLE_SETTLE_MS = 96;
const SETTINGS_SCROLL_RESTORE_MIN_STABLE_MS = 180;
const QUICK_NAV_TOOLTIP_GAP_PX = 10;
const QUICK_NAV_TOOLTIP_MARGIN_PX = 24;
const QUICK_NAV_TOOLTIP_MAX_WIDTH_PX = 240;

interface SettingsQuickNavSection {
  headingEl: HTMLHeadingElement;
  tooltip: string;
}

interface SettingsSectionHeadingOptions {
  title: string;
  tooltip: string;
}

interface SettingsSectionCoordinatorOptions {
  containerEl: HTMLElement;
  getSavedScrollTop: () => number;
  setSavedScrollTop: (scrollTop: number) => void;
  scheduleScrollStateSave: () => void;
  getScrollContainer?: () => HTMLElement | null;
}

interface BeginDisplayOptions {
  showQuickNav?: boolean;
  renderPanelTitle?: (containerEl: HTMLElement, panelTitle: string) => void;
}

export class SettingsSectionCoordinator {
  private readonly containerEl: HTMLElement;
  private readonly getSavedScrollTop: () => number;
  private readonly setSavedScrollTop: (scrollTop: number) => void;
  private readonly scheduleScrollStateSave: () => void;
  private readonly getExplicitScrollContainer?: () => HTMLElement | null;
  private sections: SettingsQuickNavSection[] = [];
  private quickNavEl: HTMLElement | null = null;
  private settingsScrollHandler?: () => void;
  private settingsScrollContainerEl: HTMLElement | null = null;
  private lastObservedSettingsScrollTop = 0;
  private pendingOpenScrollTop: number | null = null;
  private pendingOpenSectionTitle: string | null = null;
  private settingsPanelPostRenderFrameId: number | null = null;
  private settingsPanelRestoreFrameId: number | null = null;
  private settingsPanelRestoreTimeoutIds: number[] = [];
  private settingsPanelRestoreObserver: MutationObserver | null = null;
  private settingsPanelRestoreScrollContainerEl: HTMLElement | null = null;
  private settingsPanelRestoreScrollListener?: () => void;
  private settingsPanelRestoreSettleTimeoutId: number | null = null;
  private settingsPanelMinHeightRestoreFrameId: number | null = null;
  private settingsPanelPreviousMinHeight: string | null = null;
  private settingsScrollPersistenceSuspended = false;
  private displayPendingOpenScrollTop: number | null = null;
  private displayPendingOpenSectionTitle: string | null = null;
  private quickNavTooltipLayerEl: HTMLElement | null = null;
  private quickNavTooltipBubbleEl: HTMLElement | null = null;
  private quickNavTooltipArrowEl: HTMLElement | null = null;
  private quickNavTooltipActiveButton: HTMLButtonElement | null = null;
  private quickNavTooltipWindowListenersBound = false;

  constructor(options: SettingsSectionCoordinatorOptions) {
    this.containerEl = options.containerEl;
    this.getSavedScrollTop = options.getSavedScrollTop;
    this.setSavedScrollTop = options.setSavedScrollTop;
    this.scheduleScrollStateSave = options.scheduleScrollStateSave;
    this.getExplicitScrollContainer = options.getScrollContainer;
  }

  scrollToSectionByTitle(sectionTitle: string): void {
    const headingEl = Array.from(
      this.containerEl.querySelectorAll<HTMLHeadingElement>('.opencodian-settings-section-heading'),
    ).find((candidate) =>
      candidate.dataset.sectionTitle === sectionTitle
      || candidate.textContent?.trim() === sectionTitle
    );

    if (!headingEl) {
      return;
    }

    this.scrollHeadingIntoView(headingEl);
  }

  prepareRestoreScrollOnNextOpen(scrollTop = this.getSavedScrollTop()): void {
    this.pendingOpenScrollTop = scrollTop;
    this.pendingOpenSectionTitle = null;
  }

  prepareScrollToSectionOnNextOpen(sectionTitle: string): void {
    this.pendingOpenSectionTitle = sectionTitle;
    this.pendingOpenScrollTop = null;
  }

  beginDisplay(panelTitle: string, options?: BeginDisplayOptions): void {
    this.displayPendingOpenScrollTop = this.pendingOpenScrollTop;
    this.displayPendingOpenSectionTitle = this.pendingOpenSectionTitle;
    this.sections = [];
    this.quickNavEl = null;

    this.captureVisibleScrollBeforeRebuild();
    this.clearSettingsPanelRestoreWork();
    this.teardownScrollPersistence();
    this.preservePanelHeightDuringRebuild();
    if (this.settingsPanelPostRenderFrameId !== null) {
      window.cancelAnimationFrame(this.settingsPanelPostRenderFrameId);
      this.settingsPanelPostRenderFrameId = null;
    }

    this.containerEl.replaceChildren();
    this.containerEl.classList.add('opencodian-settings');
    this.containerEl.style.setProperty('overflow-anchor', 'none');
    if (this.displayPendingOpenScrollTop !== null || this.displayPendingOpenSectionTitle !== null) {
      this.containerEl.style.visibility = 'hidden';
    } else {
      this.containerEl.style.removeProperty('visibility');
    }

    if (options?.showQuickNav !== false) {
      this.quickNavEl = document.createElement('div');
      this.quickNavEl.className = 'opencodian-settings-quick-nav';
      this.containerEl.appendChild(this.quickNavEl);
    }

    if (options?.renderPanelTitle) {
      options.renderPanelTitle(this.containerEl, panelTitle);
      return;
    }

    const headingEl = document.createElement('h2');
    headingEl.textContent = panelTitle;
    this.containerEl.appendChild(headingEl);
  }

  createSectionHeading(containerEl: HTMLElement, options: SettingsSectionHeadingOptions): HTMLHeadingElement {
    const headingEl = document.createElement('h3');
    headingEl.className = 'opencodian-settings-section-heading';
    headingEl.dataset.sectionTitle = options.title;
    headingEl.textContent = options.title;
    containerEl.appendChild(headingEl);
    this.sections.push({
      headingEl,
      tooltip: options.tooltip,
    });
    return headingEl;
  }

  finishDisplay(): void {
    if (this.quickNavEl) {
      this.buildQuickNav(this.quickNavEl, this.sections);
    }

    this.scheduleSettingsPanelPostRenderSetup(
      this.displayPendingOpenScrollTop,
      this.displayPendingOpenSectionTitle,
    );
    this.schedulePanelHeightRestore();
    this.clearInitialQuickNavFocus();
    this.displayPendingOpenScrollTop = null;
    this.displayPendingOpenSectionTitle = null;
  }

  hide(): void {
    this.hideQuickNavTooltip();
    this.destroyQuickNavTooltipLayer();
    this.clearSettingsPanelRestoreWork();
    this.captureSettingsPanelScrollPosition();
    this.teardownScrollPersistence();
    if (this.settingsPanelPostRenderFrameId !== null) {
      window.cancelAnimationFrame(this.settingsPanelPostRenderFrameId);
      this.settingsPanelPostRenderFrameId = null;
    }
    this.clearPanelHeightProtection();
    this.sections = [];
    this.quickNavEl = null;
  }

  restoreScrollPosition(
    scrollTop = this.getSavedScrollTop(),
    scrollContainer?: HTMLElement,
    onSettled?: () => void,
  ): void {
    const resolvedScrollContainer = scrollContainer ?? this.settingsScrollContainerEl ?? this.getSettingsScrollContainer();
    this.settingsScrollContainerEl = resolvedScrollContainer;
    this.clearSettingsPanelRestoreWork();
    this.settingsScrollPersistenceSuspended = true;
    this.settingsPanelRestoreScrollContainerEl = resolvedScrollContainer;

    const normalizedScrollTop = Math.max(0, scrollTop);
    const restoreStartedAt = Date.now();
    const minimumSettleAt = restoreStartedAt + SETTINGS_SCROLL_RESTORE_MIN_STABLE_MS;
    let restoreAttempts = 0;
    let restoreSettled = false;
    let restoreQueued = false;
    let deferredRestoreTrackingStarted = false;

    const finishRestore = (reason: string, restoredScrollTop: number): void => {
      if (restoreSettled) {
        return;
      }

      restoreSettled = true;
      this.setSavedScrollTop(restoredScrollTop);
      this.lastObservedSettingsScrollTop = restoredScrollTop;
      this.clearSettingsPanelRestoreWork();
      logger.debug('Settings scroll restored', {
        reason,
        attempts: restoreAttempts,
        elapsedMs: Date.now() - restoreStartedAt,
        targetScrollTop: normalizedScrollTop,
        restoredScrollTop,
      });
      onSettled?.();
    };

    if (Math.abs(normalizedScrollTop) <= SETTINGS_SCROLL_RESTORE_SUCCESS_TOLERANCE_PX) {
      if (Math.abs(resolvedScrollContainer.scrollTop) > SETTINGS_SCROLL_RESTORE_SUCCESS_TOLERANCE_PX) {
        resolvedScrollContainer.scrollTop = 0;
      }
      finishRestore('already-at-top', resolvedScrollContainer.scrollTop);
      return;
    }

    const scheduleRestoreSettle = (reason: string): void => {
      if (restoreSettled) {
        return;
      }

      if (this.settingsPanelRestoreSettleTimeoutId !== null) {
        window.clearTimeout(this.settingsPanelRestoreSettleTimeoutId);
      }

      const settleDelay = Math.max(
        SETTINGS_SCROLL_RESTORE_IDLE_SETTLE_MS,
        minimumSettleAt - Date.now(),
        0,
      );
      this.settingsPanelRestoreSettleTimeoutId = window.setTimeout(() => {
        this.settingsPanelRestoreSettleTimeoutId = null;
        finishRestore(reason, resolvedScrollContainer.scrollTop);
      }, settleDelay);
    };

    const startDeferredRestoreTracking = (): void => {
      if (restoreSettled || deferredRestoreTrackingStarted) {
        return;
      }

      deferredRestoreTrackingStarted = true;

      for (const delay of SETTINGS_SCROLL_RESTORE_RETRY_DELAYS) {
        const timeoutId = window.setTimeout(() => {
          this.settingsPanelRestoreTimeoutIds = this.settingsPanelRestoreTimeoutIds.filter(
            (id) => id !== timeoutId,
          );
          applyRestore(`timeout-${delay}`);
        }, delay);
        this.settingsPanelRestoreTimeoutIds.push(timeoutId);
      }

      if (typeof MutationObserver !== 'undefined') {
        this.settingsPanelRestoreObserver = new MutationObserver(() => {
          queueRestore('mutation');
        });
        this.settingsPanelRestoreObserver.observe(this.containerEl, {
          childList: true,
          subtree: true,
          characterData: true,
        });

        const observerTimeoutId = window.setTimeout(() => {
          this.settingsPanelRestoreTimeoutIds = this.settingsPanelRestoreTimeoutIds.filter(
            (id) => id !== observerTimeoutId,
          );
          if (restoreSettled) {
            return;
          }
          this.settingsPanelRestoreObserver?.disconnect();
          this.settingsPanelRestoreObserver = null;
          applyRestore('observer-timeout');
          scheduleRestoreSettle('observer-timeout');
        }, SETTINGS_SCROLL_RESTORE_OBSERVER_WINDOW_MS);
        this.settingsPanelRestoreTimeoutIds.push(observerTimeoutId);
      }
    };

    const applyRestore = (reason: string): void => {
      if (restoreSettled) {
        return;
      }

      if (!resolvedScrollContainer.isConnected) {
        finishRestore('disconnected', this.lastObservedSettingsScrollTop || normalizedScrollTop);
        return;
      }

      const currentScrollTop = resolvedScrollContainer.scrollTop;
      const alreadyAtTarget =
        Math.abs(currentScrollTop - normalizedScrollTop) <= SETTINGS_SCROLL_RESTORE_SUCCESS_TOLERANCE_PX;
      if (alreadyAtTarget) {
        if (!reason.startsWith('timeout-')) {
          scheduleRestoreSettle(reason);
        }
        return;
      }

      restoreAttempts += 1;
      resolvedScrollContainer.scrollTop = normalizedScrollTop;
      const restoredScrollTop = resolvedScrollContainer.scrollTop;
      if (Math.abs(restoredScrollTop - normalizedScrollTop) <= SETTINGS_SCROLL_RESTORE_SUCCESS_TOLERANCE_PX) {
        scheduleRestoreSettle(reason);
        return;
      }

      startDeferredRestoreTracking();
    };

    const queueRestore = (reason: string): void => {
      if (restoreSettled || restoreQueued || !resolvedScrollContainer.isConnected) {
        return;
      }

      restoreQueued = true;
      const frameId = window.requestAnimationFrame(() => {
        restoreQueued = false;
        if (this.settingsPanelRestoreFrameId === frameId) {
          this.settingsPanelRestoreFrameId = null;
        }
        applyRestore(reason);
      });
      this.settingsPanelRestoreFrameId = frameId;
    };

    this.settingsPanelRestoreScrollListener = () => {
      if (restoreSettled) {
        return;
      }

      const currentScrollTop = resolvedScrollContainer.scrollTop;
      if (Math.abs(currentScrollTop - normalizedScrollTop) <= SETTINGS_SCROLL_RESTORE_SUCCESS_TOLERANCE_PX) {
        scheduleRestoreSettle('scroll');
        return;
      }

      queueRestore('scroll');
    };
    resolvedScrollContainer.addEventListener('scroll', this.settingsPanelRestoreScrollListener, { passive: true });

    this.settingsPanelRestoreFrameId = window.requestAnimationFrame(() => {
      this.settingsPanelRestoreFrameId = null;
      applyRestore('animation-frame');
    });
  }

  private buildQuickNav(quickNavEl: HTMLElement, sections: SettingsQuickNavSection[]): void {
    quickNavEl.replaceChildren();

    const labelEl = document.createElement('div');
    labelEl.className = 'opencodian-settings-quick-nav-label';
    labelEl.textContent = t('settings.quickNav.title');
    quickNavEl.appendChild(labelEl);

    const chipsEl = document.createElement('div');
    chipsEl.className = 'opencodian-settings-quick-nav-chips';
    quickNavEl.appendChild(chipsEl);

    for (const [index, { headingEl: sectionEl, tooltip }] of sections.entries()) {
      const title = sectionEl.dataset.sectionTitle ?? sectionEl.textContent ?? '';
      const buttonEl = document.createElement('button');
      buttonEl.className = 'opencodian-settings-quick-nav-btn';
      buttonEl.textContent = title;
      buttonEl.type = 'button';
      buttonEl.dataset.quickNavTooltip = tooltip;
      if (sections.length > 1) {
        if (index <= 1) {
          buttonEl.dataset.tooltipAlign = 'left';
        } else if (index >= sections.length - 2) {
          buttonEl.dataset.tooltipAlign = 'right';
        }
      }
      buttonEl.addEventListener('mouseenter', () => {
        this.showQuickNavTooltip(buttonEl, tooltip);
      });
      buttonEl.addEventListener('mouseleave', () => {
        this.hideQuickNavTooltip(buttonEl);
      });
      buttonEl.addEventListener('focus', () => {
        this.showQuickNavTooltip(buttonEl, tooltip);
      });
      buttonEl.addEventListener('blur', () => {
        this.hideQuickNavTooltip(buttonEl);
      });
      buttonEl.addEventListener('click', () => {
        this.hideQuickNavTooltip(buttonEl);
        this.scrollHeadingIntoView(sectionEl);
      });
      chipsEl.appendChild(buttonEl);
    }
  }

  private scrollHeadingIntoView(headingEl: HTMLHeadingElement): void {
    const scrollContainer = this.getSettingsScrollContainer();
    const targetScrollTop = this.resolveHeadingScrollTop(headingEl, scrollContainer);

    if (typeof scrollContainer.scrollTo === 'function') {
      scrollContainer.scrollTo({
        behavior: 'smooth',
        top: targetScrollTop,
      });
      return;
    }

    scrollContainer.scrollTop = targetScrollTop;
  }

  private resolveHeadingScrollTop(headingEl: HTMLHeadingElement, scrollContainer: HTMLElement): number {
    const headingRect = headingEl.getBoundingClientRect();
    const scrollContainerRect = scrollContainer.getBoundingClientRect();
    const stickyOffset = this.resolveQuickNavStickyOffset(scrollContainerRect);

    return Math.max(
      0,
      scrollContainer.scrollTop + (headingRect.top - scrollContainerRect.top) - stickyOffset,
    );
  }

  private resolveQuickNavStickyOffset(scrollContainerRect: DOMRect | Pick<DOMRect, 'top' | 'bottom'>): number {
    if (!this.quickNavEl || !this.quickNavEl.isConnected) {
      return 0;
    }

    const quickNavRect = this.quickNavEl.getBoundingClientRect();
    const visibleTop = Math.max(quickNavRect.top, scrollContainerRect.top);
    const visibleBottom = Math.min(quickNavRect.bottom, scrollContainerRect.bottom);

    return Math.max(0, visibleBottom - visibleTop);
  }

  private scheduleSettingsPanelPostRenderSetup(
    pendingOpenScrollTop: number | null,
    pendingOpenSectionTitle: string | null,
  ): void {
    this.settingsPanelPostRenderFrameId = window.requestAnimationFrame(() => {
      this.settingsPanelPostRenderFrameId = null;
      const scrollContainer = this.getSettingsScrollContainer();
      this.bindSettingsPanelScrollPersistence(scrollContainer);

      if (pendingOpenSectionTitle) {
        this.scrollToSectionByTitle(pendingOpenSectionTitle);
        this.finishPendingOpenVisibility();
        return;
      }

      const targetScrollTop = pendingOpenScrollTop ?? this.getSavedScrollTop();
      if (Math.abs(targetScrollTop) <= SETTINGS_SCROLL_RESTORE_SUCCESS_TOLERANCE_PX) {
        if (Math.abs(scrollContainer.scrollTop) > SETTINGS_SCROLL_RESTORE_SUCCESS_TOLERANCE_PX) {
          scrollContainer.scrollTop = 0;
        }
        this.setSavedScrollTop(0);
        this.lastObservedSettingsScrollTop = 0;
        if (pendingOpenScrollTop !== null) {
          this.finishPendingOpenVisibility();
        }
        return;
      }

      this.restoreScrollPosition(
        targetScrollTop,
        scrollContainer,
        pendingOpenScrollTop !== null ? () => this.finishPendingOpenVisibility() : undefined,
      );
    });
  }

  private bindSettingsPanelScrollPersistence(scrollContainer?: HTMLElement): void {
    this.teardownScrollPersistence();

    const resolvedScrollContainer = scrollContainer ?? this.getSettingsScrollContainer();
    this.settingsScrollContainerEl = resolvedScrollContainer;

    this.settingsScrollHandler = () => {
      if (this.settingsScrollPersistenceSuspended) {
        return;
      }

      this.positionQuickNavTooltip();

      if (!this.containerEl.isConnected || !resolvedScrollContainer.contains(this.containerEl)) {
        return;
      }

      this.setSavedScrollTop(resolvedScrollContainer.scrollTop);
      this.lastObservedSettingsScrollTop = resolvedScrollContainer.scrollTop;
      this.scheduleScrollStateSave();
    };

    resolvedScrollContainer.addEventListener('scroll', this.settingsScrollHandler, { passive: true });
  }

  private captureSettingsPanelScrollPosition(): void {
    const scrollContainer = this.settingsScrollContainerEl ?? this.getSettingsScrollContainer();
    const nextScrollTop =
      scrollContainer.isConnected
        ? scrollContainer.scrollTop
        : this.lastObservedSettingsScrollTop;

    this.setSavedScrollTop(nextScrollTop);
    this.scheduleScrollStateSave();
  }

  private captureVisibleScrollBeforeRebuild(): void {
    if (!this.settingsScrollHandler || !this.settingsScrollContainerEl) {
      return;
    }
    if (!this.settingsScrollContainerEl.isConnected || !this.settingsScrollContainerEl.contains(this.containerEl)) {
      return;
    }

    this.captureSettingsPanelScrollPosition();
  }

  private finishPendingOpenVisibility(): void {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        this.pendingOpenScrollTop = null;
        this.pendingOpenSectionTitle = null;
        this.containerEl.style.removeProperty('visibility');
      });
    });
  }

  private clearInitialQuickNavFocus(): void {
    window.requestAnimationFrame(() => {
      const activeEl = document.activeElement;
      if (!(activeEl instanceof HTMLElement)) {
        return;
      }

      if (!activeEl.classList.contains('opencodian-settings-quick-nav-btn')) {
        return;
      }

      activeEl.blur();
    });
  }

  private ensureQuickNavTooltipLayer(): HTMLElement {
    if (
      this.quickNavTooltipLayerEl
      && this.quickNavTooltipLayerEl.isConnected
      && this.quickNavTooltipBubbleEl
      && this.quickNavTooltipArrowEl
    ) {
      return this.quickNavTooltipLayerEl;
    }

    const document = this.containerEl.ownerDocument;
    const layerEl = document.createElement('div');
    layerEl.className = 'opencodian-settings-quick-nav-tooltip-layer';
    layerEl.setAttribute('aria-hidden', 'true');

    const bubbleEl = document.createElement('div');
    bubbleEl.className = 'opencodian-settings-quick-nav-tooltip-bubble';
    layerEl.appendChild(bubbleEl);

    const arrowEl = document.createElement('div');
    arrowEl.className = 'opencodian-settings-quick-nav-tooltip-arrow';
    layerEl.appendChild(arrowEl);

    document.body.appendChild(layerEl);

    this.quickNavTooltipLayerEl = layerEl;
    this.quickNavTooltipBubbleEl = bubbleEl;
    this.quickNavTooltipArrowEl = arrowEl;

    return layerEl;
  }

  private showQuickNavTooltip(buttonEl: HTMLButtonElement, tooltip: string): void {
    const layerEl = this.ensureQuickNavTooltipLayer();
    if (!this.quickNavTooltipBubbleEl) {
      return;
    }

    this.quickNavTooltipActiveButton = buttonEl;
    this.quickNavTooltipBubbleEl.textContent = tooltip;
    layerEl.classList.add('is-visible');
    this.positionQuickNavTooltip();
    this.bindQuickNavTooltipWindowListeners();
  }

  private hideQuickNavTooltip(buttonEl?: HTMLButtonElement): void {
    if (buttonEl && this.quickNavTooltipActiveButton !== buttonEl) {
      return;
    }

    this.quickNavTooltipActiveButton = null;
    this.destroyQuickNavTooltipLayer();
  }

  private positionQuickNavTooltip(): void {
    if (
      !this.quickNavTooltipActiveButton
      || !this.quickNavTooltipLayerEl
      || !this.quickNavTooltipBubbleEl
      || !this.quickNavTooltipArrowEl
    ) {
      return;
    }

    const rect = this.quickNavTooltipActiveButton.getBoundingClientRect();
    const bubbleRect = this.quickNavTooltipBubbleEl.getBoundingClientRect();
    const tooltipWidth = Math.min(
      QUICK_NAV_TOOLTIP_MAX_WIDTH_PX,
      Math.max(this.quickNavTooltipBubbleEl.offsetWidth, Math.ceil(bubbleRect.width), 0)
        || QUICK_NAV_TOOLTIP_MAX_WIDTH_PX,
    );
    const tooltipHeight = Math.max(this.quickNavTooltipBubbleEl.offsetHeight, Math.ceil(bubbleRect.height), 0);
    const viewport = this.containerEl.ownerDocument.defaultView;
    const viewportWidth = viewport?.innerWidth ?? this.containerEl.ownerDocument.documentElement.clientWidth ?? 0;
    const viewportHeight = viewport?.innerHeight ?? this.containerEl.ownerDocument.documentElement.clientHeight ?? 0;
    const margin = QUICK_NAV_TOOLTIP_MARGIN_PX;
    const halfWidth = tooltipWidth / 2;
    const centerX = rect.left + (rect.width / 2);
    const left = Math.min(
      Math.max(centerX, margin + halfWidth),
      Math.max(margin + halfWidth, viewportWidth - margin - halfWidth),
    );
    const fitsAbove = rect.top - QUICK_NAV_TOOLTIP_GAP_PX - tooltipHeight >= margin;
    const fitsBelow = rect.bottom + QUICK_NAV_TOOLTIP_GAP_PX + tooltipHeight <= viewportHeight - margin;
    const placement = !fitsAbove && fitsBelow ? 'bottom' : 'top';
    const rawTop = placement === 'bottom'
      ? rect.bottom + QUICK_NAV_TOOLTIP_GAP_PX
      : rect.top - QUICK_NAV_TOOLTIP_GAP_PX;
    const clampedTop = placement === 'bottom'
      ? Math.min(rawTop, Math.max(margin, viewportHeight - margin - tooltipHeight))
      : Math.max(rawTop, margin + tooltipHeight);

    this.quickNavTooltipLayerEl.style.left = `${Math.round(left)}px`;
    this.quickNavTooltipLayerEl.style.top = `${Math.round(clampedTop)}px`;
    this.quickNavTooltipLayerEl.dataset.align = 'center';
    this.quickNavTooltipLayerEl.dataset.placement = placement;
  }

  private bindQuickNavTooltipWindowListeners(): void {
    if (this.quickNavTooltipWindowListenersBound) {
      return;
    }

    const view = this.containerEl.ownerDocument.defaultView;
    if (!view) {
      return;
    }

    view.addEventListener('resize', this.handleQuickNavTooltipViewportChange, { passive: true });
    view.addEventListener('scroll', this.handleQuickNavTooltipViewportChange, { passive: true });
    this.quickNavTooltipWindowListenersBound = true;
  }

  private unbindQuickNavTooltipWindowListeners(): void {
    if (!this.quickNavTooltipWindowListenersBound) {
      return;
    }

    const view = this.containerEl.ownerDocument.defaultView;
    if (view) {
      view.removeEventListener('resize', this.handleQuickNavTooltipViewportChange);
      view.removeEventListener('scroll', this.handleQuickNavTooltipViewportChange);
    }
    this.quickNavTooltipWindowListenersBound = false;
  }

  private readonly handleQuickNavTooltipViewportChange = (): void => {
    if (!this.quickNavTooltipActiveButton) {
      return;
    }
    this.positionQuickNavTooltip();
  };

  private destroyQuickNavTooltipLayer(): void {
    this.unbindQuickNavTooltipWindowListeners();
    this.quickNavTooltipLayerEl?.remove();
    this.quickNavTooltipLayerEl = null;
    this.quickNavTooltipBubbleEl = null;
    this.quickNavTooltipArrowEl = null;
    this.quickNavTooltipActiveButton = null;
  }

  private getSettingsScrollContainer(): HTMLElement {
    const explicitScrollContainer = this.getExplicitScrollContainer?.();
    if (
      explicitScrollContainer
      && explicitScrollContainer.isConnected
      && explicitScrollContainer.contains(this.containerEl)
    ) {
      this.settingsScrollContainerEl = explicitScrollContainer;
      return explicitScrollContainer;
    }

    if (
      this.settingsScrollContainerEl
      && this.settingsScrollContainerEl.isConnected
      && this.settingsScrollContainerEl.contains(this.containerEl)
    ) {
      return this.settingsScrollContainerEl;
    }

    const matchedContainer = this.containerEl.closest<HTMLElement>(SETTINGS_SCROLL_CONTAINER_SELECTOR);
    if (matchedContainer) {
      this.settingsScrollContainerEl = matchedContainer;
      return matchedContainer;
    }

    let currentEl: HTMLElement | null = this.containerEl.parentElement;
    while (currentEl) {
      if (this.looksLikeSettingsScrollContainer(currentEl)) {
        this.settingsScrollContainerEl = currentEl;
        return currentEl;
      }
      currentEl = currentEl.parentElement;
    }

    this.settingsScrollContainerEl = this.containerEl;
    return this.containerEl;
  }

  private looksLikeSettingsScrollContainer(element: HTMLElement): boolean {
    if (SETTINGS_SCROLL_CONTAINER_SELECTORS.some((selector) => element.matches(selector))) {
      return true;
    }

    if (element.scrollHeight > element.clientHeight) {
      return true;
    }

    const classNames = Array.from(element.classList);
    return classNames.some((className) =>
      className.includes('vertical-tab-content')
      || className.includes('modal-content'),
    );
  }

  private clearSettingsPanelRestoreWork(): void {
    if (this.settingsPanelRestoreFrameId !== null) {
      window.cancelAnimationFrame(this.settingsPanelRestoreFrameId);
      this.settingsPanelRestoreFrameId = null;
    }

    for (const timeoutId of this.settingsPanelRestoreTimeoutIds) {
      window.clearTimeout(timeoutId);
    }
    this.settingsPanelRestoreTimeoutIds = [];

    if (this.settingsPanelRestoreSettleTimeoutId !== null) {
      window.clearTimeout(this.settingsPanelRestoreSettleTimeoutId);
      this.settingsPanelRestoreSettleTimeoutId = null;
    }

    this.settingsPanelRestoreObserver?.disconnect();
    this.settingsPanelRestoreObserver = null;

    if (this.settingsPanelRestoreScrollListener && this.settingsPanelRestoreScrollContainerEl) {
      this.settingsPanelRestoreScrollContainerEl.removeEventListener('scroll', this.settingsPanelRestoreScrollListener);
    }
    this.settingsPanelRestoreScrollListener = undefined;
    this.settingsPanelRestoreScrollContainerEl = null;
    this.settingsScrollPersistenceSuspended = false;
  }

  private preservePanelHeightDuringRebuild(): void {
    this.clearPanelHeightProtection();
    const currentHeight = this.containerEl.offsetHeight;
    if (currentHeight <= 0) {
      return;
    }

    this.settingsPanelPreviousMinHeight = this.containerEl.style.minHeight;
    this.containerEl.style.minHeight = `${currentHeight}px`;
  }

  private schedulePanelHeightRestore(): void {
    if (this.settingsPanelPreviousMinHeight === null) {
      return;
    }

    const previousMinHeight = this.settingsPanelPreviousMinHeight;
    this.settingsPanelMinHeightRestoreFrameId = window.requestAnimationFrame(() => {
      this.settingsPanelMinHeightRestoreFrameId = null;
      this.settingsPanelPreviousMinHeight = null;
      this.containerEl.style.minHeight = previousMinHeight;
    });
  }

  private clearPanelHeightProtection(): void {
    if (this.settingsPanelMinHeightRestoreFrameId !== null) {
      window.cancelAnimationFrame(this.settingsPanelMinHeightRestoreFrameId);
      this.settingsPanelMinHeightRestoreFrameId = null;
    }

    if (this.settingsPanelPreviousMinHeight !== null) {
      this.containerEl.style.minHeight = this.settingsPanelPreviousMinHeight;
      this.settingsPanelPreviousMinHeight = null;
    }
  }

  private teardownScrollPersistence(): void {
    this.hideQuickNavTooltip();
    if (this.settingsScrollHandler) {
      this.settingsScrollContainerEl?.removeEventListener('scroll', this.settingsScrollHandler);
      this.settingsScrollHandler = undefined;
    }
    this.settingsScrollContainerEl = null;
  }
}
