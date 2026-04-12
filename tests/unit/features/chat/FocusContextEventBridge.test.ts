import type { App, EventRef } from 'obsidian';
import { MarkdownView } from 'obsidian';

import {
  FocusContextEventBridge,
  type FocusContextEventBridgeHost,
} from '../../../../src/features/chat/services/FocusContextEventBridge';

type Mocked<T> = {
  [Key in keyof T]:
    T[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : T[Key];
};

type RegisteredDomEvent = {
  target: Window | Document | HTMLElement;
  type: string;
  callback: (event: Event) => unknown;
};

function createHarness(options: { inputContainer?: HTMLElement | null } = {}) {
  const workspaceListeners = new Map<string, (...args: any[]) => void>();
  const domEvents: RegisteredDomEvent[] = [];
  const workspaceOn = jest.fn((name: string, listener: (...args: any[]) => void) => {
    workspaceListeners.set(name, listener);
    return { name } as EventRef;
  });
  const app = {
    workspace: {
      on: workspaceOn,
    },
  } as unknown as App;
  const focusContextRuntimeService = {
    handleComposerPointerDown: jest.fn(),
    handleComposerFocusIn: jest.fn(),
    handleComposerFocusOut: jest.fn(),
    startRetainedSelectionPolling: jest.fn(),
    dispose: jest.fn(),
  };
  const focusContextPreviewCoordinator = {
    handleFileOpen: jest.fn(),
    refreshActiveFocusContextPreview: jest.fn(),
    scheduleFocusContextPreviewRefresh: jest.fn(),
  };
  const inputContainer = options.inputContainer ?? document.createElement('div');
  const host: Mocked<FocusContextEventBridgeHost> = {
    getInputContainer: jest.fn(() => inputContainer),
    registerEvent: jest.fn(),
    registerDomEvent: jest.fn((target, type, callback) => {
      domEvents.push({ target, type, callback });
    }),
  };
  const bridge = new FocusContextEventBridge(
    app,
    focusContextRuntimeService,
    focusContextPreviewCoordinator,
    host,
  );

  return {
    bridge,
    host,
    focusContextRuntimeService,
    focusContextPreviewCoordinator,
    workspaceOn,
    emitWorkspace: (name: string, ...args: any[]) => {
      const listener = workspaceListeners.get(name);
      if (!listener) {
        throw new Error(`Missing workspace listener for ${name}`);
      }
      listener(...args);
    },
    fireDom: (type: string) => {
      const registration = domEvents.find((event) => event.type === type);
      if (!registration) {
        throw new Error(`Missing DOM listener for ${type}`);
      }
      registration.callback(new Event(type));
    },
    getDomEventTypes: () => domEvents.map((event) => event.type),
  };
}

describe('FocusContextEventBridge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registers focus-preview workspace and DOM bridges and starts retained-selection polling', () => {
    const { bridge, host, focusContextRuntimeService, workspaceOn, getDomEventTypes } =
      createHarness();

    bridge.start();

    expect(workspaceOn).toHaveBeenNthCalledWith(1, 'file-open', expect.any(Function));
    expect(workspaceOn).toHaveBeenNthCalledWith(2, 'active-leaf-change', expect.any(Function));
    expect(workspaceOn).toHaveBeenNthCalledWith(3, 'editor-change', expect.any(Function));
    expect(host.registerEvent).toHaveBeenCalledTimes(3);
    expect(getDomEventTypes()).toEqual([
      'pointerdown',
      'focusin',
      'focusout',
      'selectionchange',
      'mouseup',
      'keyup',
    ]);
    expect(focusContextRuntimeService.startRetainedSelectionPolling).toHaveBeenCalledTimes(1);
  });

  it('routes workspace and DOM events through the focus runtime', () => {
    const { bridge, focusContextRuntimeService, focusContextPreviewCoordinator, emitWorkspace, fireDom } =
      createHarness();
    const editor = { id: 'editor' };
    const markdownView = new MarkdownView() as MarkdownView;

    bridge.start();
    emitWorkspace('file-open', { path: 'notes/open.md' });
    emitWorkspace('active-leaf-change');
    emitWorkspace('editor-change', editor, markdownView);
    fireDom('pointerdown');
    fireDom('focusin');
    fireDom('focusout');
    fireDom('selectionchange');
    fireDom('mouseup');
    fireDom('keyup');

    expect(focusContextPreviewCoordinator.handleFileOpen).toHaveBeenCalledWith('notes/open.md');
    expect(focusContextPreviewCoordinator.refreshActiveFocusContextPreview).toHaveBeenCalledWith(
      markdownView,
      editor,
    );
    expect(focusContextRuntimeService.handleComposerPointerDown).toHaveBeenCalledTimes(1);
    expect(focusContextRuntimeService.handleComposerFocusIn).toHaveBeenCalledTimes(1);
    expect(focusContextRuntimeService.handleComposerFocusOut).toHaveBeenCalledTimes(1);
    expect(focusContextPreviewCoordinator.scheduleFocusContextPreviewRefresh).toHaveBeenCalledTimes(4);
  });

  it('disposes through the focus runtime service', () => {
    const { bridge, focusContextRuntimeService } = createHarness();

    bridge.dispose();

    expect(focusContextRuntimeService.dispose).toHaveBeenCalledTimes(1);
  });
});
