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
 * (`execCommandApproval` / `applyPatchApproval` legacy routes plus the
 * 0.159.0 `item/commandExecution/requestApproval`,
 * `item/fileChange/requestApproval`, and `item/permissions/requestApproval`
 * v2 routes), distinct from Claude Code's synchronous inline canUseTool
 * bridge.  The UI reuse path is the existing `showQuestionDialog` inline-card
 * flow with `applyResolution: false` so the question runtime collects a user
 * choice without trying to reply to a backend question.  The same context
 * also carries the question-card renderer for `item/tool/requestUserInput`
 * and the elicitation renderer for `mcpServer/elicitation/request`.
 */

import type { QuestionRequest } from '../../types';
import type {
  CodexApprovalBridgeHost,
  CodexApprovalDecision,
  CodexApprovalRequest,
  CodexApprovalResolutionResult,
} from './CodexAdapter';
import type { CodexElicitationCardRenderer } from './CodexElicitationBridge';

export type { CodexApprovalResolutionResult } from './CodexAdapter';

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
 * UI renderer for the dynamic `item/tool/requestUserInput` route: the bridge
 * hands over a ready `QuestionRequest` (one prompt per server question) and
 * receives the raw inline-card resolution result.
 */
export interface CodexQuestionCardRenderer {
  collectResponse(
    request: QuestionRequest,
    tabId: string | null,
  ): Promise<CodexApprovalResolutionResult>;
}

/**
 * Mutable host context owned by the plugin.  The view populates the renderers
 * on mount; the factories read them dynamically.  One context object serves
 * the approval bridge, the tool-user-input question seam, and the MCP
 * elicitation bridge.
 */
export interface CodexApprovalHostContext {
  getActiveTabId: () => string | null;
  approvalCardRenderer?: CodexApprovalCardRenderer;
  questionCardRenderer?: CodexQuestionCardRenderer;
  elicitationCardRenderer?: CodexElicitationCardRenderer;
}

/** Option labels used in the generated `QuestionRequest`. */
const APPROVE_LABEL = 'Approve';
const APPROVE_SESSION_LABEL = 'Approve for session';
const DENY_LABEL = 'Deny';
/** v2 `commandExecution`: adopt the server-proposed execpolicy rules. */
const APPROVE_WITH_RULES_LABEL = 'Approve and adopt suggested rules';
/** v2 `commandExecution`: persist an allow/deny rule for one host. */
const networkRuleLabel = (action: string, host: string): string =>
  `Apply network rule: ${action} ${host}`;

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

    async collectQuestionAnswers(
      request: QuestionRequest,
    ): Promise<CodexApprovalResolutionResult | null> {
      const ctx = getContext();
      if (!ctx.questionCardRenderer) {
        return null;
      }
      const tabId = ctx.getActiveTabId();
      return ctx.questionCardRenderer.collectResponse(request, tabId);
    },
  };
}

/**
 * Build a `QuestionRequest` from a `CodexApprovalRequest` so the existing
 * inline-card / `showQuestionDialog` UI can present it.
 *
 * Mirrors `buildClaudeCodeElicitationQuestionRequest` but for the Codex
 * approval model: the question text distinguishes command-execution,
 * file-change, and permission-profile approvals, and the options map to the
 * scalar / object `ReviewDecision` values the bridge can reply with.  The
 * base trio (Approve / Approve for session / Deny) always renders; the v2
 * amendment options appear only when the server proposed them.
 */
export function buildCodexApprovalQuestionRequest(
  request: CodexApprovalRequest,
): QuestionRequest {
  const question =
    request.kind === 'execCommand' || request.kind === 'commandExecution'
      ? request.cwd
        ? `Codex wants to run: \`${request.command ?? request.summary}\` (in ${request.cwd})`
        : `Codex wants to run: \`${request.command ?? request.summary}\``
      : request.kind === 'permissions'
        ? `Codex requests additional permissions${request.cwd ? ` in ${request.cwd}` : ''}${request.reason ? `: ${request.reason}` : ''}`
        : `Codex wants to apply ${request.summary}`;

  const options: QuestionRequest['questions'][number]['options'] = [
    { label: APPROVE_LABEL, description: '' },
    { label: APPROVE_SESSION_LABEL, description: '' },
    { label: DENY_LABEL, description: '' },
  ];
  if (request.proposedExecpolicyAmendment && request.proposedExecpolicyAmendment.length > 0) {
    options.push({
      label: APPROVE_WITH_RULES_LABEL,
      description: request.proposedExecpolicyAmendment.join('\n'),
    });
  }
  for (const amendment of request.proposedNetworkPolicyAmendments ?? []) {
    options.push({
      label: networkRuleLabel(amendment.action, amendment.host),
      description: request.reason ?? '',
    });
  }

  return {
    id: `codex-approval-${Date.now()}`,
    sessionId: 'codex',
    questions: [
      {
        question,
        header: 'Codex approval',
        options,
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
 *
 * The v2 amendment options are matched structurally against the originating
 * request, so a stale or forged label can never fabricate an amendment the
 * server did not propose.
 */
export function mapCodexApprovalResolution(
  result: CodexApprovalResolutionResult,
  request?: CodexApprovalRequest,
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
    case APPROVE_WITH_RULES_LABEL:
      if (request?.proposedExecpolicyAmendment && request.proposedExecpolicyAmendment.length > 0) {
        return {
          decision: 'accept_with_execpolicy_amendment',
          execpolicyAmendment: request.proposedExecpolicyAmendment,
        };
      }
      return { decision: 'denied' };
    default:
      break;
  }
  for (const amendment of request?.proposedNetworkPolicyAmendments ?? []) {
    if (label === networkRuleLabel(amendment.action, amendment.host)) {
      return {
        decision: 'apply_network_policy_amendment',
        networkPolicyAmendment: { action: amendment.action, host: amendment.host },
      };
    }
  }
  return { decision: 'denied' };
}
