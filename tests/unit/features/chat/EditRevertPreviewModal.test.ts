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

  it('renders labelled before-to-after lines and only confirms after the explicit action', () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    const modal = new EditRevertPreviewModal({} as never, { preview: cleanPreview, onConfirm, onCancel });
    modal.onOpen();

    const lines = modal.contentEl.querySelector('.opencodian-edit-revert-preview-lines')?.textContent ?? '';
    expect(lines).toContain(t('editRevert.preview.linesBeforeLabel'));
    expect(lines).toContain(t('editRevert.preview.linesAfterLabel'));
    expect(lines).toContain(t('editRevert.preview.linesValue', { count: '2' }));
    expect(lines).toContain(t('editRevert.preview.linesValue', { count: '3' }));
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

describe('EditRevertPreviewModal row semantics (R-F3)', () => {
  beforeEach(() => setLocale('en'));

  function renderRow(overrides: Partial<EditRevertPreview['rows'][number]>): HTMLElement {
    const modal = new EditRevertPreviewModal({} as never, {
      preview: {
        roundId: 'round-1',
        roundOpen: false,
        rows: [{ ...cleanPreview.rows[0], ...overrides }],
      },
      onConfirm: jest.fn(),
    });
    modal.onOpen();
    const row = modal.contentEl.querySelector<HTMLElement>('.opencodian-edit-revert-preview-row');
    if (!row) {
      throw new Error('Expected a preview row');
    }
    return row;
  }

  it('names both sides of the line comparison instead of showing two bare numbers', () => {
    const row = renderRow({ status: 'modified', beforeLines: 2, afterLines: 3 });
    const lines = row.querySelector('.opencodian-edit-revert-preview-lines');
    // Both counts carry their own label, and neither is a bare "2"/"3" pair.
    expect(lines?.textContent).toContain(t('editRevert.preview.linesBeforeLabel'));
    expect(lines?.textContent).toContain(t('editRevert.preview.linesAfterLabel'));
    expect(lines?.textContent).toContain('2');
    expect(lines?.textContent).toContain('3');
    expect(lines?.textContent).not.toBe('2 lines → 3 lines');
  });

  it('keeps the capture-state framing explicit for a modified row', () => {
    const row = renderRow({ status: 'modified', beforeLines: 2, afterLines: 3 });
    expect(row.querySelector('.opencodian-edit-revert-preview-action')?.textContent)
      .toBe(t('editRevert.preview.actionModified'));
    expect(row.textContent).toContain(t('editRevert.preview.linesBeforeLabel'));
  });

  it('says a created file will be deleted by the revert', () => {
    const row = renderRow({ status: 'created', beforeLines: 0, afterLines: 4 });
    const action = row.querySelector('.opencodian-edit-revert-preview-action')?.textContent ?? '';
    expect(action).toBe(t('editRevert.preview.actionCreated'));
    expect(action.toLowerCase()).toContain('delete');
  });

  it('says a deleted file will be restored by the revert', () => {
    const row = renderRow({ status: 'deleted', beforeLines: 5, afterLines: 0 });
    const action = row.querySelector('.opencodian-edit-revert-preview-action')?.textContent ?? '';
    expect(action).toBe(t('editRevert.preview.actionDeleted'));
    expect(action.toLowerCase()).toContain('restore');
  });

  it('explains that a moved row reverts by renaming back', () => {
    const row = renderRow({ status: 'moved', beforeLines: 1, afterLines: 1 });
    expect(row.querySelector('.opencodian-edit-revert-preview-action')?.textContent)
      .toBe(t('editRevert.preview.actionMoved'));
  });

  it('marks an unavailable count with a label rather than a bare dash', () => {
    const row = renderRow({ status: 'modified', beforeLines: null, afterLines: null });
    const lines = row.querySelector('.opencodian-edit-revert-preview-lines')?.textContent ?? '';
    expect(lines).toContain(t('editRevert.preview.linesBeforeLabel'));
    expect(lines).toContain(t('editRevert.preview.linesUnavailable'));
  });
});
