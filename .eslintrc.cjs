module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'simple-import-sort', 'jest'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:jest/recommended',
  ],
  parserOptions: {
    ecmaVersion: 2018,
    sourceType: 'module',
  },
  rules: {
    'simple-import-sort/imports': 'error',
    'simple-import-sort/exports': 'error',
    complexity: ['warn', { max: 20 }],
    'max-lines': ['warn', { max: 500, skipBlankLines: true, skipComments: true }],
    'max-lines-per-function': ['warn', { max: 200, skipBlankLines: true, skipComments: true }],
    'max-params': ['warn', 4],
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'no-console': ['warn', { allow: ['error', 'warn'] }],
  },
  overrides: [
    {
      files: ['src/types/jsx-shim.ts'],
      rules: {
        '@typescript-eslint/no-namespace': 'off',
      },
    },
    {
      files: ['src/utils/icons/lobehubIconManifest.ts'],
      rules: {
        'max-lines': 'off',
        'max-lines-per-function': 'off',
      },
    },
  ],
  env: {
    node: true,
    browser: true,
    es2018: true,
    jest: true,
  },
};
