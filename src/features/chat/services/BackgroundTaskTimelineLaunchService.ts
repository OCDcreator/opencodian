import type { ChatMessage } from '../../../core/types';
import { t } from '../../../i18n';
import type { BackgroundTaskLiveSignalLaunchInfo } from './BackgroundTaskLiveSignalCoordinator';
import type { BackgroundTaskCompletionInfo } from './BackgroundTaskNoticeStateService';

export type BackgroundTaskLaunchInfo = BackgroundTaskLiveSignalLaunchInfo;

export class BackgroundTaskTimelineLaunchService {
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
