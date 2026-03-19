/**
 * Tool-related type definitions
 */

/** Tool call information */
export interface ToolCallInfo {
  id: string;
  name: string;
  input: Record<string, unknown>;
  status?: 'pending' | 'running' | 'completed' | 'error';
  result?: string;
  isExpanded?: boolean;
}

/** Tool names */
export const TOOL_NAMES = {
  READ: 'Read',
  WRITE: 'Write',
  EDIT: 'Edit',
  BASH: 'Bash',
  GLOB: 'Glob',
  GREP: 'Grep',
  VIEW: 'View',
  LS: 'LS',
  ASK_USER: 'AskUser',
  ENTER_PLAN_MODE: 'EnterPlanMode',
  EXIT_PLAN_MODE: 'ExitPlanMode',
  TASK: 'Task',
  WEB_SEARCH: 'WebSearch',
  WEB_FETCH: 'WebFetch',
} as const;

export type ToolName = typeof TOOL_NAMES[keyof typeof TOOL_NAMES];
