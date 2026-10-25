import type { QuestionRequest, StreamChunk } from '../../../types/chat';
import type { DshJsonObject, DshJsonValue } from './DshAcpClient';

interface PendingQuestion {
  request: QuestionRequest;
  ids: string[];
  resolve: (value: DshJsonObject) => void;
}

/** Owns native question validation and one-shot answer/cancel settlement. */
export class DshQuestionBridge {
  private readonly pending = new Map<string, PendingQuestion>();

  constructor(private readonly emit: (sessionId: string, chunk: StreamChunk) => boolean) {}

  request(wire: DshJsonObject): Promise<DshJsonObject> {
    const sessionId = typeof wire.sessionId === 'string' ? wire.sessionId : '';
    const id = typeof wire.requestId === 'string' ? `dsh-question-${sessionId}-${wire.requestId}` : '';
    if (!id || !sessionId || !Array.isArray(wire.questions) || !wire.questions.length || this.pending.has(id))
      return Promise.reject(new Error('Invalid native Harness question batch'));
    const ids: string[] = [];
    const questions = wire.questions.map((entry) => {
      const question = record(entry);
      if (!question || typeof question.id !== 'string' || !question.id.trim() || ids.includes(question.id)
        || typeof question.question !== 'string' || !question.question.trim()) throw new Error('Invalid native Harness question');
      ids.push(question.id);
      const labels = new Set<string>();
      const options = (Array.isArray(question.options) ? question.options : []).map((value) => {
        const option = record(value);
        if (!option || typeof option.label !== 'string' || !option.label.trim() || labels.has(option.label))
          throw new Error('Invalid native Harness question option');
        labels.add(option.label);
        return { label: option.label, description: typeof option.description === 'string' ? option.description : '' };
      });
      return { question: question.question + (typeof question.detail === 'string' ? `\n\n${question.detail}` : ''),
        header: typeof question.header === 'string' ? question.header : '', options,
        multiple: question.multiSelect === true, custom: true };
    });
    const request: QuestionRequest = { id, sessionId, questions };
    return new Promise((resolve) => {
      this.pending.set(id, { request, ids, resolve });
      if (!this.emit(sessionId, { type: 'question_request', request })) this.reject(id);
    });
  }

  list(): QuestionRequest[] { return [...this.pending.values()].map(({ request }) => request); }

  reply(id: string, answers: string[][]): void {
    const pending = this.pending.get(id);
    if (!pending) throw new Error('Harness question is no longer active');
    if (answers.length !== pending.ids.length || answers.some((batch, i) => !Array.isArray(batch)
      || batch.some((answer) => typeof answer !== 'string') || (!pending.request.questions[i].multiple && batch.length > 1)))
      throw new Error('Invalid Harness question answer batch');
    const mapped = answers.map((batch, i) => {
      const labels = new Set(pending.request.questions[i].options.map((option) => option.label));
      const selected = batch.filter((answer) => labels.has(answer));
      const custom = batch.filter((answer) => !labels.has(answer)).join('\n');
      return { id: pending.ids[i], selected, ...(custom ? { custom } : {}) };
    });
    this.pending.delete(id);
    pending.resolve({ answers: mapped });
  }

  reject(id: string): void {
    const pending = this.pending.get(id);
    if (!pending) return;
    this.pending.delete(id); pending.resolve({ cancelled: true });
  }

  cancel(sessionId?: string): void {
    for (const [id, pending] of this.pending) if (!sessionId || pending.request.sessionId === sessionId) this.reject(id);
  }
}

function record(value: DshJsonValue): DshJsonObject | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}
