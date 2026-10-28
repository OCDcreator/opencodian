import { PiAuxQuerySession } from '../../../../../../src/core/agents/backend/pi/PiAuxQuerySession';
import { PiRpcClient } from '../../../../../../src/core/agents/backend/pi/PiRpcClient';

jest.mock('../../../../../../src/core/agents/backend/pi/PiRpcClient', () => ({
  ...jest.requireActual('../../../../../../src/core/agents/backend/pi/PiRpcClient'),
  PiRpcClient: jest.fn(),
}));

it('starts the isolated service with its selected model before reading or changing the session', async () => {
  const request = jest.fn(async (input: { type: string }) => {
    if (input.type === 'get_state') return { serviceProtocol: 1 };
    if (input.type === 'get_tools') return { tools: [{ name: 'read' }, { name: 'write' }], active: ['read'] };
    return {};
  });
  const close = jest.fn();
  (PiRpcClient as jest.Mock).mockImplementation(() => ({ request, close, subscribe: () => () => undefined }));
  const session = await PiAuxQuerySession.create({ workingDirectory: '/vault', executablePath: '/pi', systemPrompt: 'plan JSON',
    model: { kind: 'pi', provider: 'fixture', model: 'selected-model' } });
  try {
    expect(PiRpcClient).toHaveBeenCalledWith(expect.objectContaining({ provider: 'fixture', model: 'selected-model' }));
    expect(session.safety.effectiveTools).toEqual(['read']);
  } finally { await session.dispose(); }
  expect(close).toHaveBeenCalled();
});
