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
  private settingsScrollPersistenceSuspended = false;
  private displayPendingOpenScrollTop: number | null = null;
  private displayPendingOpenSectionTitle: string | null = null;

  constructor(options: SettingsSectionCoordinatorOptions) {
    this.containerEl = options.containerEl;
    this.getSavedScrollTop = options.getSavedScrollTop;
    this.setSavedScrollTop = options.setSavedScrollTop;
    this.scheduleScrollStateSave = options.scheduleScrollStateSave;
  }

  scrollToSectionByTitle(sectionTitle: string): void {
    const headingEl = Array.from(
      this.containerEl.querySelectorAll<HTMLHeadingElement>('.opencodian-settings-section-heading'),
    ).find((candidate) => candidate.dataset.sectionTitle === sectionTitle);

    headingEl?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
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

    this.clearSettingsPanelRestoreWork();
    this.teardownScrollPersistence();
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
    this.clearInitialQuickNavFocus();
    this.displayPendingOpenScrollTop = null;
    this.displayPendingOpenSectionTitle = null;
  }

  hide(): void {
    this.clearSettingsPanelRestoreWork();
    this.captureSettingsPanelScrollPosition();
    this.teardownScrollPersistence();
    if (this.settingsPanelPostRenderFrameId !== null) {
      window.cancelAnimationFrame(this.settingsPanelPostRenderFrameId);
      this.settingsPanelPostRenderFrameId = null;
    }
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
      buttonEl.dataset.tooltip = tooltip;
      if (sections.length > 1) {
        if (index <= 1) {
          buttonEl.dataset.tooltipAlign = 'left';
        } else if (index >= sections.length - 2) {
          buttonEl.dataset.tooltipAlign = 'right';
        }
      }
      buttonEl.addEventListener('click', () => {
        sectionEl.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      });
      chipsEl.appendChild(buttonEl);
    }
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

  private getSettingsScrollContainer(): HTMLElement {
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

  private teardownScrollPersistence(): void {
    if (this.settingsScrollHandler) {
      this.settingsScrollContainerEl?.removeEventListener('scroll', this.settingsScrollHandler);
      this.settingsScrollHandler = undefined;
    }
    this.settingsScrollContainerEl = null;
  }
}
