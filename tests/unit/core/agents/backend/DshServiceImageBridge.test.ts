import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { expect,it } from '@jest/globals';

/**
 * The bundled DSH service resolves history image blocks only through the owned
 * public attachment store (`readImage`). This proves the resolver contract in
 * isolation: owned bytes plus display name, and per-block failure containment
 * with stable codes instead of failing the whole history projection.
 */
it('resolves harness history images through the owned store and contains per-block failures', () => {
  const output = execFileSync(process.execPath, [path.join(__dirname, 'DshServiceImageBridge.fixture.mjs')], {
    cwd: process.cwd(), encoding: 'utf8', windowsHide: true, timeout: 30_000,
    env: { ...process.env, NODE_OPTIONS: '' },
  });
  const line = output.split('\n').find((entry) => entry.startsWith('RESULT:'));
  expect(line).toBeDefined();
  const results = JSON.parse(line!.slice('RESULT:'.length)) as Record<string, unknown>;
  expect(results.passthrough).toEqual({ type: 'text', text: 'hello' });
  expect(results.ownedNamed).toEqual({ type: 'image', mimeType: 'image/png', data: 'AQID', name: 'shot.png' });
  expect(results.ownedUnnamed).toEqual({ type: 'image', mimeType: 'image/jpeg', data: 'AQID' });
  expect(Object.keys(results.ownedUnnamed as object)).toEqual(['type', 'mimeType', 'data']);
  expect(results.missing).toEqual({ type: 'image', unavailable: true, reason: 'ATTACHMENT_NOT_FOUND' });
  expect(results.corrupt).toEqual({ type: 'image', unavailable: true, reason: 'ATTACHMENT_CORRUPT' });
  expect(results.opaqueFailure).toEqual({ type: 'image', unavailable: true, reason: 'unavailable' });
});
