import { describe, expect, mock, test } from 'claude-code/testing'
import { CODEX, LAST_RESORT, TIERS, codexArgv, explicitLabel, isAdvisory, isRoutable, isShellCAsk, newestModel, parseVerdict, pickLabel } from './lib/policy'

const CORE_ASK = { decision: 'ask', reason: 'This command passes a shell -c script that runs rm, and Claude Code could not check the script for dangerous removals.' }
const RAN = { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false }
const DONE = {
  status: 'completed',
  prompt: 'p',
  agentId: 'test-agent',
  content: [{ type: 'text', text: 'ran' }],
  totalToolUseCount: 0,
  totalDurationMs: 1,
  totalTokens: 0,
  usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: null, cache_read_input_tokens: null, server_tool_use: null, service_tier: null, cache_creation: null },
}
const CACHE = JSON.stringify({
  models: [
    { slug: 'gpt-older-luna', visibility: 'list', priority: 9 },
    { slug: 'gpt-newer-luna', visibility: 'list', priority: 4 },
    { slug: 'gpt-newest-sol', visibility: 'list', priority: 1 },
    { slug: 'gpt-newer-terra', visibility: 'list', priority: 3 },
    { slug: 'gpt-hidden-luna', visibility: 'hide', priority: 0 },
  ],
})

describe('policy', () => {
  test('newestModel picks the listed model of a family with the lowest priority', () => {
    expect(newestModel(CACHE, 'luna')).toBe('gpt-newer-luna')
    expect(newestModel(CACHE, 'astra')).toBeUndefined()
  })

  test('parseVerdict accepts only a clean verdict', () => {
    expect(parseVerdict('{"verdict":"safe","reason":"no removal"}')).toEqual({ verdict: 'safe', reason: 'no removal' })
    expect(parseVerdict('```json\n{"verdict":"unsafe","reason":"rm of $HOME"}\n```')?.verdict).toBe('unsafe')
    expect(parseVerdict('{"verdict":"maybe","reason":"x"}')).toBeUndefined()
    expect(parseVerdict('safe')).toBeUndefined()
    expect(parseVerdict(undefined)).toBeUndefined()
  })

  test('routing policy includes executor and keeps named choices', () => {
    expect(pickLabel('Complex.')).toBe('complex')
    expect(pickLabel('no idea')).toBeUndefined()
    expect(isShellCAsk('ask', CORE_ASK.reason)).toBe(true)
    expect(isShellCAsk('ask', 'Allow this git push?')).toBe(false)
    expect(isShellCAsk('allow', CORE_ASK.reason)).toBe(false)
    for (const subagent_type of [undefined, 'general-purpose', 'executor', 'Explore', 'Plan']) {
      expect(isRoutable({ subagent_type })).toBe(true)
    }
    expect(isRoutable({ subagent_type: 'specialist' })).toBe(false)
    expect(isRoutable({ model: 'opus' })).toBe(false)
    expect(isRoutable({ model: 'haiku' })).toBe(false)
    expect(isRoutable({ name: 'worker' })).toBe(false)
    expect(isRoutable({ effort: 'high' })).toBe(false)
    const argv = codexArgv('read-only', CODEX.bulk, 'gpt-newer-luna', '/tmp/final-message')
    expect(argv).toContain('gpt-newer-luna')
    expect(argv.slice(-3)).toEqual(['-o', '/tmp/final-message', '-'])
    expect(() => codexArgv('read-only', CODEX.bulk, 'gpt-newer-luna', '')).toThrow()
  })

  test('Terra runs only at medium or high, Luna only at xhigh or max; Claude is Haiku xhigh only', () => {
    for (const effort of ['medium', 'high']) expect(codexArgv('read-only', { family: 'terra', effort }, 'gpt-newer-terra', '/tmp/final-message')).toContain(`model_reasoning_effort="${effort}"`)
    for (const effort of ['xhigh', 'max']) expect(codexArgv('read-only', { family: 'luna', effort }, 'gpt-newer-luna', '/tmp/final-message')).toContain(`model_reasoning_effort="${effort}"`)
    for (const effort of ['low', 'xhigh', 'max', 'ultra', '']) expect(() => codexArgv('read-only', { family: 'terra', effort }, 'gpt-newer-terra', '/tmp/final-message')).toThrow()
    for (const effort of ['low', 'medium', 'high', '']) expect(() => codexArgv('read-only', { family: 'luna', effort }, 'gpt-newer-luna', '/tmp/final-message')).toThrow()
    for (const model of ['gpt-newest-sol', 'gpt-newer-terra', 'gpt-newer-luna-mini', 'luna', '', undefined]) expect(() => codexArgv('read-only', CODEX.bulk, model, '/tmp/final-message')).toThrow()
    expect(CODEX).toEqual({
      bulk: { family: 'luna', effort: 'xhigh' },
      'bulk-complex': { family: 'luna', effort: 'max' },
      standard: { family: 'terra', effort: 'medium' },
      complex: { family: 'terra', effort: 'high' },
      plan: { family: 'terra', effort: 'high' },
      deep: { family: 'terra', effort: 'high' },
    })
    expect(TIERS).toEqual(['bulk', 'bulk-complex', 'standard', 'complex'])
    expect(pickLabel('bulk-complex')).toBe('bulk-complex')
    expect(pickLabel('Bulk')).toBe('bulk')
    expect(explicitLabel('retry [class: complex]')).toBe('complex')
    expect(explicitLabel('[class: ultra]')).toBeUndefined()
    expect(['standard', 'complex', 'plan', 'deep'].filter((l) => isAdvisory(l as never))).toEqual(['plan', 'deep'])
    expect(LAST_RESORT).toEqual({ model: 'haiku', effort: 'xhigh' })
  })
})

function world(on: any, w: { codex: boolean; quotaExitCode?: number; quotaMissing?: boolean; codexSays?: string; codexExitCode?: number; mktempExitCode?: number; mktempStdout?: string; haikuSays?: string; cache?: boolean; agentFiles?: Record<string, string> }) {
  mock.env(on, { HOME: '/home/test' })
  mock.clock(on)
  const seen: string[][] = []
  const calls: { argv: string[]; stdin?: string }[] = []
  const uiLogs: string[] = []
  const modelCalls: string[] = []
  ;(seen as any).calls = calls
  ;(seen as any).uiLogs = uiLogs
  ;(seen as any).modelCalls = modelCalls
  on('session.cwd', () => ({ value: '/workspace' }))
  const agentFile = (path: string) => Object.entries(w.agentFiles ?? {}).find(([name]) => path.endsWith(`/.claude/agents/${name}.md`))?.[1]
  on('fs.exists', (_$: any, e: { path: string }) => ({ value: e.path.endsWith('/models_cache.json') ? w.cache !== false : agentFile(e.path) !== undefined }))
  on('fs.read', (_$: any, e: { path: string }) => ({ value: e.path === '/tmp/ai-delegation-final-message' ? w.codexSays ?? '' : e.path.endsWith('/models_cache.json') ? CACHE : agentFile(e.path) ?? '' }))
  on('ui.log', (...args: any[]) => {
    uiLogs.push(args.map((value) => typeof value === 'string' ? value : JSON.stringify(value)).join(' '))
    return { value: undefined }
  })
  on('process.run', (_$: any, e: { argv: string[]; init?: { stdin?: string } }) => {
    const argv = [...e.argv]
    seen.push(argv)
    calls.push({ argv, stdin: e.init?.stdin })
    if (argv[0] === 'mktemp') return { value: { ...RAN, exitCode: w.mktempExitCode ?? 0, stdout: w.mktempStdout ?? '/tmp/ai-delegation-final-message' } }
    if (argv[0] === 'rm') return { value: RAN }
    if (e.argv[0] === 'codex' && e.argv[1] === '--version') return { value: { ...RAN, exitCode: w.codex ? 0 : 1 } }
    if (argv[0] === 'codex-quota') {
      if (w.quotaMissing) return { value: { ...RAN, exitCode: 127 } }
      return { value: { ...RAN, exitCode: w.quotaExitCode ?? (w.codex ? 0 : 1) } }
    }
    if (argv[0] === 'codex') return { value: { ...RAN, exitCode: w.codexExitCode ?? 0 } }
    return { value: RAN }
  })
  on('model.complete', (_$: any, e: { model: string }) => {
    modelCalls.push(e.model)
    return { value: { isAnswered: true, text: w.haikuSays ?? '', usage: {} } }
  })
  return seen
}

describe('permission judge', () => {
  test('Haiku can judge when Codex is unavailable', async ($, on) => {
    world(on, { codex: false, haikuSays: '{"verdict":"safe","reason":"no removal"}' })
    on('tool.check', () => CORE_ASK as never)
    const r = await $.tool.check({ tool: 'Bash', input: { command: 'bash -c "$Z hi"' } })
    expect(r.decision).toBe('allow')
  })

  test('Codex unsafe verdict denies with the reason', async ($, on) => {
    const seen = world(on, { codex: true, codexSays: '{"verdict":"unsafe","reason":"rm of an unset variable"}' })
    on('tool.check', () => CORE_ASK as never)
    const r = await $.tool.check({ tool: 'Bash', input: { command: 'bash -c \'rm -rf "$UNSET"/x\'' } })
    expect(r.decision).toBe('deny')
    expect(r.reason).toContain('rm of an unset variable')
    expect(seen.some((a) => a[0] === 'codex' && a.includes('read-only'))).toBe(true)
  })

  test('Codex with no verdict leaves the dialog without calling Haiku', async ($, on) => {
    const seen = world(on, { codex: true, haikuSays: '{"verdict":"safe","reason":"must not be used"}' })
    on('tool.check', () => CORE_ASK as never)
    const r = await $.tool.check({ tool: 'Bash', input: { command: 'bash -c "$Z hi"' } })
    expect(r.decision).toBe('ask')
    expect((seen as any).modelCalls).toEqual([])
  })

  test('no verdict leaves the dialog, never an allow', async ($, on) => {
    world(on, { codex: false, haikuSays: 'I cannot tell' })
    on('tool.check', () => CORE_ASK as never)
    const r = await $.tool.check({ tool: 'Bash', input: { command: 'bash -c "$Z hi"' } })
    expect(r.decision).toBe('ask')
  })

  test('an ask that is not the shell -c check is untouched', async ($, on) => {
    world(on, { codex: false, haikuSays: '{"verdict":"safe","reason":"x"}' })
    on('tool.check', () => ({ decision: 'ask', reason: 'Allow this git push?' }) as never)
    const r = await $.tool.check({ tool: 'Bash', input: { command: 'git push' } })
    expect(r.decision).toBe('ask')
  })
})

describe('router', () => {
  for (const [label, prompt] of [['standard', 'Summarise README.md'], ['complex', 'Implement the coordinated update.'], ['plan', 'Plan the migration of the auth layer.'], ['deep', 'Assess the trust boundaries.']]) {
    test(`without Codex a ${label} task goes to Haiku xhigh with no classifier call, never Sonnet or Opus`, async ($, on) => {
      const seen = world(on, { codex: false, haikuSays: label })
      let routed: { model?: string; effort?: string } = {}
      on('tool.call', { tool: 'Agent' }, (_$: any, e: any) => ((routed = e), { result: DONE }) as never)
      await $.tool.call({ tool: 'Agent', description: label, prompt } as never)
      expect(routed.model).toBe('haiku')
      expect(routed.effort).toBe('xhigh')
      expect((seen as any).modelCalls).toEqual([])
      expect(seen.some((a) => a[0] === 'codex' && a[1] === 'exec')).toBe(false)
    })
  }

  test('Codex-ready standard work runs on Codex Terra medium', async ($, on) => {
    const seen = world(on, { codex: true, codexSays: 'standard' })
    let reached = false
    on('tool.call', { tool: 'Agent' }, () => ((reached = true), { result: DONE }) as never)
    const r: any = await $.tool.call({ tool: 'Agent', description: 'read', prompt: 'Summarise README.md' } as never)
    expect(reached).toBe(false)
    expect(JSON.stringify(r)).toContain('[routed: codex terra medium, class standard]')
    expect(seen.some((a) => a[0] === 'codex' && a.includes('workspace-write'))).toBe(true)
    const calls = (seen as any).calls.filter((call: { argv: string[] }) => call.argv[0] === 'codex' && call.argv[1] === 'exec')
    expect(calls).toHaveLength(2)
    for (const call of calls) expect(call.argv.slice(-3)).toEqual(['-o', '/tmp/ai-delegation-final-message', '-'])
    expect(calls[1].stdin).toBe('Summarise README.md')
    expect((seen as any).modelCalls).toEqual([])
  })

  test('complex Codex work uses Terra high after a Luna xhigh classification', async ($, on) => {
    const seen = world(on, { codex: true, codexSays: 'complex' })
    on('tool.call', { tool: 'Agent' }, () => ({ result: DONE }) as never)
    const r: any = await $.tool.call({ tool: 'Agent', description: 'multi-file change', prompt: 'Implement the coordinated update.' } as never)
    expect(JSON.stringify(r)).toContain('[routed: codex terra high, class complex]')
    const runs = seen.filter((a) => a[0] === 'codex' && a[1] === 'exec')
    expect(runs.map((a) => a.join(' ').match(/model_reasoning_effort="(\w+)"/)?.[1])).toEqual(['xhigh', 'high'])
    expect(runs[1]).toContain('workspace-write')
  })

  for (const [label, family, effort] of [['bulk', 'luna', 'xhigh'], ['bulk-complex', 'luna', 'max']]) {
    test(`${label} work runs on Codex Luna ${effort}`, async ($, on) => {
      const seen = world(on, { codex: true, codexSays: label })
      on('tool.call', { tool: 'Agent' }, () => ({ result: DONE }) as never)
      const r: any = await $.tool.call({ tool: 'Agent', description: 'large read', prompt: 'Summarise every log file.' } as never)
      expect(JSON.stringify(r)).toContain(`[routed: codex ${family} ${effort}, class ${label}]`)
      const runs = seen.filter((a) => a[0] === 'codex' && a[1] === 'exec')
      expect(runs[1]).toContain('gpt-newer-luna')
    })
  }

  test('an explicit [class: x] escalation skips the classifier', async ($, on) => {
    const seen = world(on, { codex: true, codexSays: 'bulk' })
    on('tool.call', { tool: 'Agent' }, () => ({ result: DONE }) as never)
    const r: any = await $.tool.call({ tool: 'Agent', description: 'retry [class: complex]', prompt: 'Redo the change.' } as never)
    expect(JSON.stringify(r)).toContain('[routed: codex terra high, class complex]')
    expect(seen.filter((a) => a[0] === 'codex' && a[1] === 'exec')).toHaveLength(1)
  })

  for (const label of ['plan', 'deep']) {
    test(`${label} work runs on Codex Terra high as a read-only advisory worker`, async ($, on) => {
      const seen = world(on, { codex: true, codexSays: label })
      let reached = false
      on('tool.call', { tool: 'Agent' }, () => ((reached = true), { result: DONE }) as never)
      const r: any = await $.tool.call({ tool: 'Agent', description: label, prompt: 'Assess the trust boundaries.' } as never)
      expect(reached).toBe(false)
      expect(JSON.stringify(r)).toContain(`[routed: codex terra high, class ${label}]`)
      const runs = seen.filter((a) => a[0] === 'codex' && a[1] === 'exec')
      expect(runs).toHaveLength(2)
      for (const argv of runs) expect(argv).toContain('read-only')
      expect(runs[0]).toContain('gpt-newer-luna')
      expect(runs[1]).toContain('gpt-newer-terra')
      expect(runs[1].join(' ')).toContain('model_reasoning_effort="high"')
      expect((seen as any).modelCalls).toEqual([])
    })
  }

  test('executor is routable like general-purpose', async ($, on) => {
    const seen = world(on, { codex: true, codexSays: 'task result' })
    let reached = false
    on('tool.call', { tool: 'Agent' }, () => ((reached = true), { result: DONE }) as never)
    const r: any = await $.tool.call({ tool: 'Agent', description: 'execute', prompt: 'Do the bounded task.', subagent_type: 'executor' } as never)
    expect(reached).toBe(false)
    expect(JSON.stringify(r)).toContain('[routed: codex terra medium, class standard]')
    expect(seen.some((a) => a[0] === 'codex' && a[1] === 'exec')).toBe(true)
  })

  test('explicit Haiku routes to Codex as standard when Codex is ready', async ($, on) => {
    const seen = world(on, { codex: true, codexSays: 'task result' })
    let reached = false
    on('tool.call', { tool: 'Agent' }, () => ((reached = true), { result: DONE }) as never)
    const r: any = await $.tool.call({ tool: 'Agent', description: 'read', prompt: 'Summarise README.md', model: 'haiku' } as never)
    expect(reached).toBe(false)
    expect(JSON.stringify(r)).toContain('[routed: codex terra medium, explicit haiku]')
    expect(seen.filter((a) => a[0] === 'codex' && a[1] === 'exec')).toHaveLength(1)
    expect((seen as any).modelCalls).toEqual([])
  })

  test('explicit Haiku is kept when Codex is not ready', async ($, on) => {
    const seen = world(on, { codex: false })
    let routed: unknown
    on('tool.call', { tool: 'Agent' }, (_$: any, e: unknown) => ((routed = e), { result: DONE }) as never)
    const spawn = { tool: 'Agent', description: 'read', prompt: 'Summarise README.md', model: 'haiku', effort: 'low' }
    await $.tool.call(spawn as never)
    expect(routed).toMatchObject(spawn)
    expect(seen.some((a) => a[0] === 'codex' && a[1] === 'exec')).toBe(false)
  })

  for (const extra of [{ name: 'worker' }, { subagent_type: 'pr-shepherd' }]) {
    test(`explicit Haiku on ${Object.keys(extra)[0]} ${Object.values(extra)[0]} keeps its definition while Codex is ready`, async ($, on) => {
      const seen = world(on, { codex: true })
      let routed: unknown
      on('tool.call', { tool: 'Agent' }, (_$: any, e: unknown) => ((routed = e), { result: DONE }) as never)
      const spawn = { tool: 'Agent', description: 'read', prompt: 'Summarise README.md', model: 'haiku', ...extra }
      await $.tool.call(spawn as never)
      expect(routed).toMatchObject(spawn)
      expect(seen.some((a) => a[0] === 'codex' && a[1] === 'exec')).toBe(false)
    })
  }

  test('Codex no-answer for explicit Haiku returns a failure hand-back', async ($, on) => {
    const seen = world(on, { codex: true })
    const nextCalls: any[] = []
    on('tool.call', { tool: 'Agent' }, (_$: any, e: unknown) => (nextCalls.push(e), { result: DONE }) as never)
    const r: any = await $.tool.call({ tool: 'Agent', description: 'read', prompt: 'Summarise README.md', model: 'haiku' } as never)
    expect(nextCalls.some((call) => call.model === 'haiku')).toBe(false)
    expect(r.result.content[0].text.startsWith('FAIL | router |')).toBe(true)
    expect((seen as any).modelCalls).toEqual([])
    expect(seen.filter((a) => a[0] === 'codex' && a[1] === 'exec')).toHaveLength(1)
  })

  test('explicit Opus and Sonnet choices pass through unchanged', async ($, on) => {
    const seen = world(on, { codex: true, codexSays: 'unused' })
    const routed: unknown[] = []
    on('tool.call', { tool: 'Agent' }, (_$: any, e: unknown) => (routed.push(e), { result: DONE }) as never)
    for (const model of ['opus', 'sonnet']) {
      const spawn = { tool: 'Agent', description: 'review', prompt: 'Review the design.', model }
      await $.tool.call(spawn as never)
    }
    expect(routed).toHaveLength(2)
    expect(routed[0]).toMatchObject({ model: 'opus' })
    expect(routed[1]).toMatchObject({ model: 'sonnet' })
    expect(seen).toEqual([])
  })

  test('Codex with no answer returns a failure hand-back without a classifier call', async ($, on) => {
    const seen = world(on, { codex: true, haikuSays: 'plan' })
    const nextCalls: any[] = []
    on('tool.call', { tool: 'Agent' }, (_$: any, e: unknown) => (nextCalls.push(e), { result: DONE }) as never)
    const spawn = { tool: 'Agent', description: 'read', prompt: 'Summarise README.md' }
    const r: any = await $.tool.call(spawn as never)
    expect(nextCalls.some((call) => call.model === 'haiku')).toBe(false)
    expect(r.result.content[0].text.startsWith('FAIL | router |')).toBe(true)
    expect(r.result.agentId).toBe('ai-delegation-codex')
    expect((seen as any).modelCalls).toEqual([])
    expect(seen.filter((a) => a[0] === 'codex' && a[1] === 'exec')).toHaveLength(2)
    expect((seen as any).calls.some((call: { argv: string[]; stdin?: string }) => call.argv[0] === 'tee' && call.stdin?.includes('route: standard codex no answer -> fail (no haiku)'))).toBe(true)
  })

  test('a failed Codex readiness probe is logged with its reason', async ($, on) => {
    const seen = world(on, { codex: false, haikuSays: 'standard' })
    on('tool.call', { tool: 'Agent' }, () => ({ result: DONE }) as never)
    await $.tool.call({ tool: 'Agent', description: 'read', prompt: 'Summarise README.md' } as never)
    expect((seen as any).uiLogs.join('\n')).toContain('Codex not ready: codex --version exited 1')
    expect((seen as any).calls.some((call: { argv: string[]; stdin?: string }) => call.argv[0] === 'tee' && call.stdin?.includes('codex not ready: codex --version exited 1'))).toBe(true)
  })

  test('empty final messages are logged with a reason before the failure hand-back', async ($, on) => {
    const seen = world(on, { codex: true, codexSays: '', haikuSays: 'standard' })
    const nextCalls: any[] = []
    on('tool.call', { tool: 'Agent' }, (_$: any, e: unknown) => (nextCalls.push(e), { result: DONE }) as never)
    const r: any = await $.tool.call({ tool: 'Agent', description: 'read', prompt: 'Summarise README.md' } as never)
    expect(nextCalls.some((call) => call.model === 'haiku')).toBe(false)
    expect(r.result.content[0].text.startsWith('FAIL | router |')).toBe(true)
    expect((seen as any).uiLogs.join('\n')).toContain('codex exec returned an empty final message')
    expect((seen as any).calls.some((call: { argv: string[]; stdin?: string }) => call.argv[0] === 'tee' && call.stdin?.includes('codex failure: codex exec returned an empty final message'))).toBe(true)
  })

  test('nonzero Codex exits are logged with a reason before the failure hand-back', async ($, on) => {
    const seen = world(on, { codex: true, codexExitCode: 7, codexSays: 'unused', haikuSays: 'standard' })
    const nextCalls: any[] = []
    on('tool.call', { tool: 'Agent' }, (_$: any, e: unknown) => (nextCalls.push(e), { result: DONE }) as never)
    const r: any = await $.tool.call({ tool: 'Agent', description: 'read', prompt: 'Summarise README.md' } as never)
    expect(nextCalls.some((call) => call.model === 'haiku')).toBe(false)
    expect(r.result.content[0].text.startsWith('FAIL | router |')).toBe(true)
    expect((seen as any).uiLogs.join('\n')).toContain('codex exec exited with code 7')
    expect((seen as any).calls.some((call: { argv: string[]; stdin?: string }) => call.argv[0] === 'tee' && call.stdin?.includes('codex failure: codex exec exited with code 7'))).toBe(true)
  })

  test('a failed temporary-file creation is logged and returned as a failure hand-back', async ($, on) => {
    const seen = world(on, { codex: true, mktempExitCode: 1, mktempStdout: 'not-a-path', haikuSays: 'standard' })
    const nextCalls: any[] = []
    on('tool.call', { tool: 'Agent' }, (_$: any, e: unknown) => (nextCalls.push(e), { result: DONE }) as never)
    const r: any = await $.tool.call({ tool: 'Agent', description: 'read', prompt: 'Summarise README.md' } as never)
    expect(nextCalls.some((call) => call.model === 'haiku')).toBe(false)
    expect(r.result.content[0].text.startsWith('FAIL | router |')).toBe(true)
    expect(seen.some((a) => a[0] === 'codex' && a[1] === 'exec')).toBe(false)
    expect((seen as any).uiLogs.join('\n')).toContain('could not create final-message file')
    expect((seen as any).calls.some((call: { argv: string[] }) => call.argv[0] === 'rm')).toBe(false)
  })

  test('without a listed Luna model the spawn gets a failure hand-back', async ($, on) => {
    const seen = world(on, { codex: true, codexSays: 'standard', haikuSays: 'standard', cache: false })
    const nextCalls: any[] = []
    on('tool.call', { tool: 'Agent' }, (_$: any, e: unknown) => (nextCalls.push(e), { result: DONE }) as never)
    const spawn = { tool: 'Agent', description: 'read', prompt: 'Summarise README.md' }
    const r: any = await $.tool.call(spawn as never)
    expect(nextCalls.some((call) => call.model === 'haiku')).toBe(false)
    expect(r.result.content[0].text.startsWith('FAIL | router |')).toBe(true)
    expect(seen.some((a) => a[0] === 'codex' && a[1] === 'exec')).toBe(false)
    expect((seen as any).modelCalls).toEqual([])
  })

  test('a named roster agent with no model passes through untouched while Codex is ready', async ($, on) => {
    const seen = world(on, { codex: true, codexSays: 'standard' })
    let routed: unknown
    on('tool.call', { tool: 'Agent' }, (_$: any, e: unknown) => ((routed = e), { result: DONE }) as never)
    const spawn = { tool: 'Agent', description: 'review', prompt: 'Review the diff.', subagent_type: 'pr-shepherd' }
    await $.tool.call(spawn as never)
    expect(routed).toMatchObject(spawn)
    expect((routed as any).model).toBeUndefined()
    expect((routed as any).effort).toBeUndefined()
    expect(seen).toEqual([])
  })

  test('a custom Haiku agent routes to Codex with its instructions', async ($, on) => {
    const seen = world(on, {
      codex: true,
      codexSays: 'task result',
      agentFiles: { 'pr-shepherd': '---\nname: pr-shepherd\nmodel: haiku\n---\nFollow the pull request review rubric.' },
    })
    let reached = false
    on('tool.call', { tool: 'Agent' }, () => ((reached = true), { result: DONE }) as never)
    const r: any = await $.tool.call({ tool: 'Agent', description: 'review', prompt: 'Review the change.', subagent_type: 'pr-shepherd' } as never)
    const calls = (seen as any).calls as { argv: string[]; stdin?: string }[]
    const codex = calls.find((call) => call.argv[0] === 'codex' && call.argv[1] === 'exec')
    expect(reached).toBe(false)
    expect(JSON.stringify(r)).toContain('[routed: codex terra medium, custom haiku agent]')
    expect(codex?.argv).toContain('workspace-write')
    expect(codex?.stdin).toContain('Follow the pull request review rubric.')
    expect(codex?.stdin).toContain('Review the change.')
    expect(calls.some((call) => call.argv[0] === 'tee' && call.stdin?.includes('route: custom pr-shepherd haiku -> codex terra medium (workspace-write)'))).toBe(true)
  })

  test('a custom Haiku agent with no Codex answer returns a failure hand-back', async ($, on) => {
    const seen = world(on, {
      codex: true,
      agentFiles: { 'pr-shepherd': '---\nname: pr-shepherd\nmodel: haiku\n---\nFollow the pull request review rubric.' },
    })
    const nextCalls: any[] = []
    on('tool.call', { tool: 'Agent' }, (_$: any, e: unknown) => (nextCalls.push(e), { result: DONE }) as never)
    const r: any = await $.tool.call({ tool: 'Agent', description: 'review', prompt: 'Review the change.', subagent_type: 'pr-shepherd' } as never)
    expect(nextCalls.some((call) => call.model === 'haiku')).toBe(false)
    expect(r.result.content[0].text.startsWith('FAIL | router |')).toBe(true)
    expect(seen.filter((a) => a[0] === 'codex' && a[1] === 'exec')).toHaveLength(1)
  })

  test('a custom Opus agent passes through untouched while Codex is ready', async ($, on) => {
    const seen = world(on, { codex: true, agentFiles: { 'pr-shepherd': '---\nmodel: opus\n---\nKeep the review focused.' } })
    let routed: unknown
    on('tool.call', { tool: 'Agent' }, (_$: any, e: unknown) => ((routed = e), { result: DONE }) as never)
    const spawn = { tool: 'Agent', description: 'review', prompt: 'Review the change.', subagent_type: 'pr-shepherd' }
    await $.tool.call(spawn as never)
    expect(routed).toMatchObject(spawn)
    expect(seen.some((a) => a[0] === 'codex' && a[1] === 'exec')).toBe(false)
  })

  test('a custom agent with no definition passes through untouched while Codex is ready', async ($, on) => {
    const seen = world(on, { codex: true })
    let routed: unknown
    on('tool.call', { tool: 'Agent' }, (_$: any, e: unknown) => ((routed = e), { result: DONE }) as never)
    const spawn = { tool: 'Agent', description: 'review', prompt: 'Review the change.', subagent_type: 'pr-shepherd' }
    await $.tool.call(spawn as never)
    expect(routed).toMatchObject(spawn)
    expect(seen.some((a) => a[0] === 'codex' && a[1] === 'exec')).toBe(false)
  })

  test('worktree isolation goes to Haiku xhigh without running Codex', async ($, on) => {
    const seen = world(on, { codex: true, codexSays: 'complex' })
    let routed: { model?: string; effort?: string; isolation?: string } = {}
    on('tool.call', { tool: 'Agent' }, (_$: any, e: any) => ((routed = e), { result: DONE }) as never)
    await $.tool.call({ tool: 'Agent', description: 'isolated edit', prompt: 'Change the isolated worktree.', isolation: 'worktree' } as never)
    expect(routed).toMatchObject({ model: 'haiku', effort: 'xhigh', isolation: 'worktree' })
    expect(seen.some((a) => a[0] === 'codex' && a[1] === 'exec')).toBe(false)
  })

  test('Codex quota exhaustion routes standard work to Haiku xhigh', async ($, on) => {
    const seen = world(on, { codex: true, quotaExitCode: 1, haikuSays: 'standard' })
    let routed: { model?: string; effort?: string } = {}
    on('tool.call', { tool: 'Agent' }, (_$: any, e: any) => ((routed = e), { result: DONE }) as never)
    await $.tool.call({ tool: 'Agent', description: 'read', prompt: 'Summarise README.md' } as never)
    expect(routed.model).toBe('haiku')
    expect(routed.effort).toBe('xhigh')
    expect(seen.some((a) => a[0] === 'codex' && a[1] === 'exec')).toBe(false)
  })

  test('a missing Codex quota command routes standard work to Haiku xhigh', async ($, on) => {
    const seen = world(on, { codex: true, quotaMissing: true, haikuSays: 'standard' })
    let routed: { model?: string; effort?: string } = {}
    on('tool.call', { tool: 'Agent' }, (_$: any, e: any) => ((routed = e), { result: DONE }) as never)
    await $.tool.call({ tool: 'Agent', description: 'read', prompt: 'Summarise README.md' } as never)
    expect(routed.model).toBe('haiku')
    expect(routed.effort).toBe('xhigh')
    expect(seen.some((a) => a[0] === 'codex' && a[1] === 'exec')).toBe(false)
  })
})

describe('session startup', () => {
  async function statusSection($: any, status: string) {
    const { sections } = await $.prompt.compose({ model: 'claude-sonnet-5-5', promptModel: 'claude-sonnet-5-5', surfaces: [], tools: [], outputStyle: null, traits: ['bare'] })
    const matches = sections.filter((section: { id: string }) => section.id === 'jpe-ai-delegation:codex-quota')
    expect(matches).toHaveLength(1)
    expect(matches[0].scope).toBe('session')
    expect(matches[0].text).toBe(`${status}\nCodex delegates: Terra medium default, Terra high for complex/plan/deep, Luna xhigh bulk, Luna max bulk-complex; capped: Haiku xhigh. Never Sonnet or Opus.`)
    expect(matches[0].text.length).toBeLessThan(200)
  }

  test('session startup stores available quota in one session prompt section', async ($, on) => {
    const seen = world(on, { codex: true })
    on('session.start', (_$: any, e: { cwd: string }) => ({ cwd: e.cwd }) as never)
    on('prompt.compose', () => ({ sections: [] }) as never)
    await $.session.start({ cwd: '/workspace' })
    await statusSection($, 'codex-quota: available')
    expect(seen.some((a) => a[0] === 'codex-quota')).toBe(true)
  })

  test('session startup reports exhausted quota', async ($, on) => {
    world(on, { codex: true, quotaExitCode: 1 })
    on('session.start', (_$: any, e: { cwd: string }) => ({ cwd: e.cwd }) as never)
    on('prompt.compose', () => ({ sections: [] }) as never)
    await $.session.start({ cwd: '/workspace' })
    await statusSection($, 'codex-quota: exhausted')
  })

  test('session startup reports unavailable quota on command failure', async ($, on) => {
    world(on, { codex: true, quotaMissing: true })
    on('session.start', (_$: any, e: { cwd: string }) => ({ cwd: e.cwd }) as never)
    on('prompt.compose', () => ({ sections: [] }) as never)
    await $.session.start({ cwd: '/workspace' })
    await statusSection($, 'codex-quota: unavailable')
  })

  test('session startup reports unexpected quota exits as unavailable', async ($, on) => {
    world(on, { codex: true, quotaExitCode: 2 })
    on('session.start', (_$: any, e: { cwd: string }) => ({ cwd: e.cwd }) as never)
    on('prompt.compose', () => ({ sections: [] }) as never)
    await $.session.start({ cwd: '/workspace' })
    await statusSection($, 'codex-quota: unavailable')
  })
})
