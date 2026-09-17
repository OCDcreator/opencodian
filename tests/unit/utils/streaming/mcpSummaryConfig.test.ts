import { getMcpToolSummary } from '../../../../src/utils/streaming/mcpSummaryConfig';

describe('MCP tool summary', () => {
  it('reads the query from search-shaped argument aliases', () => {
    expect(getMcpToolSummary('zhipu-web-search_web_search_prime', { content_size: 'medium', search_query: '今日新闻' })).toBe('今日新闻');
    expect(getMcpToolSummary('server_search', { searchQuery: 'release notes' })).toBe('release notes');
    expect(getMcpToolSummary('server_search', { content_size: 'high', query: 'plain query' })).toBe('plain query');
  });

  it('prefers a declared argument field over the first scalar in the payload', () => {
    expect(getMcpToolSummary('server_tool', { args: '{"a":1}' })).toBe('{"a":1}');
  });

  it('falls back to the first scalar when no known field is present', () => {
    expect(getMcpToolSummary('server_tool', { unmatched: 'value' })).toBe('value');
    expect(getMcpToolSummary('server_tool', {})).toBe('');
  });

  it('still shortens path-like fields to their tail', () => {
    expect(getMcpToolSummary('server_read', { path: '/vault/notes/daily.md' })).toBe('daily.md');
  });
});
