import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from '@jest/globals';

import { DshAdapter } from '../../../../../src/core/agents/backend/DshAdapter';

const liveDescribe = process.env.RUN_DSH_LIVE === '1' ? describe : describe.skip;

liveDescribe('DshAdapter live ACP probe', () => {
  it('creates, lists, closes, and resumes one isolated native session without prompting a model', async () => {
    const isolatedHome = mkdtempSync(path.join(os.tmpdir(), 'opencodian-dsh-live-'));
    const adapter = new DshAdapter({
      workingDirectory: '/tmp',
      getSettings: () => ({ executablePath: '', workingDirectory: '', args: [], env: {}, profile: 'acp' }),
      getExtraEnv: () => ({
        HOME: isolatedHome,
        DSH_HOME: path.join(isolatedHome, '.dsh'),
        XDG_CONFIG_HOME: path.join(isolatedHome, '.config'),
        XDG_DATA_HOME: path.join(isolatedHome, '.local', 'share'),
      }),
    });

    try {
      await adapter.start();
      expect(adapter.status).toBe('connected');
      const sessionId = await adapter.createSession('OpenCodian DSH probe');
      expect(sessionId).toEqual(expect.any(String));
      process.stdout.write(`${JSON.stringify({ stage: 'created-active', sessionId })}\n`);
      await expect(adapter.listSessions()).resolves.not.toEqual(expect.arrayContaining([
        expect.objectContaining({ id: sessionId }),
      ]));
      await adapter.stop();
      await adapter.start();
      await expect(adapter.listSessions()).resolves.toEqual(expect.arrayContaining([
        expect.objectContaining({ id: sessionId, sessionId }),
      ]));
      process.stdout.write(`${JSON.stringify({ stage: 'listed-inactive', sessionId })}\n`);
      await expect(adapter.createSession(undefined, { resumeSessionId: sessionId })).resolves.toBe(sessionId);
      process.stdout.write(`${JSON.stringify({ stage: 'resumed', sessionId })}\n`);
    } finally {
      await adapter.stop();
    }
  }, 30_000);
});
