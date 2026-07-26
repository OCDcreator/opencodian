/**
 * Acceptance / characterization: compose already-implemented public seams
 * (buildClaudeHookHandlerEdit fine-grained update-field + ClaudeSettingsSourceService
 * read/applyPathEdits). No source is modified here — this is evidence over the
 * existing seams.
 */
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import { buildClaudeHookHandlerEdit } from '../../../../../src/core/agents/backend/ClaudeSettingsHookModel';
import { ClaudeSettingsSourceService } from '../../../../../src/core/agents/backend/ClaudeSettingsSourceService';

const mkService = async (sandbox: string) => {
  const home = path.join(sandbox, 'home');
  const vault = path.join(sandbox, 'vault');
  await fs.mkdir(home, { recursive: true });
  await fs.mkdir(vault, { recursive: true });
  const service = new ClaudeSettingsSourceService(vault, {
    home,
    managedConfigDir: path.join(sandbox, 'managed'),
    archiveRootPath: path.join(sandbox, 'archive'),
  });
  return { service, vault };
};

describe('ClaudeSettingsHookModel service integration', () => {
  it('strict-JSON round-trip preserves formatting/unknowns and changes only the intended field', async () => {
    const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-hook-integ-rt-'));
    const { service, vault } = await mkService(sandbox);
    const projectPath = path.join(vault, '.claude', 'settings.json');

    const baseContent = [
      '{',
      '\t"unknownTop": true,',
      '\t"hooks": {',
      '\t\t"PreToolUse": [',
      '\t\t\t{',
      '\t\t\t\t"matcher": "Bash",',
      '\t\t\t\t"unknownGroupField": "g",',
      '\t\t\t\t"hooks": [',
      '\t\t\t\t\t{ "type": "command", "command": "orig", "once": true, "rewakeMessage": "r", "unknownHandlerField": "h" }',
      '\t\t\t\t]',
      '\t\t\t}',
      '\t\t],',
      '\t\t"Stop": [',
      '\t\t\t{ "hooks": [ { "type": "command", "command": "stopcmd" } ] }',
      '\t\t]',
      '\t}',
      '}',
      '',
    ].join('\n');
    await fs.mkdir(path.dirname(projectPath), { recursive: true });
    await fs.writeFile(projectPath, baseContent, 'utf8');

    const read = await service.read(projectPath);
    if (read.status !== 'success') throw new Error('unreachable');
    expect(read.source.parseError).toBeUndefined();
    if (read.content === null) throw new Error('content unexpectedly null');
    const content = read.content;
    const revision = read.source.revision;
    expect(revision).not.toBeNull();

    const parsed = JSON.parse(content);
    const handlerEdit = buildClaudeHookHandlerEdit(parsed, 'PreToolUse', 0, {
      type: 'update-field', index: 0, field: 'command', value: 'newcmd',
    });
    expect(handlerEdit.ok).toBe(true);
    if (!handlerEdit.ok) throw new Error('unreachable');

    const outcome = await service.applyPathEdits({
      targetPath: projectPath,
      baseContent: content,
      edits: [handlerEdit.edit],
      expectedRevision: revision,
    });
    expect(outcome.result.status).toBe('success');
    // disk bytes equal the draft exactly
    const disk = await fs.readFile(projectPath, 'utf8');
    expect(disk).toBe(outcome.draft);
    // strict JSON still valid
    const before = JSON.parse(content);
    const after = JSON.parse(disk);
    // only the intended command changed
    before.hooks.PreToolUse[0].hooks[0].command = 'newcmd';
    expect(after).toEqual(before);
    // unknown/sibling/internal fields survive
    expect(after.unknownTop).toBe(true);
    expect(after.hooks.PreToolUse[0].unknownGroupField).toBe('g');
    expect(after.hooks.PreToolUse[0].hooks[0].once).toBe(true);
    expect(after.hooks.PreToolUse[0].hooks[0].rewakeMessage).toBe('r');
    expect(after.hooks.PreToolUse[0].hooks[0].unknownHandlerField).toBe('h');
    expect(after.hooks.Stop[0].hooks[0].command).toBe('stopcmd');
    // honest evidence
    expect(outcome.evidence.persistence).toBe('verified');
    expect(outcome.evidence.application).toBe('pending');
    expect(outcome.evidence.runtime).not.toBe('verified');

    await fs.rm(sandbox, { recursive: true, force: true });
  });

  it('conflict returns the exact intended draft and leaves the external winner on disk', async () => {
    const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-hook-integ-conflict-'));
    const { service, vault } = await mkService(sandbox);
    const projectPath = path.join(vault, '.claude', 'settings.json');
    await fs.mkdir(path.dirname(projectPath), { recursive: true });

    const baseContent = '{"hooks":{"PreToolUse":[{"matcher":"Bash","hooks":[{"type":"command","command":"OLDCMD"}]}]}}';
    const expectedDraft = '{"hooks":{"PreToolUse":[{"matcher":"Bash","hooks":[{"type":"command","command":"NEWCMD"}]}]}}';
    await fs.writeFile(projectPath, baseContent, 'utf8');

    const read = await service.read(projectPath);
    if (read.status !== 'success') throw new Error('unreachable');
    const revision = read.source.revision;
    expect(revision).not.toBeNull();

    const parsed = JSON.parse(baseContent);
    const handlerEdit = buildClaudeHookHandlerEdit(parsed, 'PreToolUse', 0, {
      type: 'update-field', index: 0, field: 'command', value: 'NEWCMD',
    });
    expect(handlerEdit.ok).toBe(true);
    if (!handlerEdit.ok) throw new Error('unreachable');

    // externally replace the file with a different strict-JSON winner
    const winner = '{"hooks":{"PreToolUse":[{"matcher":"Bash","hooks":[{"type":"command","command":"WINNER"}]}]}}';
    await fs.writeFile(projectPath, winner, 'utf8');

    const outcome = await service.applyPathEdits({
      targetPath: projectPath,
      baseContent,
      edits: [handlerEdit.edit],
      expectedRevision: revision,
    });
    expect(outcome.result.status).toBe('conflict');
    // draft equals the independently known intended literal (not derived via applyJsoncPathEdits)
    expect(outcome.draft).toBe(expectedDraft);
    // disk remains the external winner exactly
    expect(await fs.readFile(projectPath, 'utf8')).toBe(winner);

    await fs.rm(sandbox, { recursive: true, force: true });
  });
});
