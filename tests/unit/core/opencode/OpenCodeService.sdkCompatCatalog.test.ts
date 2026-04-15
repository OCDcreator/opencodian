import { DEFAULT_SETTINGS } from '../../../../src/core/types';
import {
  createOpenCodeServiceSdkCompatContext,
  type MockOpenCodeServiceSdkCompatClient,
  OpenCodeService,
} from './OpenCodeService.sdkCompat.testSupport';

let service: OpenCodeService;
let mockSdkClient: MockOpenCodeServiceSdkCompatClient;

beforeEach(() => {
  ({ service, mockSdkClient } = createOpenCodeServiceSdkCompatContext());
});

describe('OpenCodeService SDK compatibility tool hydration', () => {
  it('hydrates registry tools as custom and observed external tools as MCP', async () => {
    await service.refreshToolIds();
    (service as unknown as { observeRuntimeToolNames: (tools: string[]) => void }).observeRuntimeToolNames(['exa_search']);

    const customMessage = service.hydrateOpenCodeMessage(
      {
        id: 'message-custom',
        role: 'assistant',
        sessionID: 'session-1',
        providerID: 'openai',
        modelID: 'gpt-5',
        time: { created: 1 },
      } as never,
      [{
        id: 'part-custom',
        sessionID: 'session-1',
        messageID: 'message-custom',
        type: 'tool',
        callID: 'call-custom',
        tool: 'vault_tool',
        state: {
          status: 'running',
          input: {},
          time: { start: 1 },
        },
      }] as never,
    );
    const mcpMessage = service.hydrateOpenCodeMessage(
      {
        id: 'message-mcp',
        role: 'assistant',
        sessionID: 'session-1',
        providerID: 'openai',
        modelID: 'gpt-5',
        time: { created: 1 },
      } as never,
      [{
        id: 'part-mcp',
        sessionID: 'session-1',
        messageID: 'message-mcp',
        type: 'tool',
        callID: 'call-mcp',
        tool: 'exa_search',
        state: {
          status: 'running',
          input: {},
          time: { start: 1 },
        },
      }] as never,
    );

    expect(customMessage.contentBlocks?.[0]).toMatchObject({
      toolKind: 'custom',
      toolSourceKey: 'vault_tool',
    });
    expect(mcpMessage.contentBlocks?.[0]).toMatchObject({
      toolKind: 'mcp',
      toolSourceKey: 'exa_search',
    });
  });

  it('separates cached tool catalogs by scoped directory', async () => {
    mockSdkClient.tool.list
      .mockResolvedValueOnce([
        { id: 'vault_tool_a', description: 'Vault A tool', parameters: {} },
      ])
      .mockResolvedValueOnce([
        { id: 'vault_tool_b', description: 'Vault B tool', parameters: {} },
      ]);
    service = new OpenCodeService(DEFAULT_SETTINGS);

    service.setVaultPath('C:\\vault-a');
    await expect(service.listTools('openai', 'gpt-5')).resolves.toMatchObject([
      { id: 'vault_tool_a' },
    ]);

    service.setVaultPath('C:\\vault-b');
    await expect(service.listTools('openai', 'gpt-5')).resolves.toMatchObject([
      { id: 'vault_tool_b' },
    ]);

    expect(mockSdkClient.tool.list).toHaveBeenCalledTimes(2);
  });
});

describe('OpenCodeService SDK compatibility event forwarding', () => {
  it('forwards SDK events and catalog updates', async () => {
    const receivedEvents: string[] = [];
    const catalogSnapshots: string[][] = [];

    const disposeEvents = service.subscribeToOpenCodeEvents((event) => {
      const payload = event.payload as { type?: string; payload?: { type?: string } };
      const type = payload.type ?? payload.payload?.type ?? 'unknown';
      receivedEvents.push(type);
    });
    const disposeCatalog = service.subscribeToCatalogUpdates((snapshot) => {
      catalogSnapshots.push(snapshot.toolCatalog.observedExternalTools);
    });

    await new Promise((resolve) => setTimeout(resolve, 25));

    disposeEvents();
    disposeCatalog();

    expect(receivedEvents).toContain('message.part.updated');
    expect(receivedEvents).toContain('mcp.tools.changed');
    expect(catalogSnapshots.some((tools) => tools.includes('exa_search'))).toBe(true);
  });
});
