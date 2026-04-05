import { WorkspaceLeaf } from 'obsidian';

jest.mock('../../../../src/core/opencode', () => ({
  OpenCodeService: class OpenCodeService {},
}));

import { OpenCodianView } from '../../../../src/features/chat/OpenCodianView';
import { setDebugLoggingEnabled } from '../../../../src/shared';

describe('OpenCodianView liquid glass diagnostics logging', () => {
  function createView(): OpenCodianView {
    return new OpenCodianView(new WorkspaceLeaf(), {
      settings: {
        effortLevel: 'medium',
        thinkingBudget: 0,
        locale: 'en',
      },
      openCodeService: {},
      storage: {},
    } as never);
  }

  beforeEach(() => {
    setDebugLoggingEnabled(true);
  });

  afterEach(() => {
    setDebugLoggingEnabled(false);
    jest.restoreAllMocks();
  });

  it('suppresses identical liquid glass diagnostic log payloads until they change', () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const view = createView() as unknown as {
      logLiquidGlassDiagnosticsEntry: (label: string, payload: unknown) => void;
    };

    view.logLiquidGlassDiagnosticsEntry('Liquid glass diagnostics', { adapterId: 'shuding', shellWidth: 320 });
    view.logLiquidGlassDiagnosticsEntry('Liquid glass diagnostics', { adapterId: 'shuding', shellWidth: 320 });
    view.logLiquidGlassDiagnosticsEntry('Liquid glass diagnostics', { adapterId: 'shuding', shellWidth: 360 });

    const matchingLogs = consoleSpy.mock.calls
      .map((call) => String(call[0] ?? ''))
      .filter((message) => message.includes('[OpenCodianView] Liquid glass diagnostics:'));

    expect(matchingLogs).toHaveLength(2);
  });
});
