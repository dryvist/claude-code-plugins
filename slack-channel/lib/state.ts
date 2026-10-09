/**
 * Small non-secret state shared between the server and the hooks, keyed by session id.
 * It holds the channel id and thread timestamp, and a marker while a question is pending.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { dirname } from 'path'
import { isPendingActive, pendingPath, threadStatePath } from './core.ts'

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  writeFileSync(path, JSON.stringify(value))
}

export type ThreadState = { channel: string; thread_ts: string }

export function writeThread(dir: string, sessionId: string, state: ThreadState): void {
  writeJson(threadStatePath(dir, sessionId), state)
}

export function readThread(dir: string, sessionId: string): ThreadState | null {
  const v = readJson(threadStatePath(dir, sessionId)) as Partial<ThreadState> | null
  return v && typeof v.channel === 'string' && typeof v.thread_ts === 'string'
    ? { channel: v.channel, thread_ts: v.thread_ts }
    : null
}

export function removeThread(dir: string, sessionId: string): void {
  rmSync(threadStatePath(dir, sessionId), { force: true })
}

export function markQuestionPending(dir: string, sessionId: string, expiresMs: number): void {
  writeJson(pendingPath(dir, sessionId), { expires_ms: expiresMs })
}

export function clearQuestionPending(dir: string, sessionId: string): void {
  rmSync(pendingPath(dir, sessionId), { force: true })
}

/** True while an AskUserQuestion hook owns the operator's replies. An expired marker is ignored. */
export function isQuestionPending(dir: string, sessionId: string, nowMs: number): boolean {
  return isPendingActive(readJson(pendingPath(dir, sessionId)), nowMs)
}
