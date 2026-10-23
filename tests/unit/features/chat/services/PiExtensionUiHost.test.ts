import type { App } from 'obsidian';

import type { PiServiceEvent } from '../../../../../src/core/agents/backend/pi/PiProtocol';
import { presentPiUiRequest, releasePiUiView, syncPiUiView } from '../../../../../src/features/chat/services/integrations/PiExtensionUiHost';

interface TestView {
  containerEl: HTMLElement;
  currentConversation: { backend: string; backendSessionId: string } | null;
}

const controllers: AbortController[] = [];

function createView(sessionId: string): TestView {
  const containerEl = document.body.createDiv({ cls: 'opencodian-container' });
  containerEl.createDiv({ cls: 'opencodian-header', text: 'OpenCodian' });
  const inputArea = containerEl.createDiv({ cls: 'opencodian-input-area' });
  const content = inputArea.createDiv({ cls: 'opencodian-composer-content' });
  content.createDiv({ cls: 'opencodian-input-highlight-container' })
    .createEl('textarea', { cls: 'opencodian-input' }).value = 'owned draft';
  content.createDiv({ cls: 'opencodian-composer-input-row' });
  return { containerEl, currentConversation: { backend: 'pi', backendSessionId: sessionId } };
}

function createApp(...views: TestView[]): App {
  return { workspace: { getLeavesOfType: () => views.map(view => ({ view })) } } as unknown as App;
}

function createSignal(): AbortSignal {
  const controller = new AbortController();
  controllers.push(controller);
  return controller.signal;
}

function connection(): AbortController {
  const controller = new AbortController();
  controllers.push(controller);
  return controller;
}

async function send(app: App, sessionId: string, signal: AbortSignal, fields: Record<string, unknown>): Promise<void> {
  await presentPiUiRequest(app, { type: 'extension_ui_request', id: 'owned', sessionId, ...fields }, signal);
}

afterEach(() => {
  for (const controller of controllers.splice(0)) controller.abort();
  document.body.replaceChildren();
});

describe('Pi standard extension text UI', () => {
  it('R1 renders a standard status in its matching conversation', async () => {
    const view = createView('owned-A');
    await presentPiUiRequest(createApp(view), {
      type: 'extension_ui_request', id: 'r1', method: 'setStatus',
      sessionId: 'owned-A', statusKey: 'same-key', statusText: 'I11/A/status/v1',
    }, createSignal());
    expect(view.containerEl.textContent).toContain('I11/A/status/v1');
  });

  it('R2 renders the standard widget text lines above the input by default', async () => {
    const view = createView('owned-A');
    const request: PiServiceEvent = {
      type: 'extension_ui_request', id: 'r2', method: 'setWidget', sessionId: 'owned-A',
      widgetKey: 'same-key', widgetLines: ['I11/A/widget/line-1', 'I11/A/widget/line-2'],
    };
    await presentPiUiRequest(createApp(view), request, createSignal());
    expect(view.containerEl.textContent).toContain('I11/A/widget/line-1');
    expect(view.containerEl.textContent).toContain('I11/A/widget/line-2');
  });

  it('R3 renders a visible transient title below the existing header', async () => {
    const view = createView('owned-A');
    await presentPiUiRequest(createApp(view), {
      type: 'extension_ui_request', id: 'r3', method: 'setTitle',
      sessionId: 'owned-A', title: 'I11/A/title',
    }, createSignal());
    expect(view.containerEl.textContent).toContain('I11/A/title');
  });
});

describe('Pi projection keys and literal text', () => {
  it('updates and clears one status key while preserving the other exact text', async () => {
    const view = createView('A');
    const app = createApp(view);
    const signal = createSignal();
    await send(app, 'A', signal, { method: 'setStatus', statusKey: 'main', statusText: '<b>first</b>' });
    await send(app, 'A', signal, { method: 'setStatus', statusKey: 'other', statusText: 'other\nline' });
    const node = view.containerEl.querySelector('.opencodian-pi-extension-status');
    expect(node?.textContent).toBe('<b>first</b>\nother\nline');
    expect(node?.querySelector('b')).toBeNull();
    await send(app, 'A', signal, { method: 'setStatus', statusKey: 'main', statusText: 'updated' });
    expect(view.containerEl.querySelector('.opencodian-pi-extension-status')).toBe(node);
    expect(node?.textContent).toBe('updated\nother\nline');
    await send(app, 'A', signal, { method: 'setStatus', statusKey: 'main' });
    expect(node?.textContent).toBe('other\nline');
    await send(app, 'A', signal, { method: 'setStatus', statusKey: 'other', statusText: '' });
    expect(view.containerEl.querySelector('.opencodian-pi-extension-status')).toBeNull();
  });

  it('keeps literal widget lines, default/explicit placement and one node when a key moves', async () => {
    const view = createView('A');
    const app = createApp(view);
    const signal = createSignal();
    await send(app, 'A', signal, { method: 'setWidget', widgetKey: 'main', widgetLines: ['one', '<b>two</b>'] });
    await send(app, 'A', signal, { method: 'setWidget', widgetKey: 'other', widgetLines: ['below'], widgetPlacement: 'belowEditor' });
    const nodes = view.containerEl.querySelectorAll('.opencodian-pi-extension-widget');
    const [main, other] = [...nodes];
    const editor = view.containerEl.querySelector('.opencodian-input-highlight-container')!;
    expect(main.textContent).toBe('one\n<b>two</b>');
    expect(main.querySelector('b')).toBeNull();
    expect(main.compareDocumentPosition(editor) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(editor.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await send(app, 'A', signal, { method: 'setWidget', widgetKey: 'main', widgetLines: ['changed'], widgetPlacement: 'belowEditor' });
    expect(view.containerEl.querySelectorAll('.opencodian-pi-extension-widget')).toHaveLength(2);
    expect(main.textContent).toBe('changed');
    expect(editor.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await send(app, 'A', signal, { method: 'setWidget', widgetKey: 'main' });
    expect(view.containerEl.querySelectorAll('.opencodian-pi-extension-widget')).toHaveLength(1);
    expect(other.textContent).toBe('below');
    await send(app, 'A', signal, { method: 'setWidget', widgetKey: 'other', widgetLines: [] });
    expect(view.containerEl.querySelector('.opencodian-pi-extension-widget')).toBeNull();
  });

  it('updates/hides the visible title without changing accessible, conversation or persistent titles', async () => {
    const view = createView('A');
    view.containerEl.setAttribute('aria-label', 'Original accessible name');
    const conversation = { ...view.currentConversation!, title: 'Persistent title' };
    view.currentConversation = conversation;
    const app = createApp(view);
    const signal = createSignal();
    await send(app, 'A', signal, { method: 'setTitle', title: '<b>Extension title</b>' });
    const title = view.containerEl.querySelector('.opencodian-pi-extension-title');
    expect(title?.textContent).toBe('<b>Extension title</b>');
    expect(title?.querySelector('b')).toBeNull();
    expect(view.containerEl.querySelector('.opencodian-header')?.nextSibling).toBe(title);
    await send(app, 'A', signal, { method: 'setTitle', title: 'Second title' });
    expect(view.containerEl.querySelector('.opencodian-pi-extension-title')).toBe(title);
    expect(title?.textContent).toBe('Second title');
    expect(view.containerEl.getAttribute('aria-label')).toBe('Original accessible name');
    expect(conversation.title).toBe('Persistent title');
    await send(app, 'A', signal, { method: 'setTitle', title: '' });
    expect(view.containerEl.querySelector('.opencodian-pi-extension-title')).toBeNull();
  });

  it('keeps all nodes and order stable on repeated layout sync', async () => {
    const view = createView('A');
    const app = createApp(view);
    const signal = createSignal();
    for (const key of ['first', 'second']) {
      await send(app, 'A', signal, { method: 'setWidget', widgetKey: key, widgetLines: [key] });
    }
    await send(app, 'A', signal, { method: 'setTitle', title: 'Title' });
    const nodes = [...view.containerEl.querySelectorAll('.opencodian-pi-extension-widget, .opencodian-pi-extension-title')];
    const observer = new MutationObserver(() => {});
    observer.observe(view.containerEl, { childList: true, subtree: true });
    syncPiUiView(app, view.containerEl, view.currentConversation);
    syncPiUiView(app, view.containerEl, view.currentConversation);
    expect([...view.containerEl.querySelectorAll('.opencodian-pi-extension-widget, .opencodian-pi-extension-title')]).toEqual(nodes);
    expect(observer.takeRecords()).toHaveLength(0);
    observer.disconnect();
  });
});

describe('Pi App/session/connection/view isolation', () => {
  it('isolates identical keys across two sessions, including clear and abort after visible positive controls', async () => {
    const a = createView('A');
    const b = createView('B');
    const app = createApp(a, b);
    const ca = connection();
    const cb = connection();
    for (const [session, controller] of [['A', ca], ['B', cb]] as const) {
      await send(app, session, controller.signal, { method: 'setStatus', statusKey: 'same-key', statusText: session + '-status' });
      await send(app, session, controller.signal, { method: 'setWidget', widgetKey: 'same-key', widgetLines: [session + '-widget'] });
      await send(app, session, controller.signal, { method: 'setTitle', title: session + '-title' });
    }
    expect(a.containerEl.textContent).toContain('A-widget');
    expect(b.containerEl.textContent).toContain('B-widget');
    await send(app, 'A', ca.signal, { method: 'setWidget', widgetKey: 'same-key' });
    expect(a.containerEl.textContent).not.toContain('A-widget');
    expect(b.containerEl.textContent).toContain('B-widget');
    ca.abort();
    expect(a.containerEl.textContent).toBe('OpenCodian');
    expect(b.containerEl.textContent).toContain('B-status');
    expect(b.containerEl.textContent).toContain('B-title');
  });

  it('does not share session/key state between App instances', async () => {
    const a = createView('same-session');
    const b = createView('same-session');
    const appA = createApp(a);
    const appB = createApp(b);
    const ca = connection();
    const cb = connection();
    await send(appA, 'same-session', ca.signal, { method: 'setStatus', statusKey: 'same-key', statusText: 'App A' });
    await send(appB, 'same-session', cb.signal, { method: 'setStatus', statusKey: 'same-key', statusText: 'App B' });
    expect(a.containerEl.textContent).toContain('App A');
    expect(b.containerEl.textContent).toContain('App B');
    ca.abort();
    expect(a.containerEl.textContent).not.toContain('App A');
    expect(b.containerEl.textContent).toContain('App B');
  });

  it('synchronizes two leaves of the same session and never reattaches a released leaf', async () => {
    const first = createView('A');
    const second = createView('A');
    const app = createApp(first, second);
    const controller = connection();
    await send(app, 'A', controller.signal, { method: 'setStatus', statusKey: 'same-key', statusText: 'v1' });
    await send(app, 'A', controller.signal, { method: 'setWidget', widgetKey: 'same-key', widgetLines: ['widget-v1'] });
    await send(app, 'A', controller.signal, { method: 'setTitle', title: 'title-v1' });
    expect(first.containerEl.textContent).toContain('v1');
    expect(second.containerEl.textContent).toContain('v1');
    expect(first.containerEl.querySelector('.opencodian-pi-extension-widget')?.textContent).toBe('widget-v1');
    expect(second.containerEl.querySelector('.opencodian-pi-extension-widget')?.textContent).toBe('widget-v1');
    expect(first.containerEl.querySelector('.opencodian-pi-extension-title')?.textContent).toBe('title-v1');
    expect(second.containerEl.querySelector('.opencodian-pi-extension-title')?.textContent).toBe('title-v1');
    await send(app, 'A', controller.signal, { method: 'setStatus', statusKey: 'same-key', statusText: 'v2' });
    await send(app, 'A', controller.signal, { method: 'setWidget', widgetKey: 'same-key', widgetLines: ['widget-v2'] });
    expect(first.containerEl.textContent).toContain('v2');
    expect(second.containerEl.textContent).toContain('v2');
    expect(first.containerEl.querySelector('.opencodian-pi-extension-widget')?.textContent).toBe('widget-v2');
    expect(second.containerEl.querySelector('.opencodian-pi-extension-widget')?.textContent).toBe('widget-v2');
    releasePiUiView(app, first.containerEl);
    expect(first.containerEl.textContent).toBe('OpenCodian');
    await send(app, 'A', controller.signal, { method: 'setTitle', title: 'Still live' });
    syncPiUiView(app, first.containerEl, first.currentConversation);
    expect(first.containerEl.textContent).toBe('OpenCodian');
    expect(second.containerEl.textContent).toContain('Still live');
    expect(controller.signal.aborted).toBe(false);
    controller.abort();
    expect(second.containerEl.textContent).toBe('OpenCodian');
  });

  it('restores the latest background projection after tab/backend/null switches', async () => {
    const view = createView('A');
    const app = createApp(view);
    const ca = connection();
    await send(app, 'A', ca.signal, { method: 'setTitle', title: 'A title' });
    await send(app, 'A', ca.signal, { method: 'setWidget', widgetKey: 'same-key', widgetLines: ['A v1'] });
    for (const next of [{ backend: 'pi', backendSessionId: 'B' }, { backend: 'codex', backendSessionId: 'A' }, null]) {
      view.currentConversation = next;
      syncPiUiView(app, view.containerEl, next);
      expect(view.containerEl.textContent).toBe('OpenCodian');
      await send(app, 'A', ca.signal, { method: 'setWidget', widgetKey: 'same-key', widgetLines: ['A latest'] });
      expect(view.containerEl.textContent).toBe('OpenCodian');
    }
    view.currentConversation = { backend: 'pi', backendSessionId: 'A' };
    syncPiUiView(app, view.containerEl, view.currentConversation);
    expect(view.containerEl.textContent).toContain('A latest');
    expect(view.containerEl.textContent).toContain('A title');
    expect(view.containerEl.querySelector('textarea')?.value).toBe('owned draft');
  });

  it('rejects old signal events and delayed abort after the new connection takes ownership', async () => {
    const view = createView('A');
    const app = createApp(view);
    const old = connection();
    const next = connection();
    await send(app, 'A', old.signal, { method: 'setWidget', widgetKey: 'same-key', widgetLines: ['old'] });
    await send(app, 'A', next.signal, { method: 'setWidget', widgetKey: 'same-key', widgetLines: ['new'] });
    await send(app, 'A', old.signal, { method: 'setWidget', widgetKey: 'same-key', widgetLines: ['late old'] });
    await send(app, 'A', old.signal, { method: 'setTitle', title: 'late title' });
    await send(app, 'A', old.signal, { method: 'set_editor_text', text: 'late draft' });
    old.abort();
    expect(view.containerEl.textContent).toContain('new');
    expect(view.containerEl.textContent).not.toContain('late');
    expect(view.containerEl.querySelector('textarea')?.value).toBe('owned draft');
    next.abort();
    expect(view.containerEl.textContent).toBe('OpenCodian');
    await send(app, 'A', old.signal, { method: 'setStatus', statusKey: 'same-key', statusText: 'resurrected' });
    expect(view.containerEl.textContent).toBe('OpenCodian');
  });

  it('ignores an already aborted request and registers only one abort listener per live connection', async () => {
    const view = createView('A');
    const app = createApp(view);
    const dead = connection();
    dead.abort();
    await send(app, 'A', dead.signal, { method: 'setTitle', title: 'Dead' });
    expect(view.containerEl.textContent).toBe('OpenCodian');
    const current = connection();
    const add = jest.spyOn(current.signal, 'addEventListener');
    const remove = jest.spyOn(current.signal, 'removeEventListener');
    for (const text of ['one', 'two', 'three']) {
      await send(app, 'A', current.signal, { method: 'setStatus', statusKey: 'key', statusText: text });
      syncPiUiView(app, view.containerEl, view.currentConversation);
    }
    expect(view.containerEl.textContent).toContain('three');
    expect(add.mock.calls.filter(([type]) => type === 'abort')).toHaveLength(1);
    current.abort();
    expect(remove.mock.calls.filter(([type]) => type === 'abort')).toHaveLength(1);
    expect(view.containerEl.textContent).toBe('OpenCodian');
    add.mockRestore();
    remove.mockRestore();
  });

  it('reprojects after DOM rebuild and only new events survive a closed connection reload', async () => {
    const view = createView('A');
    const app = createApp(view);
    const old = connection();
    await send(app, 'A', old.signal, { method: 'setTitle', title: 'Before rebuild' });
    const replacement = createView('A');
    view.containerEl.replaceChildren(...replacement.containerEl.childNodes);
    replacement.containerEl.remove();
    syncPiUiView(app, view.containerEl, view.currentConversation);
    expect(view.containerEl.textContent).toContain('Before rebuild');
    old.abort();
    const current = connection();
    await send(app, 'A', current.signal, { method: 'setStatus', statusKey: 'key', statusText: 'After reload' });
    expect(view.containerEl.textContent).toContain('After reload');
    expect(view.containerEl.textContent).not.toContain('Before rebuild');
  });

  it('updates editor text and dispatches input only in matching open session leaves', async () => {
    const a = createView('A');
    const copy = createView('A');
    const b = createView('B');
    const app = createApp(a, copy, b);
    const inputEvent = jest.fn();
    a.containerEl.querySelector('textarea')!.addEventListener('input', inputEvent);
    await send(app, 'A', createSignal(), { method: 'set_editor_text', text: 'exact\neditor' });
    expect(a.containerEl.querySelector('textarea')?.value).toBe('exact\neditor');
    expect(copy.containerEl.querySelector('textarea')?.value).toBe('exact\neditor');
    expect(b.containerEl.querySelector('textarea')?.value).toBe('owned draft');
    expect(inputEvent).toHaveBeenCalledTimes(1);
  });
});
