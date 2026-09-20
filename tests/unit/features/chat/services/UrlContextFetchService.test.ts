/**
 * UrlContextFetchService unit tests (advantage-parity R-E1).
 *
 * The SSRF gate is the security boundary (the plugin runs local servers):
 * - private/loopback/reserved IP literals and localhost-family hostnames
 *   are refused before any socket opens
 * - the DNS pre-check refuses hostnames resolving into private ranges
 * - every manual redirect hop re-runs the same guard (a redirect back into
 *   127.0.0.1 is rejected even when the first hop was public)
 * - non-HTML responses, timeouts and fetch errors degrade to honest
 *   `failed` items; the entry is never dropped
 * - the markdown downgrade drops scripts/styles, keeps structure, decodes
 *   entities, and truncates to the byte budget with a marker
 * - YouTube watch pages without extractable text fail honestly
 */

import {
  buildPendingUrlContextItem,
  convertHtmlToMarkdownLite,
  extractFetchableHostname,
  isPrivateIpAddress,
  isPrivateIpv4,
  isPrivateIpv6,
  UrlContextFetchService,
  type UrlFetchResult,
} from '../../../../../src/features/chat/services/UrlContextFetchService';

describe('SSRF address guards', () => {
  it('classifies private IPv4 ranges', () => {
    for (const address of ['127.0.0.1', '10.0.0.1', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.1.1', '0.0.0.0', '100.64.0.1', '198.18.0.1']) {
      expect(isPrivateIpv4(address)).toBe(true);
    }
    for (const address of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '100.128.0.1', '198.20.0.1']) {
      expect(isPrivateIpv4(address)).toBe(false);
    }
  });

  it('classifies private IPv6 ranges', () => {
    for (const address of ['::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:192.168.0.1']) {
      expect(isPrivateIpv6(address)).toBe(true);
    }
    expect(isPrivateIpv6('2606:4700::1111')).toBe(false);
    expect(isPrivateIpAddress('::ffff:8.8.8.8')).toBe(false);
  });

  it('refuses localhost-family hostnames and non-http schemes up front', () => {
    for (const url of [
      'http://localhost/x',
      'http://127.0.0.1:4196/x',
      'http://10.0.0.5/x',
      'http://[::1]/x',
      'http://machine.local/x',
      'http://db.internal/x',
      'file:///etc/passwd',
      'ftp://example.com/x',
      'not a url',
    ]) {
      expect('rejection' in extractFetchableHostname(url)).toBe(true);
    }
    expect(extractFetchableHostname('https://example.com/a?b=1')).toEqual({ hostname: 'example.com' });
  });
});

describe('convertHtmlToMarkdownLite', () => {
  it('drops script/style/noscript content and keeps structure', () => {
    const html = [
      '<html><head><title>My Page</title><style>body{color:red}</style></head>',
      '<body>',
      '<script>alert("x")</script>',
      '<h1>Title</h1>',
      '<p>Hello <strong>world</strong> and <a href="https://example.com">a link</a>.</p>',
      '<ul><li>one</li><li>two</li></ul>',
      '<pre>code &amp; more</pre>',
      '</body></html>',
    ].join('');
    const { title, markdown } = convertHtmlToMarkdownLite(html);
    expect(title).toBe('My Page');
    expect(markdown).toContain('# Title');
    expect(markdown).toContain('**world**');
    expect(markdown).toContain('[a link](https://example.com)');
    expect(markdown).toContain('- one');
    expect(markdown).toContain('```\ncode & more\n```');
    expect(markdown).not.toContain('alert');
    expect(markdown).not.toContain('color:red');
  });

  it('decodes entities including numeric forms', () => {
    const { markdown } = convertHtmlToMarkdownLite('<p>a &amp; b &#65;&#x42; &nbsp;end</p>');
    expect(markdown).toContain('a & b AB');
    expect(markdown).toContain('end');
  });
});

describe('UrlContextFetchService.fetchItem', () => {
  function service(overrides: {
    transport?: (url: string, guard: (url: string) => Promise<void>) => Promise<UrlFetchResult>;
    resolve?: (hostname: string) => Promise<string[]>;
    maxSnapshotBytes?: number;
  } = {}) {
    return new UrlContextFetchService({
      transport: overrides.transport ?? (async (url) => ({
        finalUrl: url,
        status: 200,
        contentType: 'text/html; charset=utf-8',
        bodyText: `<html><head><title>T</title></head><body><p>${'x'.repeat(2000)}</p></body></html>`,
      })),
      resolveHost: overrides.resolve ?? (async (hostname) => [hostname.endsWith('.') ? hostname : '93.184.216.34']),
      maxSnapshotBytes: overrides.maxSnapshotBytes,
    });
  }

  it('fetches, converts and marks ok', async () => {
    const result = await service().fetchItem(buildPendingUrlContextItem('https://example.com/article'));
    expect(result.kind).toBe('url');
    expect(result.url?.status).toBe('ok');
    expect(result.url?.title).toBe('T');
    expect(result.textSnapshot).toContain('xxxx');
    expect(result.url?.truncated).toBe(false);
  });

  it('refuses hostnames that resolve into private ranges (first hop)', async () => {
    const svc = service({ resolve: async () => ['10.1.2.3'] });
    const result = await svc.fetchItem(buildPendingUrlContextItem('https://rebind.example.com/x'));
    expect(result.url?.status).toBe('failed');
    expect(result.url?.failureReason).toBe('blocked-private-target');
    expect(result.textSnapshot).toBeUndefined();
  });

  it('refuses redirects back into loopback even when the first hop is public', async () => {
    // Emulates what the real manual-follow transport does on hop 2: it calls
    // the per-hop guard with the redirect target, which must reject.
    const svc = service({
      transport: async (url, guard) => {
        await guard(url);
        await guard('http://127.0.0.1:4196/secret');
        return {
          finalUrl: 'http://127.0.0.1:4196/secret',
          status: 200,
          contentType: 'text/html',
          bodyText: '<p>gotcha</p>',
        };
      },
    });
    const result = await svc.fetchItem(buildPendingUrlContextItem('https://public.example.com/start'));
    expect(result.url?.status).toBe('failed');
    expect(result.url?.failureReason).toBe('blocked-private-target');
  });

  it('marks non-HTML responses, timeouts and HTTP errors honestly', async () => {
    const binary = service({ transport: async (url) => ({ finalUrl: url, status: 200, contentType: 'application/octet-stream', bodyText: 'RAW' }) });
    expect((await binary.fetchItem(buildPendingUrlContextItem('https://example.com/f.bin'))).url?.failureReason).toBe('non-http-response');

    const httpError = service({ transport: async (url) => ({ finalUrl: url, status: 503, contentType: 'text/html', bodyText: '<p>x</p>' }) });
    expect((await httpError.fetchItem(buildPendingUrlContextItem('https://example.com/down'))).url?.failureReason).toBe('fetch-error');

    const timeout = service({ transport: async () => Promise.reject(new Error('timeout of 15000ms exceeded')) });
    expect((await timeout.fetchItem(buildPendingUrlContextItem('https://example.com/slow'))).url?.failureReason).toBe('timeout');
  });

  it('fails YouTube watch pages without extractable transcript text', async () => {
    const yt = service({
      transport: async (url) => ({
        finalUrl: url,
        status: 200,
        contentType: 'text/html',
        bodyText: '<html><head><title>Some Video</title></head><body><div id="player"></div></body></html>',
      }),
    });
    const result = await yt.fetchItem(buildPendingUrlContextItem('https://www.youtube.com/watch?v=abc'));
    expect(result.url?.status).toBe('failed');
    expect(result.url?.failureReason).toBe('youtube-transcript-unavailable');
  });

  it('truncates to the byte budget and marks truncated', async () => {
    const svc = service({ maxSnapshotBytes: 500 });
    const result = await svc.fetchItem(buildPendingUrlContextItem('https://example.com/big'));
    expect(result.url?.truncated).toBe(true);
    expect(result.textSnapshot?.endsWith('…')).toBe(true);
    expect(Buffer.byteLength(result.textSnapshot ?? '', 'utf8')).toBeLessThanOrEqual(600);
  });

  it('resolvePendingItems passes through non-url and resolved items untouched', async () => {
    const svc = service();
    const urlItem = buildPendingUrlContextItem('https://example.com/a');
    const fileItem = { ...urlItem, id: 'f1', kind: 'file' as const, path: 'a.md', url: undefined };
    const okItem = { ...urlItem, id: 'u2', url: { ...urlItem.url!, status: 'ok' as const } };

    const resolved = await svc.resolvePendingItems([fileItem, okItem, urlItem]);
    expect(resolved[0]).toBe(fileItem);
    expect(resolved[1]).toBe(okItem);
    expect(resolved[2].url?.status).toBe('ok');
  });
});
