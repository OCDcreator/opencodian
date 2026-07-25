import {
  ConversationSessionSettingsModal,
} from '../../../../src/features/chat/ui/ConversationSessionSettingsModal';
import { setLocale, t } from '../../../../src/i18n';

describe('ConversationSessionSettingsModal Codex approvalPolicy', () => {
  beforeEach(() => {
    setLocale('en');
  });

  function openModal(initialOverrides?: { codexApprovalPolicy?: 'inherit' | 'untrusted' | 'on-request' | 'never' | null }) {
    const modal = new ConversationSessionSettingsModal({} as never, {
      conversationTitle: 'Codex chat',
      defaults: {
        chatFontSizePx: 13,
        codexSandboxMode: 'workspace-write',
        codexModelReasoningEffort: 'medium',
        codexModelOverride: 'codex-mini-latest',
        codexNetworkAccessEnabled: false,
        codexWebSearchMode: 'cached',
        codexApprovalPolicy: 'inherit',
      },
      ...(initialOverrides ? { initialOverrides } : {}),
      showCodexControls: true,
      onSave: jest.fn().mockResolvedValue(undefined),
    });
    modal.onOpen();
    return modal;
  }

  function getSelect(modal: ConversationSessionSettingsModal): HTMLSelectElement {
    const select = modal.contentEl.querySelector<HTMLSelectElement>('[data-setting="codex-approval-policy"]');
    if (!select) throw new Error('Expected approval-policy select to render');
    return select;
  }

  function getAccessibleName(select: HTMLSelectElement): string {
    const labelledBy = select.getAttribute('aria-labelledby');
    if (labelledBy) {
      return labelledBy
        .split(/\s+/)
        .map((id) => modalLabel(select, id))
        .filter((value): value is string => value !== null)
        .join(' ')
        .trim();
    }
    const ariaLabel = select.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel;
    const id = select.id;
    if (!id) return '';
    return select.ownerDocument.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(id)}"]`)?.textContent?.trim() ?? '';
  }

  function modalLabel(select: HTMLSelectElement, id: string): string | null {
    let root: HTMLElement | null = select.parentElement;
    while (root?.parentElement) root = root.parentElement;
    return root?.querySelector<HTMLElement>(`[id="${id}"]`)?.textContent?.trim() ?? null;
  }

  it('renders a blank "Use global setting" option DISTINCT from the explicit "inherit" option', () => {
    const modal = openModal();
    const select = getSelect(modal);
    const options = Array.from(select.options).map((o) => o.value);
    // Blank value (use global) AND explicit inherit both present and distinct.
    expect(options).toContain('');
    expect(options).toContain('inherit');
    expect(options).toEqual(['', 'inherit', 'untrusted', 'on-request', 'never']);
    // The blank option carries the "Use global setting" label.
    expect(select.options[0].textContent).toMatch(/global/i);
    // The explicit inherit option carries a distinct "backend default" label.
    expect(select.options[1].textContent).toMatch(/inherit|backend/i);
  });

  it('defaults to blank (use global) when no per-session override exists', () => {
    expect(getSelect(openModal()).value).toBe('');
  });

  it('initializes to an explicit override when one exists', () => {
    expect(getSelect(openModal({ codexApprovalPolicy: 'untrusted' })).value).toBe('untrusted');
    expect(getSelect(openModal({ codexApprovalPolicy: 'inherit' })).value).toBe('inherit');
  });

  it('gives the real Approval Policy, Sandbox Mode, and related session selects an accessible name', () => {
    const modal = openModal();
    const approval = getSelect(modal);
    expect(modal.contentEl.querySelector('#codex-approval-policy-label')?.textContent).toContain('Approval');
    expect(approval.getAttribute('aria-labelledby')).toBe('codex-approval-policy-label');
    expect(getAccessibleName(approval)).toBe(t('chat.sessionSettings.modal.codexApprovalPolicy'));

    for (const setting of [
      'codex-sandbox-mode',
      'codex-reasoning-effort',
      'codex-network-access-enabled',
      'codex-web-search-mode',
    ]) {
      const select = modal.contentEl.querySelector<HTMLSelectElement>(`[data-setting="${setting}"]`);
      if (!select) throw new Error(`Expected ${setting} select to render`);
      expect(getAccessibleName(select)).not.toBe('');
    }
  });

  it('saves null (use global) when the blank option is selected', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    const modal = new ConversationSessionSettingsModal({} as never, {
      conversationTitle: 'Codex chat',
      defaults: {
        chatFontSizePx: 13, codexSandboxMode: 'workspace-write', codexModelReasoningEffort: 'medium',
        codexModelOverride: 'codex-mini-latest', codexNetworkAccessEnabled: false, codexWebSearchMode: 'cached',
        codexApprovalPolicy: 'inherit',
      },
      // A non-null sibling override keeps the overrides object alive so the
      // null approval policy is observable instead of collapsed to undefined.
      initialOverrides: { codexApprovalPolicy: 'untrusted', codexSandboxMode: 'read-only' },
      showCodexControls: true,
      onSave,
    });
    modal.onOpen();
    const select = getSelect(modal);
    select.value = '';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    modal.contentEl.querySelector<HTMLButtonElement>('.opencodian-session-settings-save')?.click();
    await Promise.resolve();
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ codexApprovalPolicy: null }),
    );
  });

  it('saves the explicit "inherit" value (backend default, no override) when selected', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    const modal = new ConversationSessionSettingsModal({} as never, {
      conversationTitle: 'Codex chat',
      defaults: {
        chatFontSizePx: 13, codexSandboxMode: 'workspace-write', codexModelReasoningEffort: 'medium',
        codexModelOverride: 'codex-mini-latest', codexNetworkAccessEnabled: false, codexWebSearchMode: 'cached',
        codexApprovalPolicy: 'inherit',
      },
      showCodexControls: true,
      onSave,
    });
    modal.onOpen();
    const select = getSelect(modal);
    select.value = 'inherit';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    modal.contentEl.querySelector<HTMLButtonElement>('.opencodian-session-settings-save')?.click();
    await Promise.resolve();
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ codexApprovalPolicy: 'inherit' }),
    );
  });
});
