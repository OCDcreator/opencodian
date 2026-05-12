import type { StreamChunk } from '../types/chat';

export function translateAcpMessageChunk(text: string, partId?: string): StreamChunk {
  if (partId) {
    return { type: 'thinking', content: text, partId };
  }
  return { type: 'text', content: text };
}

export function translateAcpToolCall(
  name: string,
  id: string,
  input: Record<string, unknown>,
): StreamChunk {
  return {
    type: 'tool_use',
    id,
    name,
    input,
  };
}

export function translateAcpToolCallUpdate(
  id: string,
  output: string,
  isError = false,
): StreamChunk {
  return {
    type: 'tool_result',
    toolUseId: id,
    content: output,
    isError,
  };
}

export class AcpTransportOwner {
  private aborted = false;

  constructor(
    private readonly sendMessageToAcp: (sessionId: string, message: string) => Promise<void>,
    private readonly createSession: () => Promise<string>,
    private readonly onNotification: (handler: (notification: AcpNotification) => void) => () => void,
  ) {}

  async *sendMessage(message: string, sessionId?: string): AsyncGenerator<StreamChunk> {
    this.aborted = false;

    let acpSessionId: string;
    try {
      acpSessionId = sessionId ?? await this.createSession();
    } catch (error) {
      yield { type: 'error', content: `ACP session creation failed: ${String(error)}` };
      return;
    }

    const chunks: StreamChunk[] = [];
    let resolveChunk: (() => void) | null = null;
    let done = false;

    const wake = (): void => {
      if (resolveChunk) {
        resolveChunk();
        resolveChunk = null;
      }
    };

    const unsubscribe = this.onNotification((notification) => {
      const chunk = this.translateNotification(notification);
      if (chunk) {
        chunks.push(chunk);
        wake();
      }
      if (notification.type === 'done') {
        done = true;
        wake();
      }
    });

    yield { type: 'message_start' };

    try {
      await this.sendMessageToAcp(acpSessionId, message);

      while (!done && !this.aborted) {
        const nextChunk = chunks.shift();
        if (nextChunk) {
          yield nextChunk;
          continue;
        }
        await new Promise<void>((resolve) => {
          resolveChunk = resolve;
        });
      }

      for (let nextChunk = chunks.shift(); nextChunk; nextChunk = chunks.shift()) {
        yield nextChunk;
      }

      yield { type: 'message_stop' };
    } catch (error) {
      yield { type: 'error', content: `ACP error: ${String(error)}` };
    } finally {
      unsubscribe();
    }
  }

  abort(): void {
    this.aborted = true;
  }

  private translateNotification(notification: AcpNotification): StreamChunk | null {
    switch (notification.type) {
      case 'text':
        return translateAcpMessageChunk(notification.text);
      case 'thinking':
        return translateAcpMessageChunk(notification.text, notification.partId);
      case 'tool_call':
        return translateAcpToolCall(notification.name, notification.id, notification.input);
      case 'tool_call_update':
        return translateAcpToolCallUpdate(
          notification.id,
          notification.output ?? '',
          notification.status === 'error',
        );
      case 'usage':
        return {
          type: 'usage',
          inputTokens: notification.inputTokens,
          outputTokens: notification.outputTokens,
        };
      case 'permission_request':
        return {
          type: 'permission_request',
          id: notification.id,
          permission: notification.tool,
          patterns: notification.patterns,
          metadata: {},
          always: [],
        };
      case 'done':
        return null;
    }
  }
}

type AcpNotification =
  | { type: 'text'; text: string }
  | { type: 'thinking'; text: string; partId?: string }
  | { type: 'tool_call'; name: string; id: string; input: Record<string, unknown> }
  | { type: 'tool_call_update'; id: string; status: string; output?: string }
  | { type: 'usage'; inputTokens: number; outputTokens: number }
  | { type: 'permission_request'; id: string; tool: string; patterns: string[] }
  | { type: 'done' };
