import type { ChildSessionGraph, ChildSessionInfo } from '../../../core/agents';
import { ChildSessionGraphService } from '../../../core/agents';
import type { Conversation } from '../../../core/types';

export interface ChildSessionGraphCoordinatorHost {
  getCurrentConversation(): Conversation | null;
  getSessionChildren(sessionId: string): Promise<ChildSessionInfo[]>;
  onGraphUpdated(graph: ChildSessionGraph): void;
}

export class ChildSessionGraphCoordinator {
  private readonly service = new ChildSessionGraphService();
  private currentGraph: ChildSessionGraph | null = null;

  constructor(private readonly host: ChildSessionGraphCoordinatorHost) {}

  getGraph(): ChildSessionGraph | null {
    return this.currentGraph;
  }

  async refreshGraph(): Promise<ChildSessionGraph | null> {
    const conversation = this.host.getCurrentConversation();
    if (!conversation?.openCodeSessionId) {
      this.currentGraph = null;
      return null;
    }

    let childSessions: ChildSessionInfo[] | undefined;
    try {
      childSessions = await this.host.getSessionChildren(conversation.openCodeSessionId);
    } catch {
      childSessions = undefined;
    }

    const graph = this.service.reconstructGraph({
      parentSessionId: conversation.openCodeSessionId,
      messages: conversation.messages,
      childSessions,
    });

    this.currentGraph = graph;
    this.host.onGraphUpdated(graph);
    return graph;
  }

  clearGraph(): void {
    this.currentGraph = null;
  }
}
