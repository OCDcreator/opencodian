/**
 * Read-only SDK capability disclosure rows.
 *
 * This module renders a small, stable block inside an existing Settings
 * section that shows which SDK capabilities the connected OpenCode server
 * supports. It is strictly informational — it never edits user settings or
 * credentials. Unsupported capabilities are kept visible with their redacted
 * reason and a Re-check action so users can understand why a feature is
 * disabled without being lied to.
 *
 * Security: only the redacted `reason` / `minimumServerHint` from the
 * availability result is ever rendered. No secrets, tokens, or raw server
 * error bodies are displayed.
 */

import type { ButtonComponent } from 'obsidian';
import { Setting } from 'obsidian';

import type {
  OpenCodeSdkCapabilityAvailability,
  OpenCodeUnsupportedCapabilityResult,
} from '../../core/opencode/OpenCodeSdkCapabilityDiscoveryCoordinator';
import { t, type TranslationKey } from '../../i18n';
import type OpenCodianPlugin from '../../main';

/** The set of availability kinds the renderer handles. */
type AvailabilityKind = OpenCodeSdkCapabilityAvailability['kind'];

/** Visual tone for a capability status badge. */
type CapabilityStatusTone = 'available' | 'disabled' | 'unknown';

interface ResolvedCapabilityRow {
  readonly capabilityId: string;
  readonly displayName: string;
  readonly kind: AvailabilityKind;
  readonly tone: CapabilityStatusTone;
  readonly statusLabel: string;
  readonly reason?: string;
}

export interface CapabilityDisclosureRowOptions {
  /**
   * Optional locale-key-per-capability-id labels. When a label is missing
   * the renderer falls back to the capability id itself.
   */
  readonly labels?: Partial<Record<string, TranslationKey>>;
  /**
   * Optional heading locale key rendered above the rows. When omitted no
   * heading is rendered (the caller controls the heading).
   */
  readonly headingKey?: TranslationKey;
  /**
   * Optional extra CSS class applied to the rows container element.
   */
  readonly containerClass?: string;
}

const STATUS_LABEL_KEYS: Record<AvailabilityKind, TranslationKey> = {
  available: 'capabilities.status.available',
  'unsupported-by-server': 'capabilities.status.unsupportedByServer',
  'disabled-by-user': 'capabilities.status.disabledByUser',
  'unsupported-by-sdk': 'capabilities.status.unsupportedBySdk',
  unknown: 'capabilities.status.unknown',
};

function toneForKind(kind: AvailabilityKind): CapabilityStatusTone {
  if (kind === 'available') {
    return 'available';
  }
  if (kind === 'unknown') {
    return 'unknown';
  }
  return 'disabled';
}

function isUnsupportedResult(
  value: OpenCodeSdkCapabilityAvailability | OpenCodeUnsupportedCapabilityResult,
): value is OpenCodeUnsupportedCapabilityResult {
  return (value as OpenCodeUnsupportedCapabilityResult).supported === false;
}

function resolveRow(
  capabilityId: string,
  result: OpenCodeSdkCapabilityAvailability | OpenCodeUnsupportedCapabilityResult,
  options: CapabilityDisclosureRowOptions,
): ResolvedCapabilityRow {
  const displayName = options.labels?.[capabilityId]
    ? t(options.labels[capabilityId]!)
    : capabilityId;

  if (isUnsupportedResult(result)) {
    const kind = result.kind;
    return {
      capabilityId,
      displayName,
      kind,
      tone: toneForKind(kind),
      statusLabel: t(STATUS_LABEL_KEYS[kind]),
      reason: result.reason,
    };
  }

  const reason = result.kind === 'available' ? undefined : result.reason;

  return {
    capabilityId,
    displayName,
    kind: result.kind,
    tone: toneForKind(result.kind),
    statusLabel: t(STATUS_LABEL_KEYS[result.kind]),
    reason,
  };
}

function queryCapabilities(
  plugin: OpenCodianPlugin,
  capabilityIds: readonly string[],
  options: CapabilityDisclosureRowOptions,
): ResolvedCapabilityRow[] {
  return capabilityIds.map((capabilityId) => {
    const result = plugin.openCodeService.requireSdkCapability(capabilityId);
    return resolveRow(capabilityId, result, options);
  });
}

function renderRow(setting: Setting, row: ResolvedCapabilityRow): void {
  const descriptionParts: string[] = [row.statusLabel];
  if (row.reason) {
    descriptionParts.push(row.reason);
  }
  setting.setDesc(descriptionParts.join(' · '));
  setting.setClass('opencodian-capability-row');
  setting.setClass(`opencodian-capability-row--${row.tone}`);
  setting.settingEl.setAttribute('data-capability-id', row.capabilityId);
  setting.settingEl.setAttribute('data-capability-status', row.kind);

  // The badge is a disabled button chip: it conveys status only and never
  // performs an action. Unsupported rows keep the badge (never hidden) so the
  // reason stays visible to the user.
  setting.addButton((button: ButtonComponent) => {
    button
      .setButtonText(row.statusLabel)
      .setDisabled(true);
    styleButtonBadge(button, row);
  });
}

/**
 * Apply badge tone classes/attributes to a button element. Guarded so it is a
 * no-op when `buttonEl` is absent (e.g. some unit-test mocks); in production
 * the real `ButtonComponent` always exposes `buttonEl`.
 */
function styleButtonBadge(button: ButtonComponent, row: ResolvedCapabilityRow): void {
  const buttonEl = (button as ButtonComponent & { buttonEl?: HTMLElement }).buttonEl;
  if (!buttonEl) {
    return;
  }
  buttonEl.addClass('opencodian-capability-badge');
  buttonEl.addClass(`opencodian-capability-badge--${row.tone}`);
  buttonEl.setAttribute('aria-label', row.statusLabel);
  buttonEl.setAttribute('data-capability-tone', row.tone);
  if (row.tone !== 'available') {
    buttonEl.setAttribute('disabled', 'true');
  }
}

/**
 * Render read-only capability disclosure rows for the given capability ids
 * inside `containerEl`. Renders a heading (when `options.headingKey` is set),
 * one status row per capability, and a single shared Re-check button that
 * re-probes server support and re-renders.
 *
 * The renderer is idempotent: it replaces the contents of `containerEl` on
 * every call. Callers should pass a dedicated container element.
 */
export function renderCapabilityDisclosureRows(
  containerEl: HTMLElement,
  plugin: OpenCodianPlugin,
  capabilityIds: readonly string[],
  options: CapabilityDisclosureRowOptions = {},
): void {
  containerEl.empty();
  containerEl.addClass('opencodian-capability-disclosure');
  if (options.containerClass) {
    containerEl.addClass(options.containerClass);
  }

  if (options.headingKey) {
    containerEl.createEl('h4', {
      text: t(options.headingKey),
      cls: 'opencodian-settings-subsection-heading opencodian-capability-disclosure-heading',
    });
  }

  const rows = queryCapabilities(plugin, capabilityIds, options);
  for (const row of rows) {
    const setting = new Setting(containerEl).setName(row.displayName);
    renderRow(setting, row);
  }

  const footerSetting = new Setting(containerEl).setClass('opencodian-capability-disclosure-footer');
  footerSetting.addButton((button: ButtonComponent) => {
    button.setButtonText(t('capabilities.recheck'));
    const buttonEl = (button as ButtonComponent & { buttonEl?: HTMLElement }).buttonEl;
    if (buttonEl) {
      buttonEl.addClass('opencodian-capability-recheck');
      buttonEl.setAttribute('data-capability-action', 'recheck');
    }
    button.onClick(async () => {
      button.setDisabled(true);
      try {
        await plugin.openCodeService.refreshSdkCapabilities();
      } finally {
        renderCapabilityDisclosureRows(containerEl, plugin, capabilityIds, options);
      }
    });
  });
}
