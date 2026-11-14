import { spawn, spawnSync } from 'node:child_process';
import {
  existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmdirSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { buildGateScript } from '../../../../src/core/obsidianTooling/obsidianGateScript';
import {
  buildGateScriptCommandSets,
  classifyObsidianSubcommand,
  OBSIDIAN_TOOLING_COMMAND_CATALOG,
} from '../../../../src/core/obsidianTooling/obsidianToolingCatalog';

/** A real POSIX shell plus a recording CLI; nothing connects to Obsidian. */
function createGateFixture() {
  const root = join(process.cwd(), '.tmp');
  mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, 'obsidian-gate-'));
  const scriptPath = join(directory, 'obsidian-gate');
  const cliPath = join(directory, 'fake-cli');
  const markerPath = join(directory, 'cli-argv');
  const requestsPath = join(directory, 'requests');
  const env = {
    ...process.env,
    OBSIDIAN_OPENCODIAN_CLI_BIN: cliPath,
    OBSIDIAN_OPENCODIAN_GATE_WAIT: '0',
    CLI_MARKER: markerPath,
  };
  writeFileSync(scriptPath, buildGateScript({ waitSeconds: 5 }));
  writeFileSync(cliPath, '#!/bin/sh\nprintf "%s\\n" "$@" > "$CLI_MARKER"\n', { mode: 0o755 });
  return {
    run: (args: string[]) => spawnSync('sh', [scriptPath, ...args], { encoding: 'utf8', timeout: 5000, env }),
    async decide(args: string[], decision: 'allow' | 'deny'): Promise<number | null> {
      const child = spawn('sh', [scriptPath, ...args], {
        stdio: 'ignore', env: { ...env, OBSIDIAN_OPENCODIAN_GATE_WAIT: '3' },
      });
      return new Promise((resolve, reject) => {
        const deadline = setTimeout(() => { child.kill(); reject(new Error('Gate did not finish.')); }, 4500);
        const poll = setInterval(() => {
          if (!existsSync(requestsPath)) return;
          const request = readdirSync(requestsPath).find(name => /^req-\d+-\d+\.request\.json$/.test(name));
          if (!request) return;
          clearInterval(poll);
          // Only the generated numeric request basename is allowed, never a path.
          const [, epoch, pid] = /^req-(\d+)-(\d+)\.request\.json$/.exec(request)!;
          writeFileSync(join(requestsPath, `req-${epoch}-${pid}.decision.json`), JSON.stringify({ decision }));
        }, 10);
        const finish = () => { clearInterval(poll); clearTimeout(deadline); };
        child.once('error', error => { finish(); reject(error); });
        child.once('close', code => { finish(); resolve(code); });
      });
    },
    readArgv: () => existsSync(markerPath) ? readFileSync(markerPath, 'utf8').trimEnd().split('\n') : null,
    readRequests: () => existsSync(requestsPath)
      ? readdirSync(requestsPath).filter(name => /^req-\d+-\d+\.request\.json$/.test(name))
        .map(name => JSON.parse(readFileSync(join(requestsPath, name), 'utf8')) as { subcommand: string; argv: string[] })
      : [],
    clean() {
      // Delete only files created by this fixture; never recursively remove a directory.
      if (existsSync(requestsPath)) {
        for (const name of readdirSync(requestsPath)) {
          if (!/^req-\d+-\d+\.(?:request|decision)\.json$/.test(name)) throw new Error('Unexpected fixture artifact.');
          unlinkSync(join(requestsPath, name));
        }
        rmdirSync(requestsPath);
      }
      if (existsSync(markerPath)) unlinkSync(markerPath);
      unlinkSync(scriptPath);
      unlinkSync(cliPath);
      rmdirSync(directory);
    },
  };
}

const describeWithShell = process.platform === 'win32' ? describe.skip : describe;

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
    for (const name of highImpact) expect(caseBlock).toContain(`'${name}'`);
    for (const name of passthrough) expect(caseBlock).toContain(`'${name}'`);
    expect(script).toContain(`*" $SUBCOMMAND "*`);
    expect(script).toContain(highImpact.join(' '));
    expect(script).toContain(passthrough.join(' '));
  });

  it('declares the fail-closed exit contract in the header', () => {
    const script = buildGateScript({});
    expect(script).toContain('#!/bin/sh');
    expect(script).toContain('exit 3');
    expect(script).toContain('exit 4');
    expect(script).toContain('exit 5');
    expect(script).toContain('fail closed');
  });

  it('builds request ids without non-POSIX shell variables', () => {
    const script = buildGateScript({});
    expect(script).toContain('REQ_ID="req-$(date +%s)-$$"');
    expect(script).not.toContain('$RANDOM');
  });

  describeWithShell('routing through a real shell', () => {
    it.each([
      ['vault=Test Vault', 'themes', 'total'],
      ['vault=研究库', 'search', 'query=meeting notes', 'content=vault=literal'],
    ])('forwards a valid vault prefix and every argument unchanged: %j', (...args) => {
      const fixture = createGateFixture();
      try {
        expect(fixture.run(args).status).toBe(0);
        expect(fixture.readArgv()).toEqual(args);
        expect(fixture.readRequests()).toEqual([]);
      } finally { fixture.clean(); }
    });

    it.each([
      ['search', 'vault=Test Vault'],
      ['create', 'name=Task note', 'vault=Test Vault'],
      ['plugin:reload', 'id=opencodian', 'vault=Test Vault'],
      ['vault=Test Vault', 'eval', 'code=1', 'vault=Other'],
      ['vault=Test Vault', 'vault=Other', 'search'],
      ['vault=Test Vault', 'vault=Test Vault', 'search'],
      ['vault=', 'search'],
      ['vault=  ', 'search'],
      ['search', 'query=meeting'],
      ['create', 'name=Task note'],
      ['plugin:reload', 'id=opencodian'],
      ['unknown-command'],
      ['vault=Test Vault'],
    ])('rejects ambiguous routing before CLI execution or confirmation: %j', (...args) => {
      const fixture = createGateFixture();
      try {
        const result = fixture.run(args);
        expect(result.status).toBe(2);
        expect(result.stderr).toContain('obsidian-gate:');
        expect(fixture.readArgv()).toBeNull();
        expect(fixture.readRequests()).toEqual([]);
      } finally { fixture.clean(); }
    });

    it.each(['help', 'version', 'vaults'])('keeps unscoped global discovery usable: %s', command => {
      const fixture = createGateFixture();
      try {
        expect(fixture.run([command]).status).toBe(0);
        expect(fixture.readArgv()).toEqual([command]);
      } finally { fixture.clean(); }
    });

    it.each(['plugin:install', 'future-command'])('keeps a valid target behind the confirmation gate: %s', command => {
      const fixture = createGateFixture();
      try {
        const args = ['vault=Test Vault', command, 'name=test'];
        expect(fixture.run(args).status).toBe(4);
        expect(fixture.readArgv()).toBeNull();
        expect(fixture.readRequests()).toEqual([expect.objectContaining({ subcommand: command, argv: args })]);
      } finally { fixture.clean(); }
    });

    it.each(['allow', 'deny'] as const)('preserves the explicit %s decision and original argv', async decision => {
      const fixture = createGateFixture();
      try {
        const args = ['vault=Test Vault', 'plugin:install', 'name=Task plugin'];
        expect(await fixture.decide(args, decision)).toBe(decision === 'allow' ? 0 : 3);
        expect(fixture.readArgv()).toEqual(decision === 'allow' ? args : null);
        expect(fixture.readRequests()).toEqual([expect.objectContaining({ subcommand: 'plugin:install', argv: args })]);
      } finally { fixture.clean(); }
    });
  });

  it('classifies every catalog subcommand consistently with the generated sets', () => {
    const { passthrough, highImpact } = buildGateScriptCommandSets();
    for (const name of passthrough) expect(classifyObsidianSubcommand(name)).not.toBe('high-impact');
    for (const name of highImpact) expect(classifyObsidianSubcommand(name)).toBe('high-impact');
    expect(OBSIDIAN_TOOLING_COMMAND_CATALOG.length).toBeGreaterThan(40);
  });
});
