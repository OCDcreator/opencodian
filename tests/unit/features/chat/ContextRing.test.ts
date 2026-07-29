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

  it('uses OpenCode assistant context for the ring while retaining session totals in its tooltip', () => {
    const state = ContextUsageService.applyUsageSnapshot(
      createEmptyTabContextState(),
      {
        sessionId: 'opencode-session-1',
        sessionTitle: 'OpenCode task',
        createdAt: 100,
        updatedAt: 200,
        providerId: 'openai',
        providerName: 'OpenAI',
        modelId: 'gpt-5',
        modelName: 'GPT-5',
        contextWindow: 1000,
        totalTokens: 167,
        inputTokens: 100,
        outputTokens: 50,
        reasoningTokens: 5,
        cacheReadTokens: 10,
        cacheWriteTokens: 2,
        totalCost: 0.42,
        openCodeHasCumulativeTokens: true,
        openCodeCurrentContext: {
          providerId: 'openai',
          providerName: 'OpenAI',
          modelId: 'gpt-5',
          modelName: 'GPT-5',
          contextWindow: 1000,
          totalTokens: 85,
          inputTokens: 30,
          outputTokens: 12,
          reasoningTokens: 2,
          cacheReadTokens: 40,
          cacheWriteTokens: 1,
        },
      },
    );
    const parentEl = document.createElement('div');
    const ring = new ContextRing(parentEl, jest.fn());

    ring.update(state);

    const buttonEl = parentEl.querySelector<HTMLButtonElement>('.opencodian-context-ring');
    expect(parentEl.querySelector('.opencodian-context-ring-label')?.textContent).toBe('9');
    expect(buttonEl?.dataset.tooltip).toContain('Total tokens: 167');

    ring.destroy();
  });

  it('retains the unavailable ring treatment when OpenCode has no current assistant context', () => {
    const state = ContextUsageService.applyUsageSnapshot(
      createEmptyTabContextState(),
      {
        sessionId: 'opencode-session-2',
        sessionTitle: 'OpenCode task',
        createdAt: 100,
        updatedAt: 200,
        providerId: 'openai',
        providerName: 'OpenAI',
        modelId: 'gpt-5',
        modelName: 'GPT-5',
        contextWindow: 1000,
        totalTokens: 167,
        inputTokens: 100,
        outputTokens: 50,
        reasoningTokens: 5,
        cacheReadTokens: 10,
        cacheWriteTokens: 2,
        totalCost: 0.42,
        openCodeHasCumulativeTokens: true,
        openCodeCurrentContext: null,
      },
    );
    const parentEl = document.createElement('div');
    const ring = new ContextRing(parentEl, jest.fn());

    ring.update(state);

    const buttonEl = parentEl.querySelector<HTMLButtonElement>('.opencodian-context-ring');
    expect(buttonEl?.classList.contains('is-unavailable')).toBe(true);
    expect(parentEl.querySelector('.opencodian-context-ring-label')?.textContent).toBe('-');

    ring.destroy();
  });
});
