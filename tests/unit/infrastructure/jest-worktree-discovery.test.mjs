const { globsToMatcher } = require('jest-util');
const config = require('../../../jest.config.js');

const cases = [
  ['unit', 'tests/unit/features/settings/example.test.ts', 'tests/integration/example.test.ts'],
  ['integration', 'tests/integration/example.test.ts', 'tests/unit/example.test.ts'],
  ['scripts', 'tests/unit/infrastructure/example.test.mjs', 'tests/unit/example.test.ts'],
];

test.each(cases)('%s discovers tests under dot-prefixed worktrees without crossing project patterns', (name, valid, wrongProject) => {
  const project = config.projects.find((item) => item.displayName === name);
  const matches = globsToMatcher(project.testMatch);
  for (const root of ['C:/Users/test/.codex/worktrees/project', '/home/test/.codex/worktrees/project', 'C:/workspace/project']) {
    expect(matches(`${root}/${valid}`)).toBe(true);
    expect(matches(`${root}/${wrongProject}`)).toBe(false);
    expect(matches(`${root}/reference-projects/example.test.ts`)).toBe(false);
    expect(matches(`${root}/src/example.test.ts`)).toBe(false);
  }
});
