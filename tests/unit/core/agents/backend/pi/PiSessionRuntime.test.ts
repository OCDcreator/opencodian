import { PI_CONFIG_COMMANDS, PI_OPTIONAL_RPC_COMMANDS, PI_RPC_COMMANDS, PI_SDK_COMMANDS } from '../../../../../../src/core/agents/backend/pi/PiProtocol';
import type { PiRecord } from '../../../../../../src/core/agents/backend/pi/PiRpcClient';
import { PiSessionRuntime } from '../../../../../../src/core/agents/backend/pi/PiSessionRuntime';

describe('Pi optional command handshake', () => {
  it.each([true, false])('accepts the mandatory protocol with optional commands available=%s', async (available) => {
    const close = jest.fn();
    const client = {
      request: async () => ({ serviceProtocol: 1, sdkVersion: available ? 'fixture-modern' : 'fixture-legacy',
        commands: [...PI_RPC_COMMANDS, ...PI_SDK_COMMANDS, ...PI_CONFIG_COMMANDS, ...(available ? PI_OPTIONAL_RPC_COMMANDS : [])] }),
      subscribe: () => () => {}, close,
    };
    const runtime = new PiSessionRuntime({ workingDirectory: '/fixture', sessionDirectory: '/fixture', servicePath: '/service', createClient: () => client });
    try { await expect(runtime.get('session')).resolves.toBe(client); }
    finally { runtime.dispose(); }
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('still rejects a handshake that removes a mandatory operation', async () => {
    const close = jest.fn();
    const runtime = new PiSessionRuntime({ workingDirectory: '/fixture', sessionDirectory: '/fixture', servicePath: '/service', createClient: () => ({
      request: async () => ({ serviceProtocol: 1, commands: [...PI_RPC_COMMANDS, ...PI_SDK_COMMANDS, ...PI_CONFIG_COMMANDS].filter((name) => name !== 'prompt') }),
      subscribe: () => () => {}, close,
    }) });
    await expect(runtime.get('session')).rejects.toThrow('Pi service protocol mismatch');
    expect(close).toHaveBeenCalledTimes(1);
    runtime.dispose();
  });
});

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
