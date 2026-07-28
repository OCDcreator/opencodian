/**
 * CodexChatSurfaceBinding — owns Codex-specific chat surface lifecycle.
 *
 * Encapsulates Codex chat behaviors that would otherwise grow the guarded
 * `OpenCodianView` shell with net-new runtime ownership:
 *   1. Subscribe to the Codex adapter's `skills/changed` signal and invalidate
 *      the shared slash-command menu cache immediately (not just the 120s TTL).
 *   2. Show an actionable notice when the user types `@` while Codex is active,
 *      because Codex has no native agent dispatch API.
 *   3. Resolve the Codex model catalog with auth-aware Custom policy:
 *      known ChatGPT disables Custom; API-key allows; unknown allows but
 *      marks unverified. Auth mode is determined from the adapter's real
 *      account readback, NOT inferred from the apiKey field.
 *   4. Own the Codex composer model-selection next-thread boundary notices.
 */

import { Notice } from 'obsidian';

import type { Disposable } from '../../../core/agents/backend';
import {
  type CodexAuthMode,
  type CodexCatalogAdapter,
  resolveCodexModelCatalogFromAdapter,
} from '../../../core/agents/backend/BackendModelCatalog';
import { t } from '../../../i18n';

export interface CodexChatSurfaceBindingHost {
  /** Returns the active Codex adapter, or null when Codex is not active/available. */
  getCodexAdapter(): CodexCatalogAdapter & {
    onSkillsChanged?(handler: () => void): Disposable;
  } | null;
  /** Invalidate the slash-command menu catalog so the next `/` open rebuilds it. */
  invalidateSlashCommandMenuCache(): void;
  /** Open the plugin settings surface (resource management entry point). */
  openPluginSettings(): void;
  /** Whether Codex is the active conversation backend. */
  isCodexActive(): boolean;
}

export class CodexChatSurfaceBinding {
  private skillsChangedDisposable: Disposable | null = null;

  constructor(private readonly host: CodexChatSurfaceBindingHost) {}

  /**
   * Subscribe to the Codex adapter's `skills/changed` signal so the slash menu
   * cache invalidates immediately. Idempotent; only active when Codex is active.
   */
  syncSkillsChangedSubscription(): void {
    if (!this.host.isCodexActive()) {
      this.dispose();
      return;
    }
    if (this.skillsChangedDisposable) {
      return;
    }
    const adapter = this.host.getCodexAdapter();
    if (typeof adapter?.onSkillsChanged !== 'function') {
      return;
    }
    this.skillsChangedDisposable = adapter.onSkillsChanged(() => {
      this.host.invalidateSlashCommandMenuCache();
    });
  }

  /**
   * Show an actionable notice when `@` is typed under the Codex backend: Codex
   * has no native agent dispatch API, so `@` cannot select or spawn an agent.
   * Offers a shortcut into the Codex resource management settings.
   */
  notifyAgentMentionUnavailable(): void {
    const message = t('chat.codex.agentMentionUnavailable.message');
    const actionLabel = t('chat.codex.agentMentionUnavailable.openSettings');
    const notice = new Notice(message, 6000);
    const settingBtn = notice.noticeEl.createEl('button', { text: actionLabel });
    settingBtn.addEventListener('click', () => {
      notice.hide();
      this.host.openPluginSettings();
    });
  }

  /**
   * Show an actionable notice when the user opens the Codex skill selector
   * (`/skills` or `$`) but there are no runtime skills to choose. Explains the
   * cause and offers a shortcut into the Codex resource settings where project
   * skills can be created.
   */
  notifySkillsEmpty(): void {
    const message = t('chat.codex.skillsEmpty.message');
    const actionLabel = t('chat.codex.skillsEmpty.openSettings');
    const notice = new Notice(message, 6000);
    const settingBtn = notice.noticeEl.createEl('button', { text: actionLabel });
    settingBtn.addEventListener('click', () => {
      notice.hide();
      this.host.openPluginSettings();
    });
  }

  /**
   * Show the Codex next-thread model-switch boundary notice with an explicit
   * "New Conversation" shortcut. Never automatically interrupts or migrates.
   *
   * Called after a successful idle model selection: the current running thread
   * is unchanged; the next send crosses the next-thread boundary.
   */
  notifyModelSavedNextThread(onNewConversation: () => void): void {
    const notice = new Notice('', 6000);
    const el = notice.noticeEl as unknown as HTMLElement;
    el.addClass('opencodian-codex-model-next-thread-notice');
    el.empty();
    el.createEl('span', { text: t('chat.modelSelector.codex.savedNextThread') });
    const action = el.createEl('button', {
      cls: 'opencodian-codex-model-next-thread-action',
      text: t('chat.modelSelector.codex.newConversationShortcut'),
    });
    action.addEventListener('click', () => {
      notice.hide();
      onNewConversation();
    });
  }

  /** Show a failure notice when the Codex model selection could not be saved. */
  notifyModelApplyFailed(): void {
    new Notice(t('chat.modelSelector.codex.applyFailed'));
  }

  /**
   * Resolve the Codex model catalog with auth-aware Custom policy.
   *
   * Auth mode is determined from the adapter's real account readback
   * (getAccountInfo), NOT inferred from the apiKey field:
   * - Known ChatGPT account → Custom DISABLED (only listed models)
   * - Known API-key auth → Custom allowed
   * - Unknown/unavailable → Custom allowed but marked "unverified"
   *
   * Returns null when the adapter or model list is unavailable.
   */
  async resolveCodexModelCatalog(): Promise<{ providers: import('../ui/modelSelector/types').ModelSelectorProvider[]; authMode: CodexAuthMode } | null> {
    const adapter = this.host.getCodexAdapter();
    if (!adapter || typeof adapter.getModelList !== 'function') {
      return null;
    }
    return resolveCodexModelCatalogFromAdapter(
      adapter,
      t('chat.modelSelector.codex.customApiKey'),
      t('chat.modelSelector.codex.customUnverified'),
    );
  }

  dispose(): void {
    if (this.skillsChangedDisposable) {
      try {
        this.skillsChangedDisposable.dispose();
      } catch {
        // Ignore disposal failures.
      }
      this.skillsChangedDisposable = null;
    }
  }
}
