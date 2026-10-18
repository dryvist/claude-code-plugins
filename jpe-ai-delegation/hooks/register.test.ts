import { describe, expect, mock, test } from 'claude-code/testing'
import { CLAUDE, CODEX, DEFAULT_EFFORT, codexArgv, isRoutable, isShellCAsk, newestModel, parseVerdict, pickLabel } from './lib/policy'

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
    expect(codexArgv('read-only', 'xhigh', 'gpt-newer-luna')).toContain('gpt-newer-luna')
  })

  test('Codex uses Luna at xhigh for standard and complex; Claude fallbacks match policy', () => {
    for (const effort of ['high', 'xhigh', 'max']) expect(codexArgv('read-only', effort, 'gpt-newer-luna')).toContain(`model_reasoning_effort="${effort}"`)
    for (const effort of ['low', 'medium', 'minimal', '']) expect(() => codexArgv('read-only', effort, 'gpt-newer-luna')).toThrow()
    for (const model of ['gpt-newest-sol', 'gpt-newer-luna-mini', 'luna', 'latest', '', undefined]) expect(() => codexArgv('read-only', 'xhigh', model)).toThrow()
    expect(DEFAULT_EFFORT).toBe('xhigh')
    expect(CODEX.standard!.effort).toBe('xhigh')
    expect(CODEX.complex!.effort).toBe('xhigh')
    expect(Object.keys(CODEX)).toEqual(['standard', 'complex'])
    expect(CLAUDE.standard).toEqual({ model: 'haiku', effort: 'xhigh' })
    expect(CLAUDE.complex).toEqual({ model: 'haiku', effort: 'xhigh' })
    expect(CLAUDE.plan).toEqual({ model: 'sonnet', effort: 'high' })
    expect(CLAUDE.deep).toEqual({ model: 'sonnet', effort: 'high' })
  })
})

function world(on: any, w: { codex: boolean; quotaExitCode?: number; quotaMissing?: boolean; codexSays?: string; haikuSays?: string; cache?: boolean }) {
  mock.env(on, { HOME: '/home/test' })
  mock.clock(on)
  const seen: string[][] = []
  const modelCalls: string[] = []
  ;(seen as any).modelCalls = modelCalls
  on('fs.exists', () => ({ value: w.cache !== false }))
  on('fs.read', () => ({ value: CACHE }))
  on('ui.log', () => ({ value: undefined }))
  on('process.run', (_$: any, e: { argv: string[] }) => {
    seen.push([...e.argv])
    if (e.argv[0] === 'codex' && e.argv[1] === '--version') return { value: { ...RAN, exitCode: w.codex ? 0 : 1 } }
    if (e.argv[0] === 'codex-quota') {
      if (w.quotaMissing) return { value: { ...RAN, exitCode: 127 } }
      return { value: { ...RAN, exitCode: w.quotaExitCode ?? (w.codex ? 0 : 1) } }
    }
    if (e.argv[0] === 'codex') return { value: { ...RAN, stdout: w.codexSays ?? '' } }
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
  test('without Codex a plan task goes to Sonnet at high effort', async ($, on) => {
    world(on, { codex: false, haikuSays: 'plan' })
    let routed: { model?: string; effort?: string } = {}
    on('tool.call', { tool: 'Agent' }, (_$: any, e: any) => ((routed = e), { result: DONE }) as never)
    await $.tool.call({ tool: 'Agent', description: 'design', prompt: 'Plan the migration of the auth layer.' } as never)
    expect(routed.model).toBe('sonnet')
    expect(routed.effort).toBe('high')
  })

  test('an unclear classification defaults to Haiku xhigh when Codex is unavailable', async ($, on) => {
    world(on, { codex: false, haikuSays: 'hmm' })
    let routed: { model?: string; effort?: string } = {}
    on('tool.call', { tool: 'Agent' }, (_$: any, e: any) => ((routed = e), { result: DONE }) as never)
    await $.tool.call({ tool: 'Agent', description: 'read', prompt: 'Summarise README.md' } as never)
    expect(routed.model).toBe('haiku')
    expect(routed.effort).toBe('xhigh')
  })

  test('Codex-ready standard work runs on Codex Luna xhigh', async ($, on) => {
    const seen = world(on, { codex: true, codexSays: 'standard' })
    let reached = false
    on('tool.call', { tool: 'Agent' }, () => ((reached = true), { result: DONE }) as never)
    const r: any = await $.tool.call({ tool: 'Agent', description: 'read', prompt: 'Summarise README.md' } as never)
    expect(reached).toBe(false)
    expect(JSON.stringify(r)).toContain('[routed: codex luna xhigh, class standard]')
    expect(seen.some((a) => a[0] === 'codex' && a.includes('workspace-write'))).toBe(true)
    expect((seen as any).modelCalls).toEqual([])
  })

  test('complex Codex work uses xhigh', async ($, on) => {
    const seen = world(on, { codex: true, codexSays: 'complex' })
    on('tool.call', { tool: 'Agent' }, () => ({ result: DONE }) as never)
    await $.tool.call({ tool: 'Agent', description: 'multi-file change', prompt: 'Implement the coordinated update.' } as never)
    const runs = seen.filter((a) => a[0] === 'codex' && a[1] === 'exec')
    expect(runs.length).toBe(2)
    for (const argv of runs) expect(argv.join(' ')).toContain('model_reasoning_effort="xhigh"')
  })

  test('plan stays on Sonnet when Codex is ready and classifier is read-only', async ($, on) => {
    const seen = world(on, { codex: true, codexSays: 'plan' })
    let routed: { model?: string; effort?: string } = {}
    on('tool.call', { tool: 'Agent' }, (_$: any, e: any) => ((routed = e), { result: DONE }) as never)
    await $.tool.call({ tool: 'Agent', description: 'design', prompt: 'Plan the migration of the auth layer.' } as never)
    expect(routed.model).toBe('sonnet')
    expect(routed.effort).toBe('high')
    expect(seen.filter((a) => a[0] === 'codex' && a[1] === 'exec').every((a) => a.includes('read-only') && a.includes('gpt-newer-luna'))).toBe(true)
  })

  test('deep work uses Sonnet at high effort', async ($, on) => {
    const seen = world(on, { codex: true, codexSays: 'deep' })
    let routed: { model?: string; effort?: string } = {}
    on('tool.call', { tool: 'Agent' }, (_$: any, e: any) => ((routed = e), { result: DONE }) as never)
    await $.tool.call({ tool: 'Agent', description: 'security review', prompt: 'Assess the trust boundaries.' } as never)
    expect(routed.model).toBe('sonnet')
    expect(routed.effort).toBe('high')
  })

  test('executor is routable like general-purpose', async ($, on) => {
    const seen = world(on, { codex: true, codexSays: 'task result' })
    let reached = false
    on('tool.call', { tool: 'Agent' }, () => ((reached = true), { result: DONE }) as never)
    const r: any = await $.tool.call({ tool: 'Agent', description: 'execute', prompt: 'Do the bounded task.', subagent_type: 'executor' } as never)
    expect(reached).toBe(false)
    expect(JSON.stringify(r)).toContain('[routed: codex luna xhigh, class standard]')
    expect(seen.some((a) => a[0] === 'codex' && a[1] === 'exec')).toBe(true)
  })

  test('explicit Haiku routes to Codex as standard when Codex is ready', async ($, on) => {
    const seen = world(on, { codex: true, codexSays: 'task result' })
    let reached = false
    on('tool.call', { tool: 'Agent' }, () => ((reached = true), { result: DONE }) as never)
    const r: any = await $.tool.call({ tool: 'Agent', description: 'read', prompt: 'Summarise README.md', model: 'haiku' } as never)
    expect(reached).toBe(false)
    expect(JSON.stringify(r)).toContain('[routed: codex luna xhigh, explicit haiku]')
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

  test('Codex no-answer for explicit Haiku keeps the requested spawn unchanged', async ($, on) => {
    const seen = world(on, { codex: true })
    let routed: unknown
    on('tool.call', { tool: 'Agent' }, (_$: any, e: unknown) => ((routed = e), { result: DONE }) as never)
    const spawn = { tool: 'Agent', description: 'read', prompt: 'Summarise README.md', model: 'haiku' }
    await $.tool.call(spawn as never)
    expect(routed).toMatchObject(spawn)
    expect((routed as any).effort).toBeUndefined()
    expect((seen as any).modelCalls).toEqual([])
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

  test('ready Codex classification no-answer defaults to standard without Haiku and passes failed work through', async ($, on) => {
    const seen = world(on, { codex: true, haikuSays: 'plan' })
    let routed: unknown
    on('tool.call', { tool: 'Agent' }, (_$: any, e: unknown) => ((routed = e), { result: DONE }) as never)
    const spawn = { tool: 'Agent', description: 'read', prompt: 'Summarise README.md' }
    await $.tool.call(spawn as never)
    expect(routed).toMatchObject(spawn)
    expect((routed as any).model).toBeUndefined()
    expect((seen as any).modelCalls).toEqual([])
    expect(seen.filter((a) => a[0] === 'codex' && a[1] === 'exec')).toHaveLength(2)
  })

  test('without a listed Luna model the original spawn passes through without Haiku', async ($, on) => {
    const seen = world(on, { codex: true, codexSays: 'standard', haikuSays: 'standard', cache: false })
    let routed: unknown
    on('tool.call', { tool: 'Agent' }, (_$: any, e: unknown) => ((routed = e), { result: DONE }) as never)
    const spawn = { tool: 'Agent', description: 'read', prompt: 'Summarise README.md' }
    await $.tool.call(spawn as never)
    expect(routed).toMatchObject(spawn)
    expect(seen.some((a) => a[0] === 'codex' && a[1] === 'exec')).toBe(false)
    expect((seen as any).modelCalls).toEqual([])
  })

  test('worktree isolation stays on Claude while classification uses a read-only sandbox', async ($, on) => {
    const seen = world(on, { codex: true, codexSays: 'complex' })
    let routed: { model?: string; effort?: string; isolation?: string } = {}
    on('tool.call', { tool: 'Agent' }, (_$: any, e: any) => ((routed = e), { result: DONE }) as never)
    await $.tool.call({ tool: 'Agent', description: 'isolated edit', prompt: 'Change the isolated worktree.', isolation: 'worktree' } as never)
    expect(routed).toMatchObject({ model: 'haiku', effort: 'xhigh', isolation: 'worktree' })
    const runs = seen.filter((a) => a[0] === 'codex' && a[1] === 'exec')
    expect(runs).toHaveLength(1)
    expect(runs[0]).toContain('read-only')
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
    expect(matches[0].text).toBe(`${status}\nDelegates run on Codex Luna xhigh while available; never Haiku then.`)
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
