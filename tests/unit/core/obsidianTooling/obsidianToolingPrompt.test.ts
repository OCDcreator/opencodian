import {
  OBSIDIAN_TOOLING_INJECTION_CLOSE_MARKER,
  OBSIDIAN_TOOLING_INJECTION_OPEN_MARKER,
  OBSIDIAN_TOOLING_MVP_HIGH_IMPACT_COMMANDS,
  OBSIDIAN_TOOLING_MVP_READ_COMMANDS,
  OBSIDIAN_TOOLING_MVP_VAULT_WRITE_COMMANDS,
} from '../../../../src/core/obsidianTooling/obsidianToolingCatalog';
import {
  buildObsidianToolingBlock,
} from '../../../../src/core/obsidianTooling/obsidianToolingPrompt';

describe('tooling capability block (R-B4 injected skill)', () => {
  const available = buildObsidianToolingBlock({
    availability: 'available',
    gatePath: '/vault/.opencodian/obsidian-tooling/obsidian-gate',
    cliCommand: 'obsidian',
  });

  it('is marker-framed for epoch detection', () => {
    expect(available).toContain(OBSIDIAN_TOOLING_INJECTION_OPEN_MARKER);
    expect(available).toContain(OBSIDIAN_TOOLING_INJECTION_CLOSE_MARKER);
    expect(available.indexOf(OBSIDIAN_TOOLING_INJECTION_OPEN_MARKER)).toBeLessThan(
      available.indexOf(OBSIDIAN_TOOLING_INJECTION_CLOSE_MARKER),
    );
  });

  it('names the gate wrapper as the only invocation path', () => {
    expect(available).toContain('/vault/.opencodian/obsidian-tooling/obsidian-gate');
  });

  it('documents the confirmation gate exit semantics', () => {
    expect(available).toContain('exit 3');
    expect(available).toContain('exit 4');
    expect(available).toContain('exit 5');
    expect(available.toLowerCase()).toContain('never work around the gate');
  });

  it('lists the MVP read and vault-write surfaces plus the high-impact set', () => {
    for (const command of OBSIDIAN_TOOLING_MVP_READ_COMMANDS) {
      expect(available).toContain(command);
    }
    for (const command of OBSIDIAN_TOOLING_MVP_VAULT_WRITE_COMMANDS) {
      expect(available).toContain(command);
    }
    for (const command of OBSIDIAN_TOOLING_MVP_HIGH_IMPACT_COMMANDS) {
      expect(available).toContain(command);
    }
  });

  it('unavailable variant stays honest and short without command usage', () => {
    const unavailable = buildObsidianToolingBlock({
      availability: 'unavailable',
      gatePath: '/vault/.opencodian/obsidian-tooling/obsidian-gate',
      cliCommand: 'obsidian',
      unavailableReason: 'obsidian: command not found',
    });
    expect(unavailable).toContain(OBSIDIAN_TOOLING_INJECTION_OPEN_MARKER);
    expect(unavailable).toContain('UNAVAILABLE');
    expect(unavailable).toContain('obsidian: command not found');
    expect(unavailable).not.toContain('HOW TO CALL');
  });

  it('is deterministic', () => {
    const again = buildObsidianToolingBlock({
      availability: 'available',
      gatePath: '/vault/.opencodian/obsidian-tooling/obsidian-gate',
      cliCommand: 'obsidian',
    });
    expect(again).toBe(available);
  });
});
