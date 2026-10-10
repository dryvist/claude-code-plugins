import type { EngineInterface, Register } from 'claude-code'
import { CLASSIFIER, CLAUDE, CODEX, JUDGE, codexArgv, isRoutable, isShellCAsk, newestModel, parseVerdict, pickLabel } from './lib/policy'
import type { Label, Sandbox } from './lib/policy'

type Engine = EngineInterface
type Options = { cheapFamily: string; deepFamily: string }
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

// One `codex exec`: the final message is stdout. Undefined on any failure or an empty answer.
async function runCodex($: Engine, family: string, effort: string, sandbox: Sandbox, prompt: string, timeoutMs: number): Promise<string | undefined> {
  try {
    const home = (await $.env.get('CODEX_HOME')) ?? `${await $.env.get('HOME')}/.codex`
    const cache = `${home}/models_cache.json`
    const model = (await $.fs.exists(cache)) ? newestModel((await $.fs.read(cache)) as string, family) : undefined
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

async function classify($: Engine, e: AgentCall, ready: boolean, o: Options): Promise<Label> {
  const task = `${e.description ?? ''}\n${e.prompt.slice(0, 4000)}`
  if (ready) {
    const label = pickLabel(await runCodex($, o.cheapFamily, 'high', 'read-only', `${CLASSIFIER}\n\nTask:\n${task}`, 90_000))
    if (label) return label
  }
  const r = await $.model.complete({ model: 'haiku', effort: 'high', system: CLASSIFIER, prompt: task, maxTokens: 10, timeoutMs: 30_000 })
  return pickLabel(r.isAnswered ? r.text : undefined) ?? 'standard'
}

async function route($: Engine, e: AgentCall, next: (e: never) => Promise<unknown>, o: Options): Promise<unknown> {
  if (!isRoutable(e)) return next(e as never)
  const ready = await codexReady($)
  const label = await classify($, e, ready, o)
  const sandbox: Sandbox = e.subagent_type === 'Explore' || e.subagent_type === 'Plan' ? 'read-only' : 'workspace-write'

  // A Codex run has no worktree isolation, so isolated spawns stay on Claude.
  if (ready && !e.isolation) {
    const c = CODEX[label]
    const started = await $.clock.now()
    const out = await runCodex($, o[c.family], c.effort, sandbox, e.prompt, 600_000)
    if (out) {
      await logDecision($, `route: ${label} -> codex ${o[c.family]} ${c.effort} (${sandbox})`)
      return {
        result: {
          status: 'completed',
          prompt: e.prompt,
          agentId: 'ai-delegation-codex',
          content: [{ type: 'text', text: `${out}\n\n[routed: codex ${o[c.family]} ${c.effort}, class ${label}]` }],
          totalToolUseCount: 0,
          totalDurationMs: (await $.clock.now()) - started,
          totalTokens: 0,
          usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: null, cache_read_input_tokens: null, server_tool_use: null, service_tier: null, cache_creation: null },
        },
      } as never
    }
    $.ui.log(`ai-delegation: Codex gave no answer for a ${label} task, using Claude`)
  }
  const c = CLAUDE[label]
  await logDecision($, `route: ${label} -> claude ${c.model} ${c.effort}`)
  return next({ ...e, model: c.model, effort: c.effort } as never)
}

// Answers core's bypass-immune "shell -c script runs rm" ask. Anything but a clean verdict returns core's own
// result, so the person still sees the dialog; a failure never allows.
async function judge($: Engine, e: { input: unknown }, next: (e: never) => Promise<{ decision: string; reason?: string }>, o: Options): Promise<unknown> {
  const core = await next(e as never)
  if (!isShellCAsk(core.decision, core.reason)) return core

  const command = String((e.input as { command?: unknown })?.command ?? '')
  const ask = `${JUDGE}\n\nCommand:\n\`\`\`\n${command}\n\`\`\``
  let by = `codex ${o.cheapFamily} xhigh`
  let verdict = (await codexReady($)) ? parseVerdict(await runCodex($, o.cheapFamily, 'xhigh', 'read-only', ask, 120_000)) : undefined
  if (!verdict) {
    by = 'haiku xhigh'
    const r = await $.model.complete({ model: 'haiku', effort: 'xhigh', prompt: ask, maxTokens: 400, timeoutMs: 60_000 })
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

export const register: Register = (on, options) => {
  const o = { cheapFamily: String(options.cheapFamily), deepFamily: String(options.deepFamily) }

  // Subagent router: the cheapest tier the task justifies, Codex first when it has quota. A failing hook
  // leaves the spawn exactly as the model asked for it.
  on('tool.call', { tool: 'Agent' }, ($, e, next) => route($, e as never, next as never, o) as never).catch(($, e, next) => next(e))

  // Permission judge for the bypass-immune ask. A failing hook leaves core's ask.
  on('tool.check', { tool: 'Bash' }, ($, e, next) => judge($, e, next as never, o) as never).catch(($, e, next) => next(e))
}
