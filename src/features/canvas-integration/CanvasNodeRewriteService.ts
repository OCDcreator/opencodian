/**
 * CanvasNodeRewriteService — the read-only aux rewrite for one canvas node
 * (R-C5, flowtext-c5-design §3.4).
 *
 * Contract discipline, unchanged from inline edit:
 * - the ONLY AI channel is `AgentAuxQueryCapability.startAuxQuerySession()`
 *   (provably read-only at runtime; §6.1 — never weakened here);
 * - the response is parsed with the audited inline-edit response parser
 *   (`parseInlineEditResponse`, `<replacement>` protocol), so the reply must
 *   be exactly the node's new content — clarification when no tag;
 * - `findWriteToolCalls` stays a BLOCKING audit: any write-class tool call
 *   discards the whole turn and disposes the session;
 * - the service never writes: it returns a preview, the controller shows the
 *   confirm modal, and only then a core.canvas write function runs.
 *
 * One short-lived session per rewrite, disposed on every exit path.
 */

import {
  type AgentAuxQueryCapability,
  type AuxQueryResult,
  type AuxQuerySession,
  type BackendModelSelection,
  findWriteToolCalls,
} from '../../core/agents/backend/AgentAuxQueryCapability';
import type { AgentBackendKind } from '../../core/types/chat';
import { parseInlineEditResponse } from '../inline-edit/InlineEditPrompt';

/** Longest node content the request may embed (fail-closed over-limit refusal). */
export const CANVAS_NODE_REWRITE_MAX_CONTENT_CHARS = 20_000;

/**
 * Narrow adapter slice the rewrite needs (satisfied structurally by the
 * inline-edit plugin host's resolved adapter — composition injects it).
 */
export interface CanvasRewriteAdapter {
  readonly kind: AgentBackendKind;
  readonly displayName: string;
  /** Aux capability, or `null` when the backend cannot prove read-only execution. */
  getAuxQuery(): AgentAuxQueryCapability | null;
  resolveModel(): { ok: true; model: BackendModelSelection | null } | { ok: false; error: string };
  getEffort(): string | null;
}

/** Resolved aux session inputs, injected by composition (main.ts) per action. */
export interface CanvasAuxTarget {
  readonly adapter: CanvasRewriteAdapter;
  readonly workingDirectory: string;
}

/** What the service needs to run one rewrite. */
export interface CanvasNodeRewriteServiceConfig {
  readonly adapter: CanvasRewriteAdapter;
  readonly workingDirectory: string;
  readonly locale: 'en' | 'zh';
  readonly signal?: AbortSignal;
}

/** The node content being rewritten (already read; the service does no vault IO). */
export interface CanvasRewriteInput {
  /** Canvas file path, shown to the model for orientation only. */
  readonly canvasPath: string;
  readonly nodeType: 'text' | 'file';
  /** The node's full current content (file nodes: the whole note). */
  readonly content: string;
  /** The user's rewrite instruction. */
  readonly instruction: string;
}

export type CanvasRewriteOutcome =
  | { readonly status: 'preview'; readonly text: string }
  | { readonly status: 'clarification'; readonly text: string }
  | { readonly status: 'error'; readonly reason: string; readonly detail?: string };

const SYSTEM_PROMPT_EN = [
  'You rewrite the content of a single Obsidian Canvas node. The user gives one instruction and one node body; you reply with the node\'s new content.',
  '',
  'Output contract — follow it exactly:',
  '- Reply with exactly one <replacement>...</replacement> tag holding the COMPLETE new node content.',
  '- To ask a question or ask for clarification, reply with plain prose and NO tag.',
  'Never emit more than one tag. Never nest tags. Never wrap the tag in markdown fences.',
  'The tag body is used verbatim, so put nothing in it but the final content.',
  '',
  'Editing rules:',
  '- Rewrite only what the instruction asks for. Do not expand a node into a long document.',
  '- When the instruction asks for a Mermaid diagram, output exactly one ```mermaid code block and nothing else inside the tag.',
  '- Preserve the node\'s language. Keep the reply as short as the request allows.',
  '',
  'You have read-only tools; you never create, modify, or delete anything — the caller applies your result.',
].join('\n');

const SYSTEM_PROMPT_ZH = [
  '你负责改写单个 Obsidian Canvas 节点的内容。用户给出一条指令和一个节点正文，你回复该节点的新内容。',
  '',
  '输出契约——必须严格遵守：',
  '- 只回复一个 <replacement>...</replacement> 标签，标签内是完整的节点新内容。',
  '- 需要提问或澄清时，直接用纯文本回复，不要使用任何标签。',
  '禁止输出多个标签，禁止标签嵌套，禁止用 markdown 代码块包裹标签本身。',
  '标签内的内容会被原样使用，因此只能放最终内容。',
  '',
  '改写要求：',
  '- 只改指令要求的部分，不要把一个节点扩写成长文。',
  '- 指令要求生成 Mermaid 图时，标签内输出且仅输出一个 ```mermaid 代码块。',
  '- 保持节点原有语言。回复尽量简短。',
  '',
  '你只有只读工具；不能创建、修改或删除任何东西——结果由调用方应用。',
].join('\n');

export function buildCanvasNodeRewriteSystemPrompt(locale: 'en' | 'zh'): string {
  return locale === 'zh' ? SYSTEM_PROMPT_ZH : SYSTEM_PROMPT_EN;
}

/**
 * Build the user turn. The node body rides in a `<canvas_node>` block; a body
 * containing a literal `</replacement>` would break the response protocol's
 * mirror image... actually it breaks the REQUEST block's own tag, so both
 * collisions are rejected fail-closed (same rule as inline edit §6.1).
 */
export function buildCanvasNodeRewriteRequest(
  input: CanvasRewriteInput,
): { ok: true; prompt: string } | { ok: false; error: string } {
  const instruction = input.instruction.trim();
  if (!instruction) {
    return { ok: false, error: 'empty-instruction' };
  }
  if (input.content.length > CANVAS_NODE_REWRITE_MAX_CONTENT_CHARS) {
    return { ok: false, error: 'content-too-long' };
  }
  if (input.content.includes('</canvas_node>') || input.content.includes('</replacement>')) {
    return { ok: false, error: 'protocol-tag-in-content' };
  }
  const prompt = [
    instruction,
    '',
    `<canvas_node path="${input.canvasPath}" nodeType="${input.nodeType}">`,
    input.content,
    '</canvas_node>',
  ].join('\n');
  return { ok: true, prompt };
}

export class CanvasNodeRewriteService {
  private session: AuxQuerySession | null = null;
  private disposed = false;

  constructor(private readonly config: CanvasNodeRewriteServiceConfig) {}

  /**
   * Run one rewrite turn. Resolves with a preview outcome; nothing is ever
   * written by this call. The session is disposed on every exit path.
   */
  async rewrite(input: CanvasRewriteInput): Promise<CanvasRewriteOutcome> {
    if (this.disposed) {
      return { status: 'error', reason: 'service-disposed' };
    }
    const built = buildCanvasNodeRewriteRequest(input);
    if (!built.ok) {
      await this.dispose();
      return { status: 'error', reason: built.error };
    }
    try {
      const session = await this.ensureSession();
      if ('status' in session) {
        await this.dispose();
        return session;
      }
      const signal = this.config.signal;
      const result = await session.query({
        prompt: built.prompt,
        ...(signal ? { signal } : {}),
      });
      return await this.consume(result);
    } catch (error) {
      return {
        status: 'error',
        reason: 'session-unavailable',
        detail: error instanceof Error ? error.message : String(error),
      };
    } finally {
      // One short-lived session per rewrite: never leak native state.
      await this.dispose();
    }
  }

  /** Idempotent teardown of the native session. */
  async dispose(): Promise<void> {
    this.disposed = true;
    const session = this.session;
    this.session = null;
    if (!session) {
      return;
    }
    try {
      await session.dispose();
    } catch {
      // Teardown is best-effort; the turn result is already decided.
    }
  }

  private async ensureSession(): Promise<AuxQuerySession | CanvasRewriteOutcome> {
    const capability = this.config.adapter.getAuxQuery();
    if (!capability) {
      return {
        status: 'error',
        reason: 'capability-unavailable',
        detail: this.config.adapter.kind,
      };
    }
    const resolved = this.config.adapter.resolveModel();
    if (!resolved.ok) {
      return { status: 'error', reason: 'model-unavailable', detail: resolved.error };
    }
    const effort = this.config.adapter.getEffort();
    this.session = await capability.startAuxQuerySession({
      systemPrompt: buildCanvasNodeRewriteSystemPrompt(this.config.locale),
      workingDirectory: this.config.workingDirectory,
      ...(resolved.model ? { model: resolved.model } : {}),
      ...(effort ? { effort } : {}),
    });
    return this.session;
  }

  /** Apply the response contract plus the blocking write audit. */
  private async consume(result: AuxQueryResult): Promise<CanvasRewriteOutcome> {
    if (!result.success) {
      if (result.cancelled) {
        return { status: 'error', reason: 'cancelled' };
      }
      return { status: 'error', reason: 'turn-failed', detail: result.error };
    }
    // §5.5 rule 2 (inline edit contract): any write-class tool invalidates the
    // whole turn — the result is discarded, never previewed.
    const violations = findWriteToolCalls(result.toolCalls);
    if (violations.length > 0) {
      return { status: 'error', reason: 'write-tool-observed', detail: violations.join(', ') };
    }
    const parsed = parseInlineEditResponse(result.text);
    switch (parsed.kind) {
      case 'replacement':
        return { status: 'preview', text: parsed.text };
      case 'clarification':
        return { status: 'clarification', text: parsed.text };
      default:
        // 'insertion' (wrong protocol tag for this flow) and parser errors.
        return {
          status: 'error',
          reason: parsed.kind === 'error' ? parsed.error : 'unexpected-protocol',
        };
    }
  }
}
