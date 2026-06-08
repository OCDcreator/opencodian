import { t } from '../../../i18n';

export type UnavailableServerAvailability = 'checking' | 'disabled' | 'starting' | 'offline';

export function getUnavailableServerMessage(availability: UnavailableServerAvailability): string {
  if (availability === 'starting') {
    return t('chat.error.serverStarting');
  }

  if (availability === 'disabled') {
    return t('chat.empty.noBackend.description');
  }

  return t('chat.error.serverOffline');
}

export function getFriendlyServerStartErrorMessage(error: unknown): string {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const lowerMessage = rawMessage.toLowerCase();

  if (lowerMessage.includes('opencode not found')) {
    return t('chat.error.serverBinaryMissing');
  }

  if (lowerMessage.includes('already in use')) {
    return t('chat.error.serverPortInUse');
  }

  return `${t('chat.error.serverStartFailed')}\n${rawMessage}`;
}
