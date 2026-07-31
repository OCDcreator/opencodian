import { StorageService } from '../../../../src/core/storage/StorageService';

describe('Task 14 StorageService constructor characterization', () => {
  it('captures the vault adapter from app once and uses that adapter for metadata, theme, and conversation persistence', async () => {
    const adapter = {
      basePath: '/characterization-vault',
      exists: jest.fn().mockResolvedValue(false),
      mkdir: jest.fn().mockResolvedValue(undefined),
      write: jest.fn().mockResolvedValue(undefined),
      writeBinary: jest.fn().mockResolvedValue(undefined),
      read: jest.fn().mockResolvedValue('{}'),
      readBinary: jest.fn().mockResolvedValue(new ArrayBuffer(0)),
      remove: jest.fn().mockResolvedValue(undefined),
      list: jest.fn().mockResolvedValue({ files: [], folders: [] }),
    };
    const pluginReads: PropertyKey[] = [];
    const plugin = new Proxy({ app: { vault: { adapter } } }, {
      get(target, property, receiver) {
        pluginReads.push(property);
        return Reflect.get(target, property, receiver);
      },
    });
    const storage = new StorageService(plugin as never);

    await storage.initialize();
    await storage.saveConversation({
      id: 'task14-conversation',
      title: 'Constructor adapter characterization',
      createdAt: 1,
      updatedAt: 2,
      messages: [],
    } as never);

    expect(pluginReads).toEqual(['app']);
    expect(adapter.mkdir).toHaveBeenCalledWith('.opencodian/session-metas');
    expect(adapter.mkdir).toHaveBeenCalledWith('.opencodian/theme-backgrounds');
    expect(adapter.write).toHaveBeenCalledWith(
      '.opencodian/sessions/task14-conversation.json',
      expect.stringContaining('Constructor adapter characterization'),
    );
    expect(adapter.write).toHaveBeenCalledWith(
      '.opencodian/session-metas/task14-conversation.json',
      expect.stringContaining('"messageCount": 0'),
    );
  });
});
