/**
 * CodexChatSurfaceBinding — owns Codex-specific chat surface lifecycle.
 *
 * Encapsulates the two Codex chat behaviors that would otherwise grow the
 * guarded `OpenCodianView` shell with net-new runtime ownership:
 *   1. Subscribe to the Codex adapter's `skills/changed` signal and invalidate
 *      the shared slash-command menu cache immediately (not just the 120s TTL).
 *   2. Show an actionable notice when the user types `@` while Codex is active,
 *      because Codex has no native agent dispatch API.
 *
 * The view composes this binding; it does not own the subscription/disposable
 * or the notice DOM directly.
 */

import { Notice } from 'obsidian';

import type { Disposable } from '../../../core/agents/backend';
import { t } from '../../../i18n';

export interface CodexChatSurfaceBindingHost {
  /** Returns the active Codex adapter, or null when Codex is not active/available. */
  getCodexAdapter(): {
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
