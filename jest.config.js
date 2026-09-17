/** @type {import('jest').Config} */

/**
 * Per-test timeout for the whole suite.
 *
 * Jest's 5s default is a *scheduling* budget here, not a work budget: the
 * filesystem- and process-heavy suites (core/config, core/agents/backend) finish
 * their slowest test in ~110ms when run alone, but stall past 5s when 777 suites
 * run together — Windows spends the difference on real CLI spawns, temp-dir I/O
 * and antivirus scanning, and the flaking file moves from run to run, so a
 * per-file allowlist cannot hold. 20s keeps ~180x headroom over the measured
 * cost while still failing a genuinely hung test in bounded time; the few suites
 * whose own work is slow (real git cycles, jsdom render passes) keep their
 * explicit 30-60s overrides.
 */
const TEST_TIMEOUT_MS = 20_000;

module.exports = {
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  modulePathIgnorePatterns: ['<rootDir>/reference-projects/'],
  testPathIgnorePatterns: ['<rootDir>/reference-projects/'],
  watchPathIgnorePatterns: ['<rootDir>/reference-projects/', '<rootDir>/coverage/', '<rootDir>/dist/'],
  projects: [
    {
      displayName: 'unit',
      roots: ['<rootDir>/src', '<rootDir>/tests'],
      testEnvironment: 'jsdom',
      testMatch: ['<rootDir>/tests/unit/**/*.test.ts'],
      testTimeout: TEST_TIMEOUT_MS,
      modulePathIgnorePatterns: ['<rootDir>/reference-projects/'],
      testPathIgnorePatterns: ['<rootDir>/reference-projects/'],
      watchPathIgnorePatterns: ['<rootDir>/reference-projects/', '<rootDir>/coverage/', '<rootDir>/dist/'],
      transform: {
        '^.+\\.tsx?$': ['ts-jest', {
          tsconfig: 'tsconfig.jest.json',
        }],
      },
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
        '^obsidian$': '<rootDir>/tests/__mocks__/obsidian.ts',
        '^@opencode-ai/sdk$': '<rootDir>/tests/__mocks__/opencode-sdk.ts',
      },
      setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
    },
    {
      displayName: 'integration',
      roots: ['<rootDir>/src', '<rootDir>/tests'],
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/integration/**/*.test.ts'],
      testTimeout: TEST_TIMEOUT_MS,
      modulePathIgnorePatterns: ['<rootDir>/reference-projects/'],
      testPathIgnorePatterns: ['<rootDir>/reference-projects/'],
      watchPathIgnorePatterns: ['<rootDir>/reference-projects/', '<rootDir>/coverage/', '<rootDir>/dist/'],
      transform: {
        '^.+\\.tsx?$': ['ts-jest', {
          tsconfig: 'tsconfig.jest.json',
        }],
      },
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
      },
    },
    {
      displayName: 'scripts',
      roots: ['<rootDir>/tests'],
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/unit/infrastructure/**/*.test.mjs'],
      testTimeout: TEST_TIMEOUT_MS,
      transform: {},
      moduleFileExtensions: ['js', 'mjs', 'json'],
    },
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/index.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
};
