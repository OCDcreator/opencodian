import { App, Modal, Notice } from 'obsidian';

jest.mock('obsidian', () => ({
  ...jest.requireActual('obsidian'),
  Notice: jest.fn(),
}));

import type { McpConfigService } from '../../../../src/core/config/McpConfigService';
import { McpServerEditorModal } from '../../../../src/features/settings/McpServerEditorModal';
import { TextareaSizeMemory } from '../../../../src/features/settings/TextareaSizeMemory';
import { setLocale, t } from '../../../../src/i18n';
import {
  changeText,
  changeTextArea,
  changeToggle,
  clearRecordArrays,
  expectLastNotice,
  flushAsync,
  getTextAreaRecord,
  getTextRecord,
  mockSettingPrototype,
} from './helpers/mcpSectionTestHelpers';

function createService(): jest.Mocked<Pick<McpConfigService, 'upsertServer'>> {
  return {
    upsertServer: jest.fn().mockResolvedValue(undefined),
  };
}

describe('McpServerEditorModal', () => {
  beforeEach(() => {
    setLocale('en');
    document.body.innerHTML = '';
    clearRecordArrays();
    (Notice as unknown as jest.Mock).mockClear();
    jest.spyOn(TextareaSizeMemory, 'attach').mockReturnValue({
      destroy: jest.fn(),
    } as unknown as TextareaSizeMemory);
    mockSettingPrototype();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('prefills edit mode from project config truth and saves through McpConfigService', async () => {
    const service = createService();
    const closeSpy = jest.spyOn(Modal.prototype, 'close').mockImplementation(() => {});
    const onSaved = jest.fn();
    const modal = new McpServerEditorModal({} as App, {
      mode: 'edit',
      serverName: 'exa',
      existingEntry: {
        type: 'remote',
        url: 'https://mcp.example.com/mcp',
        headers: { Authorization: 'Bearer secret' },
        enabled: false,
      },
      existingNames: ['exa'],
      configService: service as unknown as McpConfigService,
      onSaved,
    });

    modal.onOpen();

    expect(getTextRecord(t('settings.server.mcp.add.name'))?.control.inputEl.value).toBe('exa');
    expect(getTextRecord(t('settings.server.mcp.add.url'))?.control.inputEl.value).toBe('https://mcp.example.com/mcp');
    expect(getTextAreaRecord(t('settings.server.mcp.add.headers'))?.control.inputEl.value).toBe(
      'Authorization=[redacted]',
    );

    await changeText(t('settings.server.mcp.add.url'), 'https://new.example.com/mcp');
    modal.contentEl.querySelector<HTMLButtonElement>('.opencodian-mcp-form-actions > button')?.click();
    await flushAsync();

    expect(service.upsertServer).toHaveBeenCalledWith('exa', {
      type: 'remote',
      url: 'https://new.example.com/mcp',
      headers: { Authorization: 'Bearer secret' },
      enabled: false,
    });
    expect(onSaved).toHaveBeenCalled();
    expect(closeSpy).toHaveBeenCalled();
  });

  it('validates add mode and submits local server payload', async () => {
    const service = createService();
    const modal = new McpServerEditorModal({} as App, {
      mode: 'add',
      existingNames: ['duplicate'],
      configService: service as unknown as McpConfigService,
      onSaved: jest.fn(),
    });

    modal.onOpen();

    modal.contentEl.querySelector<HTMLButtonElement>('.opencodian-mcp-form-actions > button')?.click();
    expectLastNotice(t('settings.server.mcp.validation.nameRequired'));

    await changeText(t('settings.server.mcp.add.name'), 'local');
    await changeTextArea(t('settings.server.mcp.add.command'), 'node\nserver.js');
    await changeToggle(t('settings.server.mcp.add.enabled'), false);
    modal.contentEl.querySelector<HTMLButtonElement>('.opencodian-mcp-form-actions > button')?.click();
    await flushAsync();

    expect(service.upsertServer).toHaveBeenCalledWith('local', {
      type: 'local',
      command: ['node', 'server.js'],
      enabled: false,
    });
  });

  it('attaches textarea size memory to local and remote textarea fields', () => {
    const service = createService();

    const localModal = new McpServerEditorModal({} as App, {
      mode: 'add',
      existingNames: [],
      configService: service as unknown as McpConfigService,
      onSaved: jest.fn(),
    });
    localModal.onOpen();

    expect(TextareaSizeMemory.attach).toHaveBeenCalledWith(
      getTextAreaRecord(t('settings.server.mcp.add.command'))!.control.inputEl,
      'mcp-local-command',
    );
    expect(TextareaSizeMemory.attach).toHaveBeenCalledWith(
      getTextAreaRecord(t('settings.server.mcp.add.environment'))!.control.inputEl,
      'mcp-local-environment',
    );

    clearRecordArrays();
    (TextareaSizeMemory.attach as jest.Mock).mockClear();

    const remoteModal = new McpServerEditorModal({} as App, {
      mode: 'edit',
      serverName: 'remote',
      existingEntry: {
        type: 'remote',
        url: 'https://example.com/mcp',
      },
      existingNames: ['remote'],
      configService: service as unknown as McpConfigService,
      onSaved: jest.fn(),
    });
    remoteModal.onOpen();

    expect(TextareaSizeMemory.attach).toHaveBeenCalledWith(
      getTextAreaRecord(t('settings.server.mcp.add.headers'))!.control.inputEl,
      'mcp-remote-headers',
    );
  });

  it('keeps duplicate name validation scoped to add mode', async () => {
    const service = createService();
    const modal = new McpServerEditorModal({} as App, {
      mode: 'add',
      existingNames: ['duplicate'],
      configService: service as unknown as McpConfigService,
      onSaved: jest.fn(),
    });

    modal.onOpen();

    await changeText(t('settings.server.mcp.add.name'), 'duplicate');
    await changeTextArea(t('settings.server.mcp.add.command'), 'node');
    modal.contentEl.querySelector<HTMLButtonElement>('.opencodian-mcp-form-actions > button')?.click();

    expectLastNotice(t('settings.server.mcp.validation.nameDuplicate'));
    expect(service.upsertServer).not.toHaveBeenCalled();
  });

  it('lets edit mode clear previously stored sensitive fields instead of preserving them implicitly', async () => {
    const service = createService();
    const modal = new McpServerEditorModal({} as App, {
      mode: 'edit',
      serverName: 'exa',
      existingEntry: {
        type: 'remote',
        url: 'https://mcp.example.com/mcp',
        headers: { Authorization: 'Bearer secret' },
        oauth: {
          clientId: 'client-123',
          clientSecret: 'secret-abc',
        },
      },
      existingNames: ['exa'],
      configService: service as unknown as McpConfigService,
      onSaved: jest.fn(),
    });

    modal.onOpen();

    await changeTextArea(t('settings.server.mcp.add.headers'), '');
    await changeText(t('settings.server.mcp.add.oauthClientSecret'), '');
    modal.contentEl.querySelector<HTMLButtonElement>('.opencodian-mcp-form-actions > button')?.click();
    await flushAsync();

    expect(service.upsertServer).toHaveBeenCalledWith('exa', {
      type: 'remote',
      url: 'https://mcp.example.com/mcp',
      oauth: {
        clientId: 'client-123',
      },
      enabled: true,
    });
  });

  it('redacts sensitive save errors in notices', async () => {
    const service = {
      upsertServer: jest.fn().mockRejectedValue(new Error('Authorization=Bearer super-secret')),
    };
    const modal = new McpServerEditorModal({} as App, {
      mode: 'add',
      existingNames: [],
      configService: service as unknown as McpConfigService,
      onSaved: jest.fn(),
    });

    modal.onOpen();

    await changeText(t('settings.server.mcp.add.name'), 'local');
    await changeTextArea(t('settings.server.mcp.add.command'), 'node\nserver.js');
    modal.contentEl.querySelector<HTMLButtonElement>('.opencodian-mcp-form-actions > button')?.click();
    await flushAsync();

    const noticeMock = Notice as unknown as jest.Mock;
    expect(String(noticeMock.mock.calls.at(-1)?.[0] ?? '')).not.toContain('super-secret');
  });

  it('reports config-saved runtime-failed as partial success and closes the modal', async () => {
    const service = createService();
    const closeSpy = jest.spyOn(Modal.prototype, 'close').mockImplementation(() => {});
    const modal = new McpServerEditorModal({} as App, {
      mode: 'add',
      existingNames: [],
      configService: service as unknown as McpConfigService,
      onSaved: jest.fn().mockRejectedValue(new Error('Authorization: Basic abc123')),
    });

    modal.onOpen();

    await changeText(t('settings.server.mcp.add.name'), 'local');
    await changeTextArea(t('settings.server.mcp.add.command'), 'node\nserver.js');
    modal.contentEl.querySelector<HTMLButtonElement>('.opencodian-mcp-form-actions > button')?.click();
    await flushAsync();

    const noticeMock = Notice as unknown as jest.Mock;
    const lastNotice = String(noticeMock.mock.calls.at(-1)?.[0] ?? '');
    expect(lastNotice).toContain('Saved MCP server "local" to project config');
    expect(lastNotice).not.toContain('abc123');
    expect(closeSpy).toHaveBeenCalled();
  });
});
