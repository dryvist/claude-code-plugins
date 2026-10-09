import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import * as state from '../lib/state.ts'

let dir: string

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'slack-channel-test-'))
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('thread state', () => {
  test('round-trips the channel and thread for a session', () => {
    state.writeThread(dir, 'sess-1', { channel: 'C1', thread_ts: '100.5' })
    expect(state.readThread(dir, 'sess-1')).toEqual({ channel: 'C1', thread_ts: '100.5' })
  })

  test('a missing or malformed file reads as no thread', () => {
    expect(state.readThread(dir, 'never-written')).toBeNull()
    state.writeThread(dir, 'bad', { channel: 'C1', thread_ts: 7 } as unknown as state.ThreadState)
    expect(state.readThread(dir, 'bad')).toBeNull()
  })

  test('remove deletes the session file', () => {
    state.writeThread(dir, 'gone', { channel: 'C1', thread_ts: '1.0' })
    state.removeThread(dir, 'gone')
    expect(state.readThread(dir, 'gone')).toBeNull()
  })
})

describe('pending question marker', () => {
  test('is active until its expiry and cleared on demand', () => {
    const now = Date.now()
    expect(state.isQuestionPending(dir, 'sess-q', now)).toBe(false)
    state.markQuestionPending(dir, 'sess-q', now + 60_000)
    expect(state.isQuestionPending(dir, 'sess-q', now)).toBe(true)
    expect(state.isQuestionPending(dir, 'sess-q', now + 61_000)).toBe(false)
    state.clearQuestionPending(dir, 'sess-q')
    expect(state.isQuestionPending(dir, 'sess-q', now)).toBe(false)
  })
})
