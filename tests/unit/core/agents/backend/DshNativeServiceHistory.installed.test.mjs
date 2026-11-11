import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// Public installed source only: the real bridge handler serves session/history
// from a stubbed readSurface owned by this fixture. No user credentials,
// profiles, provider requests or user session bytes are used.
// DSH_PUBLIC_INSTALL (the installed `@deepseek-ai/dsh` package directory) wins.
// Default candidates derive from the Node install prefix of `process.execPath`:
// Unix global modules live under `<prefix>/lib/node_modules`, Windows under
// `<prefix>/node_modules`, with npm's dirname(execPath) layout as fallback.
const explicitInstall = process.env.DSH_PUBLIC_INSTALL;
const execDir = path.dirname(process.execPath);
const nodePrefix = path.basename(execDir) === 'bin' ? path.dirname(execDir) : execDir;
const installRoot = explicitInstall ?? [
  path.join(nodePrefix, process.platform === 'win32' ? 'node_modules' : 'lib/node_modules', '@deepseek-ai', 'dsh'),
  path.join(execDir, 'node_modules', '@deepseek-ai', 'dsh'),
].find((candidate) => existsSync(path.join(candidate, 'package.json')));
const publicRoot = installRoot ? path.join(installRoot, 'node_modules', '@deepseek-ai') : undefined;
const available = !!publicRoot && existsSync(`${publicRoot}/dsh-mcp-client/lib/index.js`);
// A configured-but-unusable DSH_PUBLIC_INSTALL is a configuration error: the
// whole file must fail, never hide behind the no-install skip below.
if (explicitInstall && !available) {
  throw new Error(`DSH_PUBLIC_INSTALL is set but unusable: missing ${publicRoot}/dsh-mcp-client/lib/index.js under ${explicitInstall}`);
}

test('real bridge session/history relays only the recorded per-message model identity', {
  skip: !explicitInstall && !available, timeout: 20_000,
}, async (context) => {
  const fixture = fileURLToPath(new URL('./DshNativeServiceHistory.fixture.mjs', import.meta.url));
  const anchor = path.join(installRoot, 'package.json');
  const child = spawn(process.execPath, [fixture, anchor], { stdio: ['pipe', 'pipe', 'pipe'] });
  context.after(() => { if (child.exitCode === null) child.kill(); });
  let stderr = '';
  child.stderr.setEncoding('utf8'); child.stderr.on('data', (chunk) => { stderr += chunk; });
  const pending = new Map();
  const lines = createInterface({ input: child.stdout });
  lines.on('line', (line) => {
    try { const value = JSON.parse(line); pending.get(value.id)?.(value); pending.delete(value.id); } catch { /* notifications */ }
  });
  const request = (id, method, params = {}) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`request ${method} timed out: ${stderr.slice(-400)}`)), 15_000);
    timer.unref();
    pending.set(id, (value) => { clearTimeout(timer); resolve(value); });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
  try {
    const ready = await request(1, 'initialize');
    assert.equal(ready.result.nativeProtocol, 'opencodian.dsh-native/1');

    const history = await request(2, 'session/history', { sessionId: 'owned-surface' });
    assert.ok(history.result, `history call failed: ${JSON.stringify(history.error ?? history)}`);
    const messages = history.result.messages;
    assert.equal(messages.length, 5);

    // Allowlist contract: only the two recorded identity strings are added for
    // assistant messages with a model source; user/tool messages and messages
    // without a model source stay unlabeled. The adapter-private replayState
    // and the rest of the source object must never reach the wire.
    const labeled = [
      { role: 'user', hasModelFields: false },
      { role: 'assistant', hasModelFields: true, provider: 'deepseek-official', model: 'deepseek-chat' },
      { role: 'assistant', hasModelFields: true, provider: 'deepseek-official', model: 'deepseek-reasoner' },
      { role: 'assistant', hasModelFields: false },
      { role: 'tool', hasModelFields: false },
    ];
    for (const [index, expectation] of labeled.entries()) {
      const message = messages[index];
      assert.equal(message.role, expectation.role, `message ${index} role`);
      assert.equal(message.sourceProvider !== undefined, expectation.hasModelFields, `message ${index} sourceProvider presence`);
      assert.equal(message.sourceModel !== undefined, expectation.hasModelFields, `message ${index} sourceModel presence`);
      if (expectation.hasModelFields) {
        assert.equal(message.sourceProvider, expectation.provider);
        assert.equal(message.sourceModel, expectation.model);
        assert.equal(message.sourceKind, 'model');
      }
      assert.equal(typeof message.timestamp, 'number');
    }
    assert.equal(JSON.stringify(history.result).includes('REPLAY_MARKER'), false, 'replayState must not cross the bridge');
    // The allowlist is closed: no message carries keys outside the known set.
    const allowed = new Set(['id', 'role', 'sourceKind', 'toolCallId', 'isError', 'content', 'timestamp', 'sourceProvider', 'sourceModel']);
    for (const message of messages) {
      for (const key of Object.keys(message)) {
        assert.ok(allowed.has(key), `unexpected wire key ${key} on ${message.id}`);
      }
    }
  } finally {
    const exit = new Promise((resolve) => child.once('exit', resolve));
    child.stdin.end();
    await exit;
  }
});
