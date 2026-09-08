import { PI_CONFIG_COMMANDS, PI_RPC_COMMANDS, PI_SDK_COMMANDS } from '../../../../../../src/core/agents/backend/pi/PiProtocol';
import type { PiRecord } from '../../../../../../src/core/agents/backend/pi/PiRpcClient';
import { PiSessionRuntime } from '../../../../../../src/core/agents/backend/pi/PiSessionRuntime';

describe('Pi UI lifetime', () => {
  it('cancels only the identified dialog and cancels all pending dialogs when stopped', async () => {
    let emit!: (event: PiRecord) => void;
    const signals: Record<string, AbortSignal> = {};
    const respond = jest.fn();
    const runtime = new PiSessionRuntime({ workingDirectory: '/tmp', sessionDirectory: '/tmp', servicePath: '/service',
      createClient: () => ({
        request: async () => ({ serviceProtocol: 1, commands: [...PI_RPC_COMMANDS, ...PI_SDK_COMMANDS, ...PI_CONFIG_COMMANDS] }),
        subscribe: (listener) => { emit = listener; return () => {}; }, close: jest.fn(), respond,
      }),
      onUiRequest: (request, signal) => new Promise((resolve) => {
        signals[String(request.id)] = signal;
        signal.addEventListener('abort', () => resolve({ cancelled: true }));
      }),
    });
    await runtime.get('session');
    emit({ type: 'extension_ui_request', method: 'confirm', id: 'one' });
    emit({ type: 'extension_ui_request', method: 'editor', id: 'two' });
    emit({ type: 'extension_ui_cancel', id: 'one' });
    expect(signals.one.aborted).toBe(true); expect(signals.two.aborted).toBe(false);
    runtime.close('session');
    expect(signals.two.aborted).toBe(true);
    await Promise.resolve();
    expect(respond).toHaveBeenCalledWith({ id: 'one', cancelled: true });
    runtime.dispose();
  });
});
