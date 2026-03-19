import { setIcon } from 'obsidian';

import type { ToolCallInfo, ToolCallStatus, ToolRendererOptions } from './types';

const STATUS_ICONS: Record<ToolCallStatus, string> = {
  pending: 'clock',
  running: 'loader',
  completed: 'check',
  error: 'x',
  blocked: 'shield-off',
};

const DEFAULT_TOOL_NAMES: Record<string, string> = {
  read: 'Read',
  write: 'Write',
  edit: 'Edit',
  bash: 'Bash',
  grep: 'Grep',
  glob: 'Glob',
  web_search: 'WebSearch',
  web_fetch: 'WebFetch',
};

export class ToolCallRenderer {
  private options: ToolRendererOptions;

  constructor(options?: Partial<ToolRendererOptions>) {
    this.options = {
      iconMap: {},
      getToolName: this.defaultGetToolName,
      getToolSummary: this.defaultGetToolSummary,
      renderExpandedContent: this.defaultRenderExpandedContent,
      ...options,
    };
  }

  private defaultGetToolName = (name: string): string => {
    return DEFAULT_TOOL_NAMES[name] || name;
  };

  private defaultGetToolSummary = (
    name: string,
    input: Record<string, unknown>
  ): string => {
    switch (name) {
      case 'read':
      case 'write':
      case 'edit':
        return this.fileNameOnly((input.file_path as string) || '');
      case 'bash':
        return this.truncateText((input.command as string) || '', 60);
      case 'glob':
      case 'grep':
        return (input.pattern as string) || '';
      case 'web_search':
        return this.truncateText((input.query as string) || '', 60);
      case 'web_fetch':
        return this.truncateText((input.url as string) || '', 60);
      default:
        return '';
    }
  };

  private defaultRenderExpandedContent = (
    container: HTMLElement,
    _toolName: string,
    result: string | undefined
  ): void => {
    if (!result) {
      container.createDiv({ cls: 'streaming-tool-empty', text: 'No result' });
      return;
    }

    const lines = result.split(/\r?\n/);
    const maxLines = 20;
    const truncated = lines.length > maxLines;
    const displayLines = truncated ? lines.slice(0, maxLines) : lines;

    const linesEl = container.createDiv({ cls: 'streaming-tool-lines' });
    for (const line of displayLines) {
      const lineEl = linesEl.createDiv({ cls: 'streaming-tool-line' });
      lineEl.setText(line || ' ');
    }

    if (truncated) {
      linesEl.createDiv({
        cls: 'streaming-tool-truncated',
        text: `... ${lines.length - maxLines} more lines`,
      });
    }
  };

  private fileNameOnly(filePath: string): string {
    if (!filePath) return '';
    const normalized = filePath.replace(/\\/g, '/');
    return normalized.split('/').pop() ?? normalized;
  }

  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }

  render(
    parentEl: HTMLElement,
    toolCall: ToolCallInfo
  ): HTMLElement {
    const toolEl = parentEl.createDiv({ cls: 'streaming-tool-call' });
    toolEl.dataset.toolId = toolCall.id;

    const header = toolEl.createDiv({ cls: 'streaming-tool-header' });
    header.setAttribute('tabindex', '0');
    header.setAttribute('role', 'button');

    const iconEl = header.createSpan({ cls: 'streaming-tool-icon' });
    iconEl.setAttribute('aria-hidden', 'true');
    this.setToolIcon(iconEl, toolCall.name);

    const nameEl = header.createSpan({ cls: 'streaming-tool-name' });
    nameEl.setText(
      this.options.getToolName!(toolCall.name, toolCall.input)
    );

    const summaryEl = header.createSpan({ cls: 'streaming-tool-summary' });
    summaryEl.setText(
      this.options.getToolSummary!(toolCall.name, toolCall.input)
    );

    const statusEl = header.createSpan({ cls: 'streaming-tool-status' });
    this.setStatus(statusEl, toolCall.status);

    const content = toolEl.createDiv({ cls: 'streaming-tool-content' });
    content.style.display = 'none';

    if (toolCall.status !== 'pending' && toolCall.status !== 'running') {
      this.options.renderExpandedContent!(content, toolCall.name, toolCall.result);
    } else {
      content.createDiv({
        cls: 'streaming-tool-pending',
        text: 'Waiting for result...',
      });
    }

    this.setupCollapsible(toolEl, header, content);

    return toolEl;
  }

  private setToolIcon(el: HTMLElement, name: string): void {
    const icon = this.options.iconMap?.[name];
    if (icon) {
      setIcon(el, icon);
    } else {
      setIcon(el, 'wrench');
    }
  }

  private setStatus(statusEl: HTMLElement, status: ToolCallStatus): void {
    statusEl.className = 'streaming-tool-status';
    statusEl.empty();
    statusEl.addClass(`status-${status}`);
    statusEl.setAttribute('aria-label', `Status: ${status}`);

    const icon = STATUS_ICONS[status];
    if (icon) {
      setIcon(statusEl, icon);
    }
  }

  private setupCollapsible(
    toolEl: HTMLElement,
    header: HTMLElement,
    content: HTMLElement
  ): void {
    let isExpanded = false;

    const toggle = () => {
      isExpanded = !isExpanded;
      content.style.display = isExpanded ? 'block' : 'none';
      header.setAttribute('aria-expanded', String(isExpanded));
      toolEl.toggleClass('is-expanded', isExpanded);
    };

    header.addEventListener('click', toggle);
    header.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    });
  }

  updateStatus(
    toolEl: HTMLElement,
    status: ToolCallStatus
  ): void {
    const statusEl = toolEl.querySelector('.streaming-tool-status') as HTMLElement;
    if (statusEl) {
      this.setStatus(statusEl, status);
    }
  }

  updateResult(
    toolEl: HTMLElement,
    toolCall: ToolCallInfo
  ): void {
    const contentEl = toolEl.querySelector('.streaming-tool-content') as HTMLElement;
    if (contentEl) {
      contentEl.empty();
      this.options.renderExpandedContent!(contentEl, toolCall.name, toolCall.result);
    }
    this.updateStatus(toolEl, toolCall.status);
  }

  updateHeader(
    toolEl: HTMLElement,
    toolCall: ToolCallInfo
  ): void {
    const nameEl = toolEl.querySelector('.streaming-tool-name') as HTMLElement;
    const summaryEl = toolEl.querySelector('.streaming-tool-summary') as HTMLElement;

    if (nameEl) {
      nameEl.setText(this.options.getToolName!(toolCall.name, toolCall.input));
    }
    if (summaryEl) {
      summaryEl.setText(this.options.getToolSummary!(toolCall.name, toolCall.input));
    }
  }
}
