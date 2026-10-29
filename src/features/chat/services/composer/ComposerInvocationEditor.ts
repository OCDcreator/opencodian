import { defaultKeymap, history, historyKeymap, isolateHistory } from '@codemirror/commands';
import { Compartment, EditorState, StateEffect, StateField } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, keymap, WidgetType } from '@codemirror/view';
import { setIcon } from 'obsidian';

export interface InvocationToken {
  start: number;
  end: number;
  kind: 'agent' | 'command' | 'skill' | 'file' | 'folder' | 'session' | 'plugin' | 'app' | 'mcp-resource';
  label?: string;
}

class InvocationWidget extends WidgetType {
  constructor(readonly value: string, readonly kind: InvocationToken['kind'], readonly label?: string) { super(); }

  eq(other: InvocationWidget): boolean { return this.value === other.value && this.kind === other.kind && this.label === other.label; }

  toDOM(): HTMLElement {
    const element = document.createElement('span');
    element.className = `opencodian-invocation-token opencodian-invocation-token--${this.kind}`;
    element.contentEditable = 'false';
    element.dataset.type = this.kind;
    element.dataset.value = this.value;
    element.title = this.label ?? this.value;
    const icon = element.appendChild(document.createElement('span'));
    icon.className = 'opencodian-invocation-token-icon';
    icon.setAttribute('aria-hidden', 'true');
    setIcon(icon, this.kind === 'skill' ? 'wand-sparkles' : this.kind === 'agent' ? 'bot'
      : this.kind === 'file' ? 'file-text' : this.kind === 'folder' ? 'folder'
        : this.kind === 'session' ? 'messages-square' : this.kind === 'mcp-resource' ? 'database'
          : this.kind === 'plugin' || this.kind === 'app' ? 'puzzle' : 'square-slash');
    const label = element.appendChild(document.createElement('span'));
    label.className = 'opencodian-invocation-token-label';
    label.textContent = this.label ?? this.value.replace(/^\/skills\s+|^\/skill:|^[/@$]/, '');
    return element;
  }

  ignoreEvent(): boolean { return false; }
}

const replaceTokens = StateEffect.define<DecorationSet>();
const tokenField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update: (tokens, transaction) => {
    for (const effect of transaction.effects) if (effect.is(replaceTokens)) return effect.value;
    return tokens.map(transaction.changes);
  },
  provide: (field) => [EditorView.decorations.from(field), EditorView.atomicRanges.of((view) => view.state.field(field))],
});

/** Isolates CodeMirror's editable token DOM from the established textarea draft/send port. */
export class ComposerInvocationEditor {
  private readonly view: EditorView;
  private readonly originalValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!;
  private readonly originalFocus: HTMLTextAreaElement['focus'];
  private readonly originalSelection: HTMLTextAreaElement['setSelectionRange'];
  private readonly observer: MutationObserver;
  private syncing = false;
  private disposed = false;
  private notificationPending = false;
  private tokenSignature = '';
  private readonly editability = new Compartment();
  private disabled = false;

  static isSupported(): boolean {
    return typeof document.createRange().getClientRects === 'function';
  }

  constructor(private readonly textarea: HTMLTextAreaElement) {
    this.originalFocus = textarea.focus;
    this.originalSelection = textarea.setSelectionRange;
    const parent = textarea.parentElement!;
    this.view = new EditorView({
      parent,
      state: EditorState.create({
        doc: textarea.value,
        extensions: [
          history(), tokenField, EditorView.lineWrapping,
          EditorView.editorAttributes.of({ class: 'opencodian-invocation-editor' }),
          this.editability.of([]),
          EditorView.contentAttributes.of({ role: 'textbox', 'aria-multiline': 'true',
            'aria-labelledby': textarea.getAttribute('aria-labelledby') ?? '', spellcheck: 'false' }),
          EditorView.domEventHandlers({
            keydown: (event) => {
              if (event.isComposing || this.view.composing) return false;
              this.publishSelection();
              const forwarded = new KeyboardEvent('keydown', { key: event.key, code: event.code,
                ctrlKey: event.ctrlKey, metaKey: event.metaKey, altKey: event.altKey,
                shiftKey: event.shiftKey, bubbles: true, cancelable: true });
              textarea.dispatchEvent(forwarded);
              return forwarded.defaultPrevented;
            },
            paste: (event) => {
              const forwarded = new ClipboardEvent('paste', { clipboardData: event.clipboardData,
                bubbles: true, cancelable: true });
              textarea.dispatchEvent(forwarded);
              return forwarded.defaultPrevented;
            },
          }),
          keymap.of([...historyKeymap, ...defaultKeymap]),
          EditorView.updateListener.of((update) => {
            if (this.syncing) return;
            if (update.docChanged || update.selectionSet) this.publishSelection();
            if (!update.docChanged || this.notificationPending) return;
            this.notificationPending = true;
            queueMicrotask(() => {
              this.notificationPending = false;
              if (!this.disposed) textarea.dispatchEvent(new Event('input', { bubbles: true }));
            });
          }),
        ],
      }),
    });
    this.view.dom.classList.add('opencodian-invocation-editor');
    parent.classList.add('has-invocation-editor');
    textarea.tabIndex = -1;
    textarea.setAttribute('aria-hidden', 'true');
    // Existing tab restore, Pi set_editor_text, menu insertion and focus seams all use this port.
    Object.defineProperty(textarea, 'value', { configurable: true,
      get: () => this.originalValue.get!.call(textarea) as string,
      set: (value: string) => { this.originalValue.set!.call(textarea, value); this.sync(); },
    });
    textarea.focus = () => { this.sync(); this.view.focus(); };
    textarea.setSelectionRange = (start, end, direction) => {
      this.originalSelection.call(textarea, start, end, direction);
      this.sync();
    };
    this.observer = new MutationObserver(() => {
      if (!textarea.isConnected) this.destroy();
      else this.sync();
    });
    this.observer.observe(parent.ownerDocument.body, { childList: true, subtree: true });
    this.observer.observe(textarea, { attributes: true, attributeFilter: ['disabled', 'aria-labelledby'] });
    this.sync();
  }

  owns(textarea: HTMLTextAreaElement): boolean { return !this.disposed && this.textarea === textarea; }

  sync(maxHeight?: number): void {
    if (this.disposed || this.syncing) return;
    if (maxHeight) this.view.dom.style.setProperty('--opencodian-invocation-max-height', `${maxHeight}px`);
    const value = this.textarea.value;
    const current = this.view.state.doc.toString();
    const from = Math.min(this.textarea.selectionStart, value.length);
    const to = Math.min(this.textarea.selectionEnd, value.length);
    const selection = this.view.state.selection.main;
    if (value !== current || selection.from !== from || selection.to !== to) {
      if (value !== current) this.tokenSignature = '';
      this.syncing = true;
      try {
        this.view.dispatch({ ...(value !== current ? { changes: { from: 0, to: current.length, insert: value },
          annotations: isolateHistory.of('full') } : {}),
          selection: { anchor: from, head: to } });
      } finally { this.syncing = false; }
    }
    if (this.disabled !== this.textarea.disabled) {
      this.disabled = this.textarea.disabled;
      this.view.dispatch({ effects: this.editability.reconfigure([
        EditorState.readOnly.of(this.disabled), EditorView.editable.of(!this.disabled),
      ]) });
    }
    this.view.contentDOM.setAttribute('aria-disabled', String(this.textarea.disabled));
    this.view.contentDOM.setAttribute('aria-labelledby', this.textarea.getAttribute('aria-labelledby') ?? '');
  }

  setTokens(tokens: readonly InvocationToken[]): void {
    if (this.disposed) return;
    this.sync();
    const text = this.view.state.doc.toString();
    const signature = JSON.stringify(tokens.map((token) => [token.start, token.end, token.kind, token.label, text.slice(token.start, token.end)]));
    if (signature === this.tokenSignature) return;
    this.tokenSignature = signature;
    const ranges = tokens.filter((token) => token.start >= 0 && token.end <= text.length && token.end > token.start)
      .map((token) => Decoration.replace({ widget: new InvocationWidget(text.slice(token.start, token.end), token.kind, token.label) })
        .range(token.start, token.end));
    // Keep a user's pending edit notification; decoration-only transactions do not replace history.
    this.syncing = true;
    try { this.view.dispatch({ effects: replaceTokens.of(Decoration.set(ranges, true)) }); }
    finally { this.syncing = false; }
  }

  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.observer.disconnect();
    this.view.destroy();
    delete (this.textarea as unknown as { value?: string }).value;
    this.textarea.focus = this.originalFocus;
    this.textarea.setSelectionRange = this.originalSelection;
    this.textarea.removeAttribute('aria-hidden');
    this.textarea.removeAttribute('tabindex');
    this.textarea.parentElement?.classList.remove('has-invocation-editor');
  }

  private publishSelection(): void {
    this.originalValue.set!.call(this.textarea, this.view.state.doc.toString());
    const selection = this.view.state.selection.main;
    this.originalSelection.call(this.textarea, selection.from, selection.to,
      selection.anchor > selection.head ? 'backward' : 'forward');
  }
}
