/** @type {import('jest').Config} */
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
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/index.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
};
