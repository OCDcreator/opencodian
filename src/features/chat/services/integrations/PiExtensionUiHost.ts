import { type App, Modal, Notice, Setting } from 'obsidian';

import type { PiServiceEvent } from '../../../../core/agents/backend/pi/PiProtocol';

interface PiUiConversation { backend?: string; backendSessionId?: string }
interface PiUiView { containerEl: HTMLElement; currentConversation?: PiUiConversation | null }
interface PiTextWidget { lines: string[]; placement: 'aboveEditor' | 'belowEditor' }
interface PiUiProjection {
  signal: AbortSignal;
  statuses: Map<string, string>;
  widgets: Map<string, PiTextWidget>;
  title: string;
  dispose(): void;
}
interface PiUiBinding {
  projection: PiUiProjection;
  titleEl: HTMLElement | null;
  statusEl: HTMLElement | null;
  widgets: Map<string, HTMLElement>;
}
interface PiUiState {
  sessions: Map<string, PiUiProjection>;
  retiredSignals: WeakSet<AbortSignal>;
  closedViews: WeakSet<HTMLElement>;
  bindings: Map<HTMLElement, PiUiBinding>;
}

const piUiStates = new WeakMap<App, PiUiState>();

function getPiUiState(app: App): PiUiState {
  let state = piUiStates.get(app);
  if (!state) {
    state = { sessions: new Map(), retiredSignals: new WeakSet(), closedViews: new WeakSet(), bindings: new Map() };
    piUiStates.set(app, state);
  }
  return state;
}

function detachPiUiBinding(state: PiUiState, container: HTMLElement): void {
  const binding = state.bindings.get(container);
  if (!binding) return;
  binding.titleEl?.remove();
  binding.statusEl?.remove();
  for (const widget of binding.widgets.values()) widget.remove();
  state.bindings.delete(container);
}

/** Release this view only. Other leaves and the native connection remain live. */
export function releasePiUiView(app: App, container: HTMLElement): void {
  const state = getPiUiState(app);
  state.closedViews.add(container);
  detachPiUiBinding(state, container);
}

function syncPiUiTitle(container: HTMLElement, binding: PiUiBinding): void {
  const header = container.querySelector<HTMLElement>('.opencodian-header');
  const text = binding.projection.title;
  if (!header || !text) {
    binding.titleEl?.remove();
    binding.titleEl = null;
    return;
  }
  const title = binding.titleEl ?? container.ownerDocument.createElement('div');
  title.className = 'opencodian-pi-extension-title';
  title.setAttribute('role', 'heading');
  title.setAttribute('aria-level', '2');
  if (title.textContent !== text) title.textContent = text;
  if (header.nextSibling !== title) header.after(title);
  binding.titleEl = title;
}

function syncPiUiStatus(container: HTMLElement, binding: PiUiBinding): void {
  const inputArea = container.querySelector<HTMLElement>('.opencodian-input-area');
  const text = [...binding.projection.statuses.values()].join('\n');
  if (!inputArea || !binding.projection.statuses.size) {
    binding.statusEl?.remove();
    binding.statusEl = null;
    return;
  }
  const status = binding.statusEl ?? container.ownerDocument.createElement('div');
  status.className = 'opencodian-pi-extension-status';
  status.setAttribute('role', 'status');
  if (status.textContent !== text) status.textContent = text;
  if (status.parentElement !== inputArea) inputArea.append(status);
  binding.statusEl = status;
}

function placePiUiWidgets(parent: HTMLElement, widgets: HTMLElement[], anchor: ChildNode | null): void {
  let next = anchor;
  for (const widget of [...widgets].reverse()) {
    if (widget.parentElement !== parent || widget.nextSibling !== next) parent.insertBefore(widget, next);
    next = widget;
  }
}

function syncPiUiWidgets(container: HTMLElement, binding: PiUiBinding): void {
  const content = container.querySelector<HTMLElement>('.opencodian-composer-content');
  const editor = content?.querySelector<HTMLElement>('.opencodian-input-highlight-container');
  const widgets = binding.projection.widgets;
  for (const [key, node] of binding.widgets) {
    if (!content || !editor || !widgets.get(key)?.lines.length) {
      node.remove();
      binding.widgets.delete(key);
    }
  }
  if (!content || !editor) return;
  const above: HTMLElement[] = [];
  const below: HTMLElement[] = [];
  for (const [key, widget] of widgets) {
    if (!widget.lines.length) continue;
    const node = binding.widgets.get(key) ?? container.ownerDocument.createElement('div');
    node.className = 'opencodian-pi-extension-widget';
    node.dataset.piWidgetKey = key;
    const text = widget.lines.join('\n');
    if (node.textContent !== text) node.textContent = text;
    binding.widgets.set(key, node);
    (widget.placement === 'belowEditor' ? below : above).push(node);
  }
  placePiUiWidgets(content, above, editor);
  placePiUiWidgets(content, below, content.querySelector('.opencodian-composer-input-row'));
}

/** Called by the existing view identity/hydration seams; owns no layout scheduling. */
export function syncPiUiView(app: App, container: HTMLElement, conversation?: PiUiConversation | null): void {
  const state = getPiUiState(app);
  if (state.closedViews.has(container)) return;
  const projection = conversation?.backend === 'pi' && conversation.backendSessionId
    ? state.sessions.get(conversation.backendSessionId) : undefined;
  if (!projection || projection.signal.aborted) {
    detachPiUiBinding(state, container);
    return;
  }
  let binding = state.bindings.get(container);
  if (binding?.projection !== projection) {
    detachPiUiBinding(state, container);
    binding = { projection, titleEl: null, statusEl: null, widgets: new Map() };
    state.bindings.set(container, binding);
  }
  syncPiUiTitle(container, binding);
  syncPiUiStatus(container, binding);
  syncPiUiWidgets(container, binding);
}

function refreshPiUiViews(app: App, state: PiUiState): void {
  const openContainers = new Set<HTMLElement>();
  for (const leaf of app.workspace.getLeavesOfType('opencodian-view')) {
    const view = leaf.view as unknown as PiUiView;
    openContainers.add(view.containerEl);
    syncPiUiView(app, view.containerEl, view.currentConversation);
  }
  for (const container of state.bindings.keys()) {
    if (!openContainers.has(container)) detachPiUiBinding(state, container);
  }
}

function getPiUiProjection(app: App, sessionId: string, signal: AbortSignal): PiUiProjection | undefined {
  const state = getPiUiState(app);
  if (signal.aborted || state.retiredSignals.has(signal)) return;
  const previous = state.sessions.get(sessionId);
  if (previous?.signal === signal) return previous;
  previous?.dispose();
  const projection: PiUiProjection = {
    signal, statuses: new Map(), widgets: new Map(), title: '',
    dispose: () => {
      signal.removeEventListener('abort', projection.dispose);
      state.retiredSignals.add(signal);
      if (state.sessions.get(sessionId) !== projection) return;
      state.sessions.delete(sessionId);
      for (const [container, binding] of state.bindings) {
        if (binding.projection === projection) detachPiUiBinding(state, container);
      }
    },
  };
  state.sessions.set(sessionId, projection);
  signal.addEventListener('abort', projection.dispose, { once: true });
  return projection;
}

function applyPiUiTextRequest(projection: PiUiProjection, request: PiServiceEvent): void {
  if (request.method === 'setTitle') projection.title = String(request.title ?? '');
  if (request.method === 'setStatus' && typeof request.statusKey === 'string') {
    const text = typeof request.statusText === 'string' ? request.statusText : '';
    if (text) projection.statuses.set(request.statusKey, text);
    else projection.statuses.delete(request.statusKey);
  }
  if (request.method === 'setWidget' && typeof request.widgetKey === 'string') {
    if (request.widgetLines === undefined) projection.widgets.delete(request.widgetKey);
    else if (Array.isArray(request.widgetLines) && request.widgetLines.every(line => typeof line === 'string')) {
      projection.widgets.set(request.widgetKey, {
        lines: [...request.widgetLines],
        placement: request.widgetPlacement === 'belowEditor' ? 'belowEditor' : 'aboveEditor',
      });
    }
  }
}


function applyPiEditorText(app: App, sessionId: string, projection: PiUiProjection, text: string): void {
  const state = getPiUiState(app);
  for (const leaf of app.workspace.getLeavesOfType('opencodian-view')) {
    if (projection.signal.aborted || state.sessions.get(sessionId) !== projection) break;
    const view = leaf.view as unknown as PiUiView;
    if (state.closedViews.has(view.containerEl) || view.currentConversation?.backend !== 'pi'
      || view.currentConversation.backendSessionId !== sessionId) continue;
    const input = view.containerEl.querySelector<HTMLTextAreaElement>('textarea.opencodian-input');
    if (input) {
      input.value = text;
      const InputEvent = input.ownerDocument.defaultView?.Event ?? Event;
      input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    }
  }
}

class PiDialog extends Modal {
  private completed = false;
  constructor(app: App, private readonly request: PiServiceEvent, private readonly finish: (result: Record<string, unknown>) => void) { super(app); }
  onOpen(): void {
    this.titleEl.setText(String(this.request.title ?? 'Pi'));
    if (this.request.message) this.contentEl.createEl('p', { text: String(this.request.message) });
    const method = String(this.request.method);
    if (method === 'select') {
      for (const option of Array.isArray(this.request.options) ? this.request.options : []) {
        new Setting(this.contentEl).setName(String(option)).addButton((button) => button.setButtonText('选择 / Select').onClick(() => this.resolve({ value: option })));
      }
    } else if (method === 'confirm') {
      new Setting(this.contentEl).addButton((b) => b.setButtonText('确认 / Confirm').setCta().onClick(() => this.resolve({ confirmed: true })));
    } else {
      const input = this.contentEl.createEl('textarea', { cls: 'opencodian-pi-dialog-input' });
      input.rows = method === 'editor' ? 12 : 3;
      input.style.width = '100%';
      input.value = String(this.request.prefill ?? '');
      input.placeholder = String(this.request.placeholder ?? '');
      input.setAttribute('aria-label', String(this.request.title ?? 'Pi input'));
      new Setting(this.contentEl).addButton((b) => b.setButtonText('提交 / Submit').setCta().onClick(() => this.resolve({ value: input.value })));
      input.focus();
    }
    new Setting(this.contentEl).addButton((b) => b.setButtonText('取消 / Cancel').onClick(() => this.resolve({ cancelled: true })));
  }
  onClose(): void { if (!this.completed) { this.completed = true; this.finish({ cancelled: true }); } }
  private resolve(result: Record<string, unknown>): void { if (this.completed) return; this.completed = true; this.finish(result); this.close(); }
}

/** Renders the official RPC UI methods that either need a user response or have an Obsidian surface. */
export async function presentPiUiRequest(app: App, request: PiServiceEvent, signal: AbortSignal): Promise<Record<string, unknown> | void> {
  const method = String(request.method);
  if (['select', 'confirm', 'input', 'editor'].includes(method)) {
    if (signal.aborted) return { cancelled: true };
    return new Promise((resolve) => {
      const close = (): void => modal.close();
      const modal = new PiDialog(app, request, (value) => { signal.removeEventListener('abort', close); resolve(value); });
      signal.addEventListener('abort', close, { once: true }); modal.open();
    });
  }
  if (method === 'notify') {
    const notice = new Notice(String(request.message ?? ''), request.url ? 0 : 6000);
    if (typeof request.url === 'string' && /^https?:\/\//i.test(request.url)) {
      notice.noticeEl.createEl('a', { text: '打开登录页面 / Open sign-in page', href: request.url, attr: { target: '_blank', rel: 'noopener noreferrer' } });
      return new Promise<void>((resolve) => {
        const close = (): void => {
          signal.removeEventListener('abort', close);
          notice.hide();
          resolve();
        };
        if (signal.aborted) close();
        else signal.addEventListener('abort', close, { once: true });
      });
    }
    return;
  }
  if (!['setStatus', 'setWidget', 'setTitle', 'set_editor_text'].includes(method) || typeof request.sessionId !== 'string') return;
  const projection = getPiUiProjection(app, request.sessionId, signal);
  if (!projection) return;
  const state = getPiUiState(app);
  if (method === 'set_editor_text') {
    applyPiEditorText(app, request.sessionId, projection, String(request.text ?? ''));
    return;
  }
  applyPiUiTextRequest(projection, request);
  refreshPiUiViews(app, state);
}
