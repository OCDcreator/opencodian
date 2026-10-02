/* eslint-disable @typescript-eslint/no-require-imports -- The scripts Jest project loads .mjs tests as untransformed CommonJS; the audited ESM contracts run in a separate Node process. */
const { execFileSync } = require('node:child_process');
const path = require('node:path');

test('T11 native candidate contracts preserve evidence levels and disabled-plugin selection semantics', () => {
  const output = execFileSync(process.execPath, [
    '--test', path.join(process.cwd(), 'scripts/audit/codex-native-candidates.test.mjs'),
  ], { cwd: process.cwd(), encoding: 'utf8', timeout: 30000 });
  expect(output).toContain('# fail 0');
  expect(output).toContain('schema advertisements keep all feature defaults off');
  expect(output).toContain('method-not-found revokes advertisement');
  expect(output).toContain('disabled plugin omission/null preserve');
});
