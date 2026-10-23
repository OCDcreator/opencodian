import type { App } from 'obsidian';

import { PI_CONFIG_COMMANDS, PI_RPC_COMMANDS, PI_SDK_COMMANDS } from '../../../../../src/core/agents/backend/pi/PiProtocol';
import type { PiRecord } from '../../../../../src/core/agents/backend/pi/PiRpcClient';
import { PiSessionRuntime } from '../../../../../src/core/agents/backend/pi/PiSessionRuntime';
import { presentPiUiRequest } from '../../../../../src/features/chat/services/integrations/PiExtensionUiHost';

jest.mock('obsidian', () => {
  const actual = jest.requireActual('obsidian');
  return {
    ...actual,
    Modal: class {
      contentEl = document.createElement('div');
      titleEl = document.createElement('div');
      modalEl = document.createElement('div');
      constructor(_app: unknown) {}
      onOpen(): void {}
      onClose(): void {}
      open(): void {
        this.modalEl.className = 'owned-modal';
        this.modalEl.append(this.titleEl, this.contentEl);
        document.body.append(this.modalEl);
        this.onOpen();
      }
      close(): void { this.onClose(); this.modalEl.remove(); }
    },
    Setting: class {
      constructor(private readonly container: HTMLElement) {}
      setName(text: string): this { this.container.createEl('span', { text }); return this; }
      addButton(configure: (button: { setButtonText(text: string): unknown; setCta(): unknown; onClick(fn: () => void): unknown }) => void): this {
        const element = this.container.createEl('button');
        const button = {
          setButtonText(text: string) { element.textContent = text; return button; },
          setCta() { return button; },
          onClick(fn: () => void) { element.addEventListener('click', fn); return button; },
        };
        configure(button);
        return this;
      }
    },
    Notice: class {
      noticeEl = document.createElement('div');
      constructor(message: string) {
        this.noticeEl.className = 'owned-notice';
        this.noticeEl.textContent = message;
        Object.defineProperty(this.noticeEl, 'createEl', {
          value: (tag: string, options: { text: string; href: string; attr: Record<string, string> }) => {
            const node = document.createElement(tag);
            node.textContent = options.text;
            node.setAttribute('href', options.href);
            for (const [name, value] of Object.entries(options.attr)) node.setAttribute(name, value);
            this.noticeEl.append(node);
            return node;
          },
        });
        document.body.append(this.noticeEl);
      }
      hide(): void { this.noticeEl.remove(); }
    },
  };
});

const runtimes: PiSessionRuntime[] = [];

function fixture() {
  const containerEl = document.body.createDiv({ cls: 'opencodian-container' });
  containerEl.createDiv({ cls: 'opencodian-header', text: 'OpenCodian' });
  const area = containerEl.createDiv({ cls: 'opencodian-input-area' });
  const content = area.createDiv({ cls: 'opencodian-composer-content' });
  content.createDiv({ cls: 'opencodian-input-highlight-container' }).createEl('textarea', { cls: 'opencodian-input' });
  content.createDiv({ cls: 'opencodian-composer-input-row' });
  const view = { containerEl, currentConversation: { backend: 'pi', backendSessionId: 'owned-A' } };
  const app = { workspace: { getLeavesOfType: () => [{ view }] } } as unknown as App;
  let emit!: (event: PiRecord) => void;
  const respond = jest.fn();
  const close = jest.fn();
  let closed = false;
  const runtime = new PiSessionRuntime({
    workingDirectory: '/owned', sessionDirectory: '/owned', servicePath: '/unused',
    createClient: () => ({
      request: async () => ({ serviceProtocol: 1, commands: [...PI_RPC_COMMANDS, ...PI_SDK_COMMANDS, ...PI_CONFIG_COMMANDS] }),
      subscribe: listener => { emit = listener; return () => {}; },
      close: () => { closed = true; close(); },
      respond: response => { if (!closed) respond(response); },
    }),
    onUiRequest: (request, signal) => presentPiUiRequest(app, request, signal),
  });
  runtimes.push(runtime);
  return { runtime, respond, close, containerEl, emit: (event: PiRecord) => emit(event) };
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function button(text: string): HTMLButtonElement {
  const element = [...document.querySelectorAll('button')].find(candidate => candidate.textContent === text);
  if (!element) throw new Error('Fixture button missing: ' + text);
  return element;
}

afterEach(async () => {
  for (const runtime of runtimes.splice(0)) runtime.dispose();
  await settle();
  document.body.replaceChildren();
});

describe('Pi official response categories through runtime and the real UI host', () => {
  it('renders all five fire-and-forget methods with zero transport responses', async () => {
    const f = fixture();
    await f.runtime.get('owned-A');
    const events = [
      { method: 'notify', message: 'Visible notice' },
      { method: 'setStatus', statusKey: 'key', statusText: 'Visible status' },
      { method: 'setWidget', widgetKey: 'key', widgetLines: ['Visible widget'] },
      { method: 'setTitle', title: 'Visible title' },
      { method: 'set_editor_text', text: 'Exact composer text' },
    ];
    events.forEach((event, index) => f.emit({ type: 'extension_ui_request', id: 'fire-' + index, ...event }));
    await settle();
    expect(document.querySelector('.owned-notice')?.textContent).toBe('Visible notice');
    for (const text of ['Visible status', 'Visible widget', 'Visible title']) expect(f.containerEl.textContent).toContain(text);
    expect(f.containerEl.querySelector('textarea')?.value).toBe('Exact composer text');
    expect(f.respond).not.toHaveBeenCalled();
    f.runtime.close('owned-A');
    expect(f.containerEl.textContent).toBe('OpenCodian');
    expect(f.close).toHaveBeenCalledTimes(1);
  });

  it.each(['select', 'confirm', 'input', 'editor'])('%s succeeds once and user cancellation replies once with its own request ID', async method => {
    const f = fixture();
    await f.runtime.get('owned-A');
    f.emit({ type: 'extension_ui_request', id: method + '-ok', method, title: 'Owned dialog',
      options: ['Exact choice'], ...(method === 'editor' ? { prefill: 'first\nsecond' } : {}),
      ...(method === 'input' ? { placeholder: 'Owned placeholder' } : {}) });
    const input = document.querySelector<HTMLTextAreaElement>('.opencodian-pi-dialog-input');
    const textMethod = method === 'input' || method === 'editor';
    expect(input?.value ?? null).toBe(textMethod ? method === 'editor' ? 'first\nsecond' : '' : null);
    expect(input?.placeholder ?? null).toBe(textMethod ? method === 'input' ? 'Owned placeholder' : '' : null);
    if (method === 'select') button('选择 / Select').click();
    else if (method === 'confirm') button('确认 / Confirm').click();
    else {
      input!.value = 'Exact\nresult';
      const submit = button('提交 / Submit');
      submit.click();
      submit.click();
    }
    await settle();
    const result = method === 'confirm' ? { confirmed: true } : { value: method === 'select' ? 'Exact choice' : 'Exact\nresult' };
    expect(f.respond.mock.calls).toEqual([[{ ...result, id: method + '-ok' }]]);
    expect(document.querySelector('.owned-modal')).toBeNull();
    f.emit({ type: 'extension_ui_request', id: method + '-cancel', method, title: 'Cancel dialog', options: ['Ignored'] });
    const cancel = button('取消 / Cancel');
    cancel.click();
    cancel.click();
    await settle();
    expect(f.respond.mock.calls).toEqual([
      [{ ...result, id: method + '-ok' }],
      [{ cancelled: true, id: method + '-cancel' }],
    ]);
    expect(document.querySelector('.owned-modal')).toBeNull();
  });
});

describe('Pi existing dialog and OAuth cancellation routes', () => {
  it('replies once to native cancel and cleans runtime-close dialogs without writing to a closed peer', async () => {
    const f = fixture();
    await f.runtime.get('owned-A');
    f.emit({ type: 'extension_ui_request', id: 'native-cancel', method: 'input', title: 'Native cancel' });
    f.emit({ type: 'extension_ui_cancel', id: 'not-this-request' });
    expect(document.querySelectorAll('.owned-modal')).toHaveLength(1);
    f.emit({ type: 'extension_ui_cancel', id: 'native-cancel' });
    f.emit({ type: 'extension_ui_cancel', id: 'native-cancel' });
    await settle();
    expect(f.respond.mock.calls).toEqual([[{ cancelled: true, id: 'native-cancel' }]]);
    f.emit({ type: 'extension_ui_request', id: 'close-dialog', method: 'editor', title: 'Runtime close' });
    f.runtime.close('owned-A');
    await settle();
    expect(f.respond.mock.calls).toEqual([[{ cancelled: true, id: 'native-cancel' }]]);
    expect(f.close).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.owned-modal')).toBeNull();
  });

  it('clears a visible connection projection on transport failure', async () => {
    const f = fixture();
    await f.runtime.get('owned-A');
    f.emit({ type: 'extension_ui_request', id: 'live', method: 'setTitle', title: 'Before failure' });
    expect(f.containerEl.textContent).toContain('Before failure');
    f.emit({ type: 'transport_error', error: 'Owned failure' });
    await settle();
    expect(f.containerEl.textContent).toBe('OpenCodian');
    expect(f.respond).not.toHaveBeenCalled();
    expect(f.close).toHaveBeenCalledTimes(1);
  });

  it('keeps OAuth URL notice request cancellation separate from protocol responses', async () => {
    const f = fixture();
    await f.runtime.get('owned-A');
    f.emit({ type: 'extension_ui_request', id: 'oauth-link', method: 'notify',
      message: 'Owned auth link', url: 'https://auth.example.test/start' });
    expect(document.querySelector('.owned-notice a')?.getAttribute('href')).toBe('https://auth.example.test/start');
    f.emit({ type: 'extension_ui_cancel', id: 'other' });
    expect(document.querySelector('.owned-notice')).not.toBeNull();
    f.emit({ type: 'extension_ui_cancel', id: 'oauth-link' });
    await settle();
    expect(document.querySelector('.owned-notice')).toBeNull();
    expect(f.respond).not.toHaveBeenCalled();
  });
});
