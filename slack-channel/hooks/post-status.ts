#!/usr/bin/env bun
/**
 * Notification, Stop and PostToolUse(PushNotification) hooks: one status line into the
 * session thread. Without Slack config or a session thread it does nothing and exits 0.
 */
import * as core from '../lib/core.ts'
import * as slack from '../lib/slack-http.ts'
import * as state from '../lib/state.ts'

async function main(): Promise<void> {
  const cfg = core.readSlackConfig(process.env)
  if (!cfg.ok) return
  const input = JSON.parse(await Bun.stdin.text()) as core.HookInput & { session_id?: string }
  const text = core.statusText(input)
  if (!text) return
  const thread = state.readThread(core.dataDir(process.env), input.session_id ?? '')
  if (!thread) return
  await slack.postMessage(cfg.config.botToken, cfg.config.channelId, thread.thread_ts, text)
}

main().catch(err => {
  process.stderr.write(`slack-channel: status not posted: ${(err as Error).message}\n`)
})
