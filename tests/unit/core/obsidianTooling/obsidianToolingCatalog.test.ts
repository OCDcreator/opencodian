import {
  buildGateScriptCommandSets,
  classifyObsidianSubcommand,
  OBSIDIAN_TOOLING_COMMAND_CATALOG,
  OBSIDIAN_TOOLING_MVP_HIGH_IMPACT_COMMANDS,
} from '../../../../src/core/obsidianTooling/obsidianToolingCatalog';

describe('Obsidian CLI command catalog (R-B4)', () => {
  it('classifies every MVP high-impact subcommand as high-impact', () => {
    for (const subcommand of OBSIDIAN_TOOLING_MVP_HIGH_IMPACT_COMMANDS) {
      expect(classifyObsidianSubcommand(subcommand)).toBe('high-impact');
    }
  });

  it('keeps the MVP read surface queryable without any gate', () => {
    expect(classifyObsidianSubcommand('themes')).toBe('read');
    expect(classifyObsidianSubcommand('plugins:enabled')).toBe('read');
    expect(classifyObsidianSubcommand('orphans')).toBe('read');
    expect(classifyObsidianSubcommand('search')).toBe('read');
    expect(classifyObsidianSubcommand('bookmarks')).toBe('read');
    expect(classifyObsidianSubcommand('daily:read')).toBe('read');
    expect(classifyObsidianSubcommand('tags')).toBe('read');
    expect(classifyObsidianSubcommand('property:read')).toBe('read');
  });

  it('classifies daily/property/bookmark mutation commands as vault writes', () => {
    expect(classifyObsidianSubcommand('daily:append')).toBe('vault-write');
    expect(classifyObsidianSubcommand('daily:prepend')).toBe('vault-write');
    expect(classifyObsidianSubcommand('property:set')).toBe('vault-write');
    expect(classifyObsidianSubcommand('property:remove')).toBe('vault-write');
    expect(classifyObsidianSubcommand('bookmark')).toBe('vault-write');
  });

  it('fail-closes unknown and empty subcommands to high-impact', () => {
    expect(classifyObsidianSubcommand('future:subcommand')).toBe('high-impact');
    expect(classifyObsidianSubcommand('')).toBe('high-impact');
    expect(classifyObsidianSubcommand(null)).toBe('high-impact');
    expect(classifyObsidianSubcommand(undefined)).toBe('high-impact');
  });

  it('gates arbitrary command execution, eval surfaces and app disruption', () => {
    for (const subcommand of ['command', 'eval', 'delete', 'reload', 'restart', 'devtools', 'dev:console']) {
      expect(classifyObsidianSubcommand(subcommand)).toBe('high-impact');
    }
  });

  it('never classifies the same subcommand twice', () => {
    const seen = new Set<string>();
    for (const entry of OBSIDIAN_TOOLING_COMMAND_CATALOG) {
      expect(seen.has(entry.subcommand)).toBe(false);
      seen.add(entry.subcommand);
    }
  });

  it('builds disjoint gate script sets covering the whole catalog', () => {
    const { passthrough, highImpact } = buildGateScriptCommandSets();
    expect(new Set([...passthrough, ...highImpact]).size).toBe(OBSIDIAN_TOOLING_COMMAND_CATALOG.length);
    const overlap = passthrough.filter((name) => highImpact.includes(name));
    expect(overlap).toEqual([]);
    expect([...passthrough]).toEqual([...passthrough].sort());
    expect([...highImpact]).toEqual([...highImpact].sort());
  });
});
