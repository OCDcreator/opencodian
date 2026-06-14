/**
 * Default host implementation for the Codex server-request approval bridge.
 *
 * Connects `CodexAdapter`'s approval bridge to OpenCodian's existing
 * question / inline-card UI infrastructure when the chat view is active.
 *
 * Mirrors `ClaudeCodeDefaultPermissionHost.ts`: the plugin owns a mutable
 * context object; the view populates its renderer on mount; the factory
 * reads the context dynamically so a view that loses its renderer safely
 * degrades to `denied` (via the adapter bridge default).
 *
 * Codex approvals arrive as async server-push JSON-RPC requests
 * (`execCommandApproval` / `applyPatchApproval`), distinct from Claude
 * Code's synchronous inline canUseTool bridge.  The UI reuse path is the
 * existing `showQuestionDialog` inline-card flow with
 * `applyResolution: false` so the question runtime collects a user choice
 * without trying to reply to a backend question.
 */

import type { QuestionRequest } from '../../types';
import type {
  CodexApprovalBridgeHost,
  CodexApprovalDecision,
  CodexApprovalRequest,
} from './CodexAdapter';

/**
 * UI renderer that surfaces a Codex approval request as an inline card and
 * collects a user decision.  Mirrors the Claude card-renderer pattern but
 * takes a backend-neutral `CodexApprovalRequest` and returns a
 * `CodexApprovalDecision`.
 */
export interface CodexApprovalCardRenderer {
  collectResponse(
    request: CodexApprovalRequest,
    tabId: string | null,
  ): Promise<CodexApprovalDecision | null>;
}

/**
 * Mutable host context owned by the plugin.  The view populates
 * `approvalCardRenderer` on mount; the factory reads it dynamically.
 */
export interface CodexApprovalHostContext {
  getActiveTabId: () => string | null;
  approvalCardRenderer?: CodexApprovalCardRenderer;
}

/**
 * Structural supertype of `QuestionResolutionFlowResult` so this file does
 * not need a cross-layer import from `features/chat/services`.
 */
export interface CodexApprovalResolutionResult {
  status: 'answered' | 'rejected' | 'cancelled';
  answers?: string[][];
}

/** Option labels used in the generated `QuestionRequest`. */
const APPROVE_LABEL = 'Approve';
const APPROVE_SESSION_LABEL = 'Approve for session';
const DENY_LABEL = 'Deny';

/**
 * Create a `CodexApprovalBridgeHost` that reads its renderer from the
 * context lazily on every call.  When the context has no renderer (e.g.
 * the chat view is not active), `collectApproval` returns `null` and the
 * adapter bridge defaults to a safe `denied` decision.
 */
export function createCodexApprovalBridgeHost(
  getContext: () => CodexApprovalHostContext,
): CodexApprovalBridgeHost {
  return {
    async collectApproval(
      request: CodexApprovalRequest,
    ): Promise<CodexApprovalDecision | null> {
      const ctx = getContext();
      if (!ctx.approvalCardRenderer) {
        return null;
      }
      const tabId = ctx.getActiveTabId();
      return ctx.approvalCardRenderer.collectResponse(request, tabId);
    },
  };
}

/**
 * Build a `QuestionRequest` from a `CodexApprovalRequest` so the existing
 * inline-card / `showQuestionDialog` UI can present it.
 *
 * Mirrors `buildClaudeCodeElicitationQuestionRequest` but for the Codex
 * approval model: the question text distinguishes command-execution from
 * file-change approvals, and the three options map to the scalar
 * `ReviewDecision` values the bridge can reply with.
 */
export function buildCodexApprovalQuestionRequest(
  request: CodexApprovalRequest,
): QuestionRequest {
  const question =
    request.kind === 'execCommand'
      ? request.cwd
        ? `Codex wants to run: \`${request.command ?? request.summary}\` (in ${request.cwd})`
        : `Codex wants to run: \`${request.command ?? request.summary}\``
      : `Codex wants to apply ${request.summary}`;

  return {
    id: `codex-approval-${Date.now()}`,
    sessionId: 'codex',
    questions: [
      {
        question,
        header: 'Codex approval',
        options: [
          { label: APPROVE_LABEL, description: '' },
          { label: APPROVE_SESSION_LABEL, description: '' },
          { label: DENY_LABEL, description: '' },
        ],
        multiple: false,
      },
    ],
  };
}

/**
 * Map an inline-card resolution result back to a `CodexApprovalDecision`.
 *
 * - `answered` with a recognized option label → the matching decision.
 * - `answered` with an unrecognized label → `denied` (safe default).
 * - `rejected` → `denied`.
 * - `cancelled` → `null` (the adapter bridge then defaults to `denied`).
 */
export function mapCodexApprovalResolution(
  result: CodexApprovalResolutionResult,
): CodexApprovalDecision | null {
  if (result.status === 'cancelled') {
    return null;
  }
  if (result.status === 'rejected') {
    return { decision: 'denied' };
  }

  const label = result.answers?.[0]?.[0];
  switch (label) {
    case APPROVE_LABEL:
      return { decision: 'approved' };
    case APPROVE_SESSION_LABEL:
      return { decision: 'approved_for_session' };
    case DENY_LABEL:
      return { decision: 'denied' };
    default:
      return { decision: 'denied' };
  }
}
