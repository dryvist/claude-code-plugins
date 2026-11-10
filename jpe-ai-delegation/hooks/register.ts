import type { EngineInterface, Register } from 'claude-code'
import { CLASSIFIER, CODEX, JUDGE, LAST_RESORT, LOCAL_OUTPUT_TOKENS, UTILITY, codexArgv, codingTask, eligible, estimateTokens, explicitLabel, forbiddenModel, isAdvisory, isGenericType, isShellCAsk, localTask, mandatoryLabel, newestModel, parseVerdict, pickLabel, pickLocal, rankExecutors, safePayload, scoreWindows } from './lib/policy'
import type { Executor, Label, QuotaWindow, Route, Sandbox, Score } from './lib/policy'
import { customAgentSandbox, parseAgentDefinition } from './lib/agent-definition'
import type { AgentDefinition } from './lib/agent-definition'

type Engine = EngineInterface
type AgentCall = { description?: string; prompt: string; subagent_type?: string; model?: string; effort?: string; name?: string; isolation?: string }
type QuotaRow = { id?: string; status?: string; windows?: QuotaWindow[] }
const TEXT_EXECUTOR_TIMEOUT_MS = 120_000
const QUOTA_TIMEOUT_MS = 20_000
const QUOTA_REFRESH_MS = 600_000
const MODEL_INFO_TIMEOUT_MS = 10_000
const PROMPT_POLICY = 'Check codex-quota first. Rung 1: small, quick, checkable tasks (summarize, extract, classify, reformat, a first pass over a file or log) go to the router local default or medium capability before any subscription; escalate only after a checked failure. Rung 2 holds two equal first choices, split by sensitivity; when both qualify, send the task to the executor with more quota headroom and spend every subscription before it resets (ZCode 5-hour and weekly, OpenCode Go monthly, Codex weekly). ZCode (zcode-job): obvious, definitely non-sensitive coding work in public repos; coding and coding-adjacent only: code, tests, GitHub automation and workflows, code reviews; the output is a ready PR labelled human:review; leak-scan it before merge; never auto-merge. Codex Luna: anything even remotely sensitive, or any private repo; Luna xhigh default, max as needed, while codex-quota exits 0; never Terra. Rung 3: other subscriptions where they fit (Z.ai GLM, OpenCode Go); public work only, and only while that subscription is at or under its pace for the billing period. Rung 4: Haiku xhigh, the last resort, only after rungs 1, 2 and 3 are exhausted or do not qualify. Never Sonnet, Opus or Fable subagents. Never send secrets, credentials, inventory or incident content to any executor. Antigravity stays a second-opinion reviewer, never an executor.'

// Per-session caches, reset when the module registers. The first quota read is awaited; later reads serve the cache
// and refresh it in the background at most every QUOTA_REFRESH_MS.
let quotaRead: Promise<QuotaRow[] | undefined> | undefined
let quotaAt = 0
let localWindows: Promise<Record<string, number | undefined>> | undefined

async function withTimeout<T>($: Engine, work: Promise<T>, ms: number): Promise<T> {
  let timer: { cancel: () => void } | undefined
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => { timer = $.clock.after(ms, () => reject(new Error('timeout'))) })])
  } finally {
    timer?.cancel()
  }
}

// `token-meter quota --json`; any failure or timeout means the quota is unknown.
async function readQuota($: Engine): Promise<QuotaRow[] | undefined> {
  try {
    const bin = await $.env.get('TOKEN_METER_BIN')
    const argv = bin ? [bin, 'quota', '--json'] : ['python3', `${await $.env.get('HOME')}/Library/Application Support/Token Meter/runtime/meter.py`, 'quota', '--json']
    const r = await $.process.run(argv, { timeoutMs: QUOTA_TIMEOUT_MS })
    if (r.exitCode !== 0 || r.isStdoutTruncated === true) return undefined
    const rows = JSON.parse(r.stdout)?.provider_quotas
    return Array.isArray(rows) ? rows : undefined
  } catch {
    return undefined
  }
}

async function quotaRows($: Engine): Promise<QuotaRow[] | undefined> {
  const now = await $.clock.now()
  if (!quotaRead) {
    quotaAt = now
    quotaRead = readQuota($)
    return quotaRead
  }
  const current = quotaRead
  if (now - quotaAt >= QUOTA_REFRESH_MS) {
    quotaAt = now
    // An unknown refresh keeps the last rows.
    void readQuota($).then((rows) => { if (rows) quotaRead = Promise.resolve(rows) })
  }
  return current
}

// Codex score from its token-meter row; undefined when the row is missing, failed or has no usable window.
function codexScore(rows: QuotaRow[] | undefined, nowSeconds: number): Score | undefined {
  const row = rows?.find((r) => r.id === 'codex')
  if (!row || !['ok', 'stale'].includes(row.status ?? '')) return undefined
  const score = scoreWindows(row.windows, nowSeconds)
  return score.exhausted || score.score !== undefined ? score : undefined
}

async function currentCodexScore($: Engine): Promise<Score | undefined> {
  const rows = await quotaRows($)
  return codexScore(rows, (await $.clock.now()) / 1000)
}

function quotaLine(score: Score | undefined): string {
  if (!score) return 'codex-quota: unavailable'
  return score.exhausted ? 'codex-quota: exhausted' : 'codex-quota: available'
}

// One `codex exec`; its final message is read from a temporary output file. The finite stdin string is closed by process.run.
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
      const r = await $.process.run(argv, { stdin: prompt, timeoutMs })
      if (r.exitCode !== 0) {
        failure = `codex exec exited with code ${r.exitCode}`
      } else {
        const text = ((await $.fs.read(outputFile)) as string).trim()
        if (text) return text
        failure = 'codex exec returned an empty final message'
      }
    }
  } catch {
    failure = 'codex exec invocation or output read failed'
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

// Append-only decision log; `tee -a` keeps parallel hooks from dropping each other's lines.
async function logDecision($: Engine, line: string): Promise<void> {
  try {
    await $.process.run(['tee', '-a', `${await $.env.get('HOME')}/.claude/ai-delegation.log`], { stdin: `${line}\n`, timeoutMs: 5_000 })
  } catch {
    // The log is advisory; a failed write never changes a decision.
  }
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
    if (typeof out !== 'string' || !out.trim() || choice?.finish_reason === 'length') throw new Error('failed check')
    return out.trim()
  } catch {
    await logDecision($, `local ${alias} gave no checked answer`)
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
  const started = await $.clock.now()
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
  return routedResult(e, 'ai-delegation-codex', out, `[routed: codex ${codexRoute.family} ${codexRoute.effort}, ${detail}]`, (await $.clock.now()) - started)
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
  return repo && !['.', '..'].includes(repo.split('/')[1]) ? repo : undefined
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

// The tagged repository when the task is non-sensitive coding in a verified public repository; otherwise undefined.
async function publicCodeRepo($: Engine, e: AgentCall): Promise<string | undefined> {
  const repo = repositoryTag(e.description)
  if (!codingTask(e.description) || !repo || mandatoryLabel(`${e.description ?? ''}\n${e.prompt}`)) return undefined
  try {
    const repository = await github($, repo) as { visibility?: string; private?: boolean }
    return repository.visibility === 'public' && repository.private === false ? repo : undefined
  } catch {
    await logDecision($, 'public repository could not be verified')
    return undefined
  }
}

type SandboxTool = 'zcode' | 'opencode'
const SANDBOX_NAMES: Record<SandboxTool, string> = { zcode: 'zcode-job sandbox', opencode: 'OpenCode Go sandbox' }

// Sandbox tools the operator enables; both by default.
async function sandboxTools($: Engine): Promise<string[]> {
  return ((await $.env.get('AGENT_ROUTE_ZCODE_TOOLS')) ?? 'zcode opencode').split(/\s+/).filter(Boolean)
}

async function runSandboxExecutor($: Engine, e: AgentCall, repo: string, tool: SandboxTool): Promise<unknown | undefined> {
  const started = await $.clock.now()
  try {
    const available = await $.process.run(['which', 'zcode-job'], { timeoutMs: 5_000 })
    if (available.exitCode !== 0) return undefined
  } catch {
    return undefined
  }
  const name = SANDBOX_NAMES[tool]
  try {
    const prompt = `${e.prompt}\n\nReturn a ready PR labelled human:review. Never auto-merge. The trusted lead must leak-scan the PR before merge.`
    const argv = tool === 'zcode' ? ['zcode-job', 'start', repo, prompt] : ['zcode-job', 'start', '--tool', tool, repo, prompt]
    const response = await $.process.run(argv, { timeoutMs: 300_000 })
    const line = response.stdout.replace(/\r?\n$/, '')
    const done = line.match(/^DONE\|(j-[0-9a-f]{16})\|(https:\/\/github\.com\/([A-Za-z0-9-]+\/[A-Za-z0-9._-]+)\/pull\/(\d+))$/)
    if (response.exitCode !== 0 || response.isStdoutTruncated === true || !done || done[3].toLowerCase() !== repo.toLowerCase()) return failure(e, `${tool} did not return a PR for the requested repository`)
    const pr = await github($, `${repo}/pulls/${done[4]}`) as { state?: string; draft?: boolean; labels?: { name: string }[]; html_url?: string }
    if (pr.state !== 'open' || pr.draft !== false || pr.html_url !== done[2] || !pr.labels?.some((l) => l.name === 'human:review')) return failure(e, `${tool} PR is not ready and labelled human:review`)
    await logDecision($, `route: coding -> ${name} (leak scan required before merge)`)
    return routedResult(e, `ai-delegation-${tool}`, line, `[routed: ${name}; leak-scan before merge; never auto-merge]`, (await $.clock.now()) - started)
  } catch {
    // A dispatched job may still be running. Do not start a duplicate executor.
    return failure(e, `${tool} dispatch or PR verification failed; inspect the job before retrying`)
  }
}

type Gateway = 'Z.ai GLM' | 'OpenCode Go'
async function runGateway($: Engine, e: AgentCall, gateway: Gateway): Promise<string | undefined> {
  try {
    const model = await $.env.get(gateway === 'Z.ai GLM' ? 'AGENT_ROUTE_GLM_MODEL' : 'AGENT_ROUTE_OPENCODE_GO_MODEL')
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
      // Ambiguous plugin names must not load an arbitrary marketplace's instructions.
      if (matches.length > 1 && matches[0].scope === matches[1].scope) return undefined
      if (matches[0]?.installPath.startsWith('/')) {
        const path = `${matches[0].installPath}/agents/${namespaced[2]}.md`
        if (await $.fs.exists(path)) text = (await $.fs.read(path)) as string
      }
    }
  }

  if (text === undefined) return undefined
  return parseAgentDefinition(text)
}

type RouteEvent = {
  agent_type: string; local: { alias: string | null; est_tokens: number } | null; eligible: string[]
  scores: Record<string, { score: number | null; exhausted: boolean } | null>; fell_through_from: string[]
}

// One JSON telemetry line per routing decision.
async function logRoute($: Engine, event: RouteEvent, chosen: string, reason: string): Promise<void> {
  await logDecision($, JSON.stringify({ ts_ms: await $.clock.now(), event: 'route', ...event, chosen, reason }))
}

async function route($: Engine, e: AgentCall, next: (e: never) => Promise<unknown>): Promise<unknown> {
  if (forbiddenModel(e.model) || forbiddenModel(e.subagent_type)) return failure(e, 'Sonnet, Opus and Fable subagents are forbidden')
  const original = e
  let definition: AgentDefinition | undefined
  let customSandbox: Sandbox | undefined
  if (e.subagent_type && !isGenericType(e)) {
    try {
      definition = await customAgentDefinition($, e.subagent_type)
    } catch {
      return failure(e, 'custom agent model or tool restrictions could not be read')
    }
    if (!definition) return failure(e, 'custom agent definition could not be verified')
    if (forbiddenModel(definition.model)) return failure(e, 'Sonnet, Opus and Fable subagents are forbidden')
    customSandbox = customAgentSandbox(definition)
    if (definition.prompt) e = { ...e, prompt: `Custom agent instructions:\n${definition.prompt}\n\nTask:\n${e.prompt}` }
  }
  if (!safePayload(`${e.description ?? ''}\n${e.prompt}`)) return failure(e, 'payload contains prohibited content')
  const event: RouteEvent = { agent_type: original.subagent_type ?? 'general-purpose', local: null, eligible: [], scores: {}, fell_through_from: [] }
  if (definition && customSandbox === undefined) {
    // An inherited model cannot be verified on a native pass-through.
    const model = original.model ?? definition.model
    if (!model || model === 'inherit') return failure(e, 'custom agent requires an explicit permitted model for native tools')
    await logRoute($, event, 'native custom agent', 'custom tool policy')
    return next(original as never)
  }

  // Local rung: small, checkable, self-contained text on an on-host alias.
  if (!definition && !e.isolation && isGenericType(e) && !['Explore', 'Plan'].includes(e.subagent_type ?? '') && !codingTask(e.description) && localTask(e.description, e.prompt)) {
    const base = (await $.env.get('LITELLM_LOCAL_BASE_URL'))?.replace(/\/+$/, '')
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

  // Subscription rungs: eligibility, then quota score, then static order; Haiku always ends the list.
  const restricted = definition && (definition.tools !== undefined || Boolean(definition.disallowedTools?.length))
  const repo = restricted ? undefined : await publicCodeRepo($, e)
  const candidates = eligible(Boolean(repo))
  const codex = await currentCodexScore($)
  const scores: Partial<Record<Executor, Score>> = codex ? { codex } : {}
  event.eligible = [...candidates, 'haiku']
  for (const x of candidates) event.scores[x] = scores[x] ? { score: scores[x]!.score ?? null, exhausted: scores[x]!.exhausted } : null
  const tools = await sandboxTools($)
  for (const executor of rankExecutors(candidates, scores)) {
    let result: unknown | undefined
    if (executor === 'codex') result = await runCodexRung($, e, customSandbox)
    else {
      const tool: SandboxTool = executor === 'zcode' ? 'zcode' : 'opencode'
      if (repo && tools.includes(tool)) result = await runSandboxExecutor($, e, repo, tool)
    }
    if (result) {
      await logRoute($, event, executor, 'highest-ranked eligible executor that answered')
      return result
    }
    event.fell_through_from.push(executor)
  }
  await logRoute($, event, 'haiku', 'terminal rung')
  return next({ ...original, ...LAST_RESORT } as never)
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
      by = `haiku ${LAST_RESORT.effort}`
      const r = await $.model.complete({ model: 'haiku', effort: LAST_RESORT.effort, prompt: ask, maxTokens: 400, timeoutMs: 60_000 })
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
  on('tool.call', { tool: 'Agent' }, ($, e, next) => route($, e as never, next as never) as never).catch(($, e) => failure(e as never, 'routing failed closed') as never)

  // Permission judge for the bypass-immune ask. A failing hook leaves core's ask.
  on('tool.check', { tool: 'Bash' }, ($, e, next) => judge($, e, next as never) as never).catch(($, e, next) => next(e))
}
