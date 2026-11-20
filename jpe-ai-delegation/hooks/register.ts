import type { EngineInterface, Register } from 'claude-code'
import { CLASSIFIER, CLASSIFIER_ALIAS, CODEX, CODEX_QUOTA_THRESHOLD, JUDGE, JUDGE_ALIAS, JUDGE_OUTPUT_TOKENS, LAST_RESORT, LOCAL_OUTPUT_TOKENS, QUOTA_SELECTOR, EXECUTOR_TABLE, budgetsFromMetrics, codexArgv, harnessArgv, codingTask, networkTask, eligibleRows, endAnchor, estimateTokens, explicitLabel, forbiddenModel, isAdvisory, isGenericType, isShellCAsk, jobHistory, jobState, recentFailures, localTask, mandatoryLabel, newestModel, mergeExecutorRows, metricsResult, parseCodexQuota, parseVerdict, pickLabel, pickLocal, quotaFromMetrics, rankRows, repositoryFromOrigin, safePayload, scoreWindows, taggedText, KIND_CLASSIFIER, parseKind } from './lib/policy'
import type { CodexQuotaRead, Executor, ExecutorRow, JobOutcome, JobRecord, JobState, Label, QuotaReason, QuotaRow, Route, Sandbox, Score, SkipReason, Kind, Verdict } from './lib/policy'
import { customAgentSandbox, parseAgentDefinition } from './lib/agent-definition'
import type { AgentDefinition } from './lib/agent-definition'

type Engine = EngineInterface
type AgentCall = { description?: string; prompt: string; subagent_type?: string; model?: string; effort?: string; name?: string; isolation?: string; run_in_background?: boolean }
const TEXT_EXECUTOR_TIMEOUT_MS = 120_000
const KIND_TIMEOUT_MS = 20_000
const KIND_OUTPUT_TOKENS = 16
// One-word and one-object utility asks: a model that reasons first spends the output limit before it answers.
const NO_THINKING = { chat_template_kwargs: { enable_thinking: false } }
const JUDGE_TIMEOUT_MS = 60_000
const CODEX_QUOTA_TIMEOUT_MS = 15_000
// A decisive native read serves for four hours; an unknown one is retried after ten minutes.
const CODEX_QUOTA_TTL_MS = 14_400_000
const CODEX_QUOTA_FAILURE_TTL_MS = 600_000
const CODEX_QUOTA_KEY = 'codex-quota'
const HARNESS_FAILURE_KEY = 'harness-failure:'
// A harness run that failed at least this long after it started did work and gave up, so the remaining harness rows
// are skipped and the next row of another transport runs.
const HARNESS_FALLBACK_MS = 30_000
// Codex and harness children stream through `$.process.spawn`: `$.process.run` stops every child at ten minutes, and
// a long task is not a failure. This bound ends the stream instead; leaving the loop kills the child.
const LONG_RUN_MS = 3_600_000
const QUOTA_TIMEOUT_MS = 3_000
const QUOTA_REFRESH_MS = 600_000
const QUOTA_TOKEN_MAX_BYTES = 4096
const isAbsolutePath = (path: string): boolean => path.startsWith('/')
// A caught error's own text on one bounded line, so the decision log tells a failed spawn from a bad answer.
const errText = (err: unknown): string => (err instanceof Error ? err.message : String(err)).replace(/\s+/g, ' ').slice(0, 200)

// A session keeps the PATH it started with, so after a host rebuild its first `codex` or `claude` can be a store path
// the new generation dropped. The current profile's directories go ahead of the inherited PATH for every child CLI;
// `$HOME/.local/bin` stays first because on some hosts the first `claude` on the session's PATH cannot run headless.
// Empty entries are dropped: an empty PATH element means the working directory, which may be a repository under review.
async function childPath($: Engine): Promise<string> {
  const home = await $.env.get('HOME')
  const user = await $.env.get('USER')
  const current = [...(home ? [`${home}/.local/bin`] : []), ...(user ? [`/etc/profiles/per-user/${user}/bin`] : []), '/run/current-system/sw/bin']
  return [...current, ...((await $.env.get('PATH')) ?? '').split(':')].filter(Boolean).join(':')
}

// Why a child CLI failed, for the decision log: the headless JSON result's subtype and turn count when stdout carries
// one, else the first non-empty stderr line with token-like runs redacted. One short suffix, or nothing.
function childDetail(stdout: string, stderr: string): string {
  try {
    const p = JSON.parse(stdout) as { subtype?: unknown; num_turns?: unknown }
    if (typeof p?.subtype === 'string') return ` (${errText(p.subtype)}${typeof p.num_turns === 'number' ? `, ${p.num_turns} turns` : ''})`
  } catch {
    // Not a JSON result; fall back to stderr.
  }
  const line = stderr.split('\n').find((l) => l.trim())
  return line ? ` (${errText(line.replace(/[A-Za-z0-9_+=-]{24,}/g, '[redacted]'))})` : ''
}
const MODEL_INFO_TIMEOUT_MS = 10_000
const JOB_STATUS_BUDGET_MS = 3_000
const JOB_STATUS_TIMEOUT_MS = 15_000
const JOB_LOG_BYTES = 131_072
const LOG_TIMEOUT_MS = 5_000
const PROMPT_POLICY = 'The jpe-ai-delegation hook places every Agent spawn. Tag self-contained text work [class: text] and put all of its text in the prompt; the hook sends it to an on-host local model first. An untagged spawn is classified by the hook itself, and an explicit tag always remains the override. Every other spawn, and any local answer that fails its check, goes to the subscription executors it is eligible for, ranked by usage pace. ZCode, OpenCode Go and Cursor take only non-sensitive coding tagged [task: code] [repo: owner/repository] in a public repository; their output is a ready PR labelled human:review; leak-scan it before merge; never auto-merge. Codex runs Luna at xhigh, the only Codex model and effort (AGENTS.md, \'Delegation routing\'). Tag work that needs network or GitHub writes [needs: network]; it runs on the in-session last rung, never an executor sandbox. Haiku xhigh is always last. Nothing stops because an executor is unavailable. Never Sonnet, Opus or Fable subagents. Never send secrets, credentials, inventory or incident content to any executor. Antigravity stays a second-opinion reviewer, never an executor.'

// A quota read: the instant-query result, or why there is none.
type QuotaFetch = { result?: unknown[]; failure?: 'quota_unconfigured' | 'quota_unreachable' }

// Per-session caches, reset when the module registers. The first quota read is awaited; later reads serve the cache
// and refresh it in the background at most every QUOTA_REFRESH_MS.
let quotaRead: Promise<QuotaFetch> | undefined
let quotaAt = 0
let localWindows: Promise<Record<string, number | undefined>> | undefined
let executorTable: Promise<ExecutorRow[]> | undefined
let backgroundJobs = 0

// The built-in executor table merged with the operator override, read once per session. A bad override is logged and ignored.
function loadExecutorTable($: Engine): Promise<ExecutorRow[]> {
  executorTable ??= (async () => {
    try {
      const path = `${await $.env.get('HOME')}/.config/ai-delegation/executors.json`
      if (!(await $.fs.exists(path))) return [...EXECUTOR_TABLE]
      const { rows, rejected } = mergeExecutorRows(EXECUTOR_TABLE, JSON.parse((await $.fs.read(path)) as string))
      if (rejected.length) await logDecision($, `executor override rows rejected: ${rejected.join(', ')}`)
      return rows
    } catch {
      await logDecision($, 'executor override unreadable; using the built-in table')
      return [...EXECUTOR_TABLE]
    }
  })()
  return executorTable
}

async function withTimeout<T>($: Engine, work: Promise<T>, ms: number): Promise<T> {
  let timer: { cancel: () => void } | undefined
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => { timer = $.clock.after(ms, () => reject(new Error('timeout'))) })])
  } finally {
    timer?.cancel()
  }
}

// The bearer token comes from the file AGENT_QUOTA_TOKEN_FILE names, read at call time and trimmed. Only an absolute,
// non-symlink regular file up to 4096 bytes is read; token text must be printable ASCII without whitespace. The token
// is never kept, placed in the environment or logged; it goes only to an https URL. Invalid content sends no header
// and leaves the server's 401 to decide.
async function quotaHeaders($: Engine, url: string): Promise<Record<string, string>> {
  const headers: Record<string, string> = { accept: 'application/json' }
  try {
    const path = url.startsWith('https://') ? await $.env.get('AGENT_QUOTA_TOKEN_FILE') : undefined
    if (!path || !isAbsolutePath(path)) return headers
    const file = await $.fs.stat(path, { resolve: false })
    if (file.kind !== 'file' || file.isLink || file.size > QUOTA_TOKEN_MAX_BYTES) return headers
    const content = (await $.fs.read(path)) as string
    if (content.length > QUOTA_TOKEN_MAX_BYTES) return headers
    const token = content.trim()
    if (/^[!-~]+$/.test(token)) headers.Authorization = `Bearer ${token}`
  } catch {
    // No readable token: the request goes without one.
  }
  return headers
}

// The clock, bounded by LOG_TIMEOUT_MS: null when it rejects or does not answer in time.
const clockNow = ($: Engine): Promise<number | null> => withTimeout($, $.clock.now(), LOG_TIMEOUT_MS).catch(() => null)

// One instant query to the metrics store named by AGENT_QUOTA_QUERY_URL; the plugin ships no default. Unset makes
// no request. A failure, timeout, non-OK status or a body that is not a successful vector means unreachable.
async function readQuota($: Engine): Promise<QuotaFetch> {
  const base = (await $.env.get('AGENT_QUOTA_QUERY_URL'))?.replace(/\/+$/, '')
  if (!base) return { failure: 'quota_unconfigured' }
  try {
    const url = `${base}/api/v1/query?query=${encodeURIComponent(QUOTA_SELECTOR)}`
    // The token read runs inside the timed work, so the 3 s budget covers a read that never settles.
    const request = (async () => $.http.fetch(url, { method: 'GET', headers: await quotaHeaders($, url) }))()
    const response = await withTimeout($, request, QUOTA_TIMEOUT_MS)
    const result = response.ok ? metricsResult(JSON.parse(response.text)) : undefined
    return result ? { result } : { failure: 'quota_unreachable' }
  } catch {
    return { failure: 'quota_unreachable' }
  }
}

async function quotaRows($: Engine): Promise<QuotaFetch> {
  const now = await clockNow($)
  if (!quotaRead) {
    quotaAt = now ?? 0
    quotaRead = readQuota($)
    return quotaRead
  }
  const current = quotaRead
  // Without a clock reading the refresh waits for the next decision.
  if (now !== null && now - quotaAt >= QUOTA_REFRESH_MS) {
    quotaAt = now
    // A failed refresh keeps the last result; its samples still go stale on the clock.
    void readQuota($).then((read) => { if (read.result) quotaRead = Promise.resolve(read) })
  }
  return current
}

// Score from one quota row; undefined when the row is missing or has no usable window.
function rowScore(rows: QuotaRow[], id: string, nowSeconds: number): Score | undefined {
  const row = rows.find((r) => r.id === id)
  if (!row) return undefined
  const score = scoreWindows(row.windows, nowSeconds)
  return score.exhausted || score.score !== undefined || score.distance !== undefined ? score : undefined
}

type QuotaView = { scores: Partial<Record<Executor, Score>>; unknown: Record<string, QuotaReason>; sources: Record<string, string>; budgets: Map<string, number>; nativeSkips: Record<Executor, SkipReason> }

// One native `codex-quota` read as cached in the plugin's store: the read time decides freshness.
type NativeQuota = CodexQuotaRead & { at?: number }

// The subscription's own answer: exit code 0 means it may be used and the printed object carries the used percent; any
// non-zero exit is a refusal. An absent command, a timeout beyond the 15 s budget, or no parsable object is unknown.
async function readCodexQuota($: Engine): Promise<CodexQuotaRead> {
  try {
    const result = await withTimeout($, $.process.run(['codex-quota'], { timeoutMs: CODEX_QUOTA_TIMEOUT_MS, env: { PATH: await childPath($) } }), CODEX_QUOTA_TIMEOUT_MS)
    if (result.exitCode !== 0) return { kind: 'exhausted' }
    return parseCodexQuota(result.stdout, CODEX_QUOTA_THRESHOLD)
  } catch {
    return { kind: 'unknown' }
  }
}

// The native read behind the metrics feed, cached in the plugin's store: a decisive read serves for four hours and an
// unknown one for ten minutes. Without a clock reading every call re-runs the command and nothing is cached.
async function nativeCodexQuota($: Engine): Promise<NativeQuota> {
  const now = await clockNow($)
  try {
    const cached = (await $.store.get(CODEX_QUOTA_KEY)) as NativeQuota | undefined
    const fresh = typeof cached?.at === 'number' && Number.isFinite(cached.at) && now !== null && now - cached.at >= 0 &&
      (cached.kind === 'unknown' ? now - cached.at < CODEX_QUOTA_FAILURE_TTL_MS : (cached.kind === 'ok' || cached.kind === 'exhausted') && now - cached.at < CODEX_QUOTA_TTL_MS)
    if (fresh && cached) return cached
  } catch {
    // An unreadable store entry is a cache miss.
  }
  const read = await readCodexQuota($)
  if (now !== null) {
    try {
      await $.store.set(CODEX_QUOTA_KEY, { ...read, at: now })
    } catch {
      // A failed store write only costs the next read its cache.
    }
  }
  return read
}

// A failed on-host harness row sits out for the same ten-minute window as a failed native quota read.
async function recentHarnessFailure($: Engine, executor: Executor, now: number): Promise<boolean> {
  if (!Number.isFinite(now)) return false
  try {
    const failedAt = await $.store.get(`${HARNESS_FAILURE_KEY}${executor}`)
    return typeof failedAt === 'number' && Number.isFinite(failedAt) && now >= failedAt && now - failedAt < CODEX_QUOTA_FAILURE_TTL_MS
  } catch {
    return false
  }
}

async function recordHarnessFailure($: Engine, executor: Executor, at: number | null): Promise<void> {
  if (at === null) return
  try {
    await $.store.set(`${HARNESS_FAILURE_KEY}${executor}`, at)
  } catch {
    // A failed store write only costs the next spawn its cooldown.
  }
}

// The native read decides codex whenever the feed left it without a score: eligible below the threshold with its used
// percent recorded, exhausted at or above it or on a refusal, and quota_unknown when no decisive read is possible.
async function applyNativeCodex($: Engine, view: QuotaView): Promise<void> {
  const read = await nativeCodexQuota($)
  if (read.kind === 'unknown') {
    view.nativeSkips.codex = 'quota_unknown'
    return
  }
  view.sources.codex = 'codex-quota'
  view.scores.codex = read.kind === 'exhausted' ? { exhausted: true, ...(read.used === undefined ? {} : { used: read.used }) } : { exhausted: false, used: read.used }
}

// Scores for table rows that name a quota executor, judged for staleness at this moment. Rows without one stay unknown.
// When the feed leaves codex without a score, the native `codex-quota` read decides instead.
async function currentQuota($: Engine, table: readonly ExecutorRow[]): Promise<QuotaView> {
  const read = await quotaRows($)
  const ms = await clockNow($)
  const ids = [...new Set(table.flatMap((r) => (r.quota ? [r.quota] : [])))]
  const view: QuotaView = { scores: {}, unknown: {}, sources: {}, budgets: new Map(), nativeSkips: {} }
  // Staleness cannot be judged without a clock reading, so every quota is unknown.
  if (!read.result || ms === null) {
    for (const id of ids) view.unknown[id] = read.result ? 'quota_stale' : (read.failure ?? 'quota_unreachable')
    if (ids.includes('codex')) await applyNativeCodex($, view)
    return view
  }
  const now = ms / 1000
  view.budgets = budgetsFromMetrics(read.result, table.flatMap((r) => (r.budget_key ? [r.budget_key] : [])), now)
  const adapted = quotaFromMetrics(read.result, ids, now)
  view.unknown = adapted.unknown
  view.sources = adapted.sources
  for (const r of table) {
    const score = r.quota ? rowScore(adapted.rows, r.quota, now) : undefined
    if (score) view.scores[r.id] = score
  }
  // The feed is the decider only while it answers for codex; a missing or stale codex row falls to the native read.
  if (view.scores.codex === undefined && ids.includes('codex')) await applyNativeCodex($, view)
  return view
}

async function currentCodexScore($: Engine): Promise<Score | undefined> {
  return (await currentQuota($, EXECUTOR_TABLE.filter((r) => r.quota === 'codex'))).scores.codex
}

function quotaLine(score: Score | undefined): string {
  if (!score) return 'codex-quota: unavailable'
  return score.exhausted ? 'codex-quota: exhausted' : 'codex-quota: available'
}

// One streamed child: its exit code and output once it ends, or a rejection when it is still running after timeoutMs,
// with the child killed.
async function runChild($: Engine, argv: string[], input: string, timeoutMs: number, env: Record<string, string>): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const child = $.process.spawn({ argv, input, env })
  const read = (async () => {
    const out = { stdout: '', stderr: '' }
    for await (const piece of child) out[piece.stream] += piece.text
    return { exitCode: (await child.result).code ?? -1, ...out }
  })()
  try {
    return await withTimeout($, read, timeoutMs)
  } catch (err) {
    void child.return(undefined as never).catch(() => {})
    throw errText(err) === 'timeout' ? new Error(`still running after ${timeoutMs} ms`) : err
  }
}

// One `codex exec`; its final message is read from a temporary output file.
async function runCodex($: Engine, codexRoute: Route, sandbox: Sandbox, prompt: string, timeoutMs: number, cwd?: string): Promise<string | undefined> {
  let outputFile: string | undefined
  let failure: string | undefined
  try {
    const temporary = await $.process.run(['mktemp'], { timeoutMs: 5_000 })
    const temporaryPath = temporary.stdout.trim()
    if (temporary.exitCode !== 0 || !temporaryPath.startsWith('/')) {
      failure = `could not create final-message file (exit ${temporary.exitCode})`
    } else {
      outputFile = temporaryPath
      const home = (await $.env.get('CODEX_HOME')) ?? `${await $.env.get('HOME')}/.codex`
      const cache = `${home}/models_cache.json`
      const model = (await $.fs.exists(cache)) ? newestModel((await $.fs.read(cache)) as string, codexRoute.family) : undefined
      const argv = codexArgv(sandbox, codexRoute, model, outputFile)
      if (cwd) argv.splice(2, 0, '-C', cwd)
      const r = await runChild($, argv, prompt, timeoutMs, { PATH: await childPath($) })
      if (r.exitCode !== 0) {
        failure = `codex exec exited with code ${r.exitCode}${childDetail('', r.stderr)}`
      } else {
        const text = ((await $.fs.read(outputFile)) as string).trim()
        if (text) return text
        failure = 'codex exec returned an empty final message'
      }
    }
  } catch (err) {
    failure = `codex exec invocation or output read failed: ${errText(err)}`
  } finally {
    if (outputFile) {
      try {
        await $.process.run(['rm', '-f', outputFile], { timeoutMs: 5_000 })
      } catch {
        // A cleanup failure must not replace the Codex result.
      }
    }
  }
  const reason = failure ?? 'unknown failure'
  $.ui.log(`ai-delegation: Codex failed: ${reason}`)
  await logDecision($, `codex failure: ${reason}`)
  return undefined
}

// One headless Claude Code child on the on-host router, under the row's role alias. Its stdout is one JSON object
// whose `result` is the final text; an empty or errored answer is a failed check, so routing continues.
async function runHarness($: Engine, row: ExecutorRow, sandbox: Sandbox, prompt: string, timeoutMs: number, cwd?: string): Promise<string | undefined> {
  let failure: string | undefined
  try {
    const base = (await $.env.get('LITELLM_LOCAL_BASE_URL'))?.replace(/\/+$/, '')
    if (!base) failure = 'router URL unset'
    else {
      // An empty string clears the parent's value.
      const env: Record<string, string> = {
        ANTHROPIC_BASE_URL: base,
        ANTHROPIC_AUTH_TOKEN: 'local-proxy',
        ANTHROPIC_API_KEY: '',
        CLAUDE_CODE_OAUTH_TOKEN: '',
        ANTHROPIC_CUSTOM_HEADERS: '',
        CLAUDE_CODE_USE_BEDROCK: '',
        CLAUDE_CODE_USE_VERTEX: '',
        CLAUDE_CODE_USE_FOUNDRY: '',
        ANTHROPIC_MODEL: row.model!,
        ANTHROPIC_DEFAULT_OPUS_MODEL: row.model!,
        ANTHROPIC_DEFAULT_SONNET_MODEL: row.model!,
        ANTHROPIC_DEFAULT_HAIKU_MODEL: row.model!,
        CLAUDE_CODE_SUBAGENT_MODEL: row.model!,
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
        CLAUDE_CODE_MAX_CONTEXT_TOKENS: String(row.window!),
        CLAUDE_CODE_MAX_OUTPUT_TOKENS: '8000',
        // With the unknown-window enforcement on, the child only compacts after the model rejects an over-long prompt,
        // where the run dies.
        CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT: '',
        PATH: await childPath($),
      }
      const argv = harnessArgv(sandbox, cwd ?? await $.session.cwd())
      // A working directory goes through a shell that execs the child in it.
      const r = await runChild($, cwd ? ['/bin/sh', '-c', 'cd "$1" && shift && exec "$@"', 'sh', cwd, ...argv] : argv, prompt, timeoutMs, env)
      if (r.exitCode !== 0) failure = `harness exited with code ${r.exitCode}${childDetail(r.stdout, r.stderr)}`
      else {
        const parsed = JSON.parse(r.stdout) as { is_error?: unknown; result?: unknown }
        const text = typeof parsed.result === 'string' ? parsed.result.trim() : ''
        if (parsed.is_error !== false || !text) failure = 'harness returned no checked result'
        else return text
      }
    }
  } catch (err) {
    failure = `harness invocation failed: ${errText(err)}`
  }
  $.ui.log(`ai-delegation: harness failed: ${failure ?? 'unknown failure'}`)
  await logDecision($, `harness failure: ${failure ?? 'unknown failure'}`)
  return undefined
}

// Append-only decision log; `tee -a` keeps parallel hooks from dropping each other's lines. Every step is bounded by
// LOG_TIMEOUT_MS. True when the line was written; a failed write is reported in the UI and never changes a decision.
async function logDecision($: Engine, line: string): Promise<boolean> {
  try {
    const home = await withTimeout($, $.env.get('HOME'), LOG_TIMEOUT_MS)
    const written = await withTimeout($, $.process.run(['tee', '-a', `${home}/.claude/ai-delegation.log`], { stdin: `${line}\n`, timeoutMs: LOG_TIMEOUT_MS }), LOG_TIMEOUT_MS)
    if (written.exitCode === 0) return true
  } catch {
    // Reported below.
  }
  $.ui.log('ai-delegation: decision log write failed')
  return false
}

// Context windows of the on-host aliases, read once per session from the local router.
function localModelWindows($: Engine, base: string): Promise<Record<string, number | undefined>> {
  localWindows ??= (async () => {
    try {
      const response = await withTimeout($, $.http.fetch(`${base}/model/info`, { method: 'GET', headers: { accept: 'application/json' } }), MODEL_INFO_TIMEOUT_MS)
      if (!response.ok) return {}
      const windows: Record<string, number | undefined> = {}
      for (const m of JSON.parse(response.text)?.data ?? []) {
        if (typeof m?.model_name === 'string' && typeof m?.model_info?.max_input_tokens === 'number') windows[m.model_name] = m.model_info.max_input_tokens
      }
      return windows
    } catch {
      return {}
    }
  })()
  return localWindows
}

// One chat completion on an on-host alias. An empty answer or a length cut-off is a failed check.
async function runLocal($: Engine, e: AgentCall, base: string, alias: string, timeoutMs: number): Promise<string | undefined> {
  try {
    const response = await withTimeout($, $.http.fetch(`${base}/v1/chat/completions`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: alias, max_tokens: LOCAL_OUTPUT_TOKENS, messages: [{ role: 'user', content: e.prompt }] }),
    }), timeoutMs)
    if (!response.ok) throw new Error('HTTP failure')
    const choice = JSON.parse(response.text)?.choices?.[0]
    const out = choice?.message?.content
    if (typeof out !== 'string' || !out.trim() || choice?.finish_reason === 'length') throw new Error('failed check')
    return out.trim()
  } catch {
    await logDecision($, `local ${alias} gave no checked answer`)
    return undefined
  }
}

// One word from the on-host small alias about an untagged spawn: self-contained text, code, or neither. Only this
// three-way kind is used; a failed or malformed classification names its kind in the decision log and is `other`.
async function classifyKind($: Engine, e: AgentCall): Promise<Kind> {
  let failure = 'no router URL'
  try {
    const base = (await $.env.get('LITELLM_LOCAL_BASE_URL'))?.replace(/\/+$/, '')
    if (!base) throw new Error('router URL unset')
    failure = 'timeout'
    const response = await withTimeout($, $.http.fetch(`${base}/v1/chat/completions`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'small', max_tokens: KIND_OUTPUT_TOKENS, ...NO_THINKING, messages: [{ role: 'user', content: `${KIND_CLASSIFIER}\n\nTask:\n${e.description ?? ''}\n${e.prompt.slice(0, 4000)}` }] }),
    }), KIND_TIMEOUT_MS)
    failure = 'non-OK status'
    if (!response.ok) throw new Error('HTTP failure')
    failure = 'unparsable body'
    return parseKind(JSON.parse(response.text)?.choices?.[0]?.message?.content)
  } catch (error) {
    if (failure === 'timeout' && (error as Error)?.message !== 'timeout') failure = 'unreachable'
    await logDecision($, `classifier: ${failure}`)
    return 'other'
  }
}

// Classification runs on the on-host small alias, the same chat endpoint classifyKind uses; any failure classifies
// standard, as it always has.
async function classify($: Engine, e: AgentCall): Promise<Label> {
  const mandatory = mandatoryLabel(`${e.description ?? ''}\n${e.prompt}`)
  if (mandatory) return mandatory
  const named = explicitLabel(e.description, e.prompt)
  if (named) return named
  if (e.subagent_type === 'Plan') return 'plan'
  if (e.subagent_type === 'Explore') return 'bulk'
  const task = `${e.description ?? ''}\n${e.prompt.slice(0, 4000)}`
  try {
    const base = (await $.env.get('LITELLM_LOCAL_BASE_URL'))?.replace(/\/+$/, '')
    if (!base) throw new Error('router URL unset')
    const response = await withTimeout($, $.http.fetch(`${base}/v1/chat/completions`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: CLASSIFIER_ALIAS, max_tokens: KIND_OUTPUT_TOKENS, ...NO_THINKING, messages: [{ role: 'user', content: `${CLASSIFIER}\n\nTask:\n${task}` }] }),
    }), KIND_TIMEOUT_MS)
    if (!response.ok) throw new Error('HTTP failure')
    return pickLabel(JSON.parse(response.text)?.choices?.[0]?.message?.content) ?? 'standard'
  } catch {
    return 'standard'
  }
}

async function runRoutedCodex($: Engine, e: AgentCall, route: string, codexRoute: Route, sandbox: Sandbox, detail: string): Promise<unknown | undefined> {
  const started = await clockNow($)
  let cwd: string | undefined
  if (e.isolation) {
    if (e.isolation !== 'worktree') return undefined
    const temporary = await $.process.run(['mktemp', '-d'], { timeoutMs: 5_000 })
    cwd = temporary.stdout.trim()
    if (temporary.exitCode !== 0 || !cwd.startsWith('/')) return undefined
    const worktree = await $.process.run(['git', '-C', await $.session.cwd(), 'worktree', 'add', '--detach', cwd, 'HEAD'], { timeoutMs: 30_000 })
    if (worktree.exitCode !== 0) return undefined
    detail += `, worktree ${cwd}`
  }
  const out = await runCodex($, codexRoute, sandbox, e.prompt, LONG_RUN_MS, cwd)
  if (!out) return undefined
  await logDecision($, `route: ${route} -> codex ${codexRoute.family} ${codexRoute.effort} (${sandbox})`)
  return routedResult(e, 'ai-delegation-codex', out, `[routed: codex ${codexRoute.family} ${codexRoute.effort}, ${detail}]`, started === null ? 0 : ((await clockNow($)) ?? started) - started)
}

// The Codex rung: classify, pick the sandbox, run. Undefined on any failure so routing continues. The label comes from
// the shared per-spawn classifier, so a rung that runs after another asks no second classification.
async function runCodexRung($: Engine, e: AgentCall, customSandbox: Sandbox | undefined, rungLabel: () => Promise<Label>): Promise<unknown | undefined> {
  const label = await rungLabel()
  const advisory = isAdvisory(label) || isAdvisory(explicitLabel(e.description, e.prompt) ?? label)
  if (mandatoryLabel(`${e.description ?? ''}\n${e.prompt}`)) e = { ...e, description: `${e.description ?? ''} [class: bulk-complex]` }
  const codexSandbox: Sandbox = advisory || e.subagent_type === 'Explore' || e.subagent_type === 'Plan' || customSandbox === 'read-only' ? 'read-only' : 'workspace-write'
  return runRoutedCodex($, e, label, CODEX[label], codexSandbox, `class ${label}`)
}

// One harness run under the row's alias; the same working directory rules as Codex, including the temporary worktree.
async function runRoutedHarness($: Engine, e: AgentCall, row: ExecutorRow, sandbox: Sandbox): Promise<unknown | undefined> {
  const started = await clockNow($)
  let cwd: string | undefined
  if (e.isolation) {
    if (e.isolation !== 'worktree') return undefined
    const temporary = await $.process.run(['mktemp', '-d'], { timeoutMs: 5_000 })
    cwd = temporary.stdout.trim()
    if (temporary.exitCode !== 0 || !cwd.startsWith('/')) return undefined
    const worktree = await $.process.run(['git', '-C', await $.session.cwd(), 'worktree', 'add', '--detach', cwd, 'HEAD'], { timeoutMs: 30_000 })
    if (worktree.exitCode !== 0) return undefined
  }
  const out = await runHarness($, row, sandbox, e.prompt, LONG_RUN_MS, cwd)
  if (!out) return undefined
  await logDecision($, `route: ${row.id} -> harness ${row.model} (${sandbox})`)
  return routedResult(e, 'ai-delegation-harness', out, `[routed: harness ${row.model}]`, started === null ? 0 : ((await clockNow($)) ?? started) - started)
}

// The harness rung: classify, pick the sandbox by exactly the Codex rung's input, run.
async function runHarnessRung($: Engine, e: AgentCall, row: ExecutorRow, customSandbox: Sandbox | undefined, rungLabel: () => Promise<Label>): Promise<unknown | undefined> {
  const label = await rungLabel()
  const advisory = isAdvisory(label) || isAdvisory(explicitLabel(e.description, e.prompt) ?? label)
  if (mandatoryLabel(`${e.description ?? ''}\n${e.prompt}`)) e = { ...e, description: `${e.description ?? ''} [class: bulk-complex]` }
  const sandbox: Sandbox = advisory || e.subagent_type === 'Explore' || e.subagent_type === 'Plan' || customSandbox === 'read-only' ? 'read-only' : 'workspace-write'
  return runRoutedHarness($, e, row, sandbox)
}

function routedResult(e: AgentCall, agentId: string, out: string, footer: string, duration: number): unknown {
  return {
    result: {
      status: 'completed',
      prompt: e.prompt,
      agentId,
      content: [{ type: 'text', text: `${out}\n\n${footer}` }],
      totalToolUseCount: 0,
      totalDurationMs: duration,
      totalTokens: 0,
      usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: null, cache_read_input_tokens: null, server_tool_use: null, service_tier: null, cache_creation: null },
    },
  } as never
}

function failure(e: AgentCall, reason: string): unknown {
  return routedResult(e, 'ai-delegation-policy', `FAIL | router | ${reason}`, '[routing stopped]', 0)
}

function repositoryTag(description: string | undefined, prompt?: string): string | undefined {
  const repo = taggedText(description, prompt).match(/\[repo: ([A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9._-]{1,100})\]/)?.[1]
  const repository = repo?.split('/')[1]
  return repo && repository !== undefined && !['.', '..'].includes(repository) ? repo : undefined
}

// File paths named in the prompt, with URL schemes stripped and wrapping punctuation removed; deduplicated.
function promptPaths(prompt: string): string[] {
  const text = prompt.replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s"'`<>]*/gi, ' ')
  const pattern = /(?:^|[\s("'`\[(,:=<>])(\S*[\\/]\S*|[A-Za-z0-9._-]+\.[A-Za-z0-9]{1,12})(?=$|[\s)\],;:!?<>"'`]|\.(?:\s|$))/gm
  const paths = [...text.matchAll(pattern)].map((match) => match[1].replace(/^["'`(\[]+|[),.;:!?"'`\]]+$/g, ''))
  return [...new Set(paths.filter((path) => path.length > 1))]
}

function parentPath(path: string): string {
  const normalized = path.replace(/\/+$/g, '') || '/'
  const parent = normalized.slice(0, normalized.lastIndexOf('/'))
  return parent || '/'
}

// The absolute path a prompt names: `~` against the home directory, a relative path against the call's directory;
// a Windows drive path resolves to nothing.
function resolvePromptPath(path: string, cwd: string, home: string | undefined): string | undefined {
  if (/^[A-Za-z]:[\\/]/.test(path)) return undefined
  if (path.startsWith('~/')) return home ? `${home}${path.slice(1)}` : undefined
  if (isAbsolutePath(path)) return path
  if (!isAbsolutePath(cwd)) return undefined
  return `${cwd.replace(/\/+$/g, '')}/${path.replace(/\\/g, '/')}`
}

async function realPath($: Engine, path: string): Promise<string | undefined> {
  const result = await $.process.run(['realpath', path], { timeoutMs: 5_000 })
  const resolved = result.stdout.trim()
  return result.exitCode === 0 && result.isStdoutTruncated !== true && isAbsolutePath(resolved) ? resolved : undefined
}

// The git root of the nearest existing ancestor directory of the path, so a file the task creates resolves through
// its parent. A path with no existing ancestor, or any failed or truncated read, gives no root.
async function gitRoot($: Engine, path: string): Promise<string | undefined> {
  let directory = path
  for (;;) {
    const resolved = await realPath($, directory)
    if (!resolved) {
      const parent = parentPath(directory)
      if (parent === directory) return undefined
      directory = parent
      continue
    }
    const metadata = await $.fs.stat(resolved)
    if (metadata.kind === 'file') directory = parentPath(resolved)
    else if (metadata.kind === 'dir' || metadata.kind === 'directory') directory = resolved
    else return undefined
    break
  }
  const result = await $.process.run(['git', '-C', directory, 'rev-parse', '--show-toplevel'], { timeoutMs: 5_000 })
  const root = result.stdout.trim()
  if (result.exitCode !== 0 || result.isStdoutTruncated === true || !isAbsolutePath(root)) return undefined
  return realPath($, root)
}

// The one git repository every prompt path lives in, else undefined: no paths, two different repositories, a path
// outside every repository, or a failed read means no inference.
async function repositoryRoot($: Engine, e: AgentCall): Promise<string | undefined> {
  const paths = promptPaths(e.prompt)
  if (!paths.length) return undefined
  const cwd = await $.session.cwd()
  const home = paths.some((path) => path.startsWith('~/')) ? await $.env.get('HOME') : undefined
  let root: string | undefined
  for (const path of paths) {
    const absolute = resolvePromptPath(path, cwd, home)
    if (!absolute) return undefined
    const pathRoot = await gitRoot($, absolute)
    if (!pathRoot || (root !== undefined && pathRoot !== root)) return undefined
    root ??= pathRoot
  }
  return root
}

async function inferredRepository($: Engine, root: string): Promise<string | undefined> {
  const origin = await $.process.run(['git', '-C', root, 'remote', 'get-url', 'origin'], { timeoutMs: 5_000 })
  return origin.exitCode === 0 && origin.isStdoutTruncated !== true ? repositoryFromOrigin(origin.stdout.trim()) : undefined
}

async function github($: Engine, path: string): Promise<unknown> {
  let timer: { cancel: () => void } | undefined
  try {
    const response = await Promise.race([
      $.http.fetch(`https://api.github.com/repos/${path}`, {
        method: 'GET', headers: { accept: 'application/vnd.github+json', 'user-agent': 'jpe-ai-delegation' },
      }),
      new Promise<never>((_, reject) => { timer = $.clock.after(15_000, () => reject(new Error('timeout'))) }),
    ])
    if (!response.ok) {
      // Private repository metadata needs the caller's existing GitHub CLI identity.
      const authenticated = await $.process.run(['gh', 'api', `repos/${path}`], { timeoutMs: 15_000 })
      if (authenticated.exitCode !== 0 || authenticated.isStdoutTruncated === true) throw new Error('repository check failed')
      return JSON.parse(authenticated.stdout)
    }
    return JSON.parse(response.text)
  } finally {
    timer?.cancel()
  }
}

// The tagged repository, or without a tag the one inferred from the prompt paths, when the task is non-sensitive
// coding in a verified public repository; otherwise undefined. `codeTask` is an explicit `[task: code]` tag or a
// `code` classification. Either way GitHub visibility decides.
async function publicCodeRepo($: Engine, e: AgentCall, codeTask: boolean): Promise<string | undefined> {
  if (!codeTask || mandatoryLabel(`${e.description ?? ''}\n${e.prompt}`)) return undefined
  try {
    const tagged = repositoryTag(e.description, e.prompt)
    const root = tagged ? undefined : await repositoryRoot($, e)
    const repo = tagged ?? (root ? await inferredRepository($, root) : undefined)
    if (!repo) return undefined
    const repository = await github($, repo) as { visibility?: string; private?: boolean }
    return repository.visibility === 'public' && repository.private === false ? repo : undefined
  } catch {
    await logDecision($, 'public repository could not be verified')
    return undefined
  }
}

const SANDBOX_NAMES: Record<string, string> = { zcode: 'zcode-job sandbox', opencode: 'OpenCode Go sandbox', 'opencode-qwen': 'Qwen sandbox', 'cursor-agent': 'Cursor sandbox' }

// Sandbox tools the operator enables; undefined (unset) enables every table row's tool.
async function sandboxTools($: Engine): Promise<string[] | undefined> {
  return (await $.env.get('AGENT_ROUTE_ZCODE_TOOLS'))?.split(/\s+/).filter(Boolean)
}

// The job's dispatcher state, or undefined while it runs or when status cannot be read within timeoutMs.
async function jobStatus($: Engine, job: string, timeoutMs: number): Promise<JobState | undefined> {
  try {
    const status = await withTimeout($, $.process.run(['zcode-job', 'status', job], { timeoutMs }), timeoutMs)
    return status.exitCode === 0 && status.isStdoutTruncated !== true ? jobState(JSON.parse(status.stdout)) : undefined
  } catch {
    return undefined
  }
}

// One decision-log write for every outcome found at this placement.
async function logOutcomes($: Engine, ended: { record: JobRecord; state: JobState }[]): Promise<JobOutcome[]> {
  if (!ended.length) return []
  const ts_ms = await clockNow($)
  if (ts_ms === null) return []
  const outcomes = ended.map(({ record, state }) => ({ job: record.job, repo: record.repo, executor: record.executor, end: state.end, ts_ms, ended_ms: endAnchor(record, state, ts_ms) }))
  await logDecision($, outcomes.map((o) => JSON.stringify({ ts_ms, event: 'outcome', job: o.job, repo: o.repo, executor: o.executor, end: o.end, ended_ms: o.ended_ms })).join('\n'))
  return outcomes
}

// Jobs from recent route lines and one outcome per logged job, read from the last JOB_LOG_BYTES of the decision log; an
// unreadable or truncated read counts as no history. Pending jobs are read once each, together within
// JOB_STATUS_BUDGET_MS, and an outcome line is written for each job that has ended.
async function jobOutcomes($: Engine, nowMs: number): Promise<JobOutcome[]> {
  let history: { pending: JobRecord[]; outcomes: JobOutcome[] }
  try {
    const tail = await $.process.run(['tail', '-c', String(JOB_LOG_BYTES), `${await $.env.get('HOME')}/.claude/ai-delegation.log`], { timeoutMs: 5_000 })
    if (tail.exitCode !== 0 || tail.isStdoutTruncated === true) return []
    history = jobHistory(tail.stdout.split('\n'), nowMs)
  } catch {
    return []
  }
  if (!history.pending.length) return history.outcomes
  const states: (JobState | undefined)[] = []
  await withTimeout($, Promise.all(history.pending.map(async (p, i) => { states[i] = await jobStatus($, p.job, JOB_STATUS_BUDGET_MS) })), JOB_STATUS_BUDGET_MS).catch(() => undefined)
  const ended = history.pending.flatMap((record, i) => { const state = states[i]; return state ? [{ record, state }] : [] })
  return [...history.outcomes, ...await logOutcomes($, ended)]
}

// No result only before dispatch (zcode-job not installed); after dispatch it returns the PR or a FAIL result. `accepted`
// is true once the dispatcher's answer names a job, so a FAIL without it means receipt is unverified.
// `unconfirmed` is true when the dispatch call threw or timed out, so whether the job was submitted is unknown.
// `refused` is true when the dispatcher answered in full and named no job: nothing was submitted, so the next rung runs.
type SandboxRun = { result?: unknown; record?: JobRecord; state?: JobState; accepted: boolean; unconfirmed?: boolean; refused?: boolean }
// A result with a `cancelled` state stops routing. Other ended states without a PR let the task move to the next executor.
async function runSandboxExecutor($: Engine, e: AgentCall, repo: string, tool: string, executor: string): Promise<SandboxRun> {
  const started = await clockNow($)
  try {
    const available = await $.process.run(['which', 'zcode-job'], { timeoutMs: 5_000 })
    if (available.exitCode !== 0) return { accepted: false }
  } catch {
    return { accepted: false }
  }
  const name = SANDBOX_NAMES[tool] ?? `${tool} sandbox`
  let record: JobRecord | undefined
  let accepted = false
  let answered = false
  try {
    const prompt = `${e.prompt}\n\nReturn a ready PR labelled human:review. Never auto-merge. The trusted lead must leak-scan the PR before merge.`
    const argv = tool === 'zcode' ? ['zcode-job', 'start', repo, prompt] : ['zcode-job', 'start', '--tool', tool, repo, prompt]
    // The dispatcher refuses a job without this marker; the repository was verified public before this call.
    const response = await $.process.run(argv, { timeoutMs: 300_000, env: { UNTRUSTED_OK: 'public' } })
    answered = true
    const line = response.stdout.replace(/\r?\n$/, '')
    const job = response.isStdoutTruncated === true ? undefined : line.match(/^(?:DONE|FAIL)\|(j-[0-9a-f]{16})\|/)?.[1]
    accepted = Boolean(job)
    if (!job && response.isStdoutTruncated !== true) return { accepted, refused: true }
    if (job) record = { job, repo, executor, started_ms: started ?? 0 }
    const done = line.match(/^DONE\|(j-[0-9a-f]{16})\|(https:\/\/github\.com\/([A-Za-z0-9-]+\/[A-Za-z0-9._-]+)\/pull\/(\d+))$/)
    const pullUrl = done?.[2]
    const pullRepository = done?.[3]
    const pullNumber = done?.[4]
    if (response.exitCode !== 0 || response.isStdoutTruncated === true || !pullUrl || !pullRepository || !pullNumber || pullRepository.toLowerCase() !== repo.toLowerCase()) {
      // A job still running or with an unreadable end may yet open a PR: never start a duplicate.
      const state = record ? await jobStatus($, record.job, JOB_STATUS_TIMEOUT_MS) : undefined
      if (state?.end === 'cancelled') return { accepted, record, state, result: failure(e, `${tool} job ${record!.job} was cancelled; routing stops for this task`) }
      if (state && state.end !== 'pr_opened') return { accepted, record, state }
      return { accepted, record, result: failure(e, `${tool} did not return a PR for the requested repository`) }
    }
    const pr = await github($, `${repo}/pulls/${pullNumber}`) as { state?: string; draft?: boolean; labels?: { name: string }[]; html_url?: string }
    if (pr.state !== 'open' || pr.draft !== false || pr.html_url !== pullUrl || !pr.labels?.some((l) => l.name === 'human:review')) return { accepted, record, result: failure(e, `${tool} PR is not ready and labelled human:review`) }
    await logDecision($, `route: coding -> ${name} (leak scan required before merge)`)
    return { accepted, record, result: routedResult(e, `ai-delegation-${tool}`, line, `[routed: ${name}; leak-scan before merge; never auto-merge]`, started === null ? 0 : ((await clockNow($)) ?? started) - started) }
  } catch {
    // A dispatched job may still be running. Do not start a duplicate executor.
    return { accepted, record, unconfirmed: !answered, result: failure(e, `${tool} dispatch or PR verification failed; inspect the job before retrying`) }
  }
}

async function customAgentDefinition($: Engine, type: string): Promise<AgentDefinition | undefined> {
  if (!/^[\w:.-]+$/.test(type)) return undefined
  const cwd = await $.session.cwd()
  const home = await $.env.get('HOME')
  const paths = [`${cwd}/.claude/agents/${type}.md`, ...(home ? [`${home}/.claude/agents/${type}.md`] : [])]
  let text: string | undefined
  for (const path of paths) {
    if (!(await $.fs.exists(path))) continue
    text = (await $.fs.read(path)) as string
    break
  }
  const namespaced = type.match(/^([\w-]+):([\w-]+)$/)
  if (text === undefined && namespaced) {
    const config = (await $.env.get('CLAUDE_CONFIG_DIR')) ?? (home ? `${home}/.claude` : undefined)
    const registry = config ? `${config}/plugins/installed_plugins.json` : undefined
    if (registry && await $.fs.exists(registry)) {
      type Installation = { scope: string; installPath: string; projectPath?: string }
      const installed = JSON.parse((await $.fs.read(registry)) as string) as { plugins: Record<string, Installation[]> }
      const scopes = ['local', 'project', 'user']
      const matches = Object.entries(installed.plugins).filter(([key]) => key.split('@')[0] === namespaced[1])
        .flatMap(([, entries]) => entries)
        .filter((entry) => scopes.includes(entry.scope) && (entry.scope === 'user' || (entry.projectPath && (cwd === entry.projectPath || cwd.startsWith(`${entry.projectPath}/`)))))
        .sort((a, b) => scopes.indexOf(a.scope) - scopes.indexOf(b.scope))
      const firstMatch = matches[0]
      const secondMatch = matches[1]
      // Ambiguous plugin names must not load an arbitrary marketplace's instructions.
      if (firstMatch && secondMatch && firstMatch.scope === secondMatch.scope) return undefined
      if (firstMatch?.installPath.startsWith('/')) {
        const path = `${firstMatch.installPath}/agents/${namespaced[2]}.md`
        if (await $.fs.exists(path)) text = (await $.fs.read(path)) as string
      }
    }
  }

  if (text === undefined) return undefined
  return parseAgentDefinition(text)
}

type RouteEvent = {
  agent_type: string; kind: { value: Kind; source: 'tag' | 'classifier' | 'none' }; local: { alias: string | null; est_tokens: number } | null; eligible: string[]
  scores: Record<string, { score: number | null; exhausted: boolean; effective: number | null; used: number | null; line: number | null } | null>; fell_through_from: string[]
  skipped: Record<string, SkipReason>; jobs: JobRecord[]
  quota_unknown: Record<string, QuotaReason>; quota_source: Record<string, string>
}

// One JSON telemetry line per routing decision. It never throws, so a failed write cannot change the decision.
// The loaded hook's manifest version, read once per plugin root, so a route line traces to the session that wrote it.
const hookVersions = new Map<string, Promise<string | null>>()
function hookVersion($: Engine): Promise<string | null> {
  const root = $.plugin.root
  if (!root) return Promise.resolve(null)
  let read = hookVersions.get(root)
  if (!read) {
    read = Promise.resolve($.fs.read(`${root}/.claude-plugin/plugin.json`))
      .then((text) => (JSON.parse(text as string) as { version?: unknown }).version)
      .then((version) => (typeof version === 'string' ? version : null), () => null)
    hookVersions.set(root, read)
  }
  return read
}

async function logRoute($: Engine, event: RouteEvent, chosen: string, reason: string): Promise<void> {
  try {
    // A clock that does not answer in time leaves ts_ms null rather than dropping the line.
    const ts_ms = await clockNow($)
    const hook_version = await hookVersion($)
    await logDecision($, JSON.stringify({ ts_ms, hook_version, event: 'route', ...event, chosen, reason }))
  } catch {
    // The log is advisory.
  }
}

// The agent type is logged only when it is a built-in type or a verified custom definition, a plain name of at most 80
// characters, and free of prohibited content; anything else is logged as "unrecognized".
const agentType = (e: AgentCall, verified: boolean): string => {
  const type = e.subagent_type ?? 'general-purpose'
  return (verified || isGenericType(e)) && /^[\w:.-]{1,80}$/.test(type) && safePayload(type) ? type : 'unrecognized'
}
const newEvent = (e: AgentCall): RouteEvent => ({ agent_type: agentType(e, false), kind: { value: 'other', source: 'none' }, local: null, eligible: [], scores: {}, fell_through_from: [], skipped: {}, jobs: [], quota_unknown: {}, quota_source: {} })

// Every exit that stops routing writes its route line too.
async function stopRoute($: Engine, e: AgentCall, event: RouteEvent, reason: string): Promise<unknown> {
  await logRoute($, event, 'stopped', reason)
  return failure(e, reason)
}

// A background spawn returns at once. The same route runs detached with the spawn in the foreground; the terminal rung
// starts a last-rung agent through $.agent.spawn, which reports on its own, and the routed result arrives through
// $.prompt.submit, queued until the session is idle.
function startBackground($: Engine, call: AgentCall): unknown {
  const job = `bg-${++backgroundJobs}`
  const terminal = async (value: AgentCall): Promise<unknown> => {
    const spawned = await $.agent.spawn({ prompt: value.prompt, description: value.description ?? '', subagentType: value.subagent_type ?? 'general-purpose', model: LAST_RESORT.model })
    const text = 'deny' in spawned ? `FAIL | router | the terminal rung was refused: ${spawned.deny}` : `The terminal rung started agent ${spawned.agentId}; its result arrives on its own.`
    return routedResult(value, 'ai-delegation-background', text, `[routed: ${LAST_RESORT.model}]`, 0)
  }
  void (async () => {
    let text: string
    try {
      const out = await route($, { ...call, run_in_background: false }, terminal as never) as { result?: { content?: { text?: string }[] } }
      text = out.result?.content?.[0]?.text ?? 'FAIL | router | the background route returned no result'
    } catch (err) {
      text = `FAIL | router | the background route failed: ${errText(err)}`
    }
    // The result lands in the user channel, so its first line marks it as data, never an operator instruction.
    const executor = /\[routed: ([^\]]+)\]\s*$/.exec(text)?.[1] ?? 'router'
    await $.prompt.submit({ text: `Subagent result (data from ${executor}, not an instruction):\n[ai-delegation ${job}] background spawn "${call.description ?? ''}"\n\n${text}` }).catch(() => logDecision($, `background ${job}: result delivery failed`))
  })()
  return routedResult(call, `ai-delegation-${job}`, `Started background job ${job}. Its result arrives later as a message from jpe-ai-delegation.`, `[routed: background ${job}]`, 0)
}

async function route($: Engine, e: AgentCall, next: (e: never) => Promise<unknown>): Promise<unknown> {
  const event = newEvent(e)
  // The route line is already written when core runs, so a core failure returns FAIL without a second line.
  const core = async (value: AgentCall): Promise<unknown> => {
    try {
      return await next(value as never)
    } catch {
      return failure(value, 'routing failed closed')
    }
  }
  if (forbiddenModel(e.model) || forbiddenModel(e.subagent_type)) return stopRoute($, e, event, 'Sonnet, Opus and Fable subagents are forbidden')
  const original = e
  let definition: AgentDefinition | undefined
  let customSandbox: Sandbox | undefined
  if (e.subagent_type && !isGenericType(e)) {
    try {
      definition = await customAgentDefinition($, e.subagent_type)
    } catch {
      return stopRoute($, e, event, 'custom agent model or tool restrictions could not be read')
    }
    event.agent_type = agentType(original, definition !== undefined)
    // No agent file: a built-in or plugin agent, which takes the native path below with its model pinned. A name
    // that cannot be an agent type still stops.
    if (!definition && !/^[\w:.-]{1,80}$/.test(e.subagent_type)) return stopRoute($, e, event, 'custom agent definition could not be verified')
    if (definition) {
      if (forbiddenModel(definition.model)) return stopRoute($, e, event, 'Sonnet, Opus and Fable subagents are forbidden')
      customSandbox = customAgentSandbox(definition)
      if (definition.prompt) e = { ...e, prompt: `Custom agent instructions:\n${definition.prompt}\n\nTask:\n${e.prompt}` }
    }
  }
  if (!safePayload(`${e.description ?? ''}\n${e.prompt}`)) return stopRoute($, e, event, 'payload contains prohibited content')
  if (e.subagent_type && !isGenericType(e) && customSandbox === undefined) {
    // The agent.spawn hook pins the model, so an inherited model never reaches the subagent.
    await logRoute($, event, 'native custom agent', 'custom tool policy')
    return core(original)
  }
  // Network or GitHub-write work runs in the session: executor sandboxes deny egress and never hold credentials.
  if (networkTask(original.description, original.prompt) || definition?.egress === 'network') {
    await logRoute($, event, LAST_RESORT.model, 'network work')
    return core({ ...original, effort: LAST_RESORT.effort })
  }
  if (original.run_in_background === true) {
    await logRoute($, event, 'background', 'run_in_background')
    return startBackground($, original)
  }

  // One three-way kind per spawn. An explicit tag wins without a request; an untagged eligible spawn asks the
  // on-host small alias once, after the forbidden-model, custom-agent and payload checks above.
  const genericRung = !definition && !e.isolation && isGenericType(e) && !['Explore', 'Plan'].includes(e.subagent_type ?? '')
  if (codingTask(e.description, e.prompt)) event.kind = { value: 'code', source: 'tag' }
  else if (localTask(e.description, e.prompt)) event.kind = { value: 'text', source: 'tag' }
  else if (!genericRung || mandatoryLabel(`${e.description ?? ''}\n${e.prompt}`)) event.kind = { value: 'other', source: 'none' }
  else event.kind = { value: await classifyKind($, e), source: 'classifier' }

  // Self-contained text work: the only work the local rung and router-chat rows take.
  const textOnly = genericRung && event.kind.value === 'text'
  const base = (await $.env.get('LITELLM_LOCAL_BASE_URL'))?.replace(/\/+$/, '')

  // Local rung: small, checkable, self-contained text on an on-host alias.
  if (textOnly) {
    const estimate = estimateTokens(e.prompt)
    const local = base ? pickLocal(estimate, await localModelWindows($, base)) : undefined
    event.local = { alias: local?.alias ?? null, est_tokens: estimate }
    if (base && local) {
      const out = await runLocal($, e, base, local.alias, local.timeoutMs)
      if (out) {
        await logRoute($, event, `local ${local.alias}`, 'checked local answer')
        return routedResult(e, 'ai-delegation-local', out, `[routed: local ${local.alias}]`, 0)
      }
      event.fell_through_from.push(`local ${local.alias}`)
    }
  }

  // Subscription rungs: eligibility, then usage pace; Haiku always ends the list.
  const restricted = definition && (definition.tools !== undefined || Boolean(definition.disallowedTools?.length))
  const repo = restricted ? undefined : await publicCodeRepo($, e, event.kind.value === 'code')
  const table = await loadExecutorTable($)
  // Without a clock reading no promotion is proven unexpired (Infinity expires them all) and no peak applies.
  const now = (await clockNow($)) ?? Number.POSITIVE_INFINITY
  // Every quota executor in the table is reported, so the event shows why an ineligible row's quota is unknown too.
  const quota = await currentQuota($, table)
  const { rows, skipped } = eligibleRows(table, Boolean(repo), now, quota.budgets)
  const { scores } = quota
  const activeRows: ExecutorRow[] = []
  for (const row of rows) {
    if (row.transport === 'harness' && await recentHarnessFailure($, row.id, now)) skipped[row.id] = 'recent_failures'
    else activeRows.push(row)
  }
  event.quota_unknown = quota.unknown
  event.quota_source = quota.sources
  const ranked = rankRows(activeRows, scores, now)
  Object.assign(skipped, ranked.skipped)
  // A codex row the native read could not decide is not a candidate, whatever its feed telemetry says.
  for (const [id, why] of Object.entries(quota.nativeSkips)) skipped[id] = why
  event.eligible = [...rows.map((r) => r.id), LAST_RESORT.model]
  event.skipped = skipped
  for (const r of rows) {
    const s = scores[r.id]
    event.scores[r.id] = {
      score: s?.score ?? null,
      exhausted: s?.exhausted ?? false,
      effective: ranked.effective[r.id] ?? null,
      used: s?.used ?? null,
      line: s?.line === undefined ? null : Number(s.line.toFixed(1)),
    }
  }
  // Outcomes of earlier sandbox jobs, read only when a sandbox executor is a candidate; an executor failing repeatedly
  // on this repository sits out for a while.
  let outcomes: JobOutcome[] | undefined
  const tools = await sandboxTools($)
  let harnessDown = false
  // One label classification per spawn, asked by whichever rung runs first.
  let labelPromise: Promise<Label> | undefined
  const rungLabel = (): Promise<Label> => (labelPromise ??= classify($, e))
  for (const executor of ranked.order.filter((id) => quota.nativeSkips[id] === undefined)) {
    const row = rows.find((r) => r.id === executor)!
    let result: unknown | undefined
    let cancelled = false
    let unaccepted = false
    let unconfirmed = false
    if (row.transport === 'harness') {
      // Without the router base URL the transport is unavailable: skip without attempting, and without naming the row
      // as fallen through. The remaining harness rows are skipped once a harness run failed after doing work for 30 s
      // or more.
      if (!base) { skipped[executor] = 'not_installed'; continue }
      if (harnessDown) { skipped[executor] = 'failed'; continue }
      const startedAt = await clockNow($)
      result = await runHarnessRung($, e, row, customSandbox, rungLabel)
      if (!result) {
        skipped[executor] = 'failed'
        const ended = await clockNow($)
        await recordHarnessFailure($, executor, ended ?? startedAt)
        if (startedAt !== null && ended !== null && ended - startedAt >= HARNESS_FALLBACK_MS) harnessDown = true
      }
    } else if (row.transport === 'codex') {
      result = await runCodexRung($, e, customSandbox, rungLabel)
      if (!result) skipped[executor] = 'failed'
    } else if (row.transport === 'router-chat' && event.fell_through_from.includes(`local ${row.model}`)) {
      // The local rung already sent this prompt to this alias and it failed its check.
      skipped[executor] = 'failed'
    } else if (row.transport === 'router-chat') {
      // The local rung's chat call and size gate, under the row's router model; never code or tool work. A prompt whose
      // estimate exceeds 60% of the model's window, or a model with no known window, is skipped.
      const fits = textOnly && base ? ((await localModelWindows($, base))[row.model!] ?? 0) * 0.6 >= estimateTokens(e.prompt) : false
      const out = fits ? await runLocal($, e, base!, row.model!, TEXT_EXECUTOR_TIMEOUT_MS) : undefined
      if (out) result = routedResult(e, 'ai-delegation-router-chat', out, `[routed: router-chat ${row.model}]`, 0)
      else skipped[executor] = !textOnly || (base && !fits) ? 'ineligible' : base ? 'failed' : 'not_installed'
    } else if (!repo || (tools && !tools.includes(row.tool!))) {
      skipped[executor] = repo ? 'not_installed' : 'ineligible'
    } else if (recentFailures(outcomes ??= await jobOutcomes($, now), executor, repo, now)) {
      skipped[executor] = 'recent_failures'
    } else {
      const run = await runSandboxExecutor($, e, repo, row.tool!, executor)
      if (run.record) event.jobs.push(run.record)
      if (run.record && run.state) await logOutcomes($, [{ record: run.record, state: run.state }])
      if (!run.result) skipped[executor] = run.state || run.refused ? 'failed' : 'not_installed'
      cancelled = run.state?.end === 'cancelled'
      result = run.result
      unconfirmed = Boolean(result) && run.unconfirmed === true
      unaccepted = Boolean(result) && !run.accepted && !unconfirmed
    }
    if (result) {
      // `chosen` names the executor that received the task; a dispatched sandbox job without a verified PR keeps its
      // executor as `chosen`, with that reason. `stopped` means no executor is known to have received it, as when the
      // dispatch failed before the dispatcher named a job.
      const unverified = (result as { result?: { agentId?: string } }).result?.agentId === 'ai-delegation-policy'
      // A dispatch call that threw or timed out may have submitted the job: it is neither a refusal nor a stop.
      if (unconfirmed) await logRoute($, event, executor, 'dispatch-unconfirmed')
      else if (unaccepted) await logRoute($, event, 'stopped', `${executor} dispatch failed before the job was accepted`)
      else await logRoute($, event, executor, cancelled ? 'sandbox job cancelled' : unverified ? 'sandbox job without a verified PR' : 'highest-ranked eligible executor that answered')
      return result
    }
    event.fell_through_from.push(executor)
  }
  // No executor took the task: the terminal rung runs in core at LAST_RESORT.effort; the agent.spawn hook sets its model.
  await logRoute($, event, LAST_RESORT.model, 'terminal rung')
  return core({ ...original, effort: LAST_RESORT.effort })
}

// One judge ask on the on-host medium alias, the same endpoint classifyKind uses: a parsed verdict, or why there is
// none. The dialog is left to the person on any failure.
async function judgeVerdict($: Engine, ask: string): Promise<{ verdict?: Verdict; failure: string }> {
  let failure = 'no router URL'
  try {
    const base = (await $.env.get('LITELLM_LOCAL_BASE_URL'))?.replace(/\/+$/, '')
    if (!base) throw new Error('router URL unset')
    failure = 'timeout'
    const response = await withTimeout($, $.http.fetch(`${base}/v1/chat/completions`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: JUDGE_ALIAS, max_tokens: JUDGE_OUTPUT_TOKENS, ...NO_THINKING, messages: [{ role: 'user', content: ask }] }),
    }), JUDGE_TIMEOUT_MS)
    failure = 'non-OK status'
    if (!response.ok) throw new Error('HTTP failure')
    failure = 'unparsable body'
    const verdict = parseVerdict(JSON.parse(response.text)?.choices?.[0]?.message?.content)
    if (!verdict) throw new Error('no verdict in reply')
    return { verdict }
  } catch (error) {
    if (failure === 'timeout' && (error as Error)?.message !== 'timeout') failure = 'unreachable'
    return { failure }
  }
}

// Answers core's bypass-immune "shell -c script runs rm" ask on the on-host medium alias; the Codex subscription is
// never spent on it. Anything but a parsed safe verdict returns core's own result, so the person still sees the dialog;
// a failure never allows.
async function judge($: Engine, e: { input: unknown }, next: (e: never) => Promise<{ decision: string; reason?: string }>): Promise<unknown> {
  const core = await next(e as never)
  if (!isShellCAsk(core.decision, core.reason)) return core

  const command = String((e.input as { command?: unknown })?.command ?? '')
  if (!safePayload(command)) return core
  const label = mandatoryLabel(command)
  const ask = `${label ? `[class: ${label}]\n` : ''}${JUDGE}\n\nCommand:\n\`\`\`\n${command}\n\`\`\``
  const { verdict, failure } = await judgeVerdict($, ask)
  if (!verdict) {
    await logDecision($, `judge: no verdict (${failure}), dialog left to the person`)
    return core
  }
  const by = `local ${JUDGE_ALIAS}`
  await logDecision($, `judge: ${verdict.verdict} by ${by}: ${verdict.reason.slice(0, 200)}`)
  const reason = `ai-delegation judge (${by}): ${verdict.reason}`
  return { decision: verdict.verdict === 'safe' ? 'allow' : 'deny', reason }
}

export const register: Register = (on) => {
  quotaRead = undefined
  quotaAt = 0
  localWindows = undefined
  executorTable = undefined

  // Start the first quota read without delaying the session.
  on('session.start', async ($, e, next) => {
    void quotaRows($)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('prompt.compose', async ($, e, next) => {
    const line = quotaLine(await currentCodexScore($))
    const result = await next(e)
    return { sections: [...result.sections, { id: 'jpe-ai-delegation:codex-quota', text: `${line}
${PROMPT_POLICY}`, scope: 'session' }] }
  }).catch(($, e, next) => next(e))

  // An unexpected router failure must not bypass the model and payload guards.
  on('tool.call', { tool: 'Agent' }, ($, e, next) => route($, e as never, next as never) as never).catch(($, e) => stopRoute($, e as never, newEvent(e as never), 'routing failed closed') as never)

  // Every Agent tool spawn that reaches core runs on LAST_RESORT.model. The Agent tool has no model parameter, so the
  // pin is set here, where the engine decides the spawn's model. Forks inherit by design; workflow agents, teammates
  // and resumed runs keep the model their own start chose.
  on('agent.spawn', ($, e, next) => {
    if (!e.tool_use_id || e.fork || e.workflow || e.isTeammate || e.resume || e.model === LAST_RESORT.model) return next(e)
    return next({ ...e, model: LAST_RESORT.model })
  }).catch(() => ({ deny: 'subagent model pin failed closed' }))

  // Permission judge for the bypass-immune ask. A failing hook leaves core's ask.
  on('tool.check', { tool: 'Bash' }, ($, e, next) => judge($, e, next as never) as never).catch(($, e, next) => next(e))
}
