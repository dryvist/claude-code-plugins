import { describe, expect, test } from 'bun:test'
import { escapeSlack, outbound, redact, statusText, truncate, dataDir, threadStatePath, isPendingActive } from '../lib/core.ts'

// Token-shaped fixtures are assembled at runtime, so no literal in this source matches a secret scanner.
// The joined value has the real shape the redaction rules must catch.
const joined = (...parts: string[]) => parts.join('')

describe('redact', () => {
  test('masks Slack, GitHub, OpenAI-style, AWS and bearer tokens', () => {
    const samples = [
      joined('xo', 'xb-1234567890-abcdefghij'),
      joined('xa', 'pp-1-A0123456789-abcdefghijkl'),
      joined('github', '_pat_11ABCDEFG0123456789_abcdefghijklmnop'),
      joined('gh', 'p_abcdefghijklmnopqrstuvwxyz0123456789'),
      joined('s', 'k-abcdefghijklmnop1234'),
      joined('AK', 'IAABCDEFGHIJKLMNOP'),
      joined('Authorization: Bearer ', 'abcdef.ghijkl-mnop'),
    ]
    for (const s of samples) {
      const out = redact(`before ${s} after`)
      expect(out).toContain('[REDACTED]')
      expect(out).not.toContain(s)
      expect(out.startsWith('before ')).toBe(true)
    }
  })

  test('masks a private key block, including an unterminated one', () => {
    const block = joined('-----BEGIN OPENSSH ', 'PRIVATE KEY-----')
    const end = joined('-----END OPENSSH ', 'PRIVATE KEY-----')
    expect(redact(`${block}\nAAAA\n${end}`)).toBe('[REDACTED]')
    expect(redact(joined('-----BEGIN RSA ', 'PRIVATE KEY-----') + '\nAAAA')).toBe('[REDACTED]')
  })

  test('masks key=value secrets and keeps the key name', () => {
    expect(redact('api_key=hunter2hunter2')).toBe('api_key=[REDACTED]')
    expect(redact('password: swordfish')).toBe('password: [REDACTED]')
    expect(redact('access-key = AB12CD34')).toBe('access-key = [REDACTED]')
  })

  test('leaves ordinary text, commands and paths alone', () => {
    const plain = 'Run `ls -la /tmp/work` then open https://example.com/a?b=c'
    expect(redact(plain)).toBe(plain)
  })
})

describe('outbound text', () => {
  test('escapes the characters Slack parses', () => {
    expect(escapeSlack('a <!channel> & <https://x.test|y>')).toBe('a &lt;!channel&gt; &amp; &lt;https://x.test|y&gt;')
  })

  test('redacts before it truncates, so a cut never leaves a token prefix', () => {
    const token = joined('xo', 'xb-1234567890-abcdefghij')
    const out = outbound(`${'x'.repeat(10)} ${token}`, 20)
    expect(out).not.toContain('xoxb-')
  })

  test('truncate counts code points, not UTF-16 units', () => {
    expect(truncate('ab😀cd', 3)).toBe('ab😀…')
    expect(truncate('short', 10)).toBe('short')
  })
})

describe('status lines', () => {
  test('Stop posts the first 500 characters of the last message, on one line', () => {
    const long = `line one\n${'word '.repeat(300)}`
    const text = statusText({ hook_event_name: 'Stop', last_assistant_message: long })!
    expect(text.startsWith('Stop: line one word')).toBe(true)
    expect(text.includes('\n')).toBe(false)
    expect([...text].length).toBeLessThanOrEqual(501 + 'Stop: '.length)
    expect(text.endsWith('…')).toBe(true)
  })

  test('Stop with stop_hook_active or no message posts nothing', () => {
    expect(statusText({ hook_event_name: 'Stop', stop_hook_active: true, last_assistant_message: 'x' })).toBeNull()
    expect(statusText({ hook_event_name: 'Stop', last_assistant_message: '   ' })).toBeNull()
  })

  test('Notification and PushNotification carry their message, redacted', () => {
    expect(statusText({ hook_event_name: 'Notification', message: 'Auth needed' })).toBe('Notification: Auth needed')
    const push = statusText({
      hook_event_name: 'PostToolUse',
      tool_name: 'PushNotification',
      tool_input: { message: 'approve https://x.test/a?b=c token=zzzzzz' },
    })
    expect(push).toBe('Push: approve https://x.test/a?b=c token=[REDACTED]')
  })

  test('other tools and events post nothing', () => {
    expect(statusText({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { message: 'x' } })).toBeNull()
    expect(statusText({ hook_event_name: 'SessionStart' })).toBeNull()
  })
})

describe('paths and pending markers', () => {
  test('data dir uses the plugin data variable, else a per-user default', () => {
    expect(dataDir({ CLAUDE_PLUGIN_DATA: '/data/x' })).toBe('/data/x')
    expect(dataDir({})).toMatch(/\.claude\/channels\/slack-channel$/)
  })

  test('session ids cannot escape the state directory', () => {
    expect(threadStatePath('/d', '../../etc/x')).toBe('/d/threads/______etc_x.json')
    expect(threadStatePath('/d', '')).toBe('/d/threads/unknown.json')
  })

  test('a pending marker is active only until it expires', () => {
    expect(isPendingActive({ expires_ms: 2000 }, 1000)).toBe(true)
    expect(isPendingActive({ expires_ms: 1000 }, 1000)).toBe(false)
    expect(isPendingActive(null, 1000)).toBe(false)
    expect(isPendingActive({ expires_ms: 'soon' }, 1000)).toBe(false)
  })
})
