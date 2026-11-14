import type { EngineInterface, Register } from 'claude-code'
import { CLASSIFIER, CODEX, JUDGE, LAST_RESORT, LOCAL_OUTPUT_TOKENS, QUOTA_SELECTOR, UTILITY, EXECUTOR_TABLE, budgetsFromMetrics, codexArgv, codingTask, eligibleRows, endAnchor, estimateTokens, explicitLabel, forbiddenModel, isAdvisory, isGenericType, isShellCAsk, jobHistory, jobState, recentFailures, localTask, mandatoryLabel, newestModel, mergeExecutorRows, metricsResult, parseVerdict, pickLabel, pickLocal, quotaFromMetrics, rankRows, repositoryFromOrigin, safePayload, scoreWindows } from './lib/policy'
import type { Executor, ExecutorRow, JobOutcome, JobRecord, JobState, Label, QuotaReason, QuotaRow, Route, Sandbox, Score, SkipReason } from './lib/policy'
import { customAgentSandbox, parseAgentDefinition } from './lib/agent-definition'
import type { AgentDefinition } from './lib/agent-definition'

type Engine = EngineInterface
type AgentCall = { description?: string; prompt: string; subagent_type?: string; model?: string; effort?: string; name?: string; isolation?: string }
const TEXT_EXECUTOR_TIMEOUT_MS = 120_000
const QUOTA_TIMEOUT_MS = 3_000
const QUOTA_REFRESH_MS = 600_000
const QUOTA_TOKEN_MAX_BYTES = 4096
const isAbsolutePath = (path: string): boolean => path.startsWith('/')
const MODEL_INFO_TIMEOUT_MS = 10_000
const JOB_STATUS_BUDGET_MS = 3_000
const JOB_STATUS_TIMEOUT_MS = 15_000
const JOB_LOG_BYTES = 131_072
const LOG_TIMEOUT_MS = 5_000
const PROMPT_POLICY = 'The jpe-ai-delegation hook places every Agent spawn. Tag self-contained text work [class: text] and put all of its text in the prompt; the hook sends it to an on-host local model first. Every other spawn, and any local answer that fails its check, goes to the subscription executors it is eligible for, ranked by usage pace. ZCode, OpenCode Go and Cursor take only non-sensitive coding tagged [task: code] [repo: owner/repository] in a public repository; their output is a ready PR labelled human:review; leak-scan it before merge; never auto-merge. Codex Luna takes any task; never Terra. Haiku xhigh is always last. Nothing stops because an executor is unavailable. Never Sonnet, Opus or Fable subagents. Never send secrets, credentials, inventory or incident content to any executor. Antigravity stays a second-opinion reviewer, never an executor.'

// A quota read: the instant-query result, or why there is none.
type QuotaFetch = { result?: unknown[]; failure?: 'quota_unconfigured' | 'quota_unreachable' }

// Per-session caches, reset when the module registers. The first quota read is awaited; later reads serve the cache
// and refresh it in the background at most every QUOTA_REFRESH_MS.
let quotaRead: Promise<QuotaFetch> | undefined
let quotaAt = 0
let localWindows: Promise<Record<string, number | undefined>> | undefined
let executorTable: Promise<ExecutorRow[]> | undefined

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

type QuotaView = { scores: Partial<Record<Executor, Score>>; unknown: Record<string, QuotaReason>; sources: Record<string, string>; budgets: Map<string, number> }

// Scores for table rows that name a quota executor, judged for staleness at this moment. Rows without one stay unknown.
async function currentQuota($: Engine, table: readonly ExecutorRow[]): Promise<QuotaView> {
  const read = await quotaRows($)
  const ms = await clockNow($)
  const ids = [...new Set(table.flatMap((r) => (r.quota ? [r.quota] : [])))]
  const view: QuotaView = { scores: {}, unknown: {}, sources: {}, budgets: new Map() }
  // Staleness cannot be judged without a clock reading, so every quota is unknown.
  if (!read.result || ms === null) {
    for (const id of ids) view.unknown[id] = read.result ? 'quota_stale' : (read.failure ?? 'quota_unreachable')
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
  return view
}

async function currentCodexScore($: Engine): Promise<Score | undefined> {
  return (await currentQuota($, EXECUTOR_TABLE.filter((r) => r.quota === 'codex'))).scores.codex
}

function quotaLine(score: Score | undefined): string {
  if (!score) return 'codex-quota: unavailable'
  return score.exhausted ? 'codex-quota: exhausted' : 'codex-quota: available'
}

function shortFailure(value: unknown): string {
  const raw = value instanceof Error ? value.message : String(value)
  const compact = raw.replace(/\s+/g, ' ').trim().slice(-500)
  return compact && safePayload(compact) ? compact : '[detail redacted]'
}

function stderrDetail(stderr: unknown): string {
  if (typeof stderr !== 'string' || !stderr.trim()) return ''
  const tail = stderr.trim().replace(/\s+/g, ' ').slice(-500)
  return `; stderr tail: ${safePayload(tail) ? tail : '[detail redacted]'}`
}

// `codex exec` reads the prompt from a temporary file on stdin and writes its final message to another file.
async function runCodex($: Engine, codexRoute: Route, sandbox: Sandbox, prompt: string, timeoutMs: number, cwd?: string): Promise<string | undefined> {
  const temporaryFiles: string[] = []
  let failure: string | undefined
  let stage = 'codex exec invocation'
  try {
    const createTemporaryFile = async (label: string): Promise<string | undefined> => {
      const result = await $.process.run(['mktemp'], { timeoutMs: 5_000 })
      const path = result.stdout.trim()
      if (result.exitCode !== 0 || !path.startsWith('/')) {
        failure = `could not create ${label} file (exit ${result.exitCode})${stderrDetail(result.stderr)}`
        return undefined
      }
      temporaryFiles.push(path)
      return path
    }
    const outputFile = await createTemporaryFile('final-message')
    const inputFile = outputFile ? await createTemporaryFile('prompt') : undefined
    if (outputFile && inputFile) {
      stage = 'codex environment read'
      const [home, path, user, term, lang, codexHome] = await Promise.all([
        $.env.get('HOME'), $.env.get('PATH'), $.env.get('USER'), $.env.get('TERM'), $.env.get('LANG'), $.env.get('CODEX_HOME'),
      ])
      if (!home || !path || !user || !term || !lang) {
        throw new Error('HOME, PATH, USER, TERM and LANG must be set')
      }
      stage = 'Codex model selection'
      const cache = `${codexHome ?? `${home}/.codex`}/models_cache.json`
      const model = (await $.fs.exists(cache)) ? newestModel((await $.fs.read(cache)) as string, codexRoute.family) : undefined
      const workdir = cwd ?? await $.session.cwd()
      stage = 'Codex command build'
      const argv = codexArgv(sandbox, codexRoute, model, outputFile, workdir)
      stage = 'prompt file write'
      const written = await $.process.run(['tee', inputFile], { stdin: prompt, timeoutMs: 5_000 })
      if (written.exitCode !== 0) throw new Error(`tee exited with code ${written.exitCode}${stderrDetail(written.stderr)}`)

      stage = 'codex exec invocation'
      const shell = 'home=$1; path_env=$2; user=$3; term=$4; lang=$5; input_file=$6; shift 6; exec /usr/bin/env -i "HOME=$home" "PATH=$path_env" "USER=$user" "TERM=$term" "LANG=$lang" "$@" < "$input_file"'
      const result = await $.process.run(['/bin/sh', '-c', shell, 'ai-delegation-codex', home, path, user, term, lang, inputFile, ...argv], { timeoutMs })
      if (result.exitCode !== 0) {
        failure = `codex exec exited with code ${result.exitCode}${stderrDetail(result.stderr)}`
      } else {
        stage = 'final-message output read'
        if (!(await $.fs.exists(outputFile))) {
          failure = 'codex exec final-message output file is missing'
        } else {
          const text = ((await $.fs.read(outputFile)) as string).trim()
          if (text) return text
          failure = 'codex exec returned an empty final-message output file'
        }
      }
    }
  } catch (error) {
    failure = `${stage} failed: ${shortFailure(error)}`
  } finally {
    if (temporaryFiles.length) {
      try {
        await $.process.run(['rm', '-f', ...temporaryFiles], { timeoutMs: 5_000 })
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

async function routerTarget($: Engine): Promise<{ url: string; headers: Record<string, string> }> {
  const tokenFile = await $.env.get('LLM_ROUTER_TOKEN_FILE')
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  let base: string
  if (tokenFile) {
    const routerUrl = await $.env.get('LLM_ROUTER_URL')
    if (!routerUrl) throw new Error('router URL unset')
    let token: string
    try { token = (await $.fs.read(tokenFile)).trim() } catch { throw new Error('token file unreadable') }
    if (!token) throw new Error('token file empty')
    base = routerUrl.replace(/\/+$/, '')
    headers.authorization = `Bearer ${token}`
  } else {
    const localBase = await $.env.get('LITELLM_LOCAL_BASE_URL')
    if (!localBase) throw new Error(await $.env.get('LLM_ROUTER_URL') ? 'token file unset' : 'router URL unset')
    base = `${localBase.replace(/\/+$/, '')}/v1`
  }
  return { url: `${base}/chat/completions`, headers }
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
    if (typeof out !== 'string' || !out.trim()) throw new Error('empty answer')
    if (choice?.finish_reason === 'length') throw new Error('answer was cut off')
    if (/\b(?:cannot|can't|unable to)\s+(?:access|read|open|see|view|inspect)\b|\b(?:do not|don't)\s+have access\b/i.test(out)) {
      throw new Error('answer reports unavailable access')
    }
    return out.trim()
  } catch (error) {
    await logDecision($, `local ${alias} failed: ${shortFailure(error)}`)
    return undefined
  }
}

// Classification itself runs on Codex Luna.
async function classify($: Engine, e: AgentCall): Promise<Label> {
  const mandatory = mandatoryLabel(`${e.description ?? ''}\n${e.prompt}`)
  if (mandatory) return mandatory
  const named = explicitLabel(e.description)
  if (named) return named
  if (e.subagent_type === 'Plan') return 'plan'
  if (e.subagent_type === 'Explore') return 'bulk'
  const task = `${e.description ?? ''}\n${e.prompt.slice(0, 4000)}`
  return pickLabel(await runCodex($, UTILITY, 'read-only', `${CLASSIFIER}\n\nTask:\n${task}`, 90_000)) ?? 'standard'
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
  const out = await runCodex($, codexRoute, sandbox, e.prompt, 600_000, cwd)
  if (!out) return undefined
  await logDecision($, `route: ${route} -> codex ${codexRoute.family} ${codexRoute.effort} (${sandbox})`)
  return routedResult(e, 'ai-delegation-codex', out, `[routed: codex ${codexRoute.family} ${codexRoute.effort}, ${detail}]`, started === null ? 0 : ((await clockNow($)) ?? started) - started)
}

// The Codex rung: classify, pick the sandbox, run. Undefined on any failure so routing continues.
async function runCodexRung($: Engine, e: AgentCall, customSandbox: Sandbox | undefined): Promise<unknown | undefined> {
  const label = await classify($, e)
  const advisory = isAdvisory(label) || isAdvisory(explicitLabel(e.description) ?? label)
  if (mandatoryLabel(`${e.description ?? ''}\n${e.prompt}`)) e = { ...e, description: `${e.description ?? ''} [class: bulk-complex]` }
  const codexSandbox: Sandbox = advisory || e.subagent_type === 'Explore' || e.subagent_type === 'Plan' || customSandbox === 'read-only' ? 'read-only' : 'workspace-write'
  return runRoutedCodex($, e, label, CODEX[label], codexSandbox, `class ${label}`)
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

function repositoryTag(description: string | undefined): string | undefined {
  const repo = description?.match(/\[repo: ([A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9._-]{1,100})\]/)?.[1]
  const repository = repo?.split('/')[1]
  return repo && repository !== undefined && !['.', '..'].includes(repository) ? repo : undefined
}

function absolutePromptPaths(prompt: string): string[] {
  const text = prompt.replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s"'`<>]*/gi, ' ')
  const paths = [...text.matchAll(/(?:^|[\s("'`(:,=])(\/(?:[^\s"'`<>]+))/gm)].map((match) => match[1].replace(/[),.;:!?]+$/g, ''))
  return [...new Set(paths.filter((path) => path.length > 1))]
}

function parentPath(path: string): string {
  const normalized = path.replace(/\/+$/g, '') || '/'
  const parent = normalized.slice(0, normalized.lastIndexOf('/'))
  return parent || '/'
}

async function gitRoot($: Engine, path: string): Promise<string | undefined> {
  let candidate = path
  while (isAbsolutePath(candidate)) {
    const result = await $.process.run(['git', '-C', candidate, 'rev-parse', '--show-toplevel'], { timeoutMs: 5_000 })
    const root = result.stdout.trim()
    if (result.exitCode === 0 && result.isStdoutTruncated !== true && isAbsolutePath(root)) return root
    const parent = parentPath(candidate)
    if (parent === candidate) return undefined
    candidate = parent
  }
  return undefined
}

async function inferredRepository($: Engine, e: AgentCall): Promise<string | undefined> {
  const paths = absolutePromptPaths(e.prompt)
  const candidates = paths.length ? paths : [await $.session.cwd()]
  const repositories: string[] = []
  for (const path of candidates) {
    const root = await gitRoot($, path)
    if (!root) return undefined
    const origin = await $.process.run(['git', '-C', root, 'remote', 'get-url', 'origin'], { timeoutMs: 5_000 })
    if (origin.exitCode !== 0 || origin.isStdoutTruncated === true) return undefined
    const repository = repositoryFromOrigin(origin.stdout.trim())
    if (!repository) return undefined
    repositories.push(repository)
  }
  return repositories.length && repositories.every((repository) => repository.toLowerCase() === repositories[0].toLowerCase())
    ? repositories[0]
    : undefined
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

// A tagged or inferred repository is only a candidate; GitHub visibility still decides public eligibility.
async function publicCodeRepo($: Engine, e: AgentCall): Promise<string | undefined> {
  if (!codingTask(e.description) || mandatoryLabel(`${e.description ?? ''}\n${e.prompt}`)) return undefined
  try {
    const repo = repositoryTag(e.description) ?? await inferredRepository($, e)
    if (!repo) return undefined
    const repository = await github($, repo) as { visibility?: string; private?: boolean }
    return repository.visibility === 'public' && repository.private === false ? repo : undefined
  } catch {
    await logDecision($, 'public repository could not be verified')
    return undefined
  }
}

const SANDBOX_NAMES: Record<string, string> = { zcode: 'zcode-job sandbox', opencode: 'OpenCode Go sandbox', 'cursor-agent': 'Cursor sandbox' }

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
type SandboxRun = { result?: unknown; record?: JobRecord; state?: JobState; accepted: boolean; unconfirmed?: boolean }
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
    const response = await $.process.run(argv, { timeoutMs: 300_000 })
    answered = true
    const line = response.stdout.replace(/\r?\n$/, '')
    const job = response.isStdoutTruncated === true ? undefined : line.match(/^(?:DONE|FAIL)\|(j-[0-9a-f]{16})\|/)?.[1]
    accepted = Boolean(job)
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

type Gateway = 'Z.ai GLM' | 'OpenCode Go'
async function runGateway($: Engine, e: AgentCall, gateway: Gateway): Promise<string | undefined> {
  try {
    // The module loader needs a literal variable name in each $.env.get call.
    const model = gateway === 'Z.ai GLM' ? await $.env.get('AGENT_ROUTE_GLM_MODEL') : await $.env.get('AGENT_ROUTE_OPENCODE_GO_MODEL')
    if (!model) return undefined
    const target = await routerTarget($)
    const response = await withTimeout($, $.http.fetch(target.url, {
      method: 'POST', headers: target.headers,
      body: JSON.stringify({ model, messages: [{ role: 'user', content: e.prompt }] }),
    }), TEXT_EXECUTOR_TIMEOUT_MS)
    if (!response.ok) throw new Error('HTTP failure')
    const out = JSON.parse(response.text)?.choices?.[0]?.message?.content
    if (typeof out !== 'string' || !out.trim()) throw new Error('empty content')
    await logDecision($, `route: capped -> ${gateway}`)
    return out.trim()
  } catch {
    await logDecision($, `route: ${gateway} unavailable`)
    return undefined
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
  agent_type: string; local: { alias: string | null; est_tokens: number } | null; eligible: string[]
  scores: Record<string, { score: number | null; exhausted: boolean; effective: number | null; used: number | null; line: number | null } | null>; fell_through_from: string[]
  skipped: Record<string, SkipReason>; jobs: JobRecord[]
  quota_unknown: Record<string, QuotaReason>; quota_source: Record<string, string>
}

// One JSON telemetry line per routing decision. It never throws, so a failed write cannot change the decision.
async function logRoute($: Engine, event: RouteEvent, chosen: string, reason: string): Promise<void> {
  try {
    const table = await loadExecutorTable($)
    for (const row of table) {
      if (event.scores[row.id] === undefined) event.scores[row.id] = null
      const score = event.scores[row.id]
      const hasNumericScore = Boolean(score && typeof score === 'object' && typeof score.score === 'number')
      const exhausted = Boolean(score && typeof score === 'object' && score.exhausted)
      const hasWindowReason = Object.keys(event.quota_unknown).some((key) => key.startsWith(`${row.id}/`))
      if (hasNumericScore || exhausted) delete event.quota_unknown[row.id]
      else if (event.quota_unknown[row.id] === undefined && !hasWindowReason) event.quota_unknown[row.id] = 'not_evaluated'
    }
    // A clock that does not answer in time leaves ts_ms null rather than dropping the line.
    const ts_ms = await clockNow($)
    await logDecision($, JSON.stringify({ ts_ms, event: 'route', ...event, chosen, reason }))
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
const newEvent = (e: AgentCall): RouteEvent => ({
  agent_type: agentType(e, false), local: null, eligible: [],
  scores: Object.fromEntries(EXECUTOR_TABLE.map((row) => [row.id, null])),
  fell_through_from: [], skipped: {}, jobs: [],
  quota_unknown: Object.fromEntries(EXECUTOR_TABLE.map((row) => [row.id, 'not_evaluated'])) as Record<string, QuotaReason>, quota_source: {},
})

// Every exit that stops routing writes its route line too.
async function stopRoute($: Engine, e: AgentCall, event: RouteEvent, reason: string): Promise<unknown> {
  await logRoute($, event, 'stopped', reason)
  return failure(e, reason)
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
    if (!definition) return stopRoute($, e, event, 'custom agent definition could not be verified')
    event.agent_type = agentType(original, true)
    if (forbiddenModel(definition.model)) return stopRoute($, e, event, 'Sonnet, Opus and Fable subagents are forbidden')
    customSandbox = customAgentSandbox(definition)
    if (definition.prompt) e = { ...e, prompt: `Custom agent instructions:\n${definition.prompt}\n\nTask:\n${e.prompt}` }
  }
  if (!safePayload(`${e.description ?? ''}\n${e.prompt}`)) return stopRoute($, e, event, 'payload contains prohibited content')
  if (definition && customSandbox === undefined) {
    // An inherited model cannot be verified on a native pass-through.
    const model = original.model ?? definition.model
    if (!model || model === 'inherit') return stopRoute($, e, event, 'custom agent requires an explicit permitted model for native tools')
    await logRoute($, event, 'native custom agent', 'custom tool policy')
    return core(original)
  }

  // Self-contained text work: the only work the local rung and router-chat rows take.
  const textOnly = !definition && !e.isolation && isGenericType(e) && !['Explore', 'Plan'].includes(e.subagent_type ?? '') && !codingTask(e.description) && localTask(e.description, e.prompt)
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
  const repo = restricted ? undefined : await publicCodeRepo($, e)
  const table = await loadExecutorTable($)
  // Without a clock reading no promotion is proven unexpired (Infinity expires them all) and no peak applies.
  const now = (await clockNow($)) ?? Number.POSITIVE_INFINITY
  // Every quota executor in the table is reported, so the event shows why an ineligible row's quota is unknown too.
  const quota = await currentQuota($, table)
  for (const row of table) if (!row.quota) quota.unknown[row.id] ??= 'quota_unconfigured'
  const { rows, skipped } = eligibleRows(table, Boolean(repo), now, quota.budgets)
  const { scores } = quota
  event.quota_unknown = quota.unknown
  event.quota_source = quota.sources
  const ranked = rankRows(rows, scores, now)
  Object.assign(skipped, ranked.skipped)
  event.eligible = [...rows.map((r) => r.id), LAST_RESORT.model]
  event.skipped = skipped
  for (const r of table) {
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
  for (const executor of ranked.order) {
    const row = rows.find((r) => r.id === executor)!
    let result: unknown | undefined
    let cancelled = false
    let unaccepted = false
    let unconfirmed = false
    if (row.transport === 'codex') {
      result = await runCodexRung($, e, customSandbox)
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
      if (!run.result) skipped[executor] = run.state ? 'failed' : 'not_installed'
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
  await logRoute($, event, LAST_RESORT.model, 'terminal rung')
  return core({ ...original, ...LAST_RESORT })
}

// Answers core's bypass-immune "shell -c script runs rm" ask. Anything but a clean verdict returns core's own
// result, so the person still sees the dialog; a failure never allows.
async function judge($: Engine, e: { input: unknown }, next: (e: never) => Promise<{ decision: string; reason?: string }>): Promise<unknown> {
  const core = await next(e as never)
  if (!isShellCAsk(core.decision, core.reason)) return core

  const command = String((e.input as { command?: unknown })?.command ?? '')
  if (!safePayload(command)) return core
  const label = mandatoryLabel(command)
  const judgeRoute = label ? CODEX[label] : UTILITY
  const ask = `${label ? `[class: ${label}]\n` : ''}${JUDGE}\n\nCommand:\n\`\`\`\n${command}\n\`\`\``
  const codex = await currentCodexScore($)
  const ready = codex !== undefined && !codex.exhausted
  let by = `codex ${judgeRoute.family} ${judgeRoute.effort}`
  let verdict = ready ? parseVerdict(await runCodex($, judgeRoute, 'read-only', ask, 120_000)) : undefined
  if (codex?.exhausted) {
    for (const gateway of ['Z.ai GLM', 'OpenCode Go'] as const) {
      const out = await runGateway($, { prompt: ask }, gateway)
      verdict = parseVerdict(out)
      if (verdict) { by = gateway; break }
    }
    if (!verdict) {
      by = `${LAST_RESORT.model} ${LAST_RESORT.effort}`
      const r = await $.model.complete({ model: LAST_RESORT.model, effort: LAST_RESORT.effort, prompt: ask, maxTokens: 400, timeoutMs: 60_000 })
      verdict = parseVerdict(r.isAnswered ? r.text : undefined)
    }
  }
  if (!verdict) {
    await logDecision($, 'judge: no verdict, dialog left to the person')
    return core
  }
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

  // Permission judge for the bypass-immune ask. A failing hook leaves core's ask.
  on('tool.check', { tool: 'Bash' }, ($, e, next) => judge($, e, next as never) as never).catch(($, e, next) => next(e))
}
