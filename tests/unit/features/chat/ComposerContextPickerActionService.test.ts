import type { App, TFile } from 'obsidian';
import { TFile as TFileClass, TFolder } from 'obsidian';

import type { PromptContextItem } from '../../../../src/core/types';
import {
  ComposerContextPickerActionService,
  type ComposerContextPickerActionServiceHost,
} from '../../../../src/features/chat/services/ComposerContextPickerActionService';
import { chooseContextFiles } from '../../../../src/features/chat/ui/ContextFilePickerModal';

jest.mock('../../../../src/features/chat/ui/ContextFilePickerModal', () => ({
  chooseContextFiles: jest.fn(),
}));

function createContextItem(overrides: Partial<PromptContextItem> = {}): PromptContextItem {
  return {
    id: overrides.id ?? 'context-1',
    kind: overrides.kind ?? 'file',
    path: overrides.path ?? 'notes/A.md',
    label: overrides.label ?? 'A.md',
    mime: overrides.mime ?? 'text/markdown',
    lineRange: overrides.lineRange,
    textSnapshot: overrides.textSnapshot,
  };
}

function createHarness(options: {
  builtItems?: ReadonlyMap<string, PromptContextItem | null>;
} = {}) {
  const app = {} as App;
  const addDraftContextItem = jest.fn();
  const beginContextPickerInteraction = jest.fn();
  const completeContextPickerInteraction = jest.fn();

  const host: ComposerContextPickerActionServiceHost = {
    addDraftContextItem,
    beginContextPickerInteraction,
    completeContextPickerInteraction,
  };

  const contextAttachmentBuilder = {
    buildEntryContextItem: jest.fn(async (entry: TFile) =>
      options.builtItems?.get(entry.path) ?? null),
  };

  const contextFileCatalogService = {
    getCatalog: jest.fn(async () => ({
      entries: [],
      extensions: [],
    })),
  };

  const service = new ComposerContextPickerActionService(
    app,
    contextAttachmentBuilder,
    contextFileCatalogService,
    host,
  );

  return {
    service,
    app,
    addDraftContextItem,
    beginContextPickerInteraction,
    completeContextPickerInteraction,
    contextAttachmentBuilder,
    contextFileCatalogService,
  };
}

describe('ComposerContextPickerActionService', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('opens the picker with lifecycle hooks and attaches every picked entry (multi-select)', async () => {
    const first = { path: 'docs/spec.md' } as TFile;
    const second = { path: 'docs/extra.md' } as TFile;
    const firstItem = createContextItem({ path: 'docs/spec.md' });
    const secondItem = createContextItem({ path: 'docs/extra.md' });
    const chooseContextFilesMock = chooseContextFiles as jest.MockedFunction<typeof chooseContextFiles>;
    const {
      service,
      app,
      addDraftContextItem,
      beginContextPickerInteraction,
      completeContextPickerInteraction,
      contextAttachmentBuilder,
      contextFileCatalogService,
    } = createHarness({
      builtItems: new Map([
        [first.path, firstItem],
        [second.path, secondItem],
      ]),
    });

    chooseContextFilesMock.mockImplementation(async (actualApp, loadCatalog) => {
      expect(beginContextPickerInteraction).toHaveBeenCalledTimes(1);
      expect(completeContextPickerInteraction).not.toHaveBeenCalled();
      expect(actualApp).toBe(app);
      await loadCatalog();
      return [first, second];
    });

    const result = await service.addChosenFileContextToActiveTab();

    expect(result).toBe(true);
    expect(contextFileCatalogService.getCatalog).toHaveBeenCalledTimes(1);
    expect(contextAttachmentBuilder.buildEntryContextItem).toHaveBeenCalledTimes(2);
    expect(addDraftContextItem).toHaveBeenCalledWith(firstItem);
    expect(addDraftContextItem).toHaveBeenCalledWith(secondItem);
    expect(beginContextPickerInteraction).toHaveBeenCalledTimes(1);
    expect(completeContextPickerInteraction).toHaveBeenCalledTimes(1);
  });

  it('returns false without mutating draft context when the picker is cancelled', async () => {
    const chooseContextFilesMock = chooseContextFiles as jest.MockedFunction<typeof chooseContextFiles>;
    const {
      service,
      addDraftContextItem,
      beginContextPickerInteraction,
      completeContextPickerInteraction,
      contextAttachmentBuilder,
    } = createHarness();
    chooseContextFilesMock.mockResolvedValue([]);

    const result = await service.addChosenFileContextToActiveTab();

    expect(result).toBe(false);
    expect(contextAttachmentBuilder.buildEntryContextItem).not.toHaveBeenCalled();
    expect(addDraftContextItem).not.toHaveBeenCalled();
    expect(beginContextPickerInteraction).toHaveBeenCalledTimes(1);
    expect(completeContextPickerInteraction).toHaveBeenCalledTimes(1);
  });

  it('still completes the picker lifecycle when the modal throws', async () => {
    const chooseContextFilesMock = chooseContextFiles as jest.MockedFunction<typeof chooseContextFiles>;
    const {
      service,
      addDraftContextItem,
      beginContextPickerInteraction,
      completeContextPickerInteraction,
      contextAttachmentBuilder,
    } = createHarness({
      builtItems: new Map([['docs/spec.md', createContextItem({ path: 'docs/spec.md' })]]),
    });
    chooseContextFilesMock.mockRejectedValue(new Error('picker failed'));

    await expect(service.addChosenFileContextToActiveTab()).rejects.toThrow('picker failed');

    expect(contextAttachmentBuilder.buildEntryContextItem).not.toHaveBeenCalled();
    expect(addDraftContextItem).not.toHaveBeenCalled();
    expect(beginContextPickerInteraction).toHaveBeenCalledTimes(1);
    expect(completeContextPickerInteraction).toHaveBeenCalledTimes(1);
  });

  it('claims vault drops only after resolving through the vault (R-A7)', async () => {
    const folder = Object.assign(new TFolder(), { path: 'projects', name: 'projects' });
    const file = Object.assign(new TFileClass(), { path: 'notes/a.md', extension: 'md' });
    const abstractFiles = new Map<string, unknown>([
      ['projects', folder],
      ['notes/a.md', file],
      ['outside.txt', null],
    ]);
    const app = {
      vault: {
        getAbstractFileByPath: (path: string) => abstractFiles.get(path) ?? null,
      },
    } as unknown as App;
    const addDraftContextItem = jest.fn();
    const service = new ComposerContextPickerActionService(
      app,
      { buildEntryContextItem: jest.fn(async () => createContextItem()) },
      { getCatalog: jest.fn() },
      {
        addDraftContextItem,
        beginContextPickerInteraction: jest.fn(),
        completeContextPickerInteraction: jest.fn(),
      },
    );

    // Outside-vault / unknown paths are not claimed.
    expect(service.addVaultPathContextFromDrop('/etc/passwd')).toBe(false);
    expect(service.addVaultPathContextFromDrop('')).toBe(false);

    // Vault file and folder drops are claimed and attach asynchronously.
    expect(service.addVaultPathContextFromDrop('projects')).toBe(true);
    expect(service.addVaultPathContextFromDrop('notes/a.md')).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(addDraftContextItem).toHaveBeenCalledTimes(2);
  });
});
