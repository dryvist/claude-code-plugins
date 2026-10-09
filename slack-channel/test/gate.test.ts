import { describe, expect, test } from 'bun:test'
import { isOperatorThreadReply, parseVerdict, readSlackConfig, type Gate } from '../lib/core.ts'

const gate: Gate = { channelId: 'C1', operatorUserId: 'U_OP', threadTs: '100.000' }
const reply = { channel: 'C1', thread_ts: '100.000', ts: '101.000', user: 'U_OP', text: 'hello' }

describe('operator gate', () => {
  test('accepts a plain reply from the operator in the session thread', () => {
    expect(isOperatorThreadReply(reply, gate)).toBe(true)
  })

  test('drops every other sender silently', () => {
    expect(isOperatorThreadReply({ ...reply, user: 'U_OTHER' }, gate)).toBe(false)
    expect(isOperatorThreadReply({ ...reply, user: undefined }, gate)).toBe(false)
  })

  test('drops bot messages, including a bot posting as the operator', () => {
    expect(isOperatorThreadReply({ ...reply, bot_id: 'B1' }, gate)).toBe(false)
    expect(isOperatorThreadReply({ ...reply, subtype: 'bot_message' }, gate)).toBe(false)
  })

  test('drops other channels, other threads, the root and edits', () => {
    expect(isOperatorThreadReply({ ...reply, channel: 'C2' }, gate)).toBe(false)
    expect(isOperatorThreadReply({ ...reply, channel: undefined }, gate)).toBe(false)
    expect(isOperatorThreadReply({ ...reply, thread_ts: '999.000' }, gate)).toBe(false)
    expect(isOperatorThreadReply({ ...reply, thread_ts: undefined }, gate)).toBe(false)
    expect(isOperatorThreadReply({ ...reply, ts: '100.000' }, gate)).toBe(false)
    expect(isOperatorThreadReply({ ...reply, subtype: 'message_changed' }, gate)).toBe(false)
  })

  test('drops empty text', () => {
    expect(isOperatorThreadReply({ ...reply, text: '   ' }, gate)).toBe(false)
    expect(isOperatorThreadReply({ ...reply, text: undefined }, gate)).toBe(false)
  })
})

describe('permission verdict parsing', () => {
  test('parses yes and no with a valid id, case-insensitively', () => {
    expect(parseVerdict('yes abcde')).toEqual({ request_id: 'abcde', behavior: 'allow' })
    expect(parseVerdict('Y ABCDE')).toEqual({ request_id: 'abcde', behavior: 'allow' })
    expect(parseVerdict('no kmnop')).toEqual({ request_id: 'kmnop', behavior: 'deny' })
    expect(parseVerdict('  N  zyxwv  ')).toEqual({ request_id: 'zyxwv', behavior: 'deny' })
  })

  test('rejects ids with l, wrong length, bare verdicts and chatter', () => {
    expect(parseVerdict('yes ablde')).toBeNull()
    expect(parseVerdict('yes abcd')).toBeNull()
    expect(parseVerdict('yes abcdef')).toBeNull()
    expect(parseVerdict('yes')).toBeNull()
    expect(parseVerdict('approve it')).toBeNull()
    expect(parseVerdict('yes abcde please')).toBeNull()
  })
})

describe('config from env', () => {
  const full = {
    SLACK_APP_TOKEN: 'xapp-test',
    SLACK_BOT_TOKEN: 'xoxb-test',
    SLACK_CHANNEL_ID: 'C1',
    SLACK_OPERATOR_USER_ID: 'U_OP',
  }

  test('accepts all four variables', () => {
    const r = readSlackConfig(full)
    expect(r.ok).toBe(true)
  })

  test('names each missing variable and never a value', () => {
    const r = readSlackConfig({ ...full, SLACK_BOT_TOKEN: '', SLACK_OPERATOR_USER_ID: undefined })
    expect(r).toEqual({ ok: false, missing: ['SLACK_BOT_TOKEN', 'SLACK_OPERATOR_USER_ID'] })
  })

  test('whitespace-only counts as missing', () => {
    const r = readSlackConfig({ ...full, SLACK_CHANNEL_ID: '   ' })
    expect(r).toEqual({ ok: false, missing: ['SLACK_CHANNEL_ID'] })
  })
})
