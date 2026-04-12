import type { App, EventRef } from 'obsidian';
import { MarkdownView } from 'obsidian';

import {
  ComposerContextEventBridge,
  type ComposerContextEventBridgeHost,
} from '../../../../src/features/chat/services/ComposerContextEventBridge';

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
  const vaultListeners = new Map<string, (...args: any[]) => void>();
  const domEvents: RegisteredDomEvent[] = [];
  const workspaceOn = jest.fn((name: string, listener: (...args: any[]) => void) => {
    workspaceListeners.set(name, listener);
    return { name } as EventRef;
  });
  const vaultOn = jest.fn((name: string, listener: (...args: any[]) => void) => {
    vaultListeners.set(name, listener);
    return { name } as EventRef;
  });
  const app = {
    workspace: {
      on: workspaceOn,
    },
    vault: {
      on: vaultOn,
    },
  } as unknown as App;
  const focusContextRuntimeService = {
    rememberMarkdownFilePath: jest.fn(),
    refreshActiveFocusContextPreview: jest.fn(),
    scheduleFocusContextPreviewRefresh: jest.fn(),
    handleComposerPointerDown: jest.fn(),
    handleComposerFocusIn: jest.fn(),
    handleComposerFocusOut: jest.fn(),
    startRetainedSelectionPolling: jest.fn(),
    dispose: jest.fn(),
  };
  const contextFileCatalogService = {
    handleCreate: jest.fn(),
    handleDelete: jest.fn(),
    handleRename: jest.fn(),
  };
  const inputContainer = options.inputContainer ?? document.createElement('div');
  const host: Mocked<ComposerContextEventBridgeHost> = {
    setCurrentConversationNotePath: jest.fn(),
    getInputContainer: jest.fn(() => inputContainer),
    registerEvent: jest.fn(),
    registerDomEvent: jest.fn((target, type, callback) => {
      domEvents.push({ target, type, callback });
    }),
  };
  const bridge = new ComposerContextEventBridge(
    app,
    focusContextRuntimeService,
    contextFileCatalogService,
    host,
  );

  return {
    bridge,
    host,
    focusContextRuntimeService,
    contextFileCatalogService,
    workspaceOn,
    vaultOn,
    emitWorkspace: (name: string, ...args: any[]) => {
      const listener = workspaceListeners.get(name);
      if (!listener) {
        throw new Error(`Missing workspace listener for ${name}`);
      }
      listener(...args);
    },
    emitVault: (name: string, ...args: any[]) => {
      const listener = vaultListeners.get(name);
      if (!listener) {
        throw new Error(`Missing vault listener for ${name}`);
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

describe('ComposerContextEventBridge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registers composer-context event bridges and starts retained-selection polling', () => {
    const {
      bridge,
      host,
      focusContextRuntimeService,
      workspaceOn,
      vaultOn,
      getDomEventTypes,
    } = createHarness();

    bridge.start();

    expect(workspaceOn).toHaveBeenNthCalledWith(1, 'file-open', expect.any(Function));
    expect(workspaceOn).toHaveBeenNthCalledWith(2, 'active-leaf-change', expect.any(Function));
    expect(workspaceOn).toHaveBeenNthCalledWith(3, 'editor-change', expect.any(Function));
    expect(vaultOn).toHaveBeenNthCalledWith(1, 'create', expect.any(Function));
    expect(vaultOn).toHaveBeenNthCalledWith(2, 'delete', expect.any(Function));
    expect(vaultOn).toHaveBeenNthCalledWith(3, 'rename', expect.any(Function));
    expect(host.registerEvent).toHaveBeenCalledTimes(6);
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
    const {
      bridge,
      host,
      focusContextRuntimeService,
      emitWorkspace,
      fireDom,
    } = createHarness();
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

    expect(focusContextRuntimeService.rememberMarkdownFilePath).toHaveBeenCalledWith('notes/open.md');
    expect(host.setCurrentConversationNotePath).toHaveBeenCalledWith('notes/open.md');
    expect(focusContextRuntimeService.refreshActiveFocusContextPreview).toHaveBeenCalledWith(
      markdownView,
      editor,
    );
    expect(focusContextRuntimeService.handleComposerPointerDown).toHaveBeenCalledTimes(1);
    expect(focusContextRuntimeService.handleComposerFocusIn).toHaveBeenCalledTimes(1);
    expect(focusContextRuntimeService.handleComposerFocusOut).toHaveBeenCalledTimes(1);
    expect(focusContextRuntimeService.scheduleFocusContextPreviewRefresh).toHaveBeenCalledTimes(5);
  });

  it('routes vault mutations and dispose through the dedicated collaborators', () => {
    const {
      bridge,
      focusContextRuntimeService,
      contextFileCatalogService,
      emitVault,
    } = createHarness();

    bridge.start();
    emitVault('create', { path: 'notes/new.md' });
    emitVault('delete', { path: 'notes/old.md' });
    emitVault('rename', { path: 'notes/next.md' }, 'notes/prev.md');
    bridge.dispose();

    expect(contextFileCatalogService.handleCreate).toHaveBeenCalledWith({ path: 'notes/new.md' });
    expect(contextFileCatalogService.handleDelete).toHaveBeenCalledWith({ path: 'notes/old.md' });
    expect(contextFileCatalogService.handleRename).toHaveBeenCalledWith(
      { path: 'notes/next.md' },
      'notes/prev.md',
    );
    expect(focusContextRuntimeService.dispose).toHaveBeenCalledTimes(1);
  });
});
