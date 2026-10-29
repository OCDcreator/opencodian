import { CodexAdapter } from '../../../../../src/core/agents/backend/codex/CodexAdapter';

describe('Codex selected skill transport', () => {
  it('turns known selected skill text into explicit app-server skill inputs', async () => {
    const adapter = new CodexAdapter({ workingDirectory: '/vault' });
    jest.spyOn(adapter, 'getRuntimeSkills').mockResolvedValue([
      { name: 'design', path: '/skills/design/SKILL.md', enabled: true },
      { name: 'disabled', path: '/skills/disabled/SKILL.md', enabled: false },
      { name: 'missing-path', enabled: true },
    ]);
    const input = await (adapter as unknown as {
      buildAppServerInput(text: string, images: undefined): Promise<{ payload: unknown[] }>;
    }).buildAppServerInput('使用 $design 两次 $design，$disabled $missing-path $unknown', undefined);
    expect(input.payload).toEqual([
      { type: 'text', text: '使用 $design 两次 $design，$disabled $missing-path $unknown', text_elements: [] },
      { type: 'skill', name: 'design', path: '/skills/design/SKILL.md' },
    ]);
    adapter.dispose();
  });
});
