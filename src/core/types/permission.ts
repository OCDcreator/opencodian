/**
 * Permission configuration types for OpenCode integration
 */

import type { OpencodeConfig as BaseOpencodeConfig } from './opencodeConfig';

/** Permission action types */
export type PermissionAction = 'allow' | 'deny' | 'ask';

/** Permission configuration for a specific tool */
export type ToolPermission = PermissionAction | Record<string, PermissionAction>;

/** Complete permission configuration */
export interface PermissionConfig {
  /** Default action for all permissions */
  '*'?: PermissionAction;
  /** File read permission */
  read?: ToolPermission;
  /** File edit permission (covers edit, write, patch, multiedit) */
  edit?: ToolPermission;
  /** File write permission */
  write?: ToolPermission;
  /** Shell command execution */
  bash?: ToolPermission;
  /** File glob patterns */
  glob?: ToolPermission;
  /** Content search */
  grep?: ToolPermission;
  /** Directory listing */
  list?: ToolPermission;
  /** Subtask spawning */
  task?: ToolPermission;
  /** Skill loading */
  skill?: ToolPermission;
  /** LSP queries */
  lsp?: ToolPermission;
  /** URL fetching */
  webfetch?: ToolPermission;
  /** Web search */
  websearch?: ToolPermission;
  /** Code search */
  codesearch?: ToolPermission;
  /** External directory access */
  external_directory?: ToolPermission;
  /** Doom loop detection */
  doom_loop?: ToolPermission;
  /** Todo list read */
  todoread?: ToolPermission;
  /** Todo list write */
  todowrite?: ToolPermission;
}

export type OpencodeConfig = BaseOpencodeConfig;

/** Permission request from OpenCode server */
export interface PermissionRequest {
  /** Unique request ID */
  id: string;
  /** Session ID */
  sessionID: string;
  /** Permission type (tool name) */
  permission: string;
  /** Patterns being requested */
  patterns: string[];
  /** Additional metadata */
  metadata: Record<string, unknown>;
  /** Patterns that can be auto-approved */
  always: string[];
  /** Tool call information */
  tool?: {
    messageID: string;
    callID: string;
  };
}

/** Permission response type */
export type PermissionReply = 'once' | 'always' | 'reject';

/** Permission response input */
export interface PermissionReplyInput {
  /** Request ID to respond to */
  requestID: string;
  /** Response type */
  reply: PermissionReply;
  /** Optional message (for reject with feedback) */
  message?: string;
}

/** Permission mode setting */
export type PermissionMode = 'yolo' | 'normal' | 'plan';

/** Settings for permission configuration */
export interface PermissionSettings {
  /** Current permission mode */
  mode: PermissionMode;
  /** Whether to use project-level config (.opencode/opencode.json) */
  useProjectConfig: boolean;
  /** Individual tool permissions (used when mode is 'normal') */
  toolPermissions: Record<string, PermissionAction>;
}
