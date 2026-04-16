import type { App, TFile } from 'obsidian';

import type { PromptContextItem } from '../../../../src/core/types';
import {
  ComposerContextPickerActionService,
  type ComposerContextPickerActionServiceHost,
} from '../../../../src/features/chat/services/ComposerContextPickerActionService';
import { chooseContextFile } from '../../../../src/features/chat/ui/ContextFilePickerModal';

jest.mock('../../../../src/features/chat/ui/ContextFilePickerModal', () => ({
  chooseContextFile: jest.fn(),
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
  fileItem?: PromptContextItem | null;
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
    buildFileContextItem: jest.fn(async () => options.fileItem ?? null),
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

  it('opens the file picker with picker lifecycle hooks, loads the catalog, and attaches the chosen file context', async () => {
    const file = { path: 'docs/spec.md' } as TFile;
    const fileItem = createContextItem({ path: 'docs/spec.md' });
    const chooseContextFileMock = chooseContextFile as jest.MockedFunction<typeof chooseContextFile>;
    const {
      service,
      app,
      addDraftContextItem,
      beginContextPickerInteraction,
      completeContextPickerInteraction,
      contextAttachmentBuilder,
      contextFileCatalogService,
    } = createHarness({
      fileItem,
    });

    chooseContextFileMock.mockImplementation(async (actualApp, loadCatalog) => {
      expect(beginContextPickerInteraction).toHaveBeenCalledTimes(1);
      expect(completeContextPickerInteraction).not.toHaveBeenCalled();
      expect(actualApp).toBe(app);
      await loadCatalog();
      return file;
    });

    const result = await service.addChosenFileContextToActiveTab();

    expect(result).toBe(true);
    expect(contextFileCatalogService.getCatalog).toHaveBeenCalledTimes(1);
    expect(contextAttachmentBuilder.buildFileContextItem).toHaveBeenCalledWith(file, 'file');
    expect(addDraftContextItem).toHaveBeenCalledWith(fileItem);
    expect(beginContextPickerInteraction).toHaveBeenCalledTimes(1);
    expect(completeContextPickerInteraction).toHaveBeenCalledTimes(1);
  });

  it('returns false without mutating draft context when the picker is cancelled', async () => {
    const chooseContextFileMock = chooseContextFile as jest.MockedFunction<typeof chooseContextFile>;
    const {
      service,
      addDraftContextItem,
      beginContextPickerInteraction,
      completeContextPickerInteraction,
      contextAttachmentBuilder,
    } = createHarness();
    chooseContextFileMock.mockResolvedValue(null);

    const result = await service.addChosenFileContextToActiveTab();

    expect(result).toBe(false);
    expect(contextAttachmentBuilder.buildFileContextItem).not.toHaveBeenCalled();
    expect(addDraftContextItem).not.toHaveBeenCalled();
    expect(beginContextPickerInteraction).toHaveBeenCalledTimes(1);
    expect(completeContextPickerInteraction).toHaveBeenCalledTimes(1);
  });

  it('still completes the picker lifecycle when the modal throws', async () => {
    const chooseContextFileMock = chooseContextFile as jest.MockedFunction<typeof chooseContextFile>;
    const {
      service,
      addDraftContextItem,
      beginContextPickerInteraction,
      completeContextPickerInteraction,
      contextAttachmentBuilder,
    } = createHarness({
      fileItem: createContextItem({ path: 'docs/spec.md' }),
    });
    chooseContextFileMock.mockRejectedValue(new Error('picker failed'));

    await expect(service.addChosenFileContextToActiveTab()).rejects.toThrow('picker failed');

    expect(contextAttachmentBuilder.buildFileContextItem).not.toHaveBeenCalled();
    expect(addDraftContextItem).not.toHaveBeenCalled();
    expect(beginContextPickerInteraction).toHaveBeenCalledTimes(1);
    expect(completeContextPickerInteraction).toHaveBeenCalledTimes(1);
  });
});
