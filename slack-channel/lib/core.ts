/**
 * Pure helpers shared by the channel server, the hooks and the tests.
 * No I/O and no SDK imports, so gating, parsing and redaction run offline.
 */
import { homedir } from 'os'
import { join } from 'path'

export const REQUIRED_ENV = [
  'SLACK_APP_TOKEN',
  'SLACK_BOT_TOKEN',
  'SLACK_CHANNEL_ID',
  'SLACK_OPERATOR_USER_ID',
] as const

export type SlackConfig = {
  appToken: string
  botToken: string
  channelId: string
  operatorUserId: string
}

/** Env only. Returns the names of missing variables, never their values. */
export function readSlackConfig(
  env: Record<string, string | undefined>,
): { ok: true; config: SlackConfig } | { ok: false; missing: string[] } {
  const missing = REQUIRED_ENV.filter(name => !env[name]?.trim())
  if (missing.length > 0) return { ok: false, missing: [...missing] }
  return {
    ok: true,
    config: {
      appToken: env.SLACK_APP_TOKEN!.trim(),
      botToken: env.SLACK_BOT_TOKEN!.trim(),
      channelId: env.SLACK_CHANNEL_ID!.trim(),
      operatorUserId: env.SLACK_OPERATOR_USER_ID!.trim(),
    },
  }
}

export type SlackMessage = {
  channel?: string
  user?: string
  text?: string
  ts?: string
  thread_ts?: string
  subtype?: string
  bot_id?: string
}

export type Gate = { channelId: string; operatorUserId: string; threadTs: string }

/**
 * A plain reply in this session's thread from the operator. Everything else
 * (other users, bots, other channels, other threads, the root, edits) is dropped.
 * Callers must set `channel` on messages that did not carry one.
 */
export function isOperatorThreadReply(msg: SlackMessage, gate: Gate): boolean {
  return (
    msg.channel === gate.channelId &&
    msg.thread_ts === gate.threadTs &&
    msg.ts !== gate.threadTs &&
    msg.user === gate.operatorUserId &&
    !msg.bot_id &&
    !msg.subtype &&
    (msg.text ?? '').trim() !== ''
  )
}

// 5 lowercase letters without 'l', the id alphabet Claude Code issues.
const VERDICT_RE = /^\s*(y|yes|n|no)\s+([a-km-z]{5})\s*$/i

export function parseVerdict(text: string): { request_id: string; behavior: 'allow' | 'deny' } | null {
  const m = VERDICT_RE.exec(text)
  if (!m) return null
  return {
    request_id: m[2]!.toLowerCase(),
    behavior: m[1]!.toLowerCase().startsWith('y') ? 'allow' : 'deny',
  }
}

export type Option = { label: string; description?: string }
export type Question = { question: string; header?: string; options: Option[]; multiSelect?: boolean }

/**
 * Maps one operator reply to an answer. A number picks by 1-based position, a label
 * picks case-insensitively, anything else is taken as free text (AskUserQuestion
 * always allows "Other"). An out-of-range number is an error so the caller re-asks.
 */
export function resolveAnswer(q: Question, reply: string): { answer: string } | { error: string } {
  const parts = (q.multiSelect ? reply.split(',') : [reply]).map(p => p.trim()).filter(Boolean)
  if (parts.length === 0) return { error: `Reply with ${q.multiSelect ? 'one or more options' : 'one option'}.` }
  const labels: string[] = []
  for (const part of parts) {
    if (/^\d+$/.test(part)) {
      const opt = q.options[Number(part) - 1]
      if (!opt) return { error: `"${part}" is not an option. Reply with 1-${q.options.length}.` }
      labels.push(opt.label)
    } else {
      const opt = q.options.find(o => o.label.toLowerCase() === part.toLowerCase())
      labels.push(opt ? opt.label : part)
    }
  }
  return { answer: labels.join(', ') }
}

export function formatQuestion(q: Question, index: number, total: number): string {
  const head = `*Question ${index}/${total}*${q.header ? ` (${safe(q.header)})` : ''}`
  const options = q.options.map(
    (o, i) => `${i + 1}. ${safe(o.label)}${o.description ? ` - ${safe(o.description)}` : ''}`,
  )
  const how = q.multiSelect
    ? 'Reply with the numbers or labels, comma-separated.'
    : 'Reply with a number or the option label.'
  return [head, safe(q.question), ...options, how].join('\n')
}

/** PreToolUse output that answers AskUserQuestion without the terminal picker. */
export function allowWithAnswers(questions: Question[], answers: Record<string, string>) {
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
      permissionDecisionReason: 'Answered in the Slack thread',
      updatedInput: { questions, answers },
    },
  }
}

// Token shapes that must never reach a Slack message. Order matters: the key=value
// rule runs last so it does not eat the prefix of a token it could match first.
const SECRET_SHAPES: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g,
  /\bxox[abposr]-[A-Za-z0-9-]{10,}/g,
  /\bxapp-[A-Za-z0-9-]{10,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g,
  /\bsk-[A-Za-z0-9_-]{16,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,
]
const SECRET_KEY_VALUE = /\b(password|passwd|secret|token|api[_-]?key|access[_-]?key)(\s*[:=]\s*)\S+/gi

export function redact(text: string): string {
  let out = text
  for (const re of SECRET_SHAPES) out = out.replace(re, '[REDACTED]')
  return out.replace(SECRET_KEY_VALUE, '$1$2[REDACTED]')
}

/** Escapes the three characters Slack parses in message text, so model or tool text cannot mention or link. */
export function escapeSlack(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Redacts then escapes. Use for every field that came from a model, a tool or a remote party. */
export function safe(text: string): string {
  return escapeSlack(redact(text))
}

/** Redacts, then caps the length, then escapes. Redacting first means a cut never leaves half a token. */
export function outbound(text: string, max: number): string {
  return escapeSlack(truncate(redact(text), max))
}

export function truncate(text: string, max: number): string {
  const chars = [...text]
  return chars.length <= max ? text : `${chars.slice(0, max).join('')}…`
}

export function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

export const REPLY_MAX_CHARS = 35000
export const STATUS_MAX_CHARS = 500

export type HookInput = {
  hook_event_name?: string
  tool_name?: string
  tool_input?: { message?: unknown }
  message?: unknown
  last_assistant_message?: unknown
  stop_hook_active?: boolean
}

/** One status line for Notification, Stop and PushNotification. Null means post nothing. */
export function statusText(input: HookInput): string | null {
  let raw: string | undefined
  if (input.hook_event_name === 'Notification' && typeof input.message === 'string') {
    raw = `Notification: ${input.message}`
  } else if (input.hook_event_name === 'Stop' && !input.stop_hook_active) {
    const last = input.last_assistant_message
    raw = typeof last === 'string' && last.trim() ? `Stop: ${last}` : undefined
  } else if (
    input.hook_event_name === 'PostToolUse' &&
    input.tool_name === 'PushNotification' &&
    typeof input.tool_input?.message === 'string'
  ) {
    raw = `Push: ${input.tool_input.message}`
  }
  if (!raw) return null
  return safe(truncate(oneLine(redact(raw)), STATUS_MAX_CHARS))
}

export function dataDir(env: Record<string, string | undefined>): string {
  return env.CLAUDE_PLUGIN_DATA || join(homedir(), '.claude', 'channels', 'slack-channel')
}

function fileId(sessionId: string): string {
  return sessionId.replace(/[^A-Za-z0-9_-]/g, '_') || 'unknown'
}

export const threadStatePath = (dir: string, sessionId: string) =>
  join(dir, 'threads', `${fileId(sessionId)}.json`)

export const pendingPath = (dir: string, sessionId: string) =>
  join(dir, 'pending', `${fileId(sessionId)}.json`)

export function isPendingActive(json: unknown, nowMs: number): boolean {
  const expires = (json as { expires_ms?: unknown } | null)?.expires_ms
  return typeof expires === 'number' && expires > nowMs
}
