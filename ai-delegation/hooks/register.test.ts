import { describe, expect, mock, test } from 'claude-code/testing'
import { CODEX, codexArgv, isRoutable, isShellCAsk, newestModel, parseVerdict, pickLabel } from './lib/policy'

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
    { slug: 'gpt-6-luna', visibility: 'list' },
    { slug: 'gpt-5.6-luna', visibility: 'list' },
    { slug: 'gpt-6.1-sol', visibility: 'list' },
    { slug: 'gpt-7-luna', visibility: 'hide' },
  ],
})

describe('policy', () => {
  test('newestModel picks the highest listed version of a family', () => {
    expect(newestModel(CACHE, 'luna')).toBe('gpt-6-luna')
    expect(newestModel(CACHE, 'astra')).toBeUndefined()
  })

  test('parseVerdict accepts only a clean verdict', () => {
    expect(parseVerdict('{"verdict":"safe","reason":"no removal"}')).toEqual({ verdict: 'safe', reason: 'no removal' })
    expect(parseVerdict('```json\n{"verdict":"unsafe","reason":"rm of $HOME"}\n```')?.verdict).toBe('unsafe')
    expect(parseVerdict('{"verdict":"maybe","reason":"x"}')).toBeUndefined()
    expect(parseVerdict('safe')).toBeUndefined()
    expect(parseVerdict(undefined)).toBeUndefined()
  })

  test('pickLabel, isShellCAsk, isRoutable and codexArgv', () => {
    expect(pickLabel('Complex.')).toBe('complex')
    expect(pickLabel('no idea')).toBeUndefined()
    expect(isShellCAsk('ask', CORE_ASK.reason)).toBe(true)
    expect(isShellCAsk('ask', 'Allow this git push?')).toBe(false)
    expect(isShellCAsk('allow', CORE_ASK.reason)).toBe(false)
    expect(isRoutable({})).toBe(true)
    expect(isRoutable({ subagent_type: 'Explore' })).toBe(true)
    expect(isRoutable({ subagent_type: 'haiku-xhigh' })).toBe(false)
    expect(isRoutable({ model: 'opus' })).toBe(false)
    expect(isRoutable({ name: 'worker' })).toBe(false)
    expect(codexArgv('read-only', 'xhigh', 'gpt-6-luna')).toContain('gpt-6-luna')
  })

  test('Codex is Luna-only at high, xhigh or max, and only standard and complex work reaches it', () => {
    for (const effort of ['high', 'xhigh', 'max']) expect(codexArgv('read-only', effort, 'gpt-6-luna')).toContain(`model_reasoning_effort="${effort}"`)
    for (const effort of ['low', 'medium', 'minimal', '']) expect(() => codexArgv('read-only', effort, 'gpt-6-luna')).toThrow()
    for (const model of ['gpt-6.1-sol', 'gpt-6-sol', 'gpt-6-luna-mini', 'luna', '', undefined]) expect(() => codexArgv('read-only', 'xhigh', model)).toThrow()
    expect(Object.keys(CODEX)).toEqual(['standard', 'complex'])
    for (const c of Object.values(CODEX)) expect(['high', 'xhigh', 'max']).toContain(c!.effort)
  })
})

// A fake world: codex presence and quota, what `codex exec` and the Haiku call answer.
function world(on: any, w: { codex: boolean; codexSays?: string; haikuSays?: string; cache?: boolean }) {
  mock.env(on, { HOME: '/home/test' })
  mock.clock(on)
  const seen: string[][] = []
  on('fs.exists', () => ({ value: w.cache !== false }))
  on('fs.read', () => ({ value: CACHE }))
  on('process.run', (_$: any, e: { argv: string[] }) => {
    seen.push([...e.argv])
    if (e.argv[0] === 'codex' && e.argv[1] === '--version') return { value: { ...RAN, exitCode: w.codex ? 0 : 1 } }
    if (e.argv[0] === 'codex-quota') return { value: { ...RAN, exitCode: w.codex ? 0 : 1 } }
    if (e.argv[0] === 'codex') return { value: { ...RAN, stdout: w.codexSays ?? '' } }
    return { value: RAN }
  })
  on('model.complete', () => ({ value: { isAnswered: true, text: w.haikuSays ?? '', usage: {} } }))
  return seen
}

describe('judge', () => {
  test('safe verdict from Haiku allows when Codex is unavailable', async ($, on) => {
    world(on, { codex: false, haikuSays: '{"verdict":"safe","reason":"no removal"}' })
    on('tool.check', () => CORE_ASK as never)
    const r = await $.tool.check({ tool: 'Bash', input: { command: 'bash -c "$Z hi"' } })
    expect(r.decision).toBe('allow')
  })

  test('unsafe verdict from Codex denies with the reason', async ($, on) => {
    const seen = world(on, { codex: true, codexSays: '{"verdict":"unsafe","reason":"rm of an unset variable"}' })
    on('tool.check', () => CORE_ASK as never)
    const r = await $.tool.check({ tool: 'Bash', input: { command: 'bash -c \'rm -rf "$UNSET"/x\'' } })
    expect(r.decision).toBe('deny')
    expect(r.reason).toContain('rm of an unset variable')
    expect(seen.some((a) => a[0] === 'codex' && a.includes('read-only'))).toBe(true)
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
    let seen: { model?: string; effort?: string } = {}
    on('tool.call', { tool: 'Agent' }, (_$: any, e: any) => ((seen = e), { result: DONE }) as never)
    await $.tool.call({ tool: 'Agent', description: 'design', prompt: 'Plan the migration of the auth layer.' } as never)
    expect(seen.model).toBe('sonnet')
    expect(seen.effort).toBe('high')
  })

  test('an unclear classification defaults to Haiku xhigh', async ($, on) => {
    world(on, { codex: false, haikuSays: 'hmm' })
    let seen: { model?: string; effort?: string } = {}
    on('tool.call', { tool: 'Agent' }, (_$: any, e: any) => ((seen = e), { result: DONE }) as never)
    await $.tool.call({ tool: 'Agent', description: 'read', prompt: 'Summarise README.md' } as never)
    expect(seen.model).toBe('haiku')
    expect(seen.effort).toBe('xhigh')
  })

  test('with Codex ready the answer comes from Codex and names the route', async ($, on) => {
    const seen = world(on, { codex: true, codexSays: 'standard' })
    let reached = false
    on('tool.call', { tool: 'Agent' }, () => ((reached = true), { result: DONE }) as never)
    const r: any = await $.tool.call({ tool: 'Agent', description: 'read', prompt: 'Summarise README.md' } as never)
    expect(reached).toBe(false)
    expect(JSON.stringify(r)).toContain('[routed: codex luna xhigh, class standard]')
    expect(seen.some((a) => a[0] === 'codex' && a.includes('workspace-write'))).toBe(true)
  })

  test('a plan task stays on Claude even when Codex is ready', async ($, on) => {
    const seen = world(on, { codex: true, codexSays: 'plan' })
    let routed: { model?: string; effort?: string } = {}
    on('tool.call', { tool: 'Agent' }, (_$: any, e: any) => ((routed = e), { result: DONE }) as never)
    await $.tool.call({ tool: 'Agent', description: 'design', prompt: 'Plan the migration of the auth layer.' } as never)
    expect(routed.model).toBe('sonnet')
    expect(routed.effort).toBe('high')
    expect(seen.filter((a) => a[0] === 'codex' && a[1] === 'exec').every((a) => a.includes('read-only') && a.includes('gpt-6-luna'))).toBe(true)
  })

  test('every codex exec uses the Luna model at an allowed effort', async ($, on) => {
    const seen = world(on, { codex: true, codexSays: 'standard' })
    on('tool.call', { tool: 'Agent' }, () => ({ result: DONE }) as never)
    await $.tool.call({ tool: 'Agent', description: 'read', prompt: 'Summarise README.md' } as never)
    const runs = seen.filter((a) => a[0] === 'codex' && a[1] === 'exec')
    expect(runs.length).toBeGreaterThan(0)
    for (const a of runs) {
      expect(a[a.indexOf('-m') + 1]).toBe('gpt-6-luna')
      expect(a.join(' ')).toMatch(/model_reasoning_effort="(high|xhigh|max)"/)
    }
  })

  test('with no Luna model listed Codex is not run and Claude takes the work', async ($, on) => {
    const seen = world(on, { codex: true, codexSays: 'standard', haikuSays: 'standard', cache: false })
    let routed: { model?: string } = {}
    on('tool.call', { tool: 'Agent' }, (_$: any, e: any) => ((routed = e), { result: DONE }) as never)
    await $.tool.call({ tool: 'Agent', description: 'read', prompt: 'Summarise README.md' } as never)
    expect(seen.some((a) => a[0] === 'codex' && a[1] === 'exec')).toBe(false)
    expect(routed.model).toBe('haiku')
  })

  test('a roster agent passes through untouched', async ($, on) => {
    world(on, { codex: true, codexSays: 'standard' })
    let seen: { model?: string } = {}
    on('tool.call', { tool: 'Agent' }, (_$: any, e: any) => ((seen = e), { result: DONE }) as never)
    await $.tool.call({ tool: 'Agent', description: 'x', prompt: 'y', subagent_type: 'haiku-xhigh' } as never)
    expect(seen.model).toBeUndefined()
  })
})
