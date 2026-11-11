import type { DshJobView } from '../../../../core/agents/backend/dsh/DshNativeControls';
import type { ChatMessage, Conversation } from '../../../../core/types';
import { t } from '../../../../i18n';
import { sanitizeDiagnosticReport } from '../../../../shared/diagnosticSecretSanitizer';
import type { BackgroundTaskLiveSignalLaunchInfo } from './BackgroundTaskLiveSignalCoordinator';
import type { BackgroundTaskCompletionEvent, BackgroundTaskCompletionInfo } from './BackgroundTaskNoticeStateService';

export type BackgroundTaskLaunchInfo = BackgroundTaskLiveSignalLaunchInfo & { nativeStatus?: DshJobView['status'] };

export class BackgroundTaskTimelineLaunchService {
  /** A native job belongs to its actual parent and the user turn preceding its start. */
  static groupNativeJobs(conversation: Conversation, jobs: readonly DshJobView[]): Map<ChatMessage, DshJobView[]> {
    const groups = new Map<ChatMessage, DshJobView[]>();
    const users = conversation.messages.filter(message => message.role === 'user')
      .sort((left, right) => left.timestamp - right.timestamp);
    for (const job of jobs) {
      if (job.owner !== conversation.backendSessionId || !Number.isFinite(job.startedAt)) continue;
      const anchor = [...users].reverse().find(message => message.timestamp <= job.startedAt);
      if (!anchor) continue; // Hydration has not supplied an authoritative turn anchor yet.
      const group = groups.get(anchor) ?? []; group.push(job); groups.set(anchor, group);
    }
    return groups;
  }

  static nativeJobIdentity(job: Pick<DshJobView, 'owner' | 'id'>): string {
    return `dsh-job:${encodeURIComponent(job.owner)}:${encodeURIComponent(job.id)}`;
  }

  static nativeJobLaunch(job: DshJobView): BackgroundTaskLaunchInfo {
    const identity = this.nativeJobIdentity(job);
    return { launchId: identity, taskId: identity, nativeStatus: job.status,
      description: sanitizeDiagnosticReport(job.label, { urlPolicy: 'strict' }) };
  }

  static nativeJobCompletion(job: DshJobView, isCurrent: () => boolean): BackgroundTaskCompletionEvent | null {
    if (job.status !== 'completed' && job.status !== 'failed' && job.status !== 'killed') return null;
    const identity = this.nativeJobIdentity(job);
    return { reminderMessageId: identity, reminderType: 'background-task-completed',
      tasks: [{ taskId: identity, description: this.nativeJobLaunch(job).description, nativeStatus: job.status }],
      timestamp: job.finishedAt ?? job.startedAt, nativeJob: true, isCurrent };
  }

  static upsertLaunch(
    toolCall: {
      id: string;
      input: Record<string, unknown>;
      toolMetadata?: Record<string, unknown>;
      result?: string;
    },
    target: Map<string, BackgroundTaskLaunchInfo>,
  ): void {
    const existing = target.get(toolCall.id);
    const description = this.getBackgroundTaskDescription(
      toolCall.input,
      toolCall.result ?? existing?.description,
    );
    const taskId = this.extractBackgroundTaskId(
      toolCall.toolMetadata,
      toolCall.input,
      toolCall.result,
      existing?.taskId,
    ) ?? null;

    target.set(toolCall.id, {
      launchId: toolCall.id,
      taskId,
      description,
    });
  }

  static getCompletedTaskFromToolCall(toolCall: {
    id: string;
    input: Record<string, unknown>;
    toolMetadata?: Record<string, unknown>;
    result?: string;
  }): BackgroundTaskCompletionInfo | null {
    const taskId = this.extractNativeTaskSessionId(toolCall.toolMetadata);
    if (!taskId) {
      return null;
    }

    const description = this.getBackgroundTaskDescription(
      toolCall.input,
      toolCall.result,
    );

    return {
      taskId,
      description,
    };
  }

  static addCompletedTasksFromMessage(
    message: ChatMessage,
    target: Map<string, BackgroundTaskCompletionInfo>,
  ): void {
    if (message.omo?.kind !== 'system-reminder' || !message.omo.tasks || message.omo.tasks.length === 0) {
      return;
    }

    for (const task of message.omo.tasks) {
      if (!task.id && !task.description) {
        continue;
      }

      const completionId = task.id || task.description;
      target.set(completionId, {
        taskId: task.id || completionId,
        description: task.description || t('chat.backgroundTask.noDescription'),
      });
    }
  }

  static filterPendingLaunches(
    launches: BackgroundTaskLaunchInfo[],
    completed: BackgroundTaskCompletionInfo[],
  ): BackgroundTaskLaunchInfo[] {
    return launches.filter((launch) =>
      !completed.some((completion) => this.isLaunchMatchedByCompletion(launch, completion)),
    );
  }

  private static getBackgroundTaskDescription(
    input: Record<string, unknown>,
    fallbackResult?: string,
  ): string {
    const description = [
      input.description,
      input.prompt,
      input.title,
      input.summary,
      input.query,
      input.command,
    ].find((value): value is string => typeof value === 'string' && value.trim().length > 0);

    if (description) {
      return description.trim();
    }

    if (fallbackResult) {
      const trimmed = fallbackResult.trim();
      if (trimmed.length > 0) {
        return trimmed.split(/\r?\n/)[0].trim();
      }
    }

    return t('chat.backgroundTask.noDescription');
  }

  private static extractBackgroundTaskId(...sources: unknown[]): string | null {
    for (const source of sources) {
      if (typeof source === 'string') {
        continue;
      }

      if (source && typeof source === 'object') {
        const sessionId = (source as Record<string, unknown>).sessionId;
        if (typeof sessionId === 'string' && sessionId.trim().length > 0) {
          return sessionId.trim();
        }

        const nested = [
          (source as Record<string, unknown>).task_id,
          (source as Record<string, unknown>).taskId,
          (source as Record<string, unknown>).id,
        ];
        for (const value of nested) {
          if (typeof value === 'string' && value.trim().length > 0) {
            return value.trim();
          }
        }
      }
    }

    return null;
  }

  private static extractNativeTaskSessionId(
    metadata: Record<string, unknown> | undefined,
  ): string | null {
    const sessionId = metadata?.sessionId;
    return typeof sessionId === 'string' && sessionId.trim().length > 0
      ? sessionId.trim()
      : null;
  }

  private static isLaunchMatchedByCompletion(
    launch: BackgroundTaskLaunchInfo,
    completion: BackgroundTaskCompletionInfo,
  ): boolean {
    if (launch.taskId && launch.taskId === completion.taskId) {
      return true;
    }

    return launch.description.trim().toLowerCase() === completion.description.trim().toLowerCase();
  }
}
