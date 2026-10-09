#!/usr/bin/env bun
/**
 * PreToolUse(AskUserQuestion): asks each question in the session thread and answers
 * from the operator's reply. Any reason it cannot answer (no Slack config, no thread,
 * timeout, API error) exits 0 with no output, which leaves the terminal picker in place.
 */
import * as core from '../lib/core.ts'
import * as slack from '../lib/slack-http.ts'
import * as state from '../lib/state.ts'

const POLL_MS = 4000
const MARGIN_MS = 30_000
const DEFAULT_WAIT_SECONDS = 3600

function waitSeconds(raw: string | undefined): number {
  const n = Number(raw)
  return Number.isFinite(n) && n > MARGIN_MS / 1000 ? n : DEFAULT_WAIT_SECONDS
}

const maxTs = (a: string, b: string) => (Number(b) > Number(a) ? b : a)

async function awaitAnswer(
  q: core.Question,
  questionTs: string,
  deadline: number,
  token: string,
  gate: core.Gate,
): Promise<string> {
  let oldest = questionTs
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_MS))
    const replies = await slack.threadReplies(token, gate.channelId, gate.threadTs, oldest)
    for (const msg of replies) {
      oldest = maxTs(oldest, msg.ts ?? oldest)
      if (!core.isOperatorThreadReply(msg, gate)) continue
      const res = core.resolveAnswer(q, msg.text ?? '')
      if ('answer' in res) return res.answer
      await slack.postMessage(token, gate.channelId, gate.threadTs, res.error)
    }
  }
  throw new Error('no answer before the wait limit')
}

async function main(): Promise<void> {
  const input = JSON.parse(await Bun.stdin.text()) as { session_id?: string; tool_input?: { questions?: unknown } }
  const cfg = core.readSlackConfig(process.env)
  if (!cfg.ok) return
  const questions = input.tool_input?.questions
  if (!Array.isArray(questions) || questions.length === 0) return

  const dir = core.dataDir(process.env)
  const sessionId = input.session_id ?? ''
  const thread = state.readThread(dir, sessionId)
  if (!thread) return

  const { botToken, channelId, operatorUserId } = cfg.config
  const gate: core.Gate = { channelId, operatorUserId, threadTs: thread.thread_ts }
  const deadline = Date.now() + waitSeconds(process.env.SLACK_QUESTION_TIMEOUT_SECONDS) * 1000 - MARGIN_MS

  // The server drops operator messages while this marker is live, so the answer is not also sent as a prompt.
  state.markQuestionPending(dir, sessionId, deadline + 60_000)
  try {
    const answers: Record<string, string> = {}
    for (const [i, q] of (questions as core.Question[]).entries()) {
      const questionTs = await slack.postMessage(
        botToken,
        channelId,
        gate.threadTs,
        core.formatQuestion(q, i + 1, questions.length),
      )
      answers[q.question] = await awaitAnswer(q, questionTs, deadline, botToken, gate)
      await slack.postMessage(botToken, channelId, gate.threadTs, `Answer recorded: ${core.safe(answers[q.question]!)}`)
    }
    process.stdout.write(JSON.stringify(core.allowWithAnswers(questions as core.Question[], answers)))
  } catch (err) {
    const reason = (err as Error).message
    process.stderr.write(`slack-channel: ${reason}; using the terminal picker\n`)
    await slack
      .postMessage(botToken, channelId, gate.threadTs, `Question not answered here (${core.safe(reason)}). Answer in the terminal.`)
      .catch(() => {})
  } finally {
    state.clearQuestionPending(dir, sessionId)
  }
}

main().catch(err => {
  process.stderr.write(`slack-channel: question hook failed: ${(err as Error).message}\n`)
})
