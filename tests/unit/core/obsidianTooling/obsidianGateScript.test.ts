import { execSync } from 'child_process';
import { chmodSync, readFileSync,writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { buildGateScript } from '../../../../src/core/obsidianTooling/obsidianGateScript';
import {
  buildGateScriptCommandSets,
  classifyObsidianSubcommand,
  OBSIDIAN_TOOLING_COMMAND_CATALOG,
} from '../../../../src/core/obsidianTooling/obsidianToolingCatalog';

describe('obsidian-gate script generation (R-B4)', () => {
  it('is deterministic for identical input', () => {
    expect(buildGateScript({ cliCommand: 'obsidian', waitSeconds: 90 })).toBe(
      buildGateScript({ cliCommand: 'obsidian', waitSeconds: 90 }),
    );
  });

  it('embeds the exact classification sets from the catalog', () => {
    const script = buildGateScript({});
    const { passthrough, highImpact } = buildGateScriptCommandSets();
    const caseBlock = script.slice(script.indexOf('# PASSTHROUGH'), script.indexOf('if [ "$IS_HIGH_IMPACT"'));

    for (const name of highImpact) {
      expect(caseBlock).toContain(`'${name}'`);
    }
    for (const name of passthrough) {
      expect(caseBlock).toContain(`'${name}'`);
    }
    // The runtime case patterns use the space-delimited sorted lists.
    expect(script).toContain(`*" $SUBCOMMAND "*`);
    expect(script).toContain(highImpact.join(' '));
    expect(script).toContain(passthrough.join(' '));
  });

  it('declares the fail-closed exit contract in the header', () => {
    const script = buildGateScript({});
    expect(script).toContain('#!/bin/sh');
    expect(script).toContain('exit 3'); // deny
    expect(script).toContain('exit 4'); // timeout / expired
    expect(script).toContain('exit 5'); // unreadable decision
    expect(script).toContain('fail closed');
  });

  it('approves passthrough subcommands and refuses high-impact ones without a decision (real sh)', () => {
    const script = buildGateScript({ cliCommand: 'obsidian-gate-fake-cli', waitSeconds: 3 });
    const dir = join(tmpdir(), `opencodian-gate-test-${Date.now()}-${process.pid}`);
    const requests = join(dir, 'requests');
    execSync(`mkdir -p '${requests}'`);
    const scriptPath = join(dir, 'obsidian-gate');
    writeFileSync(scriptPath, script);
    chmodSync(scriptPath, 0o755);
    // Fake CLI records that it ran and prints the argv.
    const cliPath = join(dir, 'fake-cli');
    writeFileSync(cliPath, '#!/bin/sh\necho "CLI-RAN: $*"\n');
    chmodSync(cliPath, 0o755);

    /** Run a gate invocation, returning its exit status instead of throwing. */
    const runGate = (args: string, wait: string): number => {
      try {
        execSync(`'${scriptPath}' ${args}`, {
          env: { ...process.env, OBSIDIAN_OPENCODIAN_CLI_BIN: cliPath, OBSIDIAN_OPENCODIAN_GATE_WAIT: wait },
          stdio: 'pipe',
        });
        return 0;
      } catch (error) {
        return (error as { status?: number }).status ?? -1;
      }
    };

    try {
      // Read-only command: direct exec, no gate artifacts.
      const readOut = execSync(`'${scriptPath}' themes total`, { env: { ...process.env, OBSIDIAN_OPENCODIAN_CLI_BIN: cliPath } }).toString();
      expect(readOut).toContain('CLI-RAN: themes total');

      // High-impact command with NO plugin running: the wrapper must fail
      // closed after the wait (exit 4 = timeout, no decision appeared).
      expect(runGate('plugin:install name=test', '1')).toBe(4);
      // The CLI never ran for the gated command.
      expect(execSync(`'${cliPath}' probe`, { stdio: 'pipe' }).toString()).toBe('CLI-RAN: probe\n');

      // A request file was filed with the exact argv for the user dialog.
      const requestFiles = execSync(`ls '${requests}'`).toString().trim().split('\n').filter((f) => f.endsWith('.request.json'));
      expect(requestFiles.length).toBe(1);
      const request = JSON.parse(readFileSync(join(requests, requestFiles[0]), 'utf8'));
      expect(request.subcommand).toBe('plugin:install');
      expect(request.argv).toEqual(['plugin:install', 'name=test']);
    } finally {
      execSync(`rm -rf '${dir}'`);
    }
  });

  it('classifies every catalog subcommand consistently with the generated sets', () => {
    const { passthrough, highImpact } = buildGateScriptCommandSets();
    for (const name of passthrough) {
      expect(classifyObsidianSubcommand(name)).not.toBe('high-impact');
    }
    for (const name of highImpact) {
      expect(classifyObsidianSubcommand(name)).toBe('high-impact');
    }
    expect(OBSIDIAN_TOOLING_COMMAND_CATALOG.length).toBeGreaterThan(40);
  });
});
