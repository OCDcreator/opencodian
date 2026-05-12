export type AcpConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface AcpAgentConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  enabled: boolean;
  cwd?: string;
}

export interface AcpAgentRuntime {
  config: AcpAgentConfig;
  state: AcpConnectionState;
  process: unknown | null;
  activeSessionId: string | null;
}

export interface AcpPromptOptions {
  agentId: string;
  sessionId?: string;
  cwd?: string;
}

export interface AcpToolCall {
  name: string;
  id: string;
  input: Record<string, unknown>;
}

export interface AcpToolCallUpdate {
  id: string;
  status: 'in_progress' | 'completed' | 'error';
  output?: string;
}

export interface AcpUsageUpdate {
  inputTokens: number;
  outputTokens: number;
}

export interface AcpPermissionRequest {
  id: string;
  tool: string;
  patterns: string[];
}
