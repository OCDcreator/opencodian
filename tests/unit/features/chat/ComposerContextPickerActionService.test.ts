import type { App, TFile } from 'obsidian';
import {
  capturedNotices,
  clearCapturedNotices,
  TFile as TFileClass,
  TFolder,
} from 'obsidian';

import type { ContextGroup, PromptContextItem } from '../../../../src/core/types';
import {
  type ComposerContextGroupsPort,
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

describe('ComposerContextPickerActionService context groups (R-B2)', () => {
  beforeEach(() => {
    clearCapturedNotices();
  });

  function makeFile(path: string): TFile {
    return Object.assign(new TFileClass(), {
      path,
      name: path.split('/').pop() ?? path,
      basename: (path.split('/').pop() ?? path).replace(/\.md$/, ''),
      extension: 'md',
    });
  }

  function makeFolder(path: string): TFolder {
    return Object.assign(new TFolder(), { path, name: path.split('/').pop() ?? path });
  }

  function createGroupHarness(options: {
    groups: readonly ContextGroup[];
    vault: Map<string, TFile | TFolder>;
  }) {
    const app = {
      vault: {
        getAbstractFileByPath: (path: string) => options.vault.get(path) ?? null,
      },
    } as unknown as App;
    const addDraftContextItem = jest.fn();
    const host: ComposerContextPickerActionServiceHost = {
      addDraftContextItem,
      beginContextPickerInteraction: jest.fn(),
      completeContextPickerInteraction: jest.fn(),
    };
    const contextGroups: ComposerContextGroupsPort = { listGroups: () => options.groups };
    const contextAttachmentBuilder = {
      buildEntryContextItem: jest.fn(async (entry: TFile | TFolder) => (createContextItem({
        id: `ctx-${entry.path}`,
        kind: entry instanceof TFolder ? 'folder' : 'file',
        path: entry.path,
        label: entry.path,
        mime: entry instanceof TFolder ? 'application/x-directory' : 'text/markdown',
      }))),
    };
    const service = new ComposerContextPickerActionService(
      app,
      contextAttachmentBuilder,
      { getCatalog: jest.fn() },
      host,
      { contextGroups },
    );
    return { service, addDraftContextItem, contextAttachmentBuilder };
  }

  it('attaches every resolvable group entry in order — 8 entries become 8 items (验收 1)', async () => {
    const group: ContextGroup = {
      id: 'g8',
      name: '大主题',
      entries: Array.from({ length: 8 }, (_v, i) => ({ path: `notes/n${i + 1}.md`, kind: 'file' as const })),
    };
    const vault = new Map<string, TFile | TFolder>(group.entries.map((entry) => [entry.path, makeFile(entry.path)]));
    const { service, addDraftContextItem } = createGroupHarness({ groups: [group], vault });

    await expect(service.attachContextGroup('g8')).resolves.toBe(true);

    expect(addDraftContextItem).toHaveBeenCalledTimes(8);
    const attachedPaths = addDraftContextItem.mock.calls.map(([item]) => (item as PromptContextItem).path);
    expect(attachedPaths).toEqual(group.entries.map((entry) => entry.path));
    expect(capturedNotices.some((m) => m.includes('8'))).toBe(true);
  });

  it('skips missing entries with a notice instead of failing (验收 2)', async () => {
    const group: ContextGroup = {
      id: 'gm',
      name: '混合主题',
      entries: [
        { path: 'notes/a.md', kind: 'file' },
        { path: 'notes/deleted.md', kind: 'file' },
        { path: 'refs', kind: 'folder' },
      ],
    };
    const vault = new Map<string, TFile | TFolder>([
      ['notes/a.md', makeFile('notes/a.md')],
      ['refs', makeFolder('refs')],
    ]);
    const { service, addDraftContextItem } = createGroupHarness({ groups: [group], vault });

    await expect(service.attachContextGroup('gm')).resolves.toBe(true);

    expect(addDraftContextItem).toHaveBeenCalledTimes(2);
    const items = addDraftContextItem.mock.calls.map(([item]) => item as PromptContextItem);
    expect(items[0]).toMatchObject({ path: 'notes/a.md', kind: 'file' });
    expect(items[1]).toMatchObject({ path: 'refs', kind: 'folder' });
    expect(capturedNotices.some((m) => m.includes('notes/deleted.md'))).toBe(true);
  });

  it('reports a non-text file entry as missing instead of attaching it', async () => {
    const group: ContextGroup = {
      id: 'g',
      name: '含图片',
      entries: [{ path: 'assets/pic.png', kind: 'file' }],
    };
    const vault = new Map<string, TFile | TFolder>([['assets/pic.png', makeFile('assets/pic.png')]]);
    const { service, addDraftContextItem } = createGroupHarness({ groups: [group], vault });

    await expect(service.attachContextGroup('g')).resolves.toBe(false);
    expect(addDraftContextItem).not.toHaveBeenCalled();
    expect(capturedNotices.some((m) => m.includes('assets/pic.png'))).toBe(true);
  });

  it('passes the persisted groups and the attach callback into the picker modal', async () => {
    const chooseContextFilesMock = chooseContextFiles as jest.MockedFunction<typeof chooseContextFiles>;
    const group: ContextGroup = {
      id: 'g1',
      name: '主题',
      entries: [{ path: 'notes/a.md', kind: 'file' }],
    };
    const { service } = createGroupHarness({ groups: [group], vault: new Map() });
    chooseContextFilesMock.mockResolvedValue([]);

    await service.addChosenFileContextToActiveTab();

    const options = chooseContextFilesMock.mock.calls[0]![2];
    expect(options?.groups).toEqual([{ id: 'g1', name: '主题', entryCount: 1 }]);
    expect(typeof options?.onAttachGroup).toBe('function');
  });
});
