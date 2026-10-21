export interface SettingsBackendStateLike {
  activeBackend?: string;
  enabledBackends?: unknown;
}

export function resolveSettingsActiveBackend(settings?: SettingsBackendStateLike | null): string | undefined {
  if (!settings) {
    // OpenCode 1 is retired; the implicit fallback must not resolve to it.
    return 'opencode2';
  }
  const activeBackend = settings.activeBackend;
  const enabledBackends = Array.isArray(settings.enabledBackends)
    ? settings.enabledBackends.filter((backend): backend is string => typeof backend === 'string')
    : [];
  return activeBackend && enabledBackends.includes(activeBackend)
    ? activeBackend
    : enabledBackends[0];
}

export function isOpenCodeSettingsBackendActive(settings?: SettingsBackendStateLike | null): boolean {
  return resolveSettingsActiveBackend(settings) === 'opencode';
}
