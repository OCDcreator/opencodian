import { addIcon, setIcon } from 'obsidian';

import { getToolIdentity, MCP_TOOL_ICON_ID } from '../../shared';
import {
  getMcpToolSummary,
} from './mcpSummaryConfig';
import type { ToolCallInfo, ToolCallStatus, ToolRendererOptions } from './types';

const STATUS_ICONS: Record<ToolCallStatus, string> = {
  pending: 'clock',
  running: 'loader',
  completed: 'check',
  error: 'x',
  blocked: 'shield-off',
};

const FALLBACK_TOOL_ICONS: Record<string, string> = {
  get_repo_structure: 'folder-tree',
};

const MCP_TOOL_ICON_SVG = `
  <title>ModelContextProtocol</title>
  <g fill="currentColor" fill-rule="evenodd" transform="scale(4.166667)">
    <path d="M15.688 2.343a2.588 2.588 0 00-3.61 0l-9.626 9.44a.863.863 0 01-1.203 0 .823.823 0 010-1.18l9.626-9.44a4.313 4.313 0 016.016 0 4.116 4.116 0 011.204 3.54 4.3 4.3 0 013.609 1.18l.05.05a4.115 4.115 0 010 5.9l-8.706 8.537a.274.274 0 000 .393l1.788 1.754a.823.823 0 010 1.18.863.863 0 01-1.203 0l-1.788-1.753a1.92 1.92 0 010-2.754l8.706-8.538a2.47 2.47 0 000-3.54l-.05-.049a2.588 2.588 0 00-3.607-.003l-7.172 7.034-.002.002-.098.097a.863.863 0 01-1.204 0 .823.823 0 010-1.18l7.273-7.133a2.47 2.47 0 00-.003-3.537z"></path>
    <path d="M14.485 4.703a.823.823 0 000-1.18.863.863 0 00-1.204 0l-7.119 6.982a4.115 4.115 0 000 5.9 4.314 4.314 0 006.016 0l7.12-6.982a.823.823 0 000-1.18.863.863 0 00-1.204 0l-7.119 6.982a2.588 2.588 0 01-3.61 0 2.47 2.47 0 010-3.54l7.12-6.982z"></path>
  </g>
`;

addIcon(MCP_TOOL_ICON_ID, MCP_TOOL_ICON_SVG);

export class ToolCallRenderer {
  private options: ToolRendererOptions;

  private readonly summaryResolvers: Record<string, (input: Record<string, unknown>) => string> = {
    read: (input) => this.getReadSummary(input),
    write: (input) => this.fileNameOnly(this.getToolFilePath(input)),
    edit: (input) => this.fileNameOnly(this.getToolFilePath(input)),
    multiedit: (input) => this.getMultiEditSummary(input),
    apply_patch: (input) => this.getApplyPatchSummary(input),
    patch: (input) => this.getApplyPatchSummary(input),
    bash: (input) => this.truncateText((input.command as string) || '', 60),
    list: (input) => this.directoryNameOnly((input.path as string) || ''),
    glob: (input) => this.getGlobSummary(input),
    grep: (input) => this.getGrepSummary(input),
    lsp: (input) => this.getLspSummary(input),
    web_search: (input) => this.truncateText((input.query as string) || '', 60),
    codesearch: (input) => this.truncateText((input.query as string) || '', 60),
    web_fetch: (input) => this.truncateText((input.url as string) || '', 60),
    task: (input) => this.getTaskSummary(input),
    question: (input) => this.getQuestionSummary(input),
    skill: (input) => this.truncateText(
      (input.name as string)
      || (input.skill as string)
      || '',
      80,
    ),
    plan_enter: () => 'Switch to plan mode',
    enter_plan_mode: () => 'Switch to plan mode',
    plan_exit: () => 'Switch to build mode',
    exit_plan_mode: () => 'Switch to build mode',
    todoread: (input) => this.getTodoSummary(input) || 'Current tasks',
    todowrite: (input) => this.getTodoSummary(input),
  };

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
    return getToolIdentity(name).displayName;
  };

  private defaultGetToolSummary = (
    name: string,
    input: Record<string, unknown>,
    toolKind?: ToolCallInfo['kind']
  ): string => {
    if (toolKind === 'mcp') {
      return getMcpToolSummary(name, input);
    }

    const normalizedName = getToolIdentity(name).normalizedName;
    const resolveSummary = this.summaryResolvers[normalizedName];
    return resolveSummary ? resolveSummary(input) : '';
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

  private isTaskTool(toolCall: Pick<ToolCallInfo, 'name' | 'kind'>): boolean {
    return toolCall.kind === 'task' || getToolIdentity(toolCall.name).normalizedName === 'task';
  }

  private getTaskSessionId(toolCall: Pick<ToolCallInfo, 'toolMetadata'>): string | null {
    const sessionId = typeof toolCall.toolMetadata?.sessionId === 'string'
      ? toolCall.toolMetadata.sessionId.trim()
      : '';
    return sessionId || null;
  }

  private renderTaskExpandedContent(
    container: HTMLElement,
    toolCall: ToolCallInfo,
  ): void {
    const detailsEl = container.createDiv({ cls: 'streaming-task-details' });
    const subagentType = typeof toolCall.input.subagent_type === 'string'
      ? toolCall.input.subagent_type.trim()
      : '';
    const description = typeof toolCall.input.description === 'string'
      ? toolCall.input.description.trim()
      : typeof toolCall.input.prompt === 'string'
        ? toolCall.input.prompt.trim()
        : '';
    const sessionId = this.getTaskSessionId(toolCall);

    if (subagentType) {
      detailsEl.createDiv({ cls: 'streaming-task-field', text: `Agent: ${subagentType}` });
    }
    if (description) {
      detailsEl.createDiv({ cls: 'streaming-task-field', text: `Description: ${description}` });
    }
    detailsEl.createDiv({ cls: 'streaming-task-field', text: `Status: ${toolCall.status}` });

    if (sessionId) {
      detailsEl.createDiv({ cls: 'streaming-task-field', text: `Session: ${sessionId}` });
      const openButton = detailsEl.createEl('button', {
        cls: 'streaming-task-session-button',
        text: 'Open subagent session',
      });
      openButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.options.onOpenToolSession?.(sessionId, toolCall);
      });
    } else {
      detailsEl.createDiv({
        cls: 'streaming-task-field streaming-task-field-muted',
        text: 'Session unavailable',
      });
    }

    detailsEl.createDiv({
      cls: 'streaming-task-field streaming-task-field-muted',
      text: toolCall.status === 'error'
        ? 'Task failed. Open the subagent session for details.'
        : 'Task result is kept in the subagent session.',
    });
  }

  private fileNameOnly(filePath: string): string {
    if (!filePath) return '';
    const normalized = filePath.replace(/\\/g, '/');
    return normalized.split('/').pop() ?? normalized;
  }

  private directoryNameOnly(filePath: string): string {
    if (!filePath) return '';
    const normalized = filePath.replace(/\\/g, '/').replace(/\/+$/, '');
    if (!normalized) {
      return '';
    }

    const parts = normalized.split('/');
    return parts[parts.length - 1] || normalized;
  }

  private getToolFilePath(input: Record<string, unknown>): string {
    const candidate = [
      input.file_path,
      input.filePath,
      input.path,
      input.notebook_path,
      input.notebookPath,
      input.target_file,
      input.targetFile,
    ].find((value): value is string => typeof value === 'string' && value.trim().length > 0);

    return candidate?.trim() ?? '';
  }

  private getTodoSummary(input: Record<string, unknown>): string {
    const todos = this.extractTodoNames(input);
    if (todos.length === 0) {
      return '';
    }

    const rawTodos = Array.isArray(input.todos) ? input.todos as Array<{ status?: string }> : [];
    const done = rawTodos.filter((todo) => todo.status === 'completed').length;
    const preview = todos.slice(0, 2).join(' · ');
    const extraCount = todos.length - Math.min(todos.length, 2);
    const extraSuffix = extraCount > 0 ? ` · +${extraCount}` : '';

    return `${done}/${todos.length} · ${this.truncateText(`${preview}${extraSuffix}`, 80)}`;
  }

  private extractTodoNames(input: Record<string, unknown>): string[] {
    if (!Array.isArray(input.todos)) {
      return [];
    }

    return input.todos.reduce<string[]>((names, todo) => {
      if (!todo || typeof todo !== 'object') {
        return names;
      }

      const content = typeof (todo as { content?: unknown }).content === 'string'
        ? (todo as { content: string }).content.trim()
        : '';
      if (!content) {
        return names;
      }

      names.push(content);
      return names;
    }, []);
  }

  private getReadSummary(input: Record<string, unknown>): string {
    const file = this.fileNameOnly(this.getToolFilePath(input));
    const offset = this.getPositiveInteger(input.offset);
    const limit = this.getPositiveInteger(input.limit);

    if (!file) {
      return this.formatReadRange(offset, limit);
    }

    const range = this.formatReadRange(offset, limit);
    return range ? `${file} · ${range}` : file;
  }

  private getMultiEditSummary(input: Record<string, unknown>): string {
    const file = this.fileNameOnly(this.getToolFilePath(input));
    const edits = Array.isArray(input.edits) ? input.edits.length : 0;
    if (!file) {
      return edits > 0 ? `${edits} edits` : '';
    }
    return edits > 0 ? `${file} · ${edits} edits` : file;
  }

  private getApplyPatchSummary(input: Record<string, unknown>): string {
    const patchText = typeof input.patchText === 'string'
      ? input.patchText
      : typeof input.patch === 'string'
        ? input.patch
        : '';

    if (!patchText) {
      return '';
    }

    const matches = [...patchText.matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm)];
    const files = matches
      .map((match) => this.fileNameOnly(match[1]?.trim() ?? ''))
      .filter((value) => value.length > 0);

    if (files.length === 0) {
      return 'Patch';
    }

    if (files.length === 1) {
      return files[0];
    }

    const preview = files.slice(0, 2).join(' · ');
    const extra = files.length - 2;
    return extra > 0 ? `${files.length} files · ${preview} · +${extra}` : `${files.length} files · ${preview}`;
  }

  private getGlobSummary(input: Record<string, unknown>): string {
    const pattern = typeof input.pattern === 'string' ? input.pattern.trim() : '';
    const dir = this.directoryNameOnly(typeof input.path === 'string' ? input.path : '');

    if (pattern && dir) {
      return this.truncateText(`${pattern} · ${dir}`, 80);
    }

    return pattern || dir;
  }

  private getGrepSummary(input: Record<string, unknown>): string {
    const parts: string[] = [];
    const pattern = typeof input.pattern === 'string' ? input.pattern.trim() : '';
    const include = typeof input.include === 'string' ? input.include.trim() : '';
    const dir = this.directoryNameOnly(typeof input.path === 'string' ? input.path : '');

    if (pattern) {
      parts.push(pattern);
    }
    if (include) {
      parts.push(include);
    } else if (dir) {
      parts.push(dir);
    }

    return this.truncateText(parts.join(' · '), 80);
  }

  private getLspSummary(input: Record<string, unknown>): string {
    const operation = typeof input.operation === 'string' ? input.operation.trim() : '';
    const file = this.fileNameOnly(this.getToolFilePath(input));
    const line = this.getPositiveInteger(input.line);
    const character = this.getPositiveInteger(input.character);

    const location = [file, line, character].filter((value) => value !== null && value !== '').join(':');
    if (operation && location) {
      return `${operation} · ${location}`;
    }

    return operation || location;
  }

  private getTaskSummary(input: Record<string, unknown>): string {
    const type = typeof input.subagent_type === 'string' ? input.subagent_type.trim() : '';
    const description = typeof input.description === 'string'
      ? input.description.trim()
      : typeof input.prompt === 'string'
        ? input.prompt.trim()
        : typeof input.title === 'string'
          ? input.title.trim()
          : '';

    if (type && description) {
      return this.truncateText(`${type} · ${description}`, 80);
    }

    return this.truncateText(type || description, 80);
  }

  private getQuestionSummary(input: Record<string, unknown>): string {
    const questions = Array.isArray(input.questions) ? input.questions : [];
    if (questions.length === 0) {
      return '';
    }

    if (questions.length === 1 && questions[0] && typeof questions[0] === 'object') {
      const question = questions[0] as { header?: unknown; question?: unknown };
      const label = typeof question.header === 'string' && question.header.trim()
        ? question.header.trim()
        : typeof question.question === 'string'
          ? question.question.trim()
          : '';
      return this.truncateText(label, 80);
    }

    return `${questions.length} questions`;
  }

  private getPositiveInteger(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return Math.floor(value);
    }

    if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
      return Number(value.trim());
    }

    return null;
  }

  private formatReadRange(offset: number | null, limit: number | null): string {
    if (offset === null && limit === null) {
      return '';
    }

    const start = offset ?? 1;
    if (limit !== null) {
      return `${start}-${start + limit - 1}`;
    }

    return `${start}+`;
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
    this.setToolIcon(iconEl, toolCall);

    const nameEl = header.createSpan({ cls: 'streaming-tool-name' });
    nameEl.setText(
      this.options.getToolName!(toolCall.name, toolCall.input)
    );

    const summaryEl = header.createSpan({ cls: 'streaming-tool-summary' });
    const summaryText = this.options.getToolSummary!(toolCall.name, toolCall.input, toolCall.kind);
    summaryEl.setText(summaryText);
    summaryEl.title = summaryText;

    // Status icon (right side) - shows checkmark for success, X for error
    const statusEl = header.createSpan({ cls: 'streaming-tool-status' });
    statusEl.addClass(`status-${toolCall.status}`);
    this.setStatus(statusEl, toolCall.status);

    const content = toolEl.createDiv({ cls: 'streaming-tool-content' });
    content.style.display = 'none';

    if (this.isTaskTool(toolCall)) {
      this.renderTaskExpandedContent(content, toolCall);
    } else if (toolCall.status !== 'pending' && toolCall.status !== 'running') {
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

  private setToolIcon(el: HTMLElement, toolCall: Pick<ToolCallInfo, 'name' | 'kind'>): void {
    const { name } = toolCall;
    // Use custom icon map if provided
    if (this.options.iconMap?.[name]) {
      setIcon(el, this.options.iconMap[name]);
      return;
    }

    if (toolCall.kind === 'mcp') {
      setIcon(el, MCP_TOOL_ICON_ID);
      return;
    }

    if (toolCall.kind === 'custom') {
      setIcon(el, 'layers');
      return;
    }

    const identity = getToolIdentity(name);
    const icon = FALLBACK_TOOL_ICONS[identity.normalizedName]
      || FALLBACK_TOOL_ICONS[name]
      || identity.icon
      || 'wrench';
    setIcon(el, icon);
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
      this.options.onCollapsibleToggle?.();
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
      if (this.isTaskTool(toolCall)) {
        this.renderTaskExpandedContent(contentEl, toolCall);
      } else {
        this.options.renderExpandedContent!(contentEl, toolCall.name, toolCall.result);
      }
    }
    this.updateStatus(toolEl, toolCall.status);
  }

  updateHeader(
    toolEl: HTMLElement,
    toolCall: ToolCallInfo
  ): void {
    const iconEl = toolEl.querySelector('.streaming-tool-icon') as HTMLElement;
    const nameEl = toolEl.querySelector('.streaming-tool-name') as HTMLElement;
    const summaryEl = toolEl.querySelector('.streaming-tool-summary') as HTMLElement;

    if (iconEl) {
      this.setToolIcon(iconEl, toolCall);
    }
    if (nameEl) {
      nameEl.setText(this.options.getToolName!(toolCall.name, toolCall.input));
    }
    if (summaryEl) {
      const summaryText = this.options.getToolSummary!(toolCall.name, toolCall.input, toolCall.kind);
      summaryEl.setText(summaryText);
      summaryEl.title = summaryText;
    }
  }
}
