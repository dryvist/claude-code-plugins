/**
 * Web API calls for the hooks. Plain fetch with no dependencies, so a hook runs
 * with no install step. The token goes in the Authorization header only.
 */
import type { SlackMessage } from './core.ts'

type SlackResponse = { ok: boolean; error?: string; ts?: string; messages?: SlackMessage[] }

async function call(token: string, method: string, params: Record<string, unknown>, read: boolean) {
  const url = new URL(`https://slack.com/api/${method}`)
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` }
  const init: RequestInit = { method: read ? 'GET' : 'POST', headers, signal: AbortSignal.timeout(15_000) }
  if (read) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v))
  } else {
    headers['Content-Type'] = 'application/json; charset=utf-8'
    init.body = JSON.stringify(params)
  }
  const res = await fetch(url, init)
  const json = (await res.json()) as SlackResponse
  if (!json.ok) throw new Error(`${method} failed: ${json.error ?? `HTTP ${res.status}`}`)
  return json
}

export async function postMessage(token: string, channel: string, threadTs: string, text: string): Promise<string> {
  const res = await call(token, 'chat.postMessage', { channel, thread_ts: threadTs, text }, false)
  if (!res.ts) throw new Error('chat.postMessage returned no ts')
  return res.ts
}

/** Thread replies strictly newer than `oldest`. Each message gets the channel it was read from. */
export async function threadReplies(
  token: string,
  channel: string,
  threadTs: string,
  oldest: string,
): Promise<SlackMessage[]> {
  const res = await call(token, 'conversations.replies', { channel, ts: threadTs, oldest, limit: 200 }, true)
  return (res.messages ?? []).map(m => ({ ...m, channel }))
}
