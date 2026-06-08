import { createEmptyTabContextState } from '../../../../src/core/types';
import { ContextUsageService } from '../../../../src/features/chat/services/ContextUsageService';
import { ContextRing } from '../../../../src/features/chat/ui/ContextRing';
import { TooltipLayerController } from '../../../../src/shared/TooltipLayerController';

function buildState(percentage: number) {
  return ContextUsageService.applyPreciseUsage(
    ContextUsageService.syncStateIdentity(
      createEmptyTabContextState(),
      {
        model: 'gpt-5',
        contextWindow: 100,
      },
    ),
    {
      input: percentage,
      output: 0,
      reasoning: 0,
      cacheRead: 0,
      cacheWrite: 0,
    },
  );
}

describe('ContextRing', () => {
  afterEach(() => {
    TooltipLayerController.ensureForDocument(document).destroy();
    document.body.innerHTML = '';
  });

  it.each([
    [28, 'is-success'],
    [66, 'is-warning'],
    [88, 'is-danger'],
  ])('renders a %s percent context ring with state color but no visible tier text', (percentage, toneClass) => {
    const parentEl = document.createElement('div');
    const ring = new ContextRing(parentEl, jest.fn());

    ring.update(buildState(percentage));

    const buttonEl = parentEl.querySelector<HTMLButtonElement>('.opencodian-context-ring');
    const valueEl = parentEl.querySelector<HTMLElement>('.opencodian-context-ring-label');

    expect(buttonEl?.classList.contains(toneClass)).toBe(true);
    expect(parentEl.querySelector('.opencodian-context-ring-tier')).toBeNull();
    expect(buttonEl?.textContent).not.toMatch(/LOW|MEDIUM|HIGH/);
    expect(valueEl?.textContent).toBe(String(percentage));

    ring.destroy();
  });

  it('marks segmented ticks active from the current percentage', () => {
    const parentEl = document.createElement('div');
    const ring = new ContextRing(parentEl, jest.fn());

    ring.update(buildState(50));

    expect(parentEl.querySelectorAll('.opencodian-context-ring-tick')).toHaveLength(24);
    expect(parentEl.querySelectorAll('.opencodian-context-ring-tick.is-active')).toHaveLength(12);

    ring.destroy();
  });

  it('renders hover details through the shared body-level overlay', () => {
    const parentEl = document.createElement('div');
    document.body.appendChild(parentEl);
    const ring = new ContextRing(parentEl, jest.fn());

    ring.update(buildState(50));

    const buttonEl = parentEl.querySelector<HTMLButtonElement>('.opencodian-context-ring');
    Object.defineProperty(buttonEl as HTMLButtonElement, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 160,
        top: 96,
        right: 196,
        bottom: 132,
        width: 36,
        height: 36,
        x: 160,
        y: 96,
        toJSON: () => '',
      }),
    });

    buttonEl?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

    const overlay = document.body.querySelector<HTMLElement>('.opencodian-tooltip-layer');
    expect(overlay).not.toBeNull();
    expect(overlay?.textContent).toContain(buttonEl?.dataset.tooltip ?? '');

    ring.destroy();
  });
});
