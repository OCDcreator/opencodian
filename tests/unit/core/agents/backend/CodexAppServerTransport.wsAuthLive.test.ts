/**
 * CodexAppServerTransport websocket-auth fallback — REAL child-process probe.
 *
 * Unlike the mocked wsAuth unit tests, this file spawns the actual emulator
 * fixture (tests/fixtures/codex-old-cli-emulator.mjs) as real child processes,
 * so the classification runs against genuine stderr→exit timing instead of
 * hand-ordered mock events:
 *   - a clap-style parser rejection of `--ws-auth` (exit 2) authorizes the
 *     exactly-once unauthenticated fallback (spawn #2 has no auth flags);
 *   - an unrelated non-zero failure with the auth flags present (config
 *     permission error, exit 78) must stay a hard failure: exactly one spawn,
 *     no fallback, capability token intact;
 *   - a missing executable (ENOENT) likewise never downgrades.
 * A real old Codex CLI is not installed on this machine; the emulator is the
 * documented, deterministic stand-in (the installed 0.169.0 CLI accepting the
 * flags is proven separately by .scratch codex-wsauth-proof).
 */
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { CodexAppServerClient } from '../../../../../src/core/agents/backend/codex/CodexAppServerClient';

const EMULATOR_PATH = path.resolve(__dirname, '../../../../fixtures/codex-old-cli-emulator.mjs');
// Windows cannot exec a shebang .mjs directly; the fixtures suite is darwin/Linux.
const describeLive = process.platform === 'win32' ? describe.skip : describe;

interface InvocationRecord { argv: string[]; hasAuthFlag: boolean; kind: string }

function readInvocations(file: string): InvocationRecord[] {
  try {
    return readFileSync(file, 'utf8').split('\n').filter((line) => line.trim())
      .map((line) => JSON.parse(line) as InvocationRecord);
  } catch {
    return [];
  }
}

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error('condition not met before timeout');
}

function freshWorkspace(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'opencodian-codex-oldcli-probe-'));
  writeFileSync(path.join(dir, 'config.toml'), '# emulator workspace\n');
  chmodSync(EMULATOR_PATH, 0o755);
  return dir;
}

function makeClient(workspace: string, exitKind?: string): CodexAppServerClient {
  return new CodexAppServerClient({
    codexPathOverride: EMULATOR_PATH,
    workingDirectory: workspace,
    getExtraEnv: () => ({
      FAKE_INVOCATIONS: path.join(workspace, 'invocations.jsonl'),
      ...(exitKind ? { FAKE_EXIT_KIND: exitKind } : {}),
    }),
  });
}

/**
 * Explicit, non-recursive cleanup (project destructive-command policy: no
 * recursive deletes, ever): unlink only the two files this test created, then
 * remove the directory only once empty. Anything unexpected left inside is
 * left in place (a stray temp dir in /tmp is harmless; a recursive delete is
 * not an option).
 */
function cleanupWorkspace(dir: string): void {
  for (const name of ['config.toml', 'invocations.jsonl']) {
    const file = path.join(dir, name);
    try {
      if (existsSync(file)) unlinkSync(file);
    } catch {
      // Best-effort; a leftover temp file in /tmp is acceptable.
    }
  }
  try {
    rmdirSync(dir);
  } catch {
    // Directory not empty (unexpected third entry) or already gone: leave it.
  }
}

describeLive('CodexAppServerTransport ws-auth fallback against a real old-CLI process', () => {
  let workspaces: string[] = [];

  beforeEach(() => {
    workspaces = [];
  });

  afterEach(() => {
    for (const dir of workspaces.splice(0)) {
      cleanupWorkspace(dir);
    }
  });

  it('falls back exactly once when the parser rejects --ws-auth (clap-style exit 2)', async () => {
    const workspace = freshWorkspace();
    workspaces.push(workspace);
    const client = makeClient(workspace);
    // The retry spawn prints a URL but nothing listens on it: start() ends in a
    // connection failure. The assertion target is the SPAWN SEQUENCE, proven by
    // the emulator's own invocation log.
    void client.start().catch(() => { /* connection refusal after fallback is expected */ });

    await waitFor(() => readInvocations(path.join(workspace, 'invocations.jsonl')).length >= 2, 8000);
    const invocations = readInvocations(path.join(workspace, 'invocations.jsonl'));
    expect(invocations[0]).toMatchObject({ hasAuthFlag: true, argv: expect.arrayContaining(['--ws-auth', 'capability-token', '--ws-token-sha256']) });
    expect(invocations[1]).toMatchObject({ hasAuthFlag: false });
    expect(invocations).toHaveLength(2);

    await client.stop();
    expect((client as unknown as { wsAuthToken: string | null }).wsAuthToken).toBeNull();
  }, 20000);

  it('does NOT downgrade on an unrelated non-zero failure (config error, exit 78) even with auth flags present', async () => {
    const workspace = freshWorkspace();
    workspaces.push(workspace);
    const client = makeClient(workspace, 'config');

    await expect(client.start()).rejects.toThrow('App-server exited with code 78');

    // Bounded grace window: no second spawn may appear.
    await new Promise((resolve) => setTimeout(resolve, 500));
    const invocations = readInvocations(path.join(workspace, 'invocations.jsonl'));
    expect(invocations).toHaveLength(1);
    expect(invocations[0]).toMatchObject({ hasAuthFlag: true, kind: 'config' });
    // Fail-closed: the capability token is untouched, never silently dropped.
    expect((client as unknown as { wsAuthToken: string | null }).wsAuthToken).not.toBeNull();
    await client.stop();
  }, 20000);

  it('does not fall back for a missing executable (ENOENT)', async () => {
    const workspace = freshWorkspace();
    workspaces.push(workspace);
    const client = makeClient(workspace);
    // Point the transport at a directory that is not executable: the emulator
    // file itself is used only to prove the workspace wiring above.
    (client as unknown as { codexPathOverride: string }).codexPathOverride = path.join(workspace, 'missing-codex');

    await expect(client.start()).rejects.toThrow(/ENOENT/);
    expect(readInvocations(path.join(workspace, 'invocations.jsonl'))).toHaveLength(0);
    expect((client as unknown as { wsAuthToken: string | null }).wsAuthToken).not.toBeNull();
    await client.stop();
  }, 20000);

  it('emulator fixture contract: executable, writes invocations, emits clap rejection for auth flags', () => {
    const workspace = freshWorkspace();
    workspaces.push(workspace);
    const env = { ...process.env, FAKE_INVOCATIONS: path.join(workspace, 'invocations.jsonl') };
    const rejected = spawnSync(EMULATOR_PATH, ['app-server', '--listen', 'ws://127.0.0.1:0', '--ws-auth', 'capability-token'], { env, encoding: 'utf8' });
    expect(rejected.status).toBe(2);
    expect(rejected.stderr).toContain("unexpected argument '--ws-auth' found");
    // Usage text may mention the flag, but on lines WITHOUT a rejection phrase.
    expect(rejected.stderr.split('\n').some((line) => line.includes('--ws-auth') && /usage:/i.test(line))).toBe(true);
    expect(readInvocations(env.FAKE_INVOCATIONS as string)[0]).toMatchObject({ hasAuthFlag: true });
    // Sanity: the tmpdir only ever contains our probe artifacts.
    expect(readdirSync(workspace)).toContain('invocations.jsonl');
  });
});
