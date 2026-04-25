const justifiedMaxLinesFiles = [
  'src/core/opencode/OpenCodeCatalogQueryCoordinator.ts',
  'src/core/opencode/OpenCodeService.ts',
  'src/core/opencode/OpenCodeStreamEventTransformer.ts',
  'src/core/opencode/OpenCodeStreamingRuntimeCoordinator.ts',
  'src/core/opencode/ServerManager.ts',
  'src/core/types/settings.ts',
  'src/features/chat/OpenCodianView.ts',
  'src/features/chat/glassOctahedronDemo.ts',
  'src/features/chat/glassOctahedronDemoRefraction.ts',
  'src/features/chat/liquidDiamondDemo.ts',
  'src/features/chat/liquidDiamondDemoWebgl.ts',
  'src/features/settings/ModelConfigModal.ts',
  'src/features/settings/ModelConfigProviderEditor.ts',
  'src/features/settings/OpenCodianSettings.ts',
  'src/features/settings/SettingsConversationSection.ts',
  'src/features/settings/SettingsModelCatalogPresenter.ts',
  'src/features/settings/SettingsStyleSection.ts',
  'src/features/settings/settingsStyleControls.ts',
  'src/features/settings/modelConfigWorkspace.ts',
  'src/i18n/locales/en.ts',
  'src/i18n/locales/zh.ts',
  'src/main.ts',
  'src/utils/glass/adapters/nikdelvin.ts',
  'src/utils/glass/adapters/shuding.ts',
  'src/utils/glass/adapters/shudingDiamond.ts',
  'src/utils/icons/ProviderIconService.ts',
  'src/utils/icons/builtinIconRegistry.ts',
  'src/utils/streaming/StreamController.ts',
  'tests/unit/core/opencode/OpenCodeStreamingRuntimeCoordinator.test.ts',
  'tests/unit/core/storage/StorageService.test.ts',
  'tests/unit/features/chat/glassOctahedronDemo.test.ts',
];

const justifiedMaxLinesPerFunctionFiles = [
  'src/features/chat/liquidDiamondDemo.ts',
  'src/features/chat/liquidDiamondDemoWebgl.ts',
];

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
    {
      files: justifiedMaxLinesFiles,
      rules: {
        'max-lines': 'off',
      },
    },
    {
      files: justifiedMaxLinesPerFunctionFiles,
      rules: {
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
