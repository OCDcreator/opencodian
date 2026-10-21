import { execFileSync } from 'node:child_process';
import * as path from 'node:path';

it('keeps SDK package output and bootstrap startup errors on their correct streams', () => {
  const root = path.resolve(__dirname, '../../../../../..');
  const report = execFileSync(process.execPath, ['--test', '--test-reporter=tap', path.join(__dirname, 'PiServiceOutputGuard.test.mjs')], {
    cwd: root, encoding: 'utf8', windowsHide: true,
    // CI exports NODE_OPTIONS=--test-reporter=tap; the child must not inherit a second reporter.
    env: { ...process.env, NODE_OPTIONS: '' },
  });
  expect(report).toContain('# fail 0');
});
