/**
 * Test setup file
 */

// Mock Obsidian API globals
global.document = document;
global.window = window;

type CreateElOptions = {
  cls?: string;
  text?: string;
  attr?: Record<string, string>;
};

function applyCreateElOptions<T extends HTMLElement>(element: T, options?: CreateElOptions): T {
  if (!options) {
    return element;
  }

  if (options.cls) {
    element.className = options.cls;
  }

  if (typeof options.text === 'string') {
    element.textContent = options.text;
  }

  if (options.attr) {
    for (const [key, value] of Object.entries(options.attr)) {
      element.setAttribute(key, value);
    }
  }

  return element;
}

if (!('createEl' in HTMLElement.prototype)) {
  Object.defineProperty(HTMLElement.prototype, 'createEl', {
    value(tag: string, options?: CreateElOptions) {
      const element = applyCreateElOptions(document.createElement(tag), options);
      this.appendChild(element);
      return element;
    },
  });
}

if (!('createDiv' in HTMLElement.prototype)) {
  Object.defineProperty(HTMLElement.prototype, 'createDiv', {
    value(options?: Omit<CreateElOptions, 'tag'>) {
      return (this as HTMLElement & {
        createEl: (tag: string, options?: CreateElOptions) => HTMLDivElement;
      }).createEl('div', options);
    },
  });
}

if (!('createSpan' in HTMLElement.prototype)) {
  Object.defineProperty(HTMLElement.prototype, 'createSpan', {
    value(options?: Omit<CreateElOptions, 'tag'>) {
      return (this as HTMLElement & {
        createEl: (tag: string, options?: CreateElOptions) => HTMLSpanElement;
      }).createEl('span', options);
    },
  });
}

if (!('addClass' in HTMLElement.prototype)) {
  Object.defineProperty(HTMLElement.prototype, 'addClass', {
    value(...classes: string[]) {
      this.classList.add(...classes);
    },
  });
}

if (!('removeClass' in HTMLElement.prototype)) {
  Object.defineProperty(HTMLElement.prototype, 'removeClass', {
    value(...classes: string[]) {
      this.classList.remove(...classes);
    },
  });
}

if (!('toggleClass' in HTMLElement.prototype)) {
  Object.defineProperty(HTMLElement.prototype, 'toggleClass', {
    value(className: string, force?: boolean) {
      this.classList.toggle(className, force);
    },
  });
}

if (!('empty' in HTMLElement.prototype)) {
  Object.defineProperty(HTMLElement.prototype, 'empty', {
    value() {
      this.textContent = '';
      this.replaceChildren();
    },
  });
}

// Silence console warnings during tests
const originalConsoleWarn = console.warn;
console.warn = (...args: unknown[]) => {
  // Filter out specific warnings if needed
  originalConsoleWarn.apply(console, args);
};
