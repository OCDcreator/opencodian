import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const installation = process.env.DSH_PUBLIC_INSTALL;
const available = Boolean(installation && existsSync(path.join(installation, 'node_modules', '@deepseek-ai', 'dsh-experimental-terminal-bundle', 'package.json')));
const contextOnly = process.env.DSH_TERMINAL_CONTEXT_ONLY === '1';

test('installed official terminal enablement persists across process reboot and recreates isolated owned PTYs', {
  skip: !available && 'DSH_PUBLIC_INSTALL with the official terminal bundle is required', timeout: 55_000,
}, async () => {
  const directory = await realpath(await mkdtemp(path.join(os.tmpdir(), 'opencodian-terminal-bundle-')));
  const home = path.join(directory, 'home');
  await mkdir(home, { mode: 0o700 });
  const fixture = fileURLToPath(new URL('./DshTerminalBundle.fixture.mjs', import.meta.url));
  for (const phase of contextOnly ? ['context-only'] : ['enable', 'reboot-disable', 'verify-disabled']) {
    const child = spawn(process.execPath, [fixture, installation, directory, phase], {
      cwd: directory, stdio: ['ignore', 'pipe', 'pipe'],
      env: { PATH: `${path.dirname(process.execPath)}${path.delimiter}/usr/bin${path.delimiter}/bin`, HOME: home,
        DSH_HOME: path.join(home, 'dsh'), XDG_CONFIG_HOME: path.join(home, 'config'), XDG_DATA_HOME: path.join(home, 'data'),
        DSH_TELEMETRY_DISABLED: '1' },
    });
    let output = ''; let errors = '';
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { errors += chunk; });
    const timeout = setTimeout(() => child.kill('SIGTERM'), 15_000);
    const forcedStop = setTimeout(() => child.kill('SIGKILL'), 17_000);
    const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
    clearTimeout(timeout); clearTimeout(forcedStop);
    assert.equal(code, 0, `Isolated terminal fixture ${phase} failed: ${errors}\n${output}`);
    assert.match(output, contextOnly ? /official-isolated-terminal-context-persist-reboot/ : /official-terminal-enable-pty-persist-reboot-disable/);
    // Each line is task-owned metadata; no profile/credential values or terminal commands are included.
    console.log(output.trim());
  }
});
