import type { AgentMentionIntent } from '../../../core/agents';
import {
  type AgentMentionMenuItem,
  renderAgentMentionMenu,
  type SlashCommandMenuStatus,
} from './slashCommandMenuRenderer';

type AgentMentionMode = 'primary' | 'subagent' | 'all' | null;

export interface AgentMentionCandidate extends AgentMentionMenuItem {
  mode: AgentMentionMode;
  hidden?: boolean;
}

interface AgentMentionQuery {
  query: string;
  start: number;
  end: number;
}

interface TrackedAgentMention {
  agentId: string;
  value: string;
  start: number;
  end: number;
}

export interface AgentMentionPillSpan {
  agentId: string;
  value: string;
  start: number;
  end: number;
}

export interface AgentMentionComposerControllerHost {
  getComposerInputMode(): 'prompt' | 'shell';
  loadAgentMentionCandidates?(): Promise<AgentMentionCandidate[]>;
  scheduleLayoutSync(): void;
  onMentionInserted(): void;
  onLoadFailed(error: unknown): void;
}

export class AgentMentionComposerController {
  private candidates: AgentMentionCandidate[] | null = null;
  private visibleCandidates: AgentMentionCandidate[] = [];
  private selectedIndex = 0;
  private runId = 0;
  private status: SlashCommandMenuStatus = 'idle';
  private query: AgentMentionQuery | null = null;
  private trackedMentions: TrackedAgentMention[] = [];
  private lastContent: string | null = null;

  constructor(private readonly host: AgentMentionComposerControllerHost) {}

  reset(): void {
    this.runId += 1;
    this.candidates = null;
    this.visibleCandidates = [];
    this.selectedIndex = 0;
    this.status = 'idle';
    this.query = null;
    this.trackedMentions = [];
    this.lastContent = null;
  }

  clear(menuEl: HTMLElement | null): void {
    this.runId += 1;
    this.candidates = null;
    this.visibleCandidates = [];
    this.selectedIndex = 0;
    this.status = 'idle';
    this.query = null;
    this.render(menuEl);
  }

  getQuery(textarea: HTMLTextAreaElement): AgentMentionQuery | null {
    if (this.host.getComposerInputMode() !== 'prompt') {
      return null;
    }

    const selectionStart = textarea.selectionStart ?? textarea.value.length;
    const selectionEnd = textarea.selectionEnd ?? selectionStart;
    if (selectionStart !== selectionEnd) {
      return null;
    }

    const beforeCursor = textarea.value.slice(0, selectionStart);
    const match = /(^|[\s])@(\S*)$/.exec(beforeCursor);
    if (!match) {
      return null;
    }

    const queryText = match[2] ?? '';
    const mentionText = `@${queryText}`;
    return {
      query: queryText,
      start: selectionStart - mentionText.length,
      end: selectionStart,
    };
  }

  async refresh(
    query: AgentMentionQuery,
    menuEl: HTMLElement | null,
  ): Promise<void> {
    if (!this.host.loadAgentMentionCandidates) {
      this.clear(menuEl);
      return;
    }

    this.query = query;

    const currentRunId = ++this.runId;
    this.visibleCandidates = [];
    this.selectedIndex = 0;
    this.status = 'loading';
    this.render(menuEl);

    try {
      const candidates = this.candidates ?? await this.host.loadAgentMentionCandidates();
      if (currentRunId !== this.runId) {
        return;
      }

      this.candidates = candidates;
      this.visibleCandidates = filterAgentMentionCandidates(candidates, query.query);
      this.selectedIndex = 0;
      this.status = this.visibleCandidates.length > 0
        ? 'idle'
        : getEmptyAgentMentionMenuStatus(candidates);
      this.render(menuEl);
    } catch (error) {
      if (currentRunId !== this.runId) {
        return;
      }

      this.host.onLoadFailed(error);
      this.candidates = null;
      this.visibleCandidates = [];
      this.selectedIndex = 0;
      this.status = 'loadFailed';
      this.render(menuEl);
    }
  }

  tryHandleKeydown(
    event: KeyboardEvent,
    textarea: HTMLTextAreaElement | null,
    menuEl: HTMLElement | null,
  ): boolean {
    if (this.tryProtectTrackedMentionEdit(event, textarea)) {
      return true;
    }

    this.syncStateWithCurrentContext();

    if (this.visibleCandidates.length === 0) {
      if (event.key === 'Escape' && this.status !== 'idle') {
        event.preventDefault();
        this.clear(menuEl);
        return true;
      }

      return false;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.moveSelection(1, menuEl);
      return true;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.moveSelection(-1, menuEl);
      return true;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      this.clear(menuEl);
      return true;
    }

    if ((event.key === 'Enter' && !event.shiftKey) || event.key === 'Tab') {
      event.preventDefault();
      this.applySelectedCandidate(textarea, menuEl);
      return true;
    }

    return false;
  }

  resolveMentionIntents(content: string): AgentMentionIntent[] {
    return this.resolveMentionPillSpans(content).map((tracked) => ({
      agentId: tracked.agentId,
      source: {
        value: tracked.value,
        start: tracked.start,
        end: tracked.end,
      },
    }));
  }

  resolveMentionPillSpans(content: string): AgentMentionPillSpan[] {
    return this.trackedMentions.flatMap((tracked) => {
      const currentValue = content.slice(tracked.start, tracked.end);
      if (
        currentValue !== tracked.value
        || !isAgentMentionTokenBoundary(content, tracked.start, tracked.end)
      ) {
        return [];
      }

      return [{
        agentId: tracked.agentId,
        value: tracked.value,
        start: tracked.start,
        end: tracked.end,
      }];
    });
  }

  syncContent(content: string): void {
    if (this.lastContent === null) {
      this.lastContent = content;
      return;
    }

    if (content === this.lastContent) {
      return;
    }

    this.trackedMentions = updateTrackedMentionRanges(
      this.trackedMentions,
      this.lastContent,
      content,
    );
    this.lastContent = content;
  }

  clearTrackedMentions(): void {
    this.trackedMentions = [];
    this.lastContent = null;
  }

  private moveSelection(delta: number, menuEl: HTMLElement | null): void {
    if (this.visibleCandidates.length === 0) {
      return;
    }

    const itemCount = this.visibleCandidates.length;
    this.selectedIndex = (this.selectedIndex + delta + itemCount) % itemCount;
    this.render(menuEl);
    scrollSelectedItemIntoView(menuEl);
  }

  private applySelectedCandidate(
    textarea: HTMLTextAreaElement | null,
    menuEl: HTMLElement | null,
  ): void {
    this.syncStateWithCurrentContext();

    const item = this.visibleCandidates[this.selectedIndex];
    const query = this.query;
    if (!item || !query || !textarea) {
      return;
    }

    const mentionValue = `@${item.id}`;
    const replacement = `${mentionValue} `;
    const nextValue = [
      textarea.value.slice(0, query.start),
      replacement,
      textarea.value.slice(query.end),
    ].join('');
    const nextCursor = query.start + replacement.length;

    textarea.value = nextValue;
    textarea.focus();
    textarea.setSelectionRange(nextCursor, nextCursor);
    this.trackedMentions.push({
      agentId: item.id,
      value: mentionValue,
      start: query.start,
      end: query.start + mentionValue.length,
    });
    this.lastContent = nextValue;
    this.host.onMentionInserted();
    this.clear(menuEl);
  }

  private tryProtectTrackedMentionEdit(
    event: KeyboardEvent,
    textarea: HTMLTextAreaElement | null,
  ): boolean {
    if (!textarea || !isAtomicMentionEditKey(event)) {
      return false;
    }

    const selectionStart = textarea.selectionStart ?? textarea.value.length;
    const selectionEnd = textarea.selectionEnd ?? selectionStart;
    const protectedMention = this.findProtectedMentionForSelection(
      textarea.value,
      selectionStart,
      selectionEnd,
      event.key,
    );
    if (!protectedMention) {
      return false;
    }

    event.preventDefault();
    textarea.focus();
    textarea.setSelectionRange(protectedMention.start, protectedMention.end);
    return true;
  }

  private findProtectedMentionForSelection(
    content: string,
    selectionStart: number,
    selectionEnd: number,
    key: string,
  ): AgentMentionPillSpan | null {
    for (const mention of this.resolveMentionPillSpans(content)) {
      const selectedWholeMention = selectionStart <= mention.start && selectionEnd >= mention.end;
      if (selectionStart === selectionEnd) {
        const cursor = selectionStart;
        const cursorInsideMention = cursor > mention.start && cursor < mention.end;
        const backspaceWouldEditMention = key === 'Backspace' && cursor === mention.end;
        const deleteWouldEditMention = key === 'Delete' && cursor === mention.start;
        if (cursorInsideMention || backspaceWouldEditMention || deleteWouldEditMention) {
          return mention;
        }
        continue;
      }

      const overlapsMention = selectionStart < mention.end && selectionEnd > mention.start;
      if (!overlapsMention) {
        continue;
      }

      if (!selectedWholeMention || isPrintableEditKey(key)) {
        return mention;
      }
    }

    return null;
  }

  private render(menuEl: HTMLElement | null): void {
    if (!menuEl) {
      return;
    }

    this.syncStateWithCurrentContext();

    renderAgentMentionMenu({
      menuEl,
      items: this.visibleCandidates,
      selectedIndex: this.selectedIndex,
      status: this.status,
      onHoverItem: (index) => {
        if (this.selectedIndex === index) {
          return;
        }

        this.selectedIndex = index;
        this.render(menuEl);
      },
      onSelectItem: (index) => {
        this.selectedIndex = index;
        this.applySelectedCandidate(document.activeElement as HTMLTextAreaElement | null, menuEl);
      },
    });

    this.host.scheduleLayoutSync();
  }

  private syncStateWithCurrentContext(): void {
    if (this.query === null || !this.candidates) {
      return;
    }

    this.visibleCandidates = filterAgentMentionCandidates(this.candidates, this.query.query);
    this.selectedIndex = Math.min(
      this.selectedIndex,
      Math.max(0, this.visibleCandidates.length - 1),
    );
    this.status = this.visibleCandidates.length > 0
      ? 'idle'
      : getEmptyAgentMentionMenuStatus(this.candidates);
  }
}

export function filterAgentMentionCandidates(
  candidates: AgentMentionCandidate[],
  query: string,
): AgentMentionCandidate[] {
  const visibleCandidates = candidates.filter((candidate) =>
    !candidate.hidden && (candidate.mode === 'subagent' || candidate.mode === 'all'));
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return visibleCandidates;
  }

  return visibleCandidates
    .map((candidate) => ({
      candidate,
      score: scoreAgentMentionCandidate(candidate, normalizedQuery),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.candidate);
}

function scoreAgentMentionCandidate(
  candidate: AgentMentionCandidate,
  normalizedQuery: string,
): number {
  const fields = [
    { value: candidate.id, weight: 100 },
    { value: candidate.displayName ?? '', weight: 80 },
    { value: candidate.description ?? '', weight: 20 },
  ];

  return fields.reduce((bestScore, field) => {
    const value = field.value.trim().toLowerCase();
    if (!value) {
      return bestScore;
    }
    if (value.startsWith(normalizedQuery)) {
      return Math.max(bestScore, field.weight + normalizedQuery.length);
    }
    if (value.includes(normalizedQuery)) {
      return Math.max(bestScore, Math.floor(field.weight / 2));
    }
    return bestScore;
  }, 0);
}

function getEmptyAgentMentionMenuStatus(
  candidates: AgentMentionCandidate[],
): SlashCommandMenuStatus {
  return candidates.length === 0 ? 'emptyCatalog' : 'noMatches';
}

function scrollSelectedItemIntoView(menuEl: HTMLElement | null): void {
  const selectedEl = menuEl?.querySelector<HTMLElement>(
    '.opencodian-slash-command-menu-item.is-selected',
  );
  if (selectedEl && typeof selectedEl.scrollIntoView === 'function') {
    selectedEl.scrollIntoView({ block: 'nearest' });
  }
}

function updateTrackedMentionRanges(
  mentions: TrackedAgentMention[],
  previousContent: string,
  nextContent: string,
): TrackedAgentMention[] {
  const edit = findSingleTextEdit(previousContent, nextContent);
  const delta = edit.insertedLength - edit.removedLength;

  return mentions.flatMap((mention) => {
    if (edit.start >= mention.end) {
      return [mention];
    }

    if (edit.end <= mention.start) {
      return [{
        ...mention,
        start: mention.start + delta,
        end: mention.end + delta,
      }];
    }

    return [];
  });
}

function findSingleTextEdit(
  previousContent: string,
  nextContent: string,
): { start: number; end: number; removedLength: number; insertedLength: number } {
  let prefixLength = 0;
  const maxPrefixLength = Math.min(previousContent.length, nextContent.length);
  while (
    prefixLength < maxPrefixLength
    && previousContent[prefixLength] === nextContent[prefixLength]
  ) {
    prefixLength += 1;
  }

  let previousSuffixIndex = previousContent.length;
  let nextSuffixIndex = nextContent.length;
  while (
    previousSuffixIndex > prefixLength
    && nextSuffixIndex > prefixLength
    && previousContent[previousSuffixIndex - 1] === nextContent[nextSuffixIndex - 1]
  ) {
    previousSuffixIndex -= 1;
    nextSuffixIndex -= 1;
  }

  return {
    start: prefixLength,
    end: previousSuffixIndex,
    removedLength: previousSuffixIndex - prefixLength,
    insertedLength: nextSuffixIndex - prefixLength,
  };
}

function isAgentMentionTokenBoundary(content: string, start: number, end: number): boolean {
  const before = start === 0 || /[\s([{"']/.test(content[start - 1] ?? '');
  const after = end === content.length || /[\s.,!?;:)\]}"']/.test(content[end] ?? '');
  return before && after;
}

function isAtomicMentionEditKey(event: KeyboardEvent): boolean {
  if (event.metaKey || event.ctrlKey || event.altKey) {
    return false;
  }

  return event.key === 'Backspace' || event.key === 'Delete' || isPrintableEditKey(event.key);
}

function isPrintableEditKey(key: string): boolean {
  return key.length === 1;
}
