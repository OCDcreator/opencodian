import { mkdtemp, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  deriveAuditFingerprint,
  deriveInstructionSummary,
  REMOTE_CONTROL_AUDIT_TRACE_ID,
  RemoteControlAudit,
} from '../../../../src/core/remotecontrol/RemoteControlAudit';
import { generateRemoteControlToken } from '../../../../src/core/remotecontrol/RemoteControlAuth';

const SECRET_TOKEN = generateRemoteControlToken();
const INSTRUCTION = '整理今日会议笔记并生成待办清单，路径参考 /etc/passwd';

describe('RemoteControlAudit (R-C6 audit record shape)', () => {
  let auditDirectory: string;

  beforeEach(async () => {
    auditDirectory = await mkdtemp(join(tmpdir(), 'opencodian-rc-audit-'));
  });

  afterEach(async () => {
    await rm(auditDirectory, { recursive: true, force: true });
  });

  function createAudit(): RemoteControlAudit {
    return new RemoteControlAudit({
      directory: auditDirectory,
      knownSecrets: () => [SECRET_TOKEN],
    });
  }

  describe('instruction digest: length + hash prefix only, never content', () => {
    it('derives charLength and the 12-hex sha256 prefix', () => {
      const summary = deriveInstructionSummary(INSTRUCTION);
      expect(summary.charLength).toBe(INSTRUCTION.length);
      expect(summary.sha256Prefix12).toMatch(/^[0-9a-f]{12}$/);
    });

    it('contains no substring of the instruction — including embedded paths', () => {
      const summary = deriveInstructionSummary(INSTRUCTION);
      const serialized = JSON.stringify(summary);
      expect(serialized).not.toContain('会议');
      expect(serialized).not.toContain('/etc/passwd');
      expect(serialized).not.toContain('待办');
      for (const fragment of ['整理', '笔记', '生成']) {
        expect(serialized.includes(fragment)).toBe(false);
      }
    });

    it('records the token as a fingerprint, never the token itself', () => {
      const fingerprint = deriveAuditFingerprint(SECRET_TOKEN);
      expect(fingerprint).toMatch(/^[0-9a-f]{12}$/);
      expect(fingerprint).not.toBe(SECRET_TOKEN);
      expect(JSON.stringify(fingerprint)).not.toContain(SECRET_TOKEN);
    });
  });

  describe('persisted records', () => {
    it('writes structural JSONL records with the audited four elements', async () => {
      const audit = createAudit();
      const instructionSummary = deriveInstructionSummary(INSTRUCTION);
      audit.emit('request.terminal', 'info', {
        requestId: 'rc_test-1',
        op: 'instruction.submit',
        source: { remoteAddress: '127.0.0.1', remotePort: 54321, host: '127.0.0.1:4105' },
        authFingerprint: deriveAuditFingerprint(SECRET_TOKEN),
        instruction: instructionSummary,
        outcome: { httpStatus: 200, terminalState: 'completed', durationMs: 1234 },
      }, 'ses_remote-1');
      await audit.flush();

      const events = await audit.store.readTrace(REMOTE_CONTROL_AUDIT_TRACE_ID);
      const terminal = events.find((event) => event.name === 'request.terminal');
      expect(terminal).toBeDefined();
      const payload = terminal?.payload as Record<string, unknown>;
      expect(payload.requestId).toBe('rc_test-1');
      expect(payload.op).toBe('instruction.submit');
      expect(payload.source).toEqual({
        remoteAddress: '127.0.0.1',
        remotePort: 54321,
        host: '127.0.0.1:4105',
      });
      expect(payload.authFingerprint).toMatch(/^[0-9a-f]{12}$/);
      expect(payload.instruction).toEqual(instructionSummary);
      expect(payload.outcome).toEqual({
        httpStatus: 200,
        terminalState: 'completed',
        durationMs: 1234,
      });
      expect(terminal?.sessionId).toBe('ses_remote-1');
      await audit.dispose();
    });

    it('punches through a leaked token even if a field accidentally carries it', async () => {
      const audit = createAudit();
      audit.emit('request.rejected', 'warning', {
        requestId: 'rc_test-2',
        // Simulates a future regression: a raw Authorization echo lands in a
        // payload field. The hardened layer must still destroy the secret.
        leakedHint: `Authorization: Bearer ${SECRET_TOKEN}`,
        instruction: deriveInstructionSummary(INSTRUCTION),
        outcome: { httpStatus: 401, code: 'unauthorized' },
      });
      await audit.flush();

      const events = await audit.store.readTrace(REMOTE_CONTROL_AUDIT_TRACE_ID);
      const serialized = JSON.stringify(events);
      expect(serialized).not.toContain(SECRET_TOKEN);
      expect(serialized).toContain('[REDACTED]');
      // The instruction field still only ever carried the digest.
      const rejected = events.find((event) => event.name === 'request.rejected');
      expect((rejected?.payload as Record<string, unknown>).instruction).toEqual({
        charLength: INSTRUCTION.length,
        sha256Prefix12: expect.stringMatching(/^[0-9a-f]{12}$/),
      });
      await audit.dispose();
    });

    it('the well-formed terminal record carries no instruction content anywhere', async () => {
      const audit = createAudit();
      audit.emit('request.terminal', 'info', {
        requestId: 'rc_test-3',
        op: 'instruction.submit',
        instruction: deriveInstructionSummary(INSTRUCTION),
        outcome: { httpStatus: 200, terminalState: 'completed', durationMs: 5 },
      });
      await audit.flush();

      const events = await audit.store.readTrace(REMOTE_CONTROL_AUDIT_TRACE_ID);
      const serialized = JSON.stringify(events);
      expect(serialized).not.toContain(INSTRUCTION);
      expect(serialized).not.toContain('/etc/passwd');
      expect(serialized).not.toContain('会议');
      await audit.dispose();
    });

    it('scrubs exports through the report sanitizer as the second redaction layer', async () => {
      const audit = createAudit();
      audit.emit('request.rejected', 'warning', {
        source: { remoteAddress: '127.0.0.1', remotePort: 54322, host: 'localhost:4105' },
        outcome: { httpStatus: 401, code: 'unauthorized' },
        note: `Authorization: Bearer ${SECRET_TOKEN}`,
      });
      await audit.flush();

      const exportDirectory = join(auditDirectory, 'export');
      const bundleDirectory = await audit.store
        .exportTraceBundle(REMOTE_CONTROL_AUDIT_TRACE_ID, exportDirectory);
      const structural = await readFile(join(bundleDirectory, 'structural.jsonl'), 'utf8');
      expect(structural).not.toContain(SECRET_TOKEN);
      expect(structural).not.toContain(`Bearer ${SECRET_TOKEN}`);
      await audit.dispose();
    });
  });
});
