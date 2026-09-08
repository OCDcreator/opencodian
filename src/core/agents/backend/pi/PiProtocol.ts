/** Versioned service API, checked against the installed SDK during acceptance. */
export const PI_RPC_COMMANDS = [
  'prompt', 'steer', 'follow_up', 'abort', 'new_session', 'get_state', 'set_model', 'cycle_model',
  'get_available_models', 'set_thinking_level', 'cycle_thinking_level', 'set_steering_mode', 'set_follow_up_mode',
  'compact', 'set_auto_compaction', 'set_auto_retry', 'abort_retry', 'bash', 'abort_bash', 'get_session_stats',
  'export_html', 'switch_session', 'fork', 'clone', 'get_fork_messages', 'get_last_assistant_text', 'set_session_name',
  'get_messages', 'get_commands',
] as const;
export const PI_SDK_COMMANDS = [
  'get_tree', 'navigate_tree', 'label_entry', 'list_sessions', 'import_session', 'export_jsonl', 'get_tools', 'set_tools',
  'get_resources', 'reload', 'clear_queue', 'get_queue', 'abort_compaction', 'abort_branch_summary',
  'get_auth', 'set_api_key', 'login', 'logout', 'get_packages', 'install_package', 'remove_package', 'update_package', 'set_scoped_models',
] as const;
export const PI_CONFIG_COMMANDS = ['get_configuration', 'save_configuration', 'get_model_configuration', 'save_model_configuration'] as const;
export type PiCommandName = typeof PI_RPC_COMMANDS[number] | typeof PI_SDK_COMMANDS[number] | typeof PI_CONFIG_COMMANDS[number];
export interface PiSettingField {
  path: string; group: string; kind: 'string' | 'number' | 'boolean' | 'choice' | 'list' | 'json';
  label: { zh: string; en: string }; options?: string[]; min?: number; max?: number;
  scope?: 'terminal' | 'export' | 'session-directory'; readOnly?: boolean;
}
export interface PiConfigurationDocument { path: string; value: Record<string, unknown>; revision: string }
export interface PiConfigurationSnapshot {
  scopes: Record<'global' | 'project', PiConfigurationDocument>; fields: PiSettingField[]; sdkVersion: string;
}
export interface PiServiceEvent { type: string; [key: string]: unknown }
export type PiUiHandler = (request: PiServiceEvent, signal: AbortSignal) => Promise<Record<string, unknown> | void>;
export interface PiModelInfo {
  id: string; name: string; provider: string; reasoning: boolean;
  contextWindow?: number; maxTokens?: number; input?: string[];
  cost?: { input: number; output: number; cacheRead: number; cacheWrite: number };
}
