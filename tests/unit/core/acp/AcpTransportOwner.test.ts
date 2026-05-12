import {
  translateAcpMessageChunk,
  translateAcpToolCall,
  translateAcpToolCallUpdate,
} from '../../../../src/core/acp/AcpTransportOwner';

describe('AcpTransportOwner chunk translation', () => {
  it('translates text chunk', () => {
    const chunk = translateAcpMessageChunk('Hello world');

    expect(chunk).toEqual({ type: 'text', content: 'Hello world' });
  });

  it('translates thinking chunk', () => {
    const chunk = translateAcpMessageChunk('thinking...', 'part-123');

    expect(chunk).toEqual({ type: 'thinking', content: 'thinking...', partId: 'part-123' });
  });

  it('translates tool_use chunk', () => {
    const chunk = translateAcpToolCall('bash', 'call-1', { command: 'ls' });

    expect(chunk.type).toBe('tool_use');
    if (chunk.type === 'tool_use') {
      expect(chunk.id).toBe('call-1');
      expect(chunk.name).toBe('bash');
      expect(chunk.input).toEqual({ command: 'ls' });
    }
  });

  it('translates tool_result chunk', () => {
    const chunk = translateAcpToolCallUpdate('call-1', 'file1.txt\nfile2.txt');

    expect(chunk).toEqual({
      type: 'tool_result',
      toolUseId: 'call-1',
      content: 'file1.txt\nfile2.txt',
      isError: false,
    });
  });

  it('translates tool_result error chunk', () => {
    const chunk = translateAcpToolCallUpdate('call-1', 'command failed', true);

    expect(chunk).toEqual({
      type: 'tool_result',
      toolUseId: 'call-1',
      content: 'command failed',
      isError: true,
    });
  });
});
