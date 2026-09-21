import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SOURCE_PATH = resolve(__dirname, '../../../../src/features/chat/OpenCodianView.ts');

function readMethod(source: string, methodName: string, nextAnchor: string): string {
  const start = source.indexOf(methodName === 'getActiveBackendConversations'
    ? `private ${methodName}`
    : `private async ${methodName}`);
  const end = source.indexOf(nextAnchor, start);
  return source.slice(start, end);
}

describe('OpenCodianView session rail source contract', () => {
  it('shares one active-backend list predicate between history and the optional rail', () => {
    const source = readFileSync(SOURCE_PATH, 'utf8');

    expect(source.match(/getConversations: \(\) => this\.getActiveBackendConversations\(\)/g)).toHaveLength(2);
    expect(readMethod(source, 'getActiveBackendConversations', '/** Scroll to bottom')).toContain(
      "(conversation.backend ?? 'opencode') === this.plugin.settings.activeBackend",
    );
  });

  it('refreshes the rail after title persistence before optional backend synchronization', () => {
    const source = readFileSync(SOURCE_PATH, 'utf8');
    const method = readMethod(source, 'updateConversationTitleState', '/** Canonical display scope');

    expect(method).toContain('await this.plugin.saveConversation(conversation);');
    expect(method).toContain('this.conversationSessionRailCoordinator.refresh(this.messagesShellEl);');
    expect(method.indexOf('this.conversationSessionRailCoordinator.refresh(this.messagesShellEl);')).toBeLessThan(
      method.indexOf('await backend.updateSessionTitle'),
    );
  });

  it('refreshes the rail after every history deletion recovery path', () => {
    const source = readFileSync(SOURCE_PATH, 'utf8');

    for (const methodName of [
      'deleteConversationsAndCleanupTabs',
      'deleteAllConversationsAndReset',
    ]) {
      const method = readMethod(source, methodName, '/** Cancel streaming');
      expect(method).toContain('finally {');
      expect(method).toContain('this.conversationSessionRailCoordinator.refresh(this.messagesShellEl);');
    }
  });
});
