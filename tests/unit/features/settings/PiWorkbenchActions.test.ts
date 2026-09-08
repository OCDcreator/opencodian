import { PI_RPC_COMMANDS, PI_SDK_COMMANDS } from '../../../../src/core/agents/backend/pi/PiProtocol';
import { PI_WORKBENCH_GROUPS } from '../../../../src/features/settings/PiWorkbenchActions';

it('exposes every service capability exactly once through a labeled Pi workbench action', () => {
  const actions = Object.values(PI_WORKBENCH_GROUPS).flat();
  expect(actions.map(action => action.id).sort()).toEqual([...PI_RPC_COMMANDS, ...PI_SDK_COMMANDS].sort());
  expect(actions.every(action => action.label.length > 0)).toBe(true);
});
