import { TextareaSizeMemory } from '../../../../src/features/settings/TextareaSizeMemory';

describe('TextareaSizeMemory', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.localStorage.clear();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    window.localStorage.clear();
  });

  it('restores saved height on attach', () => {
    window.localStorage.setItem('opencodian:settings-textarea-size:test-key', '250');

    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);

    TextareaSizeMemory.attach(textarea, 'test-key');

    expect(textarea.style.height).toBe('250px');
  });

  it('persists height change via ResizeObserver', () => {
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);

    const memory = TextareaSizeMemory.attach(textarea, 'resize-test');

    // Simulate resize by changing the style height and dispatching
    // a ResizeObserver notification.
    textarea.style.height = '300px';
    // Manually trigger the observer callback since jsdom doesn't fire
    // real ResizeObserver events for style changes.
    memory.simulateResize(300);

    expect(window.localStorage.getItem('opencodian:settings-textarea-size:resize-test')).toBe('300');

    memory.destroy();
  });

  it('does not overwrite saved height when no prior value exists', () => {
    const textarea = document.createElement('textarea');
    textarea.style.height = '100px';
    document.body.appendChild(textarea);

    const memory = TextareaSizeMemory.attach(textarea, 'fresh-key');

    // No saved value — should not change the existing height.
    expect(textarea.style.height).toBe('100px');

    memory.destroy();
  });

  it('cleans up observer on destroy', () => {
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);

    const memory = TextareaSizeMemory.attach(textarea, 'cleanup-test');
    memory.destroy();

    // Destroy should not throw and the memory should be inert.
    expect(() => memory.simulateResize(400)).not.toThrow();
    // Should NOT persist after destroy.
    expect(window.localStorage.getItem('opencodian:settings-textarea-size:cleanup-test')).toBeNull();
  });

  it('uses the correct localStorage prefix', () => {
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);

    const memory = TextareaSizeMemory.attach(textarea, 'my-field');
    memory.simulateResize(180);

    const allKeys = Object.keys(window.localStorage);
    expect(allKeys).toContain('opencodian:settings-textarea-size:my-field');

    memory.destroy();
  });
});
