import type {
  ChildSessionEdge,
  ChildSessionEdgeStatus,
  ChildSessionGraph,
  ChildSessionGraphInput,
  ChildSessionGraphStatus,
  ChildSessionInfo,
  OrphanedChildSession,
} from './types';

/**
 * Reconstructs task → child-session edges from persisted metadata and
 * optionally cross-references with `session.children()` to detect
 * orphaned children.
 *
 * This is a pure-function service: callers provide persisted messages
 * and optional live child session data; the service returns a
 * `ChildSessionGraph` without performing any I/O or side effects.
 *
 * Data sources (in priority order):
 * 1. **Persisted task metadata** — `toolMetadata.sessionId` on task tool
 *    content blocks / tool calls in messages
 * 2. **Live child sessions** — `session.children()` results to detect
 *    orphaned children not matched to any persisted edge
 */
export class ChildSessionGraphService {
  /**
   * Reconstruct the child-session graph for a parent session.
   *
   * Scans all messages for task tool calls carrying `sessionId` in their
   * metadata, builds edges, then cross-references with live child session
   * data (when provided) to detect orphans.
   */
  reconstructGraph(input: ChildSessionGraphInput): ChildSessionGraph {
    const { parentSessionId, messages, childSessions } = input;
    const edges: ChildSessionEdge[] = [];

    for (const message of messages) {
      if (message.contentBlocks) {
        for (const block of message.contentBlocks) {
          if (this.isTaskToolBlock(block)) {
            const edge = this.tryBuildEdgeFromBlock(parentSessionId, message.id, block);
            if (edge) {
              edges.push(edge);
            }
          }
        }
      }

      if (message.toolCalls) {
        for (const toolCall of message.toolCalls) {
          if (this.isTaskToolCall(toolCall)) {
            const edge = this.tryBuildEdgeFromToolCall(parentSessionId, message.id, toolCall);
            if (edge) {
              edges.push(edge);
            }
          }
        }
      }
    }

    const deduplicatedEdges = this.deduplicateEdges(edges);
    const enrichedEdges = this.enrichEdgesWithChildSessions(deduplicatedEdges, childSessions);
    const orphanedSessions = this.findOrphanedSessions(enrichedEdges, childSessions);
    const orphanedSessionIds = orphanedSessions.map((session) => session.id);
    const status = this.computeGraphStatus(enrichedEdges, orphanedSessionIds);

    return {
      parentSessionId,
      edges: Object.freeze(enrichedEdges),
      orphanedSessions: Object.freeze(orphanedSessions),
      orphanedSessionIds: Object.freeze(orphanedSessionIds),
      status,
    };
  }

  private isTaskToolBlock(
    block: { readonly type: string; readonly toolKind?: string; readonly toolName?: string },
  ): boolean {
    if (block.type !== 'tool_use') {
      return false;
    }

    return block.toolKind === 'task'
      || this.canonicalizeToolName(block.toolName) === 'task';
  }

  private isTaskToolCall(
    toolCall: { readonly name: string; readonly kind?: string },
  ): boolean {
    return toolCall.kind === 'task'
      || this.canonicalizeToolName(toolCall.name) === 'task';
  }

  private canonicalizeToolName(name: string | undefined): string {
    return typeof name === 'string'
      ? name.toLowerCase().replace(/[^a-z0-9]/g, '')
      : '';
  }

  private tryBuildEdgeFromBlock(
    parentSessionId: string,
    messageId: string,
    block: {
      readonly toolId?: string;
      readonly toolMetadata?: Record<string, unknown>;
      readonly toolInput?: Record<string, unknown>;
      readonly toolStatus?: string;
    },
  ): ChildSessionEdge | null {
    if (!block.toolId) {
      return null;
    }

    const sessionId = this.extractSessionId(block.toolMetadata);
    if (!sessionId) {
      return null;
    }

    return this.buildEdge(
      {
        parentSessionId,
        parentMessageId: messageId,
        toolCallId: block.toolId,
        childSessionId: sessionId,
      },
      block.toolInput,
      block.toolStatus,
    );
  }

  private tryBuildEdgeFromToolCall(
    parentSessionId: string,
    messageId: string,
    toolCall: {
      readonly id: string;
      readonly toolMetadata?: Record<string, unknown>;
      readonly input: Record<string, unknown>;
      readonly status?: string;
    },
  ): ChildSessionEdge | null {
    const sessionId = this.extractSessionId(toolCall.toolMetadata);
    if (!sessionId) {
      return null;
    }

    return this.buildEdge(
      {
        parentSessionId,
        parentMessageId: messageId,
        toolCallId: toolCall.id,
        childSessionId: sessionId,
      },
      toolCall.input,
      toolCall.status,
    );
  }

  private buildEdge(
    identity: {
      readonly parentSessionId: string;
      readonly parentMessageId: string;
      readonly toolCallId: string;
      readonly childSessionId: string;
    },
    input: Record<string, unknown> | undefined,
    toolStatus: string | undefined,
  ): ChildSessionEdge {
    const subagentId = typeof input?.subagent_type === 'string' && input.subagent_type.trim().length > 0
      ? input.subagent_type.trim()
      : undefined;

    const description = typeof input?.description === 'string' && input.description.trim().length > 0
      ? input.description.trim()
      : typeof input?.prompt === 'string' && input.prompt.trim().length > 0
        ? input.prompt.trim()
        : undefined;

    const title = subagentId && description
      ? `${subagentId} · ${description}`
      : subagentId ?? description;

    return {
      ...identity,
      subagentId,
      description,
      status: this.resolveEdgeStatus(toolStatus),
      title,
    };
  }

  private extractSessionId(
    toolMetadata: Record<string, unknown> | undefined,
  ): string | null {
    if (!toolMetadata || typeof toolMetadata.sessionId !== 'string') {
      return null;
    }

    const trimmed = toolMetadata.sessionId.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private resolveEdgeStatus(toolStatus: string | undefined): ChildSessionEdgeStatus {
    if (!toolStatus) {
      return 'unknown';
    }

    switch (toolStatus) {
      case 'completed':
        return 'completed';
      case 'running':
      case 'pending':
        return 'active';
      case 'error':
      case 'blocked':
        return 'error';
      default:
        return 'unknown';
    }
  }

  private deduplicateEdges(edges: readonly ChildSessionEdge[]): ChildSessionEdge[] {
    const deduplicated = new Map<string, ChildSessionEdge>();

    for (const edge of edges) {
      if (!deduplicated.has(edge.childSessionId)) {
        deduplicated.set(edge.childSessionId, edge);
      }
    }

    return Array.from(deduplicated.values());
  }

  private enrichEdgesWithChildSessions(
    edges: readonly ChildSessionEdge[],
    childSessions: readonly ChildSessionInfo[] | undefined,
  ): ChildSessionEdge[] {
    if (!childSessions || childSessions.length === 0) {
      return [...edges];
    }

    const childSessionsById = new Map(childSessions.map((childSession) => [childSession.id, childSession]));

    return edges.map((edge) => {
      const childSession = childSessionsById.get(edge.childSessionId);
      if (!childSession) {
        return edge;
      }

      return {
        ...edge,
        title: edge.title ?? childSession.title,
        lastUpdatedAt: edge.lastUpdatedAt ?? childSession.updatedAt ?? childSession.createdAt,
      };
    });
  }

  private findOrphanedSessions(
    edges: readonly ChildSessionEdge[],
    childSessions: readonly ChildSessionInfo[] | undefined,
  ): OrphanedChildSession[] {
    if (!childSessions || childSessions.length === 0) {
      return [];
    }

    const matchedIds = new Set(edges.map((edge) => edge.childSessionId));
    return childSessions
      .filter((childSession) => !matchedIds.has(childSession.id))
      .map((childSession) => ({
        id: childSession.id,
        title: childSession.title,
        createdAt: childSession.createdAt,
        updatedAt: childSession.updatedAt,
      }));
  }

  private computeGraphStatus(
    edges: readonly ChildSessionEdge[],
    orphanedSessionIds: readonly string[],
  ): ChildSessionGraphStatus {
    if (edges.length === 0 && orphanedSessionIds.length === 0) {
      return 'empty';
    }

    if (orphanedSessionIds.length > 0) {
      return 'partial';
    }

    return 'complete';
  }
}
