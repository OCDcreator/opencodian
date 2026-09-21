import { EditRevertPreviewModal } from '../../../../src/features/chat/ui/EditRevertPreviewModal';
import { setLocale, t } from '../../../../src/i18n';
import type { EditRevertPreview } from '../../../../src/shared';

const cleanPreview: EditRevertPreview = {
  roundId: 'round-1',
  roundOpen: false,
  rows: [{
    path: 'notes/plan.md',
    status: 'modified',
    beforeLines: 2,
    afterLines: 3,
    conflict: false,
    conflictReason: null,
  }],
};

describe('EditRevertPreviewModal', () => {
  beforeEach(() => setLocale('en'));

  it('renders before-to-after lines and only confirms after the explicit action', () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    const modal = new EditRevertPreviewModal({} as never, { preview: cleanPreview, onConfirm, onCancel });
    modal.onOpen();

    expect(modal.contentEl.textContent).toContain('2 lines → 3 lines');
    expect(modal.contentEl.textContent).toContain(t('editRevert.preview.safeIntro'));
    expect(onConfirm).not.toHaveBeenCalled();
    modal.contentEl.querySelector<HTMLButtonElement>('.opencodian-edit-revert-preview-confirm')?.click();
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('marks conflict rows with text and an icon, then offers the deliberate override label', () => {
    const modal = new EditRevertPreviewModal({} as never, {
      preview: {
        ...cleanPreview,
        rows: [{ ...cleanPreview.rows[0], conflict: true, conflictReason: 'changed-after-capture' }],
      },
      onConfirm: jest.fn(),
    });
    modal.onOpen();

    const conflict = modal.contentEl.querySelector('.opencodian-edit-revert-preview-conflict');
    expect(conflict?.textContent).toContain(t('editRevert.preview.changedAfterCapture'));
    expect(conflict?.querySelector('svg')).not.toBeNull();
    expect(modal.contentEl.querySelector('.opencodian-edit-revert-preview-confirm')?.textContent)
      .toBe(t('editRevert.preview.confirmConflict'));
  });

  it('fails closed when preview setup failed: it has no confirm button or write callback', () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    const modal = new EditRevertPreviewModal({} as never, {
      error: 'baseline read failed',
      onConfirm,
      onCancel,
    });
    modal.onOpen();

    expect(modal.contentEl.textContent).toContain('baseline read failed');
    expect(modal.contentEl.querySelector('.opencodian-edit-revert-preview-confirm')).toBeNull();
    modal.contentEl.querySelector<HTMLButtonElement>('.opencodian-edit-revert-preview-cancel')?.click();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('fails closed when the returned preview says the round is still open', () => {
    const onConfirm = jest.fn();
    const modal = new EditRevertPreviewModal({} as never, {
      preview: { ...cleanPreview, roundOpen: true },
      onConfirm,
    });
    modal.onOpen();

    expect(modal.contentEl.textContent).toContain(t('editRevert.preview.roundOpen'));
    expect(modal.contentEl.querySelector('.opencodian-edit-revert-preview-confirm')).toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
