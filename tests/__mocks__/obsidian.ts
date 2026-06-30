/**
 * Mock Obsidian API for testing
 */

type MockDocumentProvider = () => Document | undefined;

let mockDocumentProvider: MockDocumentProvider = () => globalThis.document;

export function __setMockDocumentProvider(provider: MockDocumentProvider): void {
  mockDocumentProvider = provider;
}

export function __resetMockDocumentProvider(): void {
  mockDocumentProvider = () => globalThis.document;
}

function createMockElement(tagName: string, ownerElement?: HTMLElement): HTMLElement {
  const activeDocument = mockDocumentProvider() ?? ownerElement?.ownerDocument;
  if (activeDocument) {
    return activeDocument.createElement(tagName);
  }

  return {
    appendChild() {
      return this;
    },
    className: '',
    classList: {
      add() {},
      remove() {},
    },
    createDiv() {
      return createMockElement('div') as HTMLDivElement;
    },
    createEl() {
      return createMockElement('div');
    },
    createSpan() {
      return createMockElement('span') as HTMLSpanElement;
    },
    innerHTML: '',
    removeClass() {},
    setText(text: string) {
      this.textContent = text;
    },
    textContent: '',
  } satisfies Partial<HTMLElement> as HTMLElement;
}

export class Plugin {
  app = {};
  manifest = {};
  
  addRibbonIcon() { return this; }
  addCommand() { return this; }
  addSettingTab() { return this; }
  registerView() { return this; }
  registerEvent() { return this; }
  registerDomEvent() { return this; }
  registerInterval() { return this; }
  registerEditorExtension() { return this; }
  registerEditorSuggest() { return this; }
  registerHoverLinkSource() { return this; }
  
  loadData() { return Promise.resolve({}); }
  saveData() { return Promise.resolve(); }
  loadSettings() { return Promise.resolve({}); }
  saveSettings() { return Promise.resolve(); }
}

export class PluginSettingTab {
  app = {};
  plugin = {};
  containerEl = createMockElement('div');
  
  display() {}
  hide() {}
}

export class Setting {
  settingEl = createMockElement('div');
  controlEl = createMockElement('div');
  
  constructor(containerEl?: HTMLElement) {
    if (containerEl) {
      this.settingEl = createMockElement('div', containerEl);
      this.controlEl = createMockElement('div', containerEl);
    }
    this.settingEl.className = 'setting-item';
    this.controlEl.className = 'setting-item-control';
    if (containerEl) {
      containerEl.appendChild(this.settingEl);
      this.settingEl.appendChild(this.controlEl);
    }
  }
  setName() { return this; }
  setDesc() { return this; }
  setHeading() { return this; }
  setClass() { return this; }
  setTooltip() { return this; }
  addButton() { return this; }
  addDropdown() { return this; }
  addExtraButton() { return this; }
  addMomentFormat() { return this; }
  addProgressBar() { return this; }
  addSearch() { return this; }
  addSlider() { return this; }
  addText() { return this; }
  addTextArea() { return this; }
  addToggle() { return this; }
  then() { return this; }
}

export class Modal {
  app = {};
  contentEl = createMockElement('div');
  modalEl = createMockElement('div');
  titleEl = createMockElement('div');
  
  open() {}
  close() {}
  onOpen() {}
  onClose() {}
}

export class Component {
  load() {}
  unload() {}
  register() {}
}

export class Notice {
  constructor(_message: string) {}
}

export class TFile {
  vault = {};
  path = '';
  name = '';
  basename = '';
  extension = '';
}

export class MarkdownView {
  file: TFile | null = null;
  editor = {
    getSelection: () => '',
    getCursor: () => ({ line: 0, ch: 0 }),
  };
}

export const MarkdownRenderer = {
  renderMarkdown: jest.fn(async (markdown: string, el: HTMLElement) => {
    el.textContent = markdown;
  }),
};

export class TFolder {
  vault = {};
  path = '';
  name = '';
  children: unknown[] = [];
}

export class Vault {
  adapter = {
    basePath: '/test',
  };
  
  getAbstractFileByPath() { return null; }
  getFiles() { return []; }
  getRoot() { return {}; }
  create() { return Promise.resolve({}); }
  createFolder() { return Promise.resolve({}); }
  delete() { return Promise.resolve(); }
  read() { return Promise.resolve(''); }
  readBinary() { return Promise.resolve(new ArrayBuffer(0)); }
  write() { return Promise.resolve(); }
  writeBinary() { return Promise.resolve(); }
  append() { return Promise.resolve(); }
  process() { return Promise.resolve(); }
  getResourcePath() { return ''; }
  getAvailablePathForAttachment() { return Promise.resolve(''); }
  copy() { return Promise.resolve({}); }
  rename() { return Promise.resolve(); }
  modify() { return Promise.resolve(); }
  trash() { return Promise.resolve(); }
  on() { return {} as { off: () => void }; }
  off() {}
  offref() {}
}

export class Workspace {
  activeLeaf = null;
  leftSidebar = {};
  rightSidebar = {};
  leftRibbon = {};
  rightRibbon = {};
  
  getLeavesOfType() { return []; }
  getLeaf() { return null; }
  getRightLeaf() { return null; }
  getActiveViewOfType() { return null; }
  openLinkText() { return Promise.resolve(); }
  revealLeaf() {}
  on() { return {} as { off: () => void }; }
}

export class WorkspaceLeaf {
  view = {};
  
  openFile() { return Promise.resolve(); }
  setViewState() { return Promise.resolve(); }
  getViewState() { return {}; }
}

export class ItemView {
  app = { vault: new Vault(), workspace: new Workspace() };
  containerEl = createMockElement('div');
  contentEl = createMockElement('div');
  scope = {};
  
  getViewType() { return 'test'; }
  getDisplayText() { return 'Test'; }
  getState() { return {}; }
  setState() { return Promise.resolve(); }
  getEphemeralState() { return {}; }
  setEphemeralState() {}
  onOpen() { return Promise.resolve(); }
  onClose() { return Promise.resolve(); }
  onPaneMenu() {}
  addAction() { return this; }
}

export function setIcon(el: HTMLElement, icon: string) {
  el.innerHTML = `<svg data-icon="${icon}"></svg>`;
}

export function addIcon(_iconId: string, _svgContent: string) {}

export function normalizePath(path: string) {
  return path.replace(/\\/g, '/');
}

export function debounce(fn: () => void, delay: number) {
  let timeout: NodeJS.Timeout;
  return () => {
    clearTimeout(timeout);
    timeout = setTimeout(fn, delay);
  };
}

export const requestUrl = jest.fn();
