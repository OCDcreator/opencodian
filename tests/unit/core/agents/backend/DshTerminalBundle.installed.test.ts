import { execFileSync } from 'node:child_process';
import path from 'node:path';

it('proves official terminal bundle enablement, isolation, owned PTYs and reboot through the installed runtime', () => {
  const output = execFileSync(process.execPath, ['--test', '--test-reporter=tap', path.join(__dirname, 'DshTerminalBundle.installed.test.mjs')], {
    cwd: process.cwd(), encoding: 'utf8', windowsHide: true, timeout: 58_000,
    env: { ...process.env, NODE_OPTIONS: '' },
  });
  expect(output).toContain('# fail 0');
  expect(output).toContain('# tests 1');
  const expected = process.env.DSH_PUBLIC_INSTALL
    ? process.env.DSH_TERMINAL_CONTEXT_ONLY === '1' ? 'official-isolated-terminal-context-persist-reboot' : 'official-terminal-enable-pty-persist-reboot-disable'
    : '# skipped 1';
  expect(output).toContain(expected);
}, 60_000);
