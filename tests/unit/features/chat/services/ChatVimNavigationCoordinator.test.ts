import {
  ChatVimNavigationCoordinator,
  type ChatVimNavigationCoordinatorHost,
} from '../../../../../src/features/chat/services/ChatVimNavigationCoordinator';

type MockedChatVimNavigationCoordinatorHost = {
  [Key in keyof ChatVimNavigationCoordinatorHost]: ChatVimNavigationCoordinatorHost[Key] extends (
    ...args: infer Args
  ) => infer Result
    ? jest.Mock<Result, Args>
    : ChatVimNavigationCoordinatorHost[Key];
};

function createFixture(
  overrides: Partial<ChatVimNavigationCoordinatorHost> = {},
): {
  coordinator: ChatVimNavigationCoordinator;
  host: MockedChatVimNavigationCoordinatorHost;
  messagesContainer: HTMLElement;
  root: HTMLElement;
  scrollBy: jest.Mock;
} {
  const root = document.createElement('div');
  const messagesContainer = document.createElement('div');
  const scrollBy = jest.fn();
  Object.defineProperty(messagesContainer, 'clientHeight', {
    configurable: true,
    value: 200,
  });
  Object.defineProperty(messagesContainer, 'scrollBy', {
    configurable: true,
    value: scrollBy,
  });
  document.body.appendChild(root);

  const host: MockedChatVimNavigationCoordinatorHost = {
    isEnabled: jest.fn(() => true),
    getKeys: jest.fn(() => ({ scrollUp: 'w', scrollDown: 's', focusInput: 'i' })),
    getMessagesContainer: jest.fn(() => messagesContainer),
    focusComposer: jest.fn(),
    hasBlockingOverlay: jest.fn(() => false),
    ...overrides,
  } as MockedChatVimNavigationCoordinatorHost;
  const coordinator = new ChatVimNavigationCoordinator(host);
  coordinator.attach(root);

  return { coordinator, host, messagesContainer, root, scrollBy };
}

function dispatchKey(
  target: HTMLElement,
  init: KeyboardEventInit,
): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

describe('ChatVimNavigationCoordinator', () => {
  afterEach(() => {
    document.body.empty();
  });

  it('does nothing while the feature is disabled', () => {
    const { host, root, scrollBy } = createFixture({ isEnabled: jest.fn(() => false) });

    const event = dispatchKey(root, { key: 'w' });

    expect(scrollBy).not.toHaveBeenCalled();
    expect(host.focusComposer).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it.each([
    ['input', () => document.createElement('input'), {}],
    ['textarea', () => document.createElement('textarea'), {}],
    ['select', () => document.createElement('select'), {}],
    ['contenteditable element', () => {
      const element = document.createElement('div');
      element.setAttribute('contenteditable', 'true');
      return element;
    }, {}],
    ['Ctrl shortcut', () => document.createElement('button'), { ctrlKey: true }],
    ['Meta shortcut', () => document.createElement('button'), { metaKey: true }],
    ['Alt shortcut', () => document.createElement('button'), { altKey: true }],
    ['composition event', () => document.createElement('button'), { isComposing: true }],
    ['repeat event', () => document.createElement('button'), { repeat: true }],
  ])('leaves a %s key event to its current owner', (_label, createTarget, init) => {
    const { root, scrollBy } = createFixture();
    const target = createTarget();
    root.appendChild(target);

    const event = dispatchKey(target, { key: 'w', ...init });

    expect(scrollBy).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('leaves a nested contenteditable descendant to its editable owner', () => {
    const { root, scrollBy } = createFixture();
    const owner = document.createElement('div');
    owner.setAttribute('contenteditable', 'true');
    const descendant = owner.createSpan({ text: 'editable child' });
    root.appendChild(owner);

    const event = dispatchKey(descendant, { key: 'w' });

    expect(scrollBy).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('leaves keys alone while a host-owned blocking overlay is open', () => {
    const { root, scrollBy } = createFixture({ hasBlockingOverlay: jest.fn(() => true) });

    const event = dispatchKey(root, { key: 'w' });

    expect(scrollBy).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('scrolls the active messages container by 65 percent of its viewport in either direction', () => {
    const { root, scrollBy } = createFixture();

    const up = dispatchKey(root, { key: 'W' });
    const down = dispatchKey(root, { key: 's' });

    expect(scrollBy).toHaveBeenNthCalledWith(1, { top: -130, behavior: 'smooth' });
    expect(scrollBy).toHaveBeenNthCalledWith(2, { top: 130, behavior: 'smooth' });
    expect(up.defaultPrevented).toBe(true);
    expect(down.defaultPrevented).toBe(true);
  });

  it('focuses the composer and respects dynamically configured keys', () => {
    const { host, root, scrollBy } = createFixture({
      getKeys: jest.fn(() => ({ scrollUp: 'k', scrollDown: 'j', focusInput: 'f' })),
    });

    const focus = dispatchKey(root, { key: 'F' });
    const up = dispatchKey(root, { key: 'k' });
    const unusedDefault = dispatchKey(root, { key: 'i' });

    expect(host.focusComposer).toHaveBeenCalledTimes(1);
    expect(scrollBy).toHaveBeenCalledWith({ top: -130, behavior: 'smooth' });
    expect(focus.defaultPrevented).toBe(true);
    expect(up.defaultPrevented).toBe(true);
    expect(unusedDefault.defaultPrevented).toBe(false);
  });

  it('does not prevent a scroll shortcut when there is no active messages container', () => {
    const { root } = createFixture({ getMessagesContainer: jest.fn(() => null) });

    const event = dispatchKey(root, { key: 'w' });

    expect(event.defaultPrevented).toBe(false);
  });

  it('removes its root-scoped listener when destroyed', () => {
    const { coordinator, root, scrollBy } = createFixture();

    coordinator.destroy();
    const event = dispatchKey(root, { key: 'w' });

    expect(scrollBy).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });
});

describe('ChatVimNavigationCoordinator Shift modifier (R-F6)', () => {
  afterEach(() => {
    document.body.empty();
  });

  // Shift is a modifier like Ctrl/Meta/Alt: Shift+W produces key 'W', which
  // normalizes to the configured 'w' and used to scroll the chat and swallow
  // the event. Typing a capital letter must stay with its current owner.
  it.each([
    ['Shift+W', 'W'],
    ['Shift+S', 'S'],
    ['Shift+I', 'I'],
  ])('leaves %s to its current owner', (_label, key) => {
    const { host, root, scrollBy } = createFixture();

    const event = dispatchKey(root, { key, shiftKey: true });

    expect(scrollBy).not.toHaveBeenCalled();
    expect(host.focusComposer).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('still handles the plain lowercase configured keys', () => {
    const { host, root, scrollBy } = createFixture();

    const up = dispatchKey(root, { key: 'w' });
    const down = dispatchKey(root, { key: 's' });
    const focus = dispatchKey(root, { key: 'i' });

    expect(scrollBy).toHaveBeenNthCalledWith(1, { top: -130, behavior: 'smooth' });
    expect(scrollBy).toHaveBeenNthCalledWith(2, { top: 130, behavior: 'smooth' });
    expect(host.focusComposer).toHaveBeenCalledTimes(1);
    expect(up.defaultPrevented).toBe(true);
    expect(down.defaultPrevented).toBe(true);
    expect(focus.defaultPrevented).toBe(true);
  });

  it('still handles uppercase keys that arrive without the Shift modifier', () => {
    const { root, scrollBy } = createFixture();

    // CapsLock / synthetic events carry an uppercase key without shiftKey; the
    // binding is case-insensitive by design and must keep working.
    const event = dispatchKey(root, { key: 'W' });

    expect(scrollBy).toHaveBeenCalledWith({ top: -130, behavior: 'smooth' });
    expect(event.defaultPrevented).toBe(true);
  });
});
