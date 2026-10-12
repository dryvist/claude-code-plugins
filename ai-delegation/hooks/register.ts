import type { EngineInterface, Register } from 'claude-code'
import { CLASSIFIER, CLAUDE, CODEX, CODEX_FAMILY, DEFAULT_EFFORT, JUDGE, codexArgv, isRosterSpawn, isRoutable, isShellCAsk, newestModel, parseVerdict, pickLabel, rosterEffort } from './lib/policy'
import type { Label, Sandbox } from './lib/policy'

type Engine = EngineInterface
type AgentCall = { description?: string; prompt: string; subagent_type?: string; model?: string; effort?: string; name?: string; isolation?: string }

// Codex is usable when the CLI starts and `codex-quota` reports at least 5% free in every window.
async function codexReady($: Engine): Promise<boolean> {
  try {
    const cli = await $.process.run(['codex', '--version'], { timeoutMs: 10_000 })
    if (cli.exitCode !== 0) return false
    return (await $.process.run(['codex-quota'], { timeoutMs: 20_000 })).exitCode === 0
  } catch {
    return false
  }
}

// One `codex exec`: the final message is stdout. Undefined on any failure or an empty answer, and when no Luna
// model is listed: without `-m`, codex would use its configured default, which may not be Luna.
async function runCodex($: Engine, effort: string, sandbox: Sandbox, prompt: string, timeoutMs: number): Promise<string | undefined> {
  try {
    const home = (await $.env.get('CODEX_HOME')) ?? `${await $.env.get('HOME')}/.codex`
    const cache = `${home}/models_cache.json`
    const model = (await $.fs.exists(cache)) ? newestModel((await $.fs.read(cache)) as string, CODEX_FAMILY) : undefined
    const r = await $.process.run(codexArgv(sandbox, effort, model), { stdin: prompt, timeoutMs })
    const text = r.stdout.trim()
    return r.exitCode === 0 && text ? text : undefined
  } catch {
    return undefined
  }
}

// Append-only decision log; `tee -a` keeps parallel hooks from dropping each other's lines.
async function logDecision($: Engine, line: string): Promise<void> {
  try {
    await $.process.run(['tee', '-a', `${await $.env.get('HOME')}/.claude/ai-delegation.log`], { stdin: `${line}\n`, timeoutMs: 5_000 })
  } catch {
    // The log is advisory; a failed write never changes a decision.
  }
}

async function classify($: Engine, e: AgentCall, ready: boolean): Promise<Label> {
  const task = `${e.description ?? ''}\n${e.prompt.slice(0, 4000)}`
  if (ready) {
    const label = pickLabel(await runCodex($, DEFAULT_EFFORT, 'read-only', `${CLASSIFIER}\n\nTask:\n${task}`, 90_000))
    if (label) return label
  }
  const r = await $.model.complete({ model: 'haiku', effort: DEFAULT_EFFORT, system: CLASSIFIER, prompt: task, maxTokens: 10, timeoutMs: 30_000 })
  return pickLabel(r.isAnswered ? r.text : undefined) ?? 'standard'
}

async function runRoutedCodex($: Engine, e: AgentCall, route: string, effort: string, sandbox: Sandbox, detail: string): Promise<unknown | undefined> {
  const started = await $.clock.now()
  const out = await runCodex($, effort, sandbox, e.prompt, 600_000)
  if (!out) return undefined
  await logDecision($, `route: ${route} -> codex ${CODEX_FAMILY} ${effort} (${sandbox})`)
  return {
    result: {
      status: 'completed',
      prompt: e.prompt,
      agentId: 'ai-delegation-codex',
      content: [{ type: 'text', text: `${out}\n\n[routed: codex ${CODEX_FAMILY} ${effort}, ${detail}]` }],
      totalToolUseCount: 0,
      totalDurationMs: (await $.clock.now()) - started,
      totalTokens: 0,
      usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: null, cache_read_input_tokens: null, server_tool_use: null, service_tier: null, cache_creation: null },
    },
  } as never
}

async function route($: Engine, e: AgentCall, next: (e: never) => Promise<unknown>): Promise<unknown> {
  if (isRosterSpawn(e)) {
    if (e.isolation || !(await codexReady($))) return next(e as never)
    const effort = rosterEffort(e.subagent_type)!
    const result = await runRoutedCodex($, e, e.subagent_type!, effort, 'workspace-write', `roster ${e.subagent_type}`)
    if (result) return result
    $.ui.log(`ai-delegation: Codex gave no answer for the ${e.subagent_type} roster spawn, passing it through`)
    return next(e as never)
  }
  if (!isRoutable(e)) return next(e as never)
  const ready = await codexReady($)
  const label = await classify($, e, ready)
  const sandbox: Sandbox = e.subagent_type === 'Explore' || e.subagent_type === 'Plan' ? 'read-only' : 'workspace-write'

  // A Codex run has no worktree isolation, so isolated spawns stay on Claude. Plan and deep work never go to Codex.
  const codex = CODEX[label]
  if (ready && codex && !e.isolation) {
    const result = await runRoutedCodex($, e, label, codex.effort, sandbox, `class ${label}`)
    if (result) return result
    $.ui.log(`ai-delegation: Codex gave no answer for a ${label} task, using Claude`)
  }
  const c = CLAUDE[label]
  await logDecision($, `route: ${label} -> claude ${c.model} ${c.effort}`)
  return next({ ...e, model: c.model, effort: c.effort } as never)
}

// Answers core's bypass-immune "shell -c script runs rm" ask. Anything but a clean verdict returns core's own
// result, so the person still sees the dialog; a failure never allows.
async function judge($: Engine, e: { input: unknown }, next: (e: never) => Promise<{ decision: string; reason?: string }>): Promise<unknown> {
  const core = await next(e as never)
  if (!isShellCAsk(core.decision, core.reason)) return core

  const command = String((e.input as { command?: unknown })?.command ?? '')
  const ask = `${JUDGE}\n\nCommand:\n\`\`\`\n${command}\n\`\`\``
  let by = `codex ${CODEX_FAMILY} ${DEFAULT_EFFORT}`
  let verdict = (await codexReady($)) ? parseVerdict(await runCodex($, DEFAULT_EFFORT, 'read-only', ask, 120_000)) : undefined
  if (!verdict) {
    by = `haiku ${DEFAULT_EFFORT}`
    const r = await $.model.complete({ model: 'haiku', effort: DEFAULT_EFFORT, prompt: ask, maxTokens: 400, timeoutMs: 60_000 })
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
  // Subagent router: the cheapest tier the task justifies, Codex first when it has quota. A failing hook
  // leaves the spawn exactly as the model asked for it.
  on('tool.call', { tool: 'Agent' }, ($, e, next) => route($, e as never, next as never) as never).catch(($, e, next) => next(e))

  // Permission judge for the bypass-immune ask. A failing hook leaves core's ask.
  on('tool.check', { tool: 'Bash' }, ($, e, next) => judge($, e, next as never) as never).catch(($, e, next) => next(e))
}
