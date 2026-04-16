import type { LiquidGlassAdapterId } from '../../../core/types';
import { createLogger } from '../../../shared';
import {
  InputPanelThemeRuntime,
  type InputPanelThemeRuntimeHost,
} from './InputPanelThemeRuntime';

const logger = createLogger('OpenCodianView');

interface LiquidGlassDiagnosticElementDescriptor {
  tag: string;
  id: string | null;
  classes: string[];
  messageId: string | null;
  role: string | null;
  textPreview: string;
}

interface LiquidGlassBackdropPointSample {
  point: string;
  x: number;
  y: number;
  underlayChain: LiquidGlassDiagnosticElementDescriptor[];
}

interface LiquidGlassOverlapElementDiagnostic {
  overlapArea: number;
  overlapPercentOfShell: number;
  element: LiquidGlassDiagnosticElementDescriptor | null;
}

interface LiquidGlassBackdropOverlapDiagnostics {
  shellArea: number;
  intersectingElementCount: number;
  topIntersectingElements: LiquidGlassOverlapElementDiagnostic[];
  lastContentBottom: number | null;
  shellTop: number;
  gapAboveShellFromLastContentPx: number | null;
}

interface LiquidGlassAncestorDiagnostic {
  depth: number;
  element: LiquidGlassDiagnosticElementDescriptor | null;
  position: string;
  zIndex: string;
  overflow: string;
  isolation: string;
  transform: string;
  filter: string;
  backdropFilter: string;
  opacity: string;
  contain: string;
  mixBlendMode: string;
  pointerEvents: string;
}

export interface InputPanelAppearanceCoordinatorHost extends InputPanelThemeRuntimeHost {
  getChatContainerEl(): HTMLElement | null;
  getMessagesShellEl(): HTMLElement | null;
  getMessagesContainerEl(): HTMLElement | null;
  scheduleChatSurfaceColorSync(): void;
  scheduleComposerLayoutSync(): void;
  isDebugLoggingEnabled(): boolean;
  getLogPreview(text: string, maxLength?: number): string;
  stringifyLogPayload(payload: unknown): string;
}

export class InputPanelAppearanceCoordinator {
  private lastLiquidGlassDiagnosticsFingerprint: string | null = null;
  private readonly themeRuntime: InputPanelThemeRuntime;

  constructor(private readonly host: InputPanelAppearanceCoordinatorHost) {
    this.themeRuntime = new InputPanelThemeRuntime(host);
  }

  syncAppearanceState(): void {
    const liquidGlassAdapterId = this.themeRuntime.syncAppearanceState();
    this.host.scheduleChatSurfaceColorSync();
    this.host.scheduleComposerLayoutSync();
    this.scheduleLiquidGlassDiagnostics(liquidGlassAdapterId);
  }

  applyActionButtonStyleState(): void {
    this.themeRuntime.applyActionButtonStyleState();
  }

  applyThemeState(): void {
    const liquidGlassAdapterId = this.themeRuntime.applyThemeState();
    this.scheduleLiquidGlassDiagnostics(liquidGlassAdapterId);
  }

  destroy(): void {
    this.themeRuntime.destroy();
  }

  logDiagnosticsEntry(label: string, payload: unknown): void {
    const serializedPayload = this.host.stringifyLogPayload(payload);
    const fingerprint = `${label}:${serializedPayload}`;
    if (this.lastLiquidGlassDiagnosticsFingerprint === fingerprint) {
      return;
    }

    this.lastLiquidGlassDiagnosticsFingerprint = fingerprint;
    logger.debug(`${label}: ${serializedPayload}`);
  }

  private scheduleLiquidGlassDiagnostics(adapterId: LiquidGlassAdapterId | null): void {
    if (!adapterId || !this.host.isDebugLoggingEnabled()) {
      return;
    }

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        this.logLiquidGlassDiagnostics(adapterId);
      });
    });
  }

  private logLiquidGlassDiagnostics(adapterId: LiquidGlassAdapterId): void {
    const shellEl = this.host.getComposerShellEl();
    const filterLayerEl = this.themeRuntime.getComposerSvgFilterLayerEl();
    if (!shellEl || !filterLayerEl) {
      this.logDiagnosticsEntry('Liquid glass diagnostics skipped', {
        adapterId,
        reason: 'missing-shell-or-filter-layer',
      });
      return;
    }

    const shellRect = shellEl.getBoundingClientRect();
    const filterRect = filterLayerEl.getBoundingClientRect();
    const filterComputed = window.getComputedStyle(filterLayerEl);
    const shellComputed = window.getComputedStyle(shellEl);
    const messagesEl = this.host.getMessagesContainerEl();
    const chatContainerEl = this.host.getChatContainerEl();
    const inlineFilter = filterLayerEl.style.getPropertyValue('filter');
    const inlineBackdropFilter = filterLayerEl.style.getPropertyValue('backdrop-filter');
    const backdropPointSamples = this.collectLiquidGlassBackdropPointSamples(shellEl);
    const backdropOverlap = this.collectLiquidGlassBackdropOverlapDiagnostics(shellEl);
    const filterLayerAncestorChain = this.collectLiquidGlassAncestorChain(filterLayerEl, chatContainerEl);
    const payload = {
      adapterId,
      themeId: this.host.getInputPanelTheme(),
      adapterSettings: this.host.getLiquidGlassAdapterSettings(adapterId),
      shellRect: {
        width: Math.round(shellRect.width),
        height: Math.round(shellRect.height),
      },
      filterRect: {
        width: Math.round(filterRect.width),
        height: Math.round(filterRect.height),
      },
      shellStyles: {
        isolation: shellComputed.isolation,
        transform: shellComputed.transform,
        borderRadius: shellComputed.borderRadius,
      },
      filterLayerStyles: {
        inlineFilter,
        computedFilter: filterComputed.filter,
        inlineBackdropFilter,
        computedBackdropFilter:
          filterComputed.getPropertyValue('backdrop-filter')
          || filterComputed.getPropertyValue('-webkit-backdrop-filter'),
        backgroundColor: filterComputed.backgroundColor,
        opacity: filterComputed.opacity,
      },
      messagesMetrics: messagesEl
        ? {
            scrollTop: Math.round(messagesEl.scrollTop),
            scrollHeight: Math.round(messagesEl.scrollHeight),
            clientHeight: Math.round(messagesEl.clientHeight),
            paddingBottom: window.getComputedStyle(messagesEl).paddingBottom,
          }
        : null,
      composerStackHeight: chatContainerEl?.style.getPropertyValue('--opencodian-composer-stack-height') ?? '',
      backdropPointSamples,
      backdropOverlap,
      filterLayerAncestorChain,
    };

    this.logDiagnosticsEntry('Liquid glass diagnostics', payload);
  }

  private describeLiquidGlassDiagnosticElement(
    el: Element | null,
  ): LiquidGlassDiagnosticElementDescriptor | null {
    if (!el) {
      return null;
    }

    const tagName = typeof el.tagName === 'string' ? el.tagName.toLowerCase() : 'unknown';
    const classNames = Array.from(el.classList ?? []).slice(0, 6);
    const htmlEl = el instanceof HTMLElement ? el : null;
    const messageEl = htmlEl?.closest<HTMLElement>('.opencodian-message') ?? null;
    const previewSource = el instanceof HTMLImageElement
      ? (el.getAttribute('alt') ?? el.getAttribute('src') ?? '')
      : (htmlEl?.textContent ?? '');

    return {
      tag: tagName,
      id: 'id' in el && typeof el.id === 'string' && el.id ? el.id : null,
      classes: classNames,
      messageId: messageEl?.dataset.messageId ?? null,
      role: htmlEl?.getAttribute('role') ?? null,
      textPreview: previewSource ? this.host.getLogPreview(previewSource, 80) : '',
    };
  }

  private getLiquidGlassRectIntersectionArea(a: DOMRect, b: DOMRect): number {
    const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (width <= 0 || height <= 0) {
      return 0;
    }

    return width * height;
  }

  private collectLiquidGlassBackdropPointSamples(
    shellEl: HTMLElement,
  ): LiquidGlassBackdropPointSample[] {
    if (typeof document.elementsFromPoint !== 'function') {
      return [];
    }

    const shellRect = shellEl.getBoundingClientRect();
    if (shellRect.width <= 0 || shellRect.height <= 0) {
      return [];
    }

    const insetX = Math.max(8, Math.min(24, shellRect.width * 0.18));
    const insetY = Math.max(8, Math.min(24, shellRect.height * 0.18));
    const samplePoints = [
      { point: 'top-left', x: shellRect.left + insetX, y: shellRect.top + insetY },
      { point: 'top-center', x: shellRect.left + shellRect.width / 2, y: shellRect.top + insetY },
      { point: 'top-right', x: shellRect.right - insetX, y: shellRect.top + insetY },
      { point: 'center', x: shellRect.left + shellRect.width / 2, y: shellRect.top + shellRect.height / 2 },
      { point: 'bottom-center', x: shellRect.left + shellRect.width / 2, y: shellRect.bottom - insetY },
    ];

    return samplePoints.map((sample) => {
      const x = Math.max(0, Math.min(window.innerWidth - 1, Math.round(sample.x)));
      const y = Math.max(0, Math.min(window.innerHeight - 1, Math.round(sample.y)));
      const underlayChain = document
        .elementsFromPoint(x, y)
        .filter((candidate) => !shellEl.contains(candidate) && !candidate.contains(shellEl))
        .slice(0, 6)
        .map((candidate) => this.describeLiquidGlassDiagnosticElement(candidate))
        .filter((candidate): candidate is LiquidGlassDiagnosticElementDescriptor => candidate !== null);

      return {
        point: sample.point,
        x,
        y,
        underlayChain,
      };
    });
  }

  private collectLiquidGlassBackdropOverlapDiagnostics(
    shellEl: HTMLElement,
  ): LiquidGlassBackdropOverlapDiagnostics | null {
    const messagesShellEl = this.host.getMessagesShellEl();
    if (!messagesShellEl) {
      return null;
    }

    const shellRect = shellEl.getBoundingClientRect();
    const shellArea = Math.max(1, shellRect.width * shellRect.height);
    const overlapCandidates = Array.from(
      messagesShellEl.querySelectorAll<HTMLElement>(
        '.opencodian-message, .opencodian-chat-notice-card, .opencodian-tool-use, .opencodian-message img, .opencodian-message pre, .opencodian-message table',
      ),
    );
    const intersectingElements = overlapCandidates
      .map((candidate) => {
        const rect = candidate.getBoundingClientRect();
        const overlapArea = this.getLiquidGlassRectIntersectionArea(shellRect, rect);
        return { candidate, rect, overlapArea };
      })
      .filter((entry) => entry.overlapArea > 0)
      .sort((a, b) => b.overlapArea - a.overlapArea)
      .slice(0, 5)
      .map((entry) => ({
        overlapArea: Math.round(entry.overlapArea),
        overlapPercentOfShell: Number(((entry.overlapArea / shellArea) * 100).toFixed(2)),
        element: this.describeLiquidGlassDiagnosticElement(entry.candidate),
      }));

    const structuralContentElements = Array.from(
      messagesShellEl.querySelectorAll<HTMLElement>(
        '.opencodian-turn, .opencodian-chat-notice-card, .opencodian-tool-use',
      ),
    );
    let lastContentBottom = Number.NEGATIVE_INFINITY;
    structuralContentElements.forEach((candidate) => {
      const rect = candidate.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return;
      }

      lastContentBottom = Math.max(lastContentBottom, rect.bottom);
    });

    return {
      shellArea: Math.round(shellArea),
      intersectingElementCount: intersectingElements.length,
      topIntersectingElements: intersectingElements,
      lastContentBottom: Number.isFinite(lastContentBottom) ? Math.round(lastContentBottom) : null,
      shellTop: Math.round(shellRect.top),
      gapAboveShellFromLastContentPx:
        Number.isFinite(lastContentBottom)
          ? Math.round(shellRect.top - lastContentBottom)
          : null,
    };
  }

  private collectLiquidGlassAncestorChain(
    startEl: HTMLElement,
    stopEl?: HTMLElement | null,
  ): LiquidGlassAncestorDiagnostic[] {
    const chain: LiquidGlassAncestorDiagnostic[] = [];
    let current: HTMLElement | null = startEl;
    let depth = 0;

    while (current && depth < 8) {
      const computed = window.getComputedStyle(current);
      chain.push({
        depth,
        element: this.describeLiquidGlassDiagnosticElement(current),
        position: computed.position,
        zIndex: computed.zIndex,
        overflow: computed.overflow,
        isolation: computed.isolation,
        transform: computed.transform,
        filter: computed.filter,
        backdropFilter:
          computed.getPropertyValue('backdrop-filter')
          || computed.getPropertyValue('-webkit-backdrop-filter'),
        opacity: computed.opacity,
        contain: computed.contain,
        mixBlendMode: computed.mixBlendMode,
        pointerEvents: computed.pointerEvents,
      });

      if (stopEl && current === stopEl) {
        break;
      }

      current = current.parentElement;
      depth += 1;
    }

    return chain;
  }
}
