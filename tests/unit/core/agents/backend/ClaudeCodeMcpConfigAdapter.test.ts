import { adaptMcpConfigForClaude } from '../../../../../src/core/agents/backend';
import type { OpencodeMcpConfigRecord } from '../../../../../src/core/types/opencodeConfig';

describe('ClaudeCodeMcpConfigAdapter', () => {
  it('maps stdio entries to SDK command, args, and env fields', () => {
    const config: OpencodeMcpConfigRecord = {
      filesystem: {
        command: ['node', 'server.js'],
        environment: { API_KEY: 'x' },
      },
    };

    expect(adaptMcpConfigForClaude(config)).toEqual({
      filesystem: {
        type: 'stdio',
        command: 'node',
        args: ['server.js'],
        env: { API_KEY: 'x' },
      },
    });
  });

  it('maps remote URL entries to SDK SSE config by default', () => {
    const config: OpencodeMcpConfigRecord = {
      remote: {
        type: 'remote',
        url: 'http://localhost:3000',
        headers: { Authorization: 'Bearer x' },
      },
    };

    expect(adaptMcpConfigForClaude(config)).toEqual({
      remote: {
        type: 'sse',
        url: 'http://localhost:3000',
        headers: { Authorization: 'Bearer x' },
      },
    });
  });

  it('maps HTTP URL entries to SDK HTTP config', () => {
    const config: OpencodeMcpConfigRecord = {
      http: {
        type: 'http',
        url: 'http://localhost:3000/mcp',
      },
    };

    expect(adaptMcpConfigForClaude(config)).toEqual({
      http: {
        type: 'http',
        url: 'http://localhost:3000/mcp',
      },
    });
  });

  it('skips disabled entries', () => {
    const config: OpencodeMcpConfigRecord = {
      disabled: {
        enabled: false,
        command: ['node', 'server.js'],
      },
    };

    expect(adaptMcpConfigForClaude(config)).toEqual({});
  });

  it('skips entries without a URL or command', () => {
    const config: OpencodeMcpConfigRecord = {
      emptyCommand: { command: [] },
      missingTransport: {},
    };

    expect(adaptMcpConfigForClaude(config)).toEqual({});
  });

  it('maps mixed configs and omits invalid entries', () => {
    const config: OpencodeMcpConfigRecord = {
      stdio: { command: ['npx', 'mcp-server'] },
      sse: { type: 'remote', url: 'http://localhost:3000' },
      http: { type: 'http', url: 'http://localhost:3000/mcp' },
      disabled: { enabled: false, url: 'http://localhost:4000' },
      invalid: { command: [] },
    };

    expect(adaptMcpConfigForClaude(config)).toEqual({
      stdio: { type: 'stdio', command: 'npx', args: ['mcp-server'] },
      sse: { type: 'sse', url: 'http://localhost:3000' },
      http: { type: 'http', url: 'http://localhost:3000/mcp' },
    });
  });
});
