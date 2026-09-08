import { randomUUID } from 'node:crypto';

/** Bidirectional UI bridge. Values are never inferred or auto-approved. */
export function createExtensionUi(send, theme) {
  const pending = new Map();
  let editorText = '';
  const notify = (method, data) => send({ type: 'extension_ui_request', id: randomUUID(), method, ...data });
  const ask = (method, data, options = {}) => new Promise((resolve) => {
    const id = randomUUID();
    let timer;
    const finish = (response) => {
      if (!pending.has(id)) return;
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', cancel);
      pending.delete(id);
      if (response.cancelled) send({ type: 'extension_ui_cancel', id });
      resolve(response.cancelled ? (method === 'confirm' ? false : undefined) : method === 'confirm' ? response.confirmed === true : response.value);
    };
    const cancel = () => finish({ cancelled: true });
    pending.set(id, finish);
    if (options.signal?.aborted) return cancel();
    options.signal?.addEventListener('abort', cancel, { once: true });
    timer = setTimeout(cancel, options.timeout ?? 300000);
    send({ type: 'extension_ui_request', id, method, ...data });
  });
  return {
    context: {
      select: (title, options, dialogOptions) => ask('select', { title, options }, dialogOptions),
      confirm: (title, message, options) => ask('confirm', { title, message }, options),
      input: (title, placeholder, options) => ask('input', { title, placeholder }, options),
      editor: (title, prefill) => ask('editor', { title, prefill }),
      notify: (message, notifyType) => notify('notify', { message, notifyType }),
      setStatus: (statusKey, statusText) => notify('setStatus', { statusKey, statusText }),
      setWidget: (widgetKey, lines, options) => {
        if (typeof lines === 'function') throw new Error('Terminal component widgets require the Pi TUI; use text lines in Obsidian.');
        notify('setWidget', { widgetKey, widgetLines: lines, widgetPlacement: options?.placement });
      },
      setTitle: (title) => notify('setTitle', { title }),
      setEditorText: (text) => { editorText = text; notify('set_editor_text', { text }); },
      getEditorText: () => editorText,
      pasteToEditor: (text) => { editorText += text; notify('set_editor_text', { text: editorText }); },
      setWorkingMessage: (text) => notify('setStatus', { statusKey: 'working', statusText: text }),
      setWorkingIndicator: () => {}, setFooter: () => {}, setHeader: () => {},
      setToolsExpanded: (expanded) => notify('setStatus', { statusKey: 'tools-expanded', statusText: String(expanded) }),
      getToolsExpanded: () => false,
      get theme() { return theme; }, getAllThemes: () => [], getTheme: () => undefined,
      setTheme: () => ({ success: false, error: 'Use Obsidian appearance settings for the host theme.' }),
      custom: async () => { throw new Error('Pi terminal components cannot render in Obsidian; use select/input/editor.'); },
      addAutocompleteProvider: () => {}, setEditorComponent: () => {}, getEditorComponent: () => undefined,
    },
    ask,
    respond(message) { pending.get(message.id)?.(message); },
    cancelAll() { for (const finish of [...pending.values()]) finish({ cancelled: true }); },
  };
}
