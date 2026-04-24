import { OpencodeConfigManager } from '../../../../src/core/config/OpencodeConfigManager';

describe('OpencodeConfigManager permission summary', () => {
  it('summarizes only exact OpenCodian templates as named templates', () => {
    expect(OpencodeConfigManager.summarizePermissionConfig('allow')).toEqual({
      templateMode: 'yolo',
      customFeatures: [],
    });
    expect(
      OpencodeConfigManager.summarizePermissionConfig({
        '*': 'ask',
        read: 'ask',
        edit: 'ask',
        write: 'ask',
        bash: 'ask',
        websearch: 'ask',
        webfetch: 'ask',
        glob: 'ask',
        grep: 'ask',
        list: 'ask',
        task: 'ask',
        skill: 'ask',
      }),
    ).toEqual({
      templateMode: 'normal',
      customFeatures: [],
    });
    expect(
      OpencodeConfigManager.summarizePermissionConfig({
        '*': 'ask',
        edit: 'deny',
        write: 'deny',
        bash: 'ask',
      }),
    ).toEqual({
      templateMode: 'plan',
      customFeatures: [],
    });
  });

  it('treats task allowlists and external-directory rules as custom semantics', () => {
    expect(
      OpencodeConfigManager.summarizePermissionConfig({
        '*': 'ask',
        task: {
          '*': 'deny',
          'review-*': 'allow',
        },
        external_directory: {
          '*': 'ask',
          '/shared/libs/*': 'allow',
        },
      }),
    ).toEqual({
      templateMode: null,
      customFeatures: ['external-directory', 'task-allowlist'],
    });
  });

  it('treats non-template pattern overrides as custom patterned rules', () => {
    expect(
      OpencodeConfigManager.summarizePermissionConfig({
        '*': 'ask',
        read: {
          '*': 'allow',
          '*.env': 'ask',
        },
      }),
    ).toEqual({
      templateMode: null,
      customFeatures: ['patterned-rules'],
    });
  });
});
