import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

it('roundtrips unchanged stored Pi enums while rejecting new or changed unsupported enums (PC1)', () => {
  const output = execFileSync(process.execPath, ['--test', '--test-reporter=tap', join(__dirname, 'PiConfigurationEnumRoundtrip.test.mjs')], { cwd: process.cwd(), encoding: 'utf8', windowsHide: true,
  // CI exports NODE_OPTIONS=--test-reporter=tap; the child must not inherit a second reporter.
  env: { ...process.env, NODE_OPTIONS: '' } });
  expect(output).toContain('# fail 0');
  expect(output).toContain('# pass 9');
}, 30000);
