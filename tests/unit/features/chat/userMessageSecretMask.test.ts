import { prepareUserMessageMarkdownForDisplay } from '../../../../src/features/chat/rendering/userMessageDisplay';
import {
  maskUserMessageSecretsForDisplay,
  USER_MESSAGE_SECRET_MASK_TEXT,
} from '../../../../src/features/chat/rendering/userMessageSecretMask';
import { DIAGNOSTIC_REDACTION_PATTERNS, sanitizeDiagnosticReport } from '../../../../src/shared/diagnosticSecretSanitizer';

// Synthetic credential fixtures only. Shapes mirror common provider token
// formats so the detectors are exercised, but every character is invented.
// Never replace these with real keys.
const SYNTHETIC = {
  anthropicKey: 'sk-ant-api03-SYNTH0000EXAMPLE00',
  openAiKey: 'sk-synth0123456789abcdefghij',
  githubToken: 'ghp_synth0123456789abcdefgh',
  slackToken: 'xoxb-synth-0123456789abc',
  awsAccessKeyId: 'AKIASYNTHETICEXAMPLE',
  googleApiKey: `AIza${'q'.repeat(35)}`,
  jwt: 'eyJhbGciOiSynthetic123456.SyntheticSignature123.Sig123',
  zhipuStyleKey: '0123456789abcdef0123456789abcdef.Zyxwvu0123456789',
  pemBlock: '-----BEGIN PRIVATE KEY-----\nSYNTHETIC-KEY-MATERIAL\n-----END PRIVATE KEY-----',
  genericValue: 'SYNTHKEY0123456789',
  bearerToken: 'SYNTHTOKEN0123456789',
  queryToken: 'SYNTH0123456789',
  urlPassword: 'syntheticpass',
  envValue: 'hunter2hunter',
};

describe('maskUserMessageSecretsForDisplay', () => {
  it('masks credential assignments while keeping the surrounding text and field names', () => {
    const cases: Array<[string, string]> = [
      [`请用这个 api_key=${SYNTHETIC.anthropicKey} 试一下`, '请用这个 api_key=•••••••• 试一下'],
      [`Authorization: Bearer ${SYNTHETIC.bearerToken}`, 'Authorization: Bearer ••••••••'],
      [`--api-key ${SYNTHETIC.genericValue}`, '--api-key ••••••••'],
      [`OPENAI_API_KEY=${SYNTHETIC.openAiKey}`, 'OPENAI_API_KEY=••••••••'],
      [`db_password: ${SYNTHETIC.envValue}`, 'db_password: ••••••••'],
      [`x-api-key: ${SYNTHETIC.genericValue}`, 'x-api-key: ••••••••'],
      [`"apiKey": "${SYNTHETIC.openAiKey}"`, '"apiKey": "••••••••"'],
      [`password=${SYNTHETIC.envValue}`, 'password=••••••••'],
      [`https://synthetic-user:${SYNTHETIC.urlPassword}@example.com/api`, 'https://synthetic-user:••••••••@example.com/api'],
      [`https://example.com/cb?access_token=${SYNTHETIC.queryToken}`, 'https://example.com/cb?access_token=••••••••'],
    ];
    for (const [input, expected] of cases) {
      expect(maskUserMessageSecretsForDisplay(input)).toBe(expected);
    }
  });

  it('masks bare provider-shaped tokens without a field name', () => {
    const input = `这是 key：${SYNTHETIC.githubToken} 和 ${SYNTHETIC.slackToken}`;
    const masked = maskUserMessageSecretsForDisplay(input);

    expect(masked).toBe(`这是 key：•••••••• 和 ••••••••`);
    for (const token of [SYNTHETIC.githubToken, SYNTHETIC.slackToken, SYNTHETIC.awsAccessKeyId]) {
      expect(maskUserMessageSecretsForDisplay(`看 ${token} 看`)).toBe('看 •••••••• 看');
    }
    expect(maskUserMessageSecretsForDisplay(`看 ${SYNTHETIC.googleApiKey} 看`)).toBe('看 •••••••• 看');
    expect(maskUserMessageSecretsForDisplay(`看 ${SYNTHETIC.jwt} 看`)).toBe('看 •••••••• 看');
    expect(maskUserMessageSecretsForDisplay(`看 ${SYNTHETIC.zhipuStyleKey} 看`)).toBe('看 •••••••• 看');
  });

  it('masks PEM blocks and masked code fence content', () => {
    expect(maskUserMessageSecretsForDisplay(`看 ${SYNTHETIC.pemBlock} 看`)).toBe('看 •••••••• 看');
    const fenced = `\`\`\`\napi_key=${SYNTHETIC.genericValue}\n\`\`\``;
    expect(maskUserMessageSecretsForDisplay(fenced)).toBe(`\`\`\`\napi_key=••••••••\n\`\`\``);
  });

  it('uses a fixed-length mask so the secret length is not revealed', () => {
    const short = maskUserMessageSecretsForDisplay('token=abc1234567890123');
    const long = maskUserMessageSecretsForDisplay('token=SynthKey0123456789abcdefghijklmnop');

    expect(short).toBe('token=••••••••');
    expect(long).toBe('token=••••••••');
  });

  it('is idempotent so re-rendering never stacks masks', () => {
    const masked = maskUserMessageSecretsForDisplay(`db_password: ${SYNTHETIC.envValue}`);
    expect(maskUserMessageSecretsForDisplay(masked)).toBe(masked);
  });

  it('leaves ordinary prose untouched (no false positives)', () => {
    const prose = [
      'The secret: always be kind',
      'use --password instead of the env var',
      'token: generated at login',
      'the bearer of good news',
      'password: abc',
      'password: 请不要告诉别人',
      'keywords: foo, bar',
      'primary_key=users_id_seq',
      '今天天气不错，我们谈谈 api_key 的设计原则吧',
    ];
    for (const text of prose) {
      expect(maskUserMessageSecretsForDisplay(text)).toBe(text);
    }
  });

  it('keeps synthetic placeholders visible instead of masking them', () => {
    const placeholders = [
      'api_key=${OPENAI_API_KEY}',
      'token: <your-token>',
      'password=xxxxxxxx',
      'API_KEY=YOUR_API_KEY',
      '"apiKey": "your-api-key-here"',
      'sk-xxxxxxxxxxxxxxxxxxxxxxxx',
      'https://user:password@example.com',
    ];
    for (const text of placeholders) {
      expect(maskUserMessageSecretsForDisplay(text)).toBe(text);
    }
  });

  it('masks quoted credential values that contain valid spaces, keeping quotes/escapes structure', () => {
    expect(maskUserMessageSecretsForDisplay('{"apiKey":"synth phrase 123"}')).toBe('{"apiKey":"••••••••"}');
    expect(maskUserMessageSecretsForDisplay(`JSON.stringify({apiKey:'synth phrase 123'})`))
      .toBe(`JSON.stringify({apiKey:'••••••••'})`);
    expect(maskUserMessageSecretsForDisplay('"apiKey": "synth phrase 123",'))
      .toBe('"apiKey": "••••••••",');
    expect(maskUserMessageSecretsForDisplay('"apiKey": "ab\\"cd ef 12"'))
      .toBe('"apiKey": "••••••••"');
    expect(maskUserMessageSecretsForDisplay('db_password: `synth phrase 123`'))
      .toBe('db_password: `••••••••`');
    // Quoted placeholders still stay verbatim.
    expect(maskUserMessageSecretsForDisplay('api_key="<your token>"')).toBe('api_key="<your token>"');
  });

  it('keeps unquoted multi-word prose after credential names untouched', () => {
    // Unquoted spaced text after a credential name is prose; quoting is the
    // deliberate way to send a credential that contains spaces.
    expect(maskUserMessageSecretsForDisplay('api_key: synth phrase 123')).toBe('api_key: synth phrase 123');
    expect(maskUserMessageSecretsForDisplay('password: always be kind here')).toBe('password: always be kind here');
  });

  it('masks quoted values after space-separated CLI credential flags', () => {
    expect(maskUserMessageSecretsForDisplay('--password "synth phrase 123"')).toBe('--password "••••••••"');
    expect(maskUserMessageSecretsForDisplay('--password "synth phrase 123", then start'))
      .toBe('--password "••••••••", then start');
    expect(maskUserMessageSecretsForDisplay('--password "synthphrase123"')).toBe('--password "••••••••"');
    // Quoted placeholders stay verbatim.
    expect(maskUserMessageSecretsForDisplay('--password "<your token>"')).toBe('--password "<your token>"');
  });

  it('distinguishes line-final unquoted values from multi-word prose (no first-word partial masks)', () => {
    expect(maskUserMessageSecretsForDisplay('api_key: always use environment variables'))
      .toBe('api_key: always use environment variables');
    expect(maskUserMessageSecretsForDisplay('api_key: generated at login'))
      .toBe('api_key: generated at login');
    // A line-final single value after the same credential name is masked.
    expect(maskUserMessageSecretsForDisplay('api_key: abcxyz')).toBe('api_key: ••••••••');
  });

  it('composes with markdown preparation without re-exposing the masked value', () => {
    const masked = maskUserMessageSecretsForDisplay(`看 <div>api_key=${SYNTHETIC.genericValue}</div> 完成`);
    const prepared = prepareUserMessageMarkdownForDisplay(masked);

    expect(prepared).not.toContain(SYNTHETIC.genericValue);
    expect(prepared).toContain(`api_key=${USER_MESSAGE_SECRET_MASK_TEXT}`);
  });

  it('stays within what the shared diagnostic sanitizer also redacts', () => {
    // Display and diagnostics share detection for the shared pattern subset:
    // whatever the display masks via a shared pattern, diagnostics redacts too.
    const sharedCovered: Array<[string, string]> = [
      [`api_key=${SYNTHETIC.anthropicKey}`, SYNTHETIC.anthropicKey],
      [`Authorization: Bearer ${SYNTHETIC.bearerToken}`, SYNTHETIC.bearerToken],
      [`--api-key ${SYNTHETIC.genericValue}`, SYNTHETIC.genericValue],
      [`OPENAI_API_KEY=${SYNTHETIC.openAiKey}`, SYNTHETIC.openAiKey],
      [`https://synthetic-user:${SYNTHETIC.urlPassword}@example.com/api`, SYNTHETIC.urlPassword],
      [`https://example.com/cb?access_token=${SYNTHETIC.queryToken}`, SYNTHETIC.queryToken],
      [SYNTHETIC.pemBlock, 'SYNTHETIC-KEY-MATERIAL'],
    ];
    for (const [input, secret] of sharedCovered) {
      expect(sanitizeDiagnosticReport(input)).not.toContain(secret);
    }
    // Bare provider tokens are display-only additions; the shared sanitizer
    // does not detect them yet. This pins today's shared behaviour so a later
    // widening is a conscious decision.
    expect(sanitizeDiagnosticReport(`看 ${SYNTHETIC.githubToken} 看`)).toContain(SYNTHETIC.githubToken);
  });
});

describe('shared diagnostic pattern layout pinning', () => {
  it('pins the shared pattern indices the display masker reuses', () => {
    const expectedSources: Record<number, string> = {
      0: 'BEGIN PRIVATE KEY',
      1: 'client[_-]?secret',
      2: 'authorization\\s*[:=]\\s*bearer',
      3: 'authorization\\s*[:=]',
      5: 'credentials',
      6: 'https?:',
      7: ':\\/\\/',
      8: 'access[_-]?token',
      9: 'API_KEY',
      10: 'KEY|TOKEN|SECRET',
      11: 'sk-ant-api03-',
    };
    for (const [index, marker] of Object.entries(expectedSources)) {
      expect(DIAGNOSTIC_REDACTION_PATTERNS[Number(index)].source).toContain(marker);
    }
    // Prose-hostile shared patterns stay excluded from the display subset.
    expect(DIAGNOSTIC_REDACTION_PATTERNS[4].source).toContain('(bearer\\s+)');
    expect(DIAGNOSTIC_REDACTION_PATTERNS[12].source).toContain('(?:key|token|secret)\\s*=\\s*');
  });
});

describe('review regressions: assignment boundaries, strong contexts, encodings, linearity', () => {
  it('keeps closing backticks, quotes, and sentence punctuation outside the mask', () => {
    expect(maskUserMessageSecretsForDisplay('Use `api_key=abc123456` now')).toBe('Use `api_key=••••••••` now');
    expect(maskUserMessageSecretsForDisplay('api_key=SYNTHKEY0123456789, then reload')).toBe('api_key=••••••••, then reload');
    expect(maskUserMessageSecretsForDisplay('token=abc1234567890123.')).toBe('token=••••••••.');
    expect(maskUserMessageSecretsForDisplay('(db_password: hunter2hunter)')).toBe('(db_password: ••••••••)');
    expect(maskUserMessageSecretsForDisplay('api_key=SYNTHKEY0123456789，然后重载')).toBe('api_key=••••••••，然后重载');
  });

  it('keeps quoted placeholders and template variables verbatim', () => {
    expect(maskUserMessageSecretsForDisplay('api_key="YOUR_API_KEY", next')).toBe('api_key="YOUR_API_KEY", next');
    expect(maskUserMessageSecretsForDisplay('token={{NAME_ab12cd34}}')).toBe('token={{NAME_ab12cd34}}');
  });

  it('strongly identifies Authorization/Bearer and api_key/access_token assignment contexts', () => {
    expect(maskUserMessageSecretsForDisplay('Authorization: Bearer abcxyz')).toBe('Authorization: Bearer ••••••••');
    expect(maskUserMessageSecretsForDisplay('api_key: abcxyz')).toBe('api_key: ••••••••');
    expect(maskUserMessageSecretsForDisplay('access_token: abcxyz')).toBe('access_token: ••••••••');
  });

  it('does not mask descriptive metric fields with credential-like prefixes', () => {
    const prose = [
      'token_count=123456',
      'token_count: 123456',
      'token_limit=128000',
      'token_limit: 128000',
      'token-count: 5',
      'tokenPolicy: strict',
      '"token_count": "123456"',
    ];
    for (const text of prose) {
      expect(maskUserMessageSecretsForDisplay(text)).toBe(text);
    }
  });

  it('masks quoted values that contain the other quote type in full', () => {
    expect(maskUserMessageSecretsForDisplay(`JSON.stringify({apiKey:'abc123"DEF456'})`))
      .toBe(`JSON.stringify({apiKey:'••••••••'})`);
    expect(maskUserMessageSecretsForDisplay('"apiKey": "ab\\"cd"'))
      .toBe('"apiKey": "••••••••"');
  });

  it('detects credentials hidden behind bounded HTML entities and percent escapes', () => {
    // `gh&#112;_…` renders as `ghp_…`; the raw entity span is what gets masked.
    expect(maskUserMessageSecretsForDisplay('gh&#112;_synth0123456789abcdefgh'))
      .toBe('••••••••');
    // Entity-encoded field names decode for rendering but are not secrets:
    // the value behind them is what gets masked.
    expect(maskUserMessageSecretsForDisplay('key &#97;pi_key=SYNTHKEY0123456789 end'))
      .toBe('key &#97;pi_key=•••••••• end');
    // Percent-encoded query key (`%61` = `a`) resolves the same way.
    expect(maskUserMessageSecretsForDisplay('https://example.com/?%61pi_key=SYNTHKEY0123456789'))
      .toBe('https://example.com/?%61pi_key=••••••••');
    // Prose percent signs and ordinary ampersands stay untouched.
    expect(maskUserMessageSecretsForDisplay('discount 50%25 & more text here')).toBe('discount 50%25 & more text here');
  });

  it('stays linear on long separator-free and assignment-heavy inputs', () => {
    const blob = 'supercalifragilisticexpiali'.repeat(1200); // ~32k, no separators
    const blobStarted = performance.now();
    expect(maskUserMessageSecretsForDisplay(blob)).toBe(blob);
    const blobElapsed = performance.now() - blobStarted;
    expect(blobElapsed).toBeLessThan(100);

    const mixed = 'api_key=SYNTHKEY0123456789, `token=abc1234567890123`, 密码示例"YOUR_API_KEY"普通文本 '
      .repeat(320); // ~28k with separators and closers
    const mixedStarted = performance.now();
    const maskedMixed = maskUserMessageSecretsForDisplay(mixed);
    const mixedElapsed = performance.now() - mixedStarted;
    expect(maskedMixed).toContain('api_key=••••••••, `token=••••••••`,');
    expect(maskedMixed).toContain('密码示例"YOUR_API_KEY"普通文本');
    expect(mixedElapsed).toBeLessThan(200);
  });
});
