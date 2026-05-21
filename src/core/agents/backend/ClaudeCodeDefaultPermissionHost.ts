/**
 * Default host implementation for ClaudeCodePermissionBridge.
 *
 * Connects the bridge to OpenCodian's existing permission and question
 * inline card renderers when the chat view is active.
 *
 * When no UI context is available (e.g. background tasks, reload),
 * the host returns null and the bridge denies the request gracefully.
 */

import type { PermissionReply, QuestionRequest, StreamChunk } from '../../types';
import type { ClaudeCodeApprovalDecision, ClaudeCodeCanUseToolContext, ClaudeCodeQuestionDecision } from './ClaudeCodePermissionBridge';

type PermissionRequestChunk = Extract<StreamChunk, { type: 'permission_request' }>;

export interface ClaudeCodePermissionCardRenderer {
  collectResponse(request: PermissionRequestChunk, tabId: string | null): Promise<'once' | 'always' | 'session' | 'reject' | null>;
}

export interface ClaudeCodeQuestionCardRenderer {
  collectResponse(request: QuestionRequest, tabId: string | null): Promise<string[][] | null>;
}

export interface ClaudeCodeElicitationCardRenderer {
  collectResponse(request: QuestionRequest, tabId: string | null): Promise<{ action: 'accept' | 'decline' | 'cancel'; content?: Record<string, unknown>; answers?: string[][] } | null>;
}

export interface ClaudeCodePermissionBridgeHostContext {
  getActiveTabId: () => string | null;
  permissionCardRenderer?: ClaudeCodePermissionCardRenderer;
  questionCardRenderer?: ClaudeCodeQuestionCardRenderer;
  elicitationCardRenderer?: ClaudeCodeElicitationCardRenderer;
}

function mapCardResultToReply(result: 'once' | 'always' | 'session' | 'reject'): PermissionReply {
  switch (result) {
    case 'always':
      return 'always';
    case 'session':
      return 'session';
    case 'once':
      return 'once';
    case 'reject':
      return 'reject';
  }
}

export function createClaudeCodePermissionBridgeHost(
  getContext: () => ClaudeCodePermissionBridgeHostContext,
): { collectToolApproval: NonNullable<import('./ClaudeCodePermissionBridge').ClaudeCodePermissionBridgeHost['collectToolApproval']>; collectQuestionAnswers: NonNullable<import('./ClaudeCodePermissionBridge').ClaudeCodePermissionBridgeHost['collectQuestionAnswers']> } {
  return {
    async collectToolApproval(
      request: PermissionRequestChunk,
      _context: ClaudeCodeCanUseToolContext,
    ): Promise<ClaudeCodeApprovalDecision | PermissionReply | null> {
      const ctx = getContext();
      if (!ctx.permissionCardRenderer) {
        return null;
      }

      const tabId = ctx.getActiveTabId();
      const result = await ctx.permissionCardRenderer.collectResponse(request, tabId);
      if (!result) {
        return null;
      }

      return { reply: mapCardResultToReply(result) };
    },

    async collectQuestionAnswers(
      request: QuestionRequest,
      _context: ClaudeCodeCanUseToolContext,
    ): Promise<ClaudeCodeQuestionDecision | string[][] | null> {
      const ctx = getContext();
      if (!ctx.questionCardRenderer) {
        return null;
      }

      const tabId = ctx.getActiveTabId();
      const answers = await ctx.questionCardRenderer.collectResponse(request, tabId);
      if (!answers) {
        return null;
      }

      return { answers };
    },
  };
}
