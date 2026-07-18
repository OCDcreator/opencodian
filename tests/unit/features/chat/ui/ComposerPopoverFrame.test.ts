import { mountComposerPopoverFrame } from '../../../../../src/features/chat/ui/ComposerPopoverFrame';

describe('mountComposerPopoverFrame', () => {
  it('mounts the shared header, content, and footer in the selector dropdown', () => {
    const dropdown = document.createElement('div');
    const frame = mountComposerPopoverFrame(dropdown, {
      title: 'Choose model',
      escapeKey: 'Esc',
      navigateHint: 'Navigate',
      selectHint: 'Select',
    });

    expect(dropdown.querySelector('.opencodian-composer-popover-frame')).not.toBeNull();
    expect(dropdown.querySelector('.opencodian-composer-popover-title')?.textContent).toBe('Choose model');
    expect(dropdown.querySelector('kbd')?.textContent).toBe('Esc');
    expect(dropdown.querySelector('.opencodian-composer-popover-footer')?.textContent).toContain('Navigate');
    expect(Array.from(dropdown.firstElementChild?.children ?? []).map((child) => child.className)).toEqual([
      'opencodian-composer-popover-header',
      'opencodian-composer-popover-content',
      'opencodian-composer-popover-footer',
    ]);
    expect(frame.contentEl.className).toBe('opencodian-composer-popover-content');
  });

  it('refreshes frame copy without clearing selector content', () => {
    const dropdown = document.createElement('div');
    const frame = mountComposerPopoverFrame(dropdown, {
      title: 'Choose model',
      escapeKey: 'Esc',
      navigateHint: 'Navigate',
      selectHint: 'Select',
    });
    const child = frame.contentEl.createDiv({ text: 'catalog' });

    frame.refresh({
      title: '选择模型',
      escapeKey: 'Esc',
      navigateHint: '导航',
      selectHint: '选择',
    });

    expect(frame.contentEl.contains(child)).toBe(true);
    expect(dropdown.querySelector('.opencodian-composer-popover-title')?.textContent).toBe('选择模型');
    expect(dropdown.querySelector('kbd')?.textContent).toBe('Esc');
    expect(dropdown.querySelector('.opencodian-composer-popover-footer')?.textContent).toContain('导航');
    expect(dropdown.querySelector('.opencodian-composer-popover-footer')?.textContent).toContain('选择');
  });
});
