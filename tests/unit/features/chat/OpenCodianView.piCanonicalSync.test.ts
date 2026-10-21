import { readFileSync } from 'node:fs';
import * as path from 'node:path';

import { createSourceFile, isClassDeclaration, isMethodDeclaration, ModuleKind, ScriptTarget, transpileModule } from 'typescript';

import type { Conversation } from '../../../../src/core/types';

function canonicalMethod(): (this: unknown, conversation: Conversation, tab: string, reason: string) => Promise<unknown> {
  const source = readFileSync(path.resolve(__dirname, '../../../../src/features/chat/OpenCodianView.ts'), 'utf8');
  const ast = createSourceFile('view.ts', source, ScriptTarget.Latest, true);
  const view = ast.statements.filter(isClassDeclaration).find(node => node.name?.text === 'OpenCodianView');
  const method = view?.members.filter(isMethodDeclaration).find(node => node.name.getText(ast) === 'syncConversationMessagesFromCanonicalState');
  if (!method?.body) throw new Error('Production canonical sync method missing');
  const code = transpileModule('class ViewProbe {' + method.getText(ast) + '}\nexports.method = ViewProbe.prototype.syncConversationMessagesFromCanonicalState;', {
    compilerOptions: { target: ScriptTarget.ES2022, module: ModuleKind.CommonJS },
  }).outputText;
  const exports: { method?: ReturnType<typeof canonicalMethod> } = {};
  new Function('exports', code)(exports);
  return exports.method!;
}

describe('Pi finalization uses its native transcript rather than OpenCode canonical projections', () => {
  const sync = canonicalMethod();
  it.each(['pi', 'opencode2'] as const)('bypasses OpenCode canonical state for %s', async backend => {
    const staleProjection = { messages: [{ role: 'user', content: 'Primary' }], changed: false };
    const host = {
      conversationAuthoritativeSyncCoordinator: { syncConversationMessagesFromCanonicalState: jest.fn().mockResolvedValue(staleProjection) },
      refreshChildSessionGraphIfVisibleConversation: jest.fn(),
    };
    const conversation = { id: 'owned', backend, backendSessionId: 'native-owned', messages: [] } as unknown as Conversation;
    expect(await sync.call(host, conversation, 'owned-tab', 'send-finalization')).toBeNull();
    expect(host.conversationAuthoritativeSyncCoordinator.syncConversationMessagesFromCanonicalState).not.toHaveBeenCalled();
  });

  it('retains authoritative OpenCode canonical sync and graph refresh', async () => {
    const nativeProjection = { messages: [{ role: 'assistant', content: 'Native reply' }], changed: true };
    const host = {
      conversationAuthoritativeSyncCoordinator: { syncConversationMessagesFromCanonicalState: jest.fn().mockResolvedValue(nativeProjection) },
      refreshChildSessionGraphIfVisibleConversation: jest.fn().mockResolvedValue(undefined),
    };
    const conversation = { id: 'owned', backend: 'opencode', backendSessionId: 'native-owned', messages: [] } as unknown as Conversation;
    expect(await sync.call(host, conversation, 'owned-tab', 'send-finalization')).toBe(nativeProjection);
    expect(host.conversationAuthoritativeSyncCoordinator.syncConversationMessagesFromCanonicalState).toHaveBeenCalledWith(conversation, 'owned-tab', 'send-finalization', undefined);
    expect(host.refreshChildSessionGraphIfVisibleConversation).toHaveBeenCalledWith(conversation, 'owned-tab');
  });
});
