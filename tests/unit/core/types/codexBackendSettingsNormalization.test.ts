import {
  getDefaultCodexBackendSettings,
  normalizeBackendSettings,
} from '../../../../src/core/types';

describe('normalizeCodexBackendSettings — approvalPolicy', () => {
  it('defaults to inherit', () => {
    expect(getDefaultCodexBackendSettings().approvalPolicy).toBe('inherit');
    expect(normalizeBackendSettings({}).codex.approvalPolicy).toBe('inherit');
  });

  it('migrates retired untrusted to on-request', () => {
    expect(normalizeBackendSettings({ codex: { approvalPolicy: 'untrusted' } }).codex.approvalPolicy).toBe('on-request');
  });

  it('preserves valid explicit policies unchanged', () => {
    expect(normalizeBackendSettings({ codex: { approvalPolicy: 'inherit' } }).codex.approvalPolicy).toBe('inherit');
    expect(normalizeBackendSettings({ codex: { approvalPolicy: 'on-request' } }).codex.approvalPolicy).toBe('on-request');
    expect(normalizeBackendSettings({ codex: { approvalPolicy: 'never' } }).codex.approvalPolicy).toBe('never');
  });

  it('normalizes missing or unknown values to inherit', () => {
    expect(normalizeBackendSettings({ codex: {} }).codex.approvalPolicy).toBe('inherit');
    expect(normalizeBackendSettings({ codex: { approvalPolicy: 'on-failure' } }).codex.approvalPolicy).toBe('inherit');
    expect(normalizeBackendSettings({ codex: { approvalPolicy: 'bogus' } }).codex.approvalPolicy).toBe('inherit');
    expect(normalizeBackendSettings({ codex: { approvalPolicy: '' } }).codex.approvalPolicy).toBe('inherit');
  });

  it('normalizes non-string values to inherit', () => {
    expect(normalizeBackendSettings({ codex: { approvalPolicy: 42 } }).codex.approvalPolicy).toBe('inherit');
    expect(normalizeBackendSettings({ codex: { approvalPolicy: null } }).codex.approvalPolicy).toBe('inherit');
    expect(normalizeBackendSettings({ codex: { approvalPolicy: true } }).codex.approvalPolicy).toBe('inherit');
  });

  it('never emits untrusted, even after a double pass', () => {
    const once = normalizeBackendSettings({ codex: { approvalPolicy: 'untrusted' } });
    expect(once.codex.approvalPolicy).toBe('on-request');
    const twice = normalizeBackendSettings({ codex: once.codex });
    expect(twice.codex.approvalPolicy).toBe('on-request');
  });
});
