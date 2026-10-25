import { createHash, randomUUID } from 'node:crypto';

import { AUX_DENIED_CAPABILITIES, type AuxQueryResult, type AuxQuerySafetyProof, type AuxQuerySession,
  type AuxQuerySessionConfig, type AuxQueryTurnRequest } from '../AgentAuxQueryCapability';
import type { DshJsonObject } from './DshAcpClient';

type NativeRequest = (method: string, params: DshJsonObject, timeout?: number) => Promise<DshJsonObject>;
type Subscribe = (id: string, handler: (text: string) => void) => () => void;

/** Stateless native LLM calls with in-memory follow-up context and no Agent/tool dispatcher. */
export class DshAuxQuerySession implements AuxQuerySession {
  readonly queryId: string;
  readonly safety: AuxQuerySafetyProof;
  private disposed = false;
  private busy = false;
  private unregister: (() => void) | null = null;
  private disposal: Promise<void> | null = null;

  private constructor(private readonly nativeId: string, private readonly config: AuxQuerySessionConfig,
    private readonly port: { request: NativeRequest; subscribe: Subscribe }, readonly supportsImages: boolean) {
    this.queryId = `dsh-aux-${randomUUID()}`;
    this.safety = { backend: 'dsh', enforcedPolicy: 'none', effectiveTools: [],
      deniedCapabilities: AUX_DENIED_CAPABILITIES, mechanism: 'Native Harness LLM only; empty tool schemas, no Agent, dispatcher or persistence' };
  }

  static async create(config: AuxQuerySessionConfig, request: NativeRequest, subscribe: Subscribe, preferLowLatency = false): Promise<DshAuxQuerySession> {
    if (config.model && config.model.kind !== 'dsh') throw new Error('DSH auxiliary query requires a DSH model');
    let model: DshJsonObject | undefined;
    if (config.model?.kind === 'dsh') {
      let id = config.model.model;
      if (id.startsWith('[')) {
        const parsed: unknown = JSON.parse(id);
        if (!Array.isArray(parsed) || parsed.length !== 2 || parsed[0] !== config.model.provider || typeof parsed[1] !== 'string')
          throw new Error('Invalid DSH auxiliary model reference');
        id = parsed[1];
      }
      model = { provider: config.model.provider, model: id };
    }
    const result = await request('aux/new', { systemPrompt: config.systemPrompt, ...(model ? { model } : {}),
      ...(config.effort ? { effort: config.effort } : {}), ...(preferLowLatency ? { preferLowLatency: true } : {}) });
    const id = typeof result.queryId === 'string' ? result.queryId : '';
    if (!id || !Array.isArray(result.effectiveTools) || result.effectiveTools.length
      || result.persistence !== false || result.toolDispatcher !== false
      || result.systemPromptSha256 !== createHash('sha256').update(config.systemPrompt).digest('hex')) {
      if (id) await request('aux/close', { queryId: id });
      throw new Error('Harness did not prove a tool-free auxiliary runtime');
    }
    return new DshAuxQuerySession(id, config, { request, subscribe }, result.supportsImages === true);
  }

  async query(turn: AuxQueryTurnRequest): Promise<AuxQueryResult> {
    return this.runDshAuxiliaryTurn(turn, true);
  }

  private async runDshAuxiliaryTurn(turn: AuxQueryTurnRequest, resetContext: boolean): Promise<AuxQueryResult> {
    if (this.disposed || this.busy) return { success: false, error: 'DSH auxiliary session is unavailable or busy' };
    if (turn.images?.length && !this.supportsImages) return { success: false, error: 'Selected DSH auxiliary model does not support images' };
    if (turn.signal?.aborted) return { success: false, error: 'Cancelled', cancelled: true };
    this.busy = true;
    let text = '';
    this.unregister = this.port.subscribe(this.nativeId, (chunk) => { text += chunk; turn.onTextChunk?.(text); });
    const abort = () => this.cancel();
    turn.signal?.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(abort, this.config.turnTimeoutMs ?? 180_000);
    try {
      const result = await this.port.request('aux/query', { queryId: this.nativeId, prompt: turn.prompt, resetContext,
        ...(turn.images?.length ? { images: turn.images.map((image) => ({ mediaType: image.mediaType, data: image.data })) } : {}) },
        (this.config.turnTimeoutMs ?? 180_000) + 5000);
      return { success: true, text: readDshAuxiliaryResult(result), toolCalls: [] };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error),
        ...(turn.signal?.aborted ? { cancelled: true } : {}) };
    } finally {
      clearTimeout(timeout); turn.signal?.removeEventListener('abort', abort);
      this.unregister?.(); this.unregister = null; this.busy = false;
    }
  }

  followUp(prompt: string, request?: Partial<AuxQueryTurnRequest>): Promise<AuxQueryResult> {
    return this.runDshAuxiliaryTurn({ ...request, prompt }, false);
  }

  cancel(): void { void this.port.request('aux/cancel', { queryId: this.nativeId }).catch(() => undefined); }

  async dispose(): Promise<void> {
    if (this.disposal) return this.disposal;
    this.disposed = true;
    this.unregister?.(); this.unregister = null;
    this.disposal = this.port.request('aux/close', { queryId: this.nativeId }).then(() => undefined);
    return this.disposal;
  }
}

function readDshAuxiliaryResult(result: DshJsonObject): string {
  const proof = result.nativeProof && typeof result.nativeProof === 'object' && !Array.isArray(result.nativeProof) ? result.nativeProof : null;
  if (typeof result.text !== 'string' || !Array.isArray(result.toolCalls) || result.toolCalls.length
    || !proof || !Array.isArray(proof.effectiveTools) || proof.effectiveTools.length
    || proof.toolChoice !== 'none' || proof.persistence !== false || proof.toolDispatcher !== false)
    throw new Error('Invalid or unsafe Harness auxiliary result');
  return result.text;
}
