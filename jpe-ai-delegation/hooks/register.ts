import type { EngineInterface, Register } from 'claude-code'
import { CLASSIFIER, CODEX, JUDGE, LAST_RESORT, UTILITY, codexArgv, codingTask, explicitLabel, forbiddenModel, isAdvisory, isGenericType, isShellCAsk, mandatoryLabel, newestModel, parseVerdict, pickLabel, safePayload } from './lib/policy'
import type { Label, Route, Sandbox } from './lib/policy'

type Engine = EngineInterface
type AgentCall = { description?: string; prompt: string; subagent_type?: string; model?: string; effort?: string; name?: string; isolation?: string }
type QuotaLine = 'codex-quota: available' | 'codex-quota: exhausted' | 'codex-quota: unavailable'
const UNAVAILABLE: QuotaLine = 'codex-quota: unavailable'
const TEXT_EXECUTOR_TIMEOUT_MS = 120_000
// shortcut: the startup line lives in the module, so a hot reload recomputes it on the next prompt.compose.
let startupQuota: QuotaLine | undefined
const PROMPT_POLICY = 'Check codex-quota first. While exit 0: bulk/reads/triage -> Luna xhigh; complicated bulk and auth/secrets/router/memory/cluster -> Luna max, name [class: bulk-complex]; standard implementation -> Terra medium; complex/plan/design/architecture review -> Terra high. Never Terra above high or Luna above max. Only while capped: eligible zcode-job sandbox (coding only; public, or private with ai-untrusted-ok=true and payload classification), then Z.ai GLM, then OpenCode Go, then Haiku xhigh as last resort. zcode must return a ready PR labelled human:review; leak-scan before merge, never auto-merge. Never Sonnet, Opus or Fable subagents. Never send secrets, credentials, inventory or incident content to any executor.'

// The quota helper is installed in the nix per-user profile, which a hook's PATH may omit.
// Try an explicit CODEX_QUOTA_BIN, then the bare name, then the per-user profile path.
async function runCodexQuota($: Engine): Promise<{ exitCode: number }> {
  const explicit = await $.env.get('CODEX_QUOTA_BIN')
  if (explicit) return $.process.run([explicit], { timeoutMs: 20_000 })
  try {
    const bare = await $.process.run(['codex-quota'], { timeoutMs: 20_000 })
    if (bare.exitCode !== 127) return bare
  } catch {
    // Not on PATH; fall through to the profile path.
  }
  const user = await $.env.get('USER')
  if (!user) return { exitCode: 127 }
  return $.process.run([`/etc/profiles/per-user/${user}/bin/codex-quota`], { timeoutMs: 20_000 })
}

// Codex is usable only while `codex-quota` exits 0 and the CLI starts.
async function codexReady($: Engine): Promise<boolean> {
  let reason: string
  try {
    const quota = await runCodexQuota($)
    if (quota.exitCode !== 0) {
      reason = `codex-quota exited ${quota.exitCode}`
    } else {
      const cli = await $.process.run(['codex', '--version'], { timeoutMs: 30_000 })
      if (cli.exitCode === 0) return true
      reason = `codex --version exited ${cli.exitCode}`
    }
  } catch {
    reason = 'codex readiness probe failed or timed out'
  }
  // A silent not-ready reads as a Haiku route with no cause; name it.
  $.ui.log(`ai-delegation: Codex not ready: ${reason}`)
  await logDecision($, `codex not ready: ${reason}`)
  return false
}

async function codexQuotaStatus($: Engine): Promise<QuotaLine> {
  try {
    const result = await runCodexQuota($)
    if (result.exitCode === 0) return 'codex-quota: available'
    return result.exitCode === 1 ? 'codex-quota: exhausted' : UNAVAILABLE
  } catch {
    return UNAVAILABLE
  }
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

// Classification itself follows the Codex-first rule.
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
    if (e.isolation !== 'worktree') return failure(e, 'unsupported isolation')
    const temporary = await $.process.run(['mktemp', '-d'], { timeoutMs: 5_000 })
    cwd = temporary.stdout.trim()
    if (temporary.exitCode !== 0 || !cwd.startsWith('/')) return failure(e, 'could not create isolated directory')
    const worktree = await $.process.run(['git', '-C', await $.session.cwd(), 'worktree', 'add', '--detach', cwd, 'HEAD'], { timeoutMs: 30_000 })
    if (worktree.exitCode !== 0) return failure(e, 'could not create isolated worktree')
    detail += `, worktree ${cwd}`
  }
  const out = await runCodex($, codexRoute, sandbox, e.prompt, 600_000, cwd)
  if (!out) return undefined
  await logDecision($, `route: ${route} -> codex ${codexRoute.family} ${codexRoute.effort} (${sandbox})`)
  return routedResult(e, 'ai-delegation-codex', out, `[routed: codex ${codexRoute.family} ${codexRoute.effort}, ${detail}]`, (await $.clock.now()) - started)
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

async function runSandboxExecutor($: Engine, e: AgentCall): Promise<unknown | undefined> {
  const repo = repositoryTag(e.description)
  if (!codingTask(e.description) || !repo || !safePayload(`${e.description ?? ''}\n${e.prompt}`)) return undefined
  const started = await $.clock.now()
  try {
    const available = await $.process.run(['which', 'zcode-job'], { timeoutMs: 5_000 })
    if (available.exitCode !== 0) return undefined
    const repository = await github($, repo) as { visibility?: string; private?: boolean }
    if (repository.visibility === 'private' && repository.private === true) {
      const properties = await github($, `${repo}/properties/values`) as { property_name: string; value: unknown }[]
      if (!Array.isArray(properties) || !properties.some((p) => p.property_name === 'ai-untrusted-ok' && (p.value === 'true' || p.value === true))) return undefined
      // The caller classifies attachments, diffs and logs that the hook cannot inspect.
      if (!e.description?.includes('[payload: classified-safe]')) return undefined
    } else if (repository.visibility !== 'public' || repository.private !== false) return undefined
  } catch {
    await logDecision($, 'zcode eligibility could not be verified')
    return undefined
  }

  try {
    const prompt = `${e.prompt}\n\nReturn a ready PR labelled human:review. Never auto-merge. The trusted lead must leak-scan the PR before merge.`
    const response = await $.process.run(['zcode-job', 'start', repo, prompt], { timeoutMs: 300_000 })
    const line = response.stdout.replace(/\r?\n$/, '')
    const done = line.match(/^DONE\|(j-[0-9a-f]{16})\|(https:\/\/github\.com\/([A-Za-z0-9-]+\/[A-Za-z0-9._-]+)\/pull\/(\d+))$/)
    if (response.exitCode !== 0 || response.isStdoutTruncated === true || !done || done[3].toLowerCase() !== repo.toLowerCase()) return failure(e, 'zcode did not return a PR for the requested repository')
    const pr = await github($, `${repo}/pulls/${done[4]}`) as { state?: string; draft?: boolean; labels?: { name: string }[]; html_url?: string }
    if (pr.state !== 'open' || pr.draft !== false || pr.html_url !== done[2] || !pr.labels?.some((l) => l.name === 'human:review')) return failure(e, 'zcode PR is not ready and labelled human:review')
    await logDecision($, 'route: coding -> zcode-job sandbox (leak scan required before merge)')
    return routedResult(e, 'ai-delegation-zcode', line, '[routed: zcode-job sandbox; leak-scan before merge; never auto-merge]', (await $.clock.now()) - started)
  } catch {
    // A dispatched job may still be running. Do not start a duplicate executor.
    return failure(e, 'zcode dispatch or PR verification failed; inspect the job before retrying')
  }
}

type Gateway = 'Z.ai GLM' | 'OpenCode Go'
async function runGateway($: Engine, e: AgentCall, gateway: Gateway): Promise<string | undefined> {
  let timer: { cancel: () => void } | undefined
  try {
    const model = await $.env.get(gateway === 'Z.ai GLM' ? 'AGENT_ROUTE_GLM_MODEL' : 'AGENT_ROUTE_OPENCODE_GO_MODEL')
    if (!model) return undefined
    const target = await routerTarget($)
    const response = await Promise.race([
      $.http.fetch(target.url, {
        method: 'POST', headers: target.headers,
        body: JSON.stringify({ model, messages: [{ role: 'user', content: e.prompt }] }),
      }),
      new Promise<never>((_, reject) => { timer = $.clock.after(TEXT_EXECUTOR_TIMEOUT_MS, () => reject(new Error('timeout'))) }),
    ])
    if (!response.ok) throw new Error('HTTP failure')
    const out = JSON.parse(response.text)?.choices?.[0]?.message?.content
    if (typeof out !== 'string' || !out.trim()) throw new Error('empty content')
    await logDecision($, `route: capped -> ${gateway}`)
    return out.trim()
  } catch {
    await logDecision($, `route: ${gateway} unavailable`)
    return undefined
  } finally {
    timer?.cancel()
  }
}

async function codexNoAnswer($: Engine, e: AgentCall, route: string): Promise<unknown> {
  const started = await $.clock.now()
  await logDecision($, `route: ${route} codex no answer -> fail (no haiku)`)
  return {
    result: {
      status: 'completed',
      prompt: e.prompt,
      agentId: 'ai-delegation-codex',
      content: [{ type: 'text', text: `FAIL | router | Codex gave no answer for a ${route} task; no Haiku fallback while Codex has quota. Split the task or re-brief.` }],
      totalToolUseCount: 0,
      totalDurationMs: (await $.clock.now()) - started,
      totalTokens: 0,
      usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: null, cache_read_input_tokens: null, server_tool_use: null, service_tier: null, cache_creation: null },
    },
  } as never
}

async function customAgentDefinition($: Engine, type: string): Promise<{ model?: string; prompt: string } | undefined> {
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
  const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/)
  const model = frontmatter?.[1].match(/^model:\s*(?:"([^"]*)"|'([^']*)'|([^\s#]+))(?:\s+#.*)?$/m)
  return { model: model?.[1] ?? model?.[2] ?? model?.[3], prompt: frontmatter ? text.slice(frontmatter[0].length).trim() : '' }
}

async function route($: Engine, e: AgentCall, next: (e: never) => Promise<unknown>): Promise<unknown> {
  if (forbiddenModel(e.model) || forbiddenModel(e.subagent_type)) return failure(e, 'Sonnet, Opus and Fable subagents are forbidden')
  if (e.subagent_type && !isGenericType(e)) {
    const definition = await customAgentDefinition($, e.subagent_type)
    if (!definition) return failure(e, 'custom agent definition could not be verified')
    if (forbiddenModel(definition.model)) return failure(e, 'Sonnet, Opus and Fable subagents are forbidden')
    if (definition.prompt) e = { ...e, prompt: `Custom agent instructions:\n${definition.prompt}\n\nTask:\n${e.prompt}` }
  }
  if (!safePayload(`${e.description ?? ''}\n${e.prompt}`)) return failure(e, 'payload contains prohibited content')
  const quota = await codexQuotaStatus($)
  if (quota === UNAVAILABLE) return failure(e, 'Codex quota status unavailable')
  if (quota === 'codex-quota: available') {
    if (!(await codexReady($))) return failure(e, 'Codex unavailable while quota is available')
    const label = await classify($, e)
    const advisory = isAdvisory(label) || isAdvisory(explicitLabel(e.description) ?? label)
    if (mandatoryLabel(`${e.description ?? ''}\n${e.prompt}`)) e = { ...e, description: `${e.description ?? ''} [class: bulk-complex]` }
    const sandbox: Sandbox = advisory || e.subagent_type === 'Explore' || e.subagent_type === 'Plan' ? 'read-only' : 'workspace-write'
    const result = await runRoutedCodex($, e, label, CODEX[label], sandbox, `class ${label}`)
    return result ?? codexNoAnswer($, e, label)
  }
  const sandbox = await runSandboxExecutor($, e)
  if (sandbox) return sandbox
  // Only explicitly self-contained text work qualifies for transports without tools.
  if (!e.isolation && isGenericType(e) && !['Explore', 'Plan'].includes(e.subagent_type ?? '') && !codingTask(e.description) && e.description?.includes('[class: text]')) {
    for (const gateway of ['Z.ai GLM', 'OpenCode Go'] as const) {
      const out = await runGateway($, e, gateway)
      if (out) return routedResult(e, 'ai-delegation-gateway', out, `[routed: ${gateway}]`, 0)
    }
  }
  await logDecision($, 'route: capped, earlier rungs ineligible -> claude haiku xhigh')
  // The custom instructions have already been loaded and screened above.
  return next({ ...e, subagent_type: isGenericType(e) ? e.subagent_type : 'general-purpose', ...LAST_RESORT } as never)
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
  const ready = await codexReady($)
  let by = `codex ${judgeRoute.family} ${judgeRoute.effort}`
  let verdict = ready ? parseVerdict(await runCodex($, judgeRoute, 'read-only', ask, 120_000)) : undefined
  if (!ready && await codexQuotaStatus($) === 'codex-quota: exhausted') {
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
  on('session.start', async ($, e, next) => {
    startupQuota = await codexQuotaStatus($)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('prompt.compose', async ($, e, next) => {
    startupQuota ??= await codexQuotaStatus($)
    const result = await next(e)
    return { sections: [...result.sections, { id: 'jpe-ai-delegation:codex-quota', text: `${startupQuota}
${PROMPT_POLICY}`, scope: 'session' }] }
  }).catch(($, e, next) => next(e))

  // An unexpected router failure must not bypass the model and payload guards.
  on('tool.call', { tool: 'Agent' }, ($, e, next) => route($, e as never, next as never) as never).catch(($, e) => failure(e as never, 'routing failed closed') as never)

  // Permission judge for the bypass-immune ask. A failing hook leaves core's ask.
  on('tool.check', { tool: 'Bash' }, ($, e, next) => judge($, e, next as never) as never).catch(($, e, next) => next(e))
}
