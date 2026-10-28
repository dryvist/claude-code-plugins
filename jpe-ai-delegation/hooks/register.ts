import type { EngineInterface, Register } from 'claude-code'
import { CLASSIFIER, CODEX, JUDGE, LAST_RESORT, UTILITY, codexArgv, explicitLabel, isAdvisory, isGenericType, isHaikuRoutable, isRoutable, isShellCAsk, newestModel, parseVerdict, pickLabel } from './lib/policy'
import type { Label, Route, Sandbox } from './lib/policy'

type Engine = EngineInterface
type AgentCall = { description?: string; prompt: string; subagent_type?: string; model?: string; effort?: string; name?: string; isolation?: string }
type QuotaLine = 'codex-quota: available' | 'codex-quota: exhausted' | 'codex-quota: unavailable'
const UNAVAILABLE: QuotaLine = 'codex-quota: unavailable'
// shortcut: the startup line lives in the module, so a hot reload recomputes it on the next prompt.compose.
let startupQuota: QuotaLine | undefined
const PROMPT_POLICY = 'Codex delegates: Terra medium default, Terra high for complex/plan/deep, Luna xhigh bulk, Luna max bulk-complex; capped: Haiku xhigh. Never Sonnet or Opus.'

// Codex is usable when the CLI starts and `codex-quota` reports at least 5% free in every window.
async function codexReady($: Engine): Promise<boolean> {
  let reason: string
  try {
    const cli = await $.process.run(['codex', '--version'], { timeoutMs: 30_000 })
    if (cli.exitCode === 0) {
      const quota = await $.process.run(['codex-quota'], { timeoutMs: 20_000 })
      if (quota.exitCode === 0) return true
      reason = `codex-quota exited ${quota.exitCode}`
    } else {
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
    const result = await $.process.run(['codex-quota'], { timeoutMs: 20_000 })
    if (result.exitCode === 0) return 'codex-quota: available'
    return result.exitCode === 1 ? 'codex-quota: exhausted' : UNAVAILABLE
  } catch {
    return UNAVAILABLE
  }
}

// One `codex exec`; its final message is read from a temporary output file. The finite stdin string is closed by process.run.
async function runCodex($: Engine, codexRoute: Route, sandbox: Sandbox, prompt: string, timeoutMs: number): Promise<string | undefined> {
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
      const r = await $.process.run(codexArgv(sandbox, codexRoute, model, outputFile), { stdin: prompt, timeoutMs })
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

// Only called while Codex is ready: the label picks the Codex effort, and Claude has one fallback for every class.
async function classify($: Engine, e: AgentCall): Promise<Label> {
  const task = `${e.description ?? ''}\n${e.prompt.slice(0, 4000)}`
  const named = explicitLabel(e.description)
  if (named) return named
  return pickLabel(await runCodex($, UTILITY, 'read-only', `${CLASSIFIER}\n\nTask:\n${task}`, 90_000)) ?? 'standard'
}

async function runRoutedCodex($: Engine, e: AgentCall, route: string, codexRoute: Route, sandbox: Sandbox, detail: string): Promise<unknown | undefined> {
  const started = await $.clock.now()
  const out = await runCodex($, codexRoute, sandbox, e.prompt, 600_000)
  if (!out) return undefined
  await logDecision($, `route: ${route} -> codex ${codexRoute.family} ${codexRoute.effort} (${sandbox})`)
  return {
    result: {
      status: 'completed',
      prompt: e.prompt,
      agentId: 'ai-delegation-codex',
      content: [{ type: 'text', text: `${out}\n\n[routed: codex ${codexRoute.family} ${codexRoute.effort}, ${detail}]` }],
      totalToolUseCount: 0,
      totalDurationMs: (await $.clock.now()) - started,
      totalTokens: 0,
      usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: null, cache_read_input_tokens: null, server_tool_use: null, service_tier: null, cache_creation: null },
    },
  } as never
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

  for (const path of paths) {
    if (!(await $.fs.exists(path))) continue
    const text = (await $.fs.read(path)) as string
    const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/)
    const model = frontmatter?.[1].match(/^model:\s*(?:"([^"]*)"|'([^']*)'|([^\s#]+))(?:\s+#.*)?$/m)
    return { model: model?.[1] ?? model?.[2] ?? model?.[3], prompt: frontmatter ? text.slice(frontmatter[0].length).trim() : '' }
  }

  return undefined
}

async function route($: Engine, e: AgentCall, next: (e: never) => Promise<unknown>): Promise<unknown> {
  if (e.subagent_type && !isGenericType(e) && !e.model) {
    const definition = await customAgentDefinition($, e.subagent_type)
    if (definition?.model === 'haiku') {
      if (e.isolation || !(await codexReady($))) return next(e as never)
      const prompt = definition.prompt ? `Custom agent instructions:\n${definition.prompt}\n\nTask:\n${e.prompt}` : e.prompt
      const result = await runRoutedCodex($, { ...e, prompt }, `custom ${e.subagent_type} haiku`, CODEX.standard, 'workspace-write', 'custom haiku agent')
      if (result) return result
      return codexNoAnswer($, { ...e, prompt }, `custom ${e.subagent_type} haiku`)
    }
  }

  if (isHaikuRoutable(e)) {
    if (e.isolation || !(await codexReady($))) return next(e as never)
    const result = await runRoutedCodex($, e, 'standard', CODEX.standard, 'workspace-write', 'explicit haiku')
    if (result) return result
    return codexNoAnswer($, e, 'standard')
  }

  if (!isRoutable(e)) return next(e as never)
  const lastResort = async (why: string): Promise<unknown> => {
    await logDecision($, `route: ${why} -> claude ${LAST_RESORT.model} ${LAST_RESORT.effort}`)
    return next({ ...e, ...LAST_RESORT } as never)
  }
  // Codex capped or missing: the only executor this module can run besides Codex is the Haiku last resort.
  if (!(await codexReady($))) return lastResort('codex unavailable')
  // Worktree isolation cannot run through `codex exec`, which works in the session's directory.
  if (e.isolation) return lastResort('isolated')
  const label = await classify($, e)
  const sandbox: Sandbox = isAdvisory(label) || e.subagent_type === 'Explore' || e.subagent_type === 'Plan' ? 'read-only' : 'workspace-write'
  const result = await runRoutedCodex($, e, label, CODEX[label], sandbox, `class ${label}`)
  if (result) return result
  return codexNoAnswer($, e, label)
}

// Answers core's bypass-immune "shell -c script runs rm" ask. Anything but a clean verdict returns core's own
// result, so the person still sees the dialog; a failure never allows.
async function judge($: Engine, e: { input: unknown }, next: (e: never) => Promise<{ decision: string; reason?: string }>): Promise<unknown> {
  const core = await next(e as never)
  if (!isShellCAsk(core.decision, core.reason)) return core

  const command = String((e.input as { command?: unknown })?.command ?? '')
  const ask = `${JUDGE}\n\nCommand:\n\`\`\`\n${command}\n\`\`\``
  const ready = await codexReady($)
  let by = `codex ${UTILITY.family} ${UTILITY.effort}`
  let verdict = ready ? parseVerdict(await runCodex($, UTILITY, 'read-only', ask, 120_000)) : undefined
  if (!ready) {
    by = `haiku ${LAST_RESORT.effort}`
    const r = await $.model.complete({ model: 'haiku', effort: LAST_RESORT.effort, prompt: ask, maxTokens: 400, timeoutMs: 60_000 })
    verdict = parseVerdict(r.isAnswered ? r.text : undefined)
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

  // Subagent router: the cheapest tier the task justifies, Codex first when it has quota. A failing hook
  // leaves the spawn exactly as the model asked for it.
  on('tool.call', { tool: 'Agent' }, ($, e, next) => route($, e as never, next as never) as never).catch(($, e, next) => next(e))

  // Permission judge for the bypass-immune ask. A failing hook leaves core's ask.
  on('tool.check', { tool: 'Bash' }, ($, e, next) => judge($, e, next as never) as never).catch(($, e, next) => next(e))
}
