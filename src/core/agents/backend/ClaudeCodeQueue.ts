/**
 * Async queue and helper types for Claude Code persistent query streaming.
 *
 * @module claude-code-queue
 */

export interface ClaudeCodeQueuedPrompt {
  type: 'user';
  message: { role: 'user'; content: string };
}

export interface ClaudeCodeSessionRuntime {
  input: ClaudeCodeAsyncQueue<ClaudeCodeQueuedPrompt>;
  output: ClaudeCodeAsyncQueue<ClaudeCodeRuntimeOutput>;
  normalizer: import('./ClaudeCodeStreamNormalizer').ClaudeCodeStreamNormalizer;
  abortController: AbortController;
  effort?: string;
  query?: AsyncIterable<unknown> & {
    interrupt?: () => Promise<void>;
    setModel?: (model?: string) => Promise<void>;
    setPermissionMode?: (mode: string) => Promise<void>;
    setMcpServers?: (servers: Record<string, unknown>) => Promise<unknown>;
    rewindFiles?: (userMessageId: string, options?: { dryRun?: boolean }) => Promise<unknown>;
    supportedModels?: () => Promise<Array<{
      id?: string;
      name?: string;
      provider?: string;
      value?: string;
      displayName?: string;
    }>>;
    close?: () => void;
  };
  closed: boolean;
}

export type ClaudeCodeRuntimeOutput =
  | { type: 'message'; message: unknown }
  | { type: 'error'; error: unknown };

export class ClaudeCodeAsyncQueue<T> implements AsyncIterable<T> {
  private readonly values: T[] = [];
  private readonly waiters: Array<(result: IteratorResult<T>) => void> = [];
  private closed = false;

  push(value: T): void {
    if (this.closed) {
      return;
    }

    const waiter = this.waiters.shift();
    if (waiter) {
      waiter({ value, done: false });
      return;
    }
    this.values.push(value);
  }

  close(): void {
    if (this.closed) {
      return;
    }

    this.closed = true;
    for (const waiter of this.waiters.splice(0)) {
      waiter({ value: undefined, done: true });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => this.next(),
    };
  }

  private next(): Promise<IteratorResult<T>> {
    const value = this.values.shift();
    if (value !== undefined) {
      return Promise.resolve({ value, done: false });
    }
    if (this.closed) {
      return Promise.resolve({ value: undefined, done: true });
    }
    return new Promise((resolve) => this.waiters.push(resolve));
  }
}

export function createSessionId(): string {
  return `claude-code-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createUserPrompt(prompt: string): ClaudeCodeQueuedPrompt {
  return {
    type: 'user',
    message: {
      role: 'user',
      content: prompt,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isTurnBoundaryMessage(message: unknown): boolean {
  return isRecord(message) && message.type === 'result';
}

export function isPromptSuggestionMessage(message: unknown): boolean {
  return isRecord(message) && message.type === 'prompt_suggestion';
}
