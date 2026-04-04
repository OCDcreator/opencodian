import { NavigationSidebar } from '../../../../src/features/chat/ui/NavigationSidebar';

type ObsidianLikeElement = HTMLElement & {
  createDiv: (options?: { cls?: string }) => HTMLDivElement;
  createEl: <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    options?: { cls?: string; text?: string; attr?: Record<string, string> }
  ) => HTMLElementTagNameMap[K];
};

class ResizeObserverMock {
  observe() {}
  disconnect() {}
}

function installObsidianElementHelpers(): void {
  const prototype = HTMLElement.prototype as ObsidianLikeElement;

  if (!prototype.createDiv) {
    prototype.createDiv = function createDiv(options = {}) {
      return appendChildElement(this, 'div', options);
    };
  }

  if (!prototype.createEl) {
    prototype.createEl = function createEl(tag, options = {}) {
      return appendChildElement(this, tag, options);
    };
  }
}

function appendChildElement<K extends keyof HTMLElementTagNameMap>(
  parent: HTMLElement,
  tag: K,
  options: { cls?: string; text?: string; attr?: Record<string, string> } = {}
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);

  if (options.cls) {
    element.className = options.cls;
  }

  if (options.text) {
    element.textContent = options.text;
  }

  if (options.attr) {
    for (const [key, value] of Object.entries(options.attr)) {
      element.setAttribute(key, value);
    }
  }

  parent.appendChild(element);
  return element;
}

function setNumericProperty(target: object, key: string, value: number): void {
  Object.defineProperty(target, key, {
    configurable: true,
    writable: true,
    value,
  });
}

function setRect(target: HTMLElement, top: number, height = 40): void {
  Object.defineProperty(target, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      top,
      bottom: top + height,
      left: 0,
      right: 100,
      width: 100,
      height,
      x: 0,
      y: top,
      toJSON: () => ({}),
    }),
  });
}

function createTurn(messagesEl: HTMLElement, label: string) {
  const turnEl = document.createElement('div');
  turnEl.className = 'opencodian-turn';

  const headerEl = document.createElement('div');
  headerEl.className = 'opencodian-turn-header';

  const userMessageEl = document.createElement('div');
  userMessageEl.className = 'opencodian-message opencodian-message--user';
  userMessageEl.textContent = label;

  const bodyEl = document.createElement('div');
  bodyEl.className = 'opencodian-turn-body';

  const assistantMessageEl = document.createElement('div');
  assistantMessageEl.className = 'opencodian-message opencodian-message--assistant';
  assistantMessageEl.textContent = `${label} reply`;

  headerEl.appendChild(userMessageEl);
  bodyEl.appendChild(assistantMessageEl);
  turnEl.append(headerEl, bodyEl);
  messagesEl.appendChild(turnEl);

  return { turnEl, userMessageEl };
}

describe('NavigationSidebar', () => {
  beforeAll(() => {
    installObsidianElementHelpers();
    (globalThis as typeof globalThis & { ResizeObserver?: typeof ResizeObserver }).ResizeObserver =
      ResizeObserverMock as unknown as typeof ResizeObserver;
  });

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('uses the turn anchor for previous navigation in sticky mode', () => {
    const parentEl = document.createElement('div') as ObsidianLikeElement;
    const messagesShellEl = document.createElement('div');
    const messagesEl = document.createElement('div');
    messagesShellEl.appendChild(messagesEl);
    parentEl.appendChild(messagesShellEl);
    messagesEl.className = 'opencodian-messages opencodian-messages--sticky-mask';
    document.body.appendChild(parentEl);

    const scrollTo = jest.fn();
    Object.defineProperty(messagesEl, 'scrollTo', {
      configurable: true,
      value: scrollTo,
    });
    setNumericProperty(messagesEl, 'scrollHeight', 2400);
    setNumericProperty(messagesEl, 'clientHeight', 500);
    setNumericProperty(messagesEl, 'scrollTop', 920);
    setRect(messagesShellEl, 0, 500);
    setRect(messagesEl, 0, 500);

    const firstTurn = createTurn(messagesEl, 'first');
    const secondTurn = createTurn(messagesEl, 'second');
    const thirdTurn = createTurn(messagesEl, 'third');

    setRect(firstTurn.turnEl, -720, 180);
    setRect(firstTurn.userMessageEl, -60, 48);
    setRect(secondTurn.turnEl, -260, 220);
    setRect(secondTurn.userMessageEl, 0, 48);
    setRect(thirdTurn.turnEl, 220, 220);
    setRect(thirdTurn.userMessageEl, 220, 48);

    const sidebar = new NavigationSidebar(parentEl, messagesShellEl, messagesEl);
    const prevBtn = parentEl.querySelector('.opencodian-nav-btn-prev') as HTMLButtonElement;

    prevBtn.click();

    expect(scrollTo).toHaveBeenCalledWith({ top: 200, behavior: 'smooth' });

    sidebar.destroy();
  });

  it('keeps the existing message padding in natural mode', () => {
    const parentEl = document.createElement('div') as ObsidianLikeElement;
    const messagesShellEl = document.createElement('div');
    const messagesEl = document.createElement('div');
    messagesShellEl.appendChild(messagesEl);
    parentEl.appendChild(messagesShellEl);
    messagesEl.className = 'opencodian-messages opencodian-messages--natural';
    document.body.appendChild(parentEl);

    const scrollTo = jest.fn();
    Object.defineProperty(messagesEl, 'scrollTo', {
      configurable: true,
      value: scrollTo,
    });
    setNumericProperty(messagesEl, 'scrollHeight', 1800);
    setNumericProperty(messagesEl, 'clientHeight', 500);
    setNumericProperty(messagesEl, 'scrollTop', 360);
    setRect(messagesShellEl, 0, 500);
    setRect(messagesEl, 0, 500);

    const firstTurn = createTurn(messagesEl, 'first');
    const secondTurn = createTurn(messagesEl, 'second');

    setRect(firstTurn.turnEl, -240, 180);
    setRect(firstTurn.userMessageEl, -160, 48);
    setRect(secondTurn.turnEl, 80, 180);
    setRect(secondTurn.userMessageEl, 80, 48);

    const sidebar = new NavigationSidebar(parentEl, messagesShellEl, messagesEl);
    const nextBtn = parentEl.querySelector('.opencodian-nav-btn-next') as HTMLButtonElement;

    nextBtn.click();

    expect(scrollTo).toHaveBeenCalledWith({ top: 430, behavior: 'smooth' });

    sidebar.destroy();
  });

  it('uses the provided bottom callback when available', () => {
    const parentEl = document.createElement('div') as ObsidianLikeElement;
    const messagesShellEl = document.createElement('div');
    const messagesEl = document.createElement('div');
    messagesShellEl.appendChild(messagesEl);
    parentEl.appendChild(messagesShellEl);
    messagesEl.className = 'opencodian-messages opencodian-messages--natural';
    document.body.appendChild(parentEl);

    const scrollTo = jest.fn();
    const onScrollToBottom = jest.fn();
    Object.defineProperty(messagesEl, 'scrollTo', {
      configurable: true,
      value: scrollTo,
    });
    setNumericProperty(messagesEl, 'scrollHeight', 1800);
    setNumericProperty(messagesEl, 'clientHeight', 500);
    setNumericProperty(messagesEl, 'scrollTop', 360);
    setRect(messagesShellEl, 0, 500);
    setRect(messagesEl, 0, 500);

    const sidebar = new NavigationSidebar(parentEl, messagesShellEl, messagesEl, {
      onScrollToBottom,
    });
    const bottomBtn = parentEl.querySelector('.opencodian-nav-btn-bottom') as HTMLButtonElement;

    bottomBtn.click();

    expect(onScrollToBottom).toHaveBeenCalledTimes(1);
    expect(scrollTo).not.toHaveBeenCalled();

    sidebar.destroy();
  });
});
