import { readdirSync,readFileSync } from 'node:fs';
import * as path from 'node:path';

import ts from 'typescript';

import { normalizeBackendSettings, normalizePiBackendSettings } from '../../../../../../src/core/types/settings';
import { SlashCommandExecutionService } from '../../../../../../src/features/chat/services/SlashCommandExecutionService';
import { SlashCommandMenuCatalogCache } from '../../../../../../src/features/chat/services/SlashCommandMenuCatalogCache';

describe('Pi backend isolation contract', () => {
  it('allows only shared contracts and Pi modules across the service boundary', () => {
    const root = path.resolve(__dirname, '../../../../../../src/core/agents/backend/pi');
    const imports: string[] = [];
    for (const file of readdirSync(root).filter((name) => name.endsWith('.ts'))) {
      const source = ts.createSourceFile(file, readFileSync(path.join(root, file), 'utf8'), ts.ScriptTarget.Latest, true);
      for (const statement of source.statements) {
        if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) imports.push(statement.moduleSpecifier.text);
      }
    }
    expect(imports.length).toBeGreaterThan(0);
    const allowed = ['../AgentService', '../../AgentCapability', '../../../types/chat', '../../../types/settings'];
    expect(imports.filter((specifier) => !specifier.startsWith('node:') && !specifier.startsWith('./') && !allowed.includes(specifier))).toEqual([]);
  });

  it('normalizes Pi independently and preserves legacy settings defaults', () => {
    const legacy = normalizeBackendSettings(undefined);
    const withPi = normalizeBackendSettings({ ...legacy, pi: { executablePath: ' /bin/pi ', provider: ' p ', model: ' m ', thinkingLevel: 'invalid' } });
    expect(withPi.pi).toEqual({ executablePath: '/bin/pi', provider: 'p', model: 'm', thinkingLevel: '' });
    expect(withPi.codex).toEqual(legacy.codex);
    expect(withPi.claudeCode).toEqual(legacy.claudeCode);
    expect(withPi.opencode).toEqual(legacy.opencode);
    expect(normalizePiBackendSettings(null)).toEqual({ executablePath: '', provider: '', model: '', thinkingLevel: '' });
  });

  it('does not touch OpenCode catalogs or command execution when Pi handles slash input', async () => {
    const failOnForeignRead = jest.fn(() => { throw new Error('Other backend called'); });
    const cache = new SlashCommandMenuCatalogCache({
      getBackendKey: () => 'pi', getHiddenCommandIds: () => [], getVaultPath: () => '/vault',
      loadProjectAgents: failOnForeignRead, loadProjectCommands: failOnForeignRead,
      loadRuntimeCommands: failOnForeignRead, loadRuntimeSkills: failOnForeignRead,
    });
    await expect(cache.load()).resolves.toEqual([]);
    const commands = new SlashCommandExecutionService({
      getCurrentConversation: () => ({ backend: 'pi' }),
      getRuntimeSkills: failOnForeignRead, runSessionCommand: failOnForeignRead,
    } as never);
    await expect(commands.tryRunSlashCommand('/skill:example hello')).resolves.toBe(false);
    expect(failOnForeignRead).not.toHaveBeenCalled();
  });
});
