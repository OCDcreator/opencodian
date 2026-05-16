import { SessionPermissionTracker } from '../../../../src/core/types/permission';

describe('SessionPermissionTracker', () => {
  it('scopes approvals by tool, action, and the full pattern set', () => {
    const tracker = new SessionPermissionTracker();

    tracker.addSessionApproval('session-1', 'edit', 'write', ['b.md', 'a.md']);

    expect(tracker.isSessionApproved('session-1', 'edit', 'write', ['a.md', 'b.md'])).toBe(true);
    expect(tracker.isSessionApproved('session-1', 'read', 'write', ['a.md', 'b.md'])).toBe(false);
    expect(tracker.isSessionApproved('session-1', 'edit', 'write', ['a.md'])).toBe(false);
    expect(tracker.isSessionApproved('session-1', 'edit', 'read', ['a.md', 'b.md'])).toBe(false);
  });
});
