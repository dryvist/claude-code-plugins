import { describe, expect, test } from 'claude-code/testing'
import { endAnchor, jobHistory, jobState, recentFailures } from './lib/policy'
import { register } from './register'
import { CODEX, EXECUTOR_TABLE, LAST_RESORT, codexArgv, eligibleRows, mergeExecutorRows, metricsResult, peakMultiplier, quotaFromMetrics, rankRows, validRow, estimateTokens, explicitLabel, forbiddenModel, isAdvisory, localTask, mandatoryLabel, newestModel, parseVerdict, pickLocal, safePayload, scoreWindows } from './lib/policy'
import { customAgentSandbox, parseAgentDefinition } from './lib/agent-definition'
import { RECORDED_QUOTA } from './fixtures/quota-instant-query'

const RAN = { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false }
const CACHE = JSON.stringify({ models: [
  { slug: 'gpt-older-luna', visibility: 'list', priority: 9 },
  { slug: 'gpt-newer-luna', visibility: 'list', priority: 4 },
  { slug: 'gpt-newer-terra', visibility: 'list', priority: 1 },
  { slug: 'gpt-hidden-luna', visibility: 'hide', priority: 0 },
] })
const PR = { html_url: 'https://github.com/owner/project/pull/12', state: 'open', draft: false, labels: [{ name: 'human:review' }] }
const CORE_ASK = { decision: 'ask', reason: 'This shell -c script runs rm.' }
type Call = { argv: string[]; stdin?: string }
type World = {
  quota?: number; codexWindows?: unknown[]; cursorWindows?: unknown[]; now?: number; gatewayFinish?: string; quotaThrows?: boolean; cache?: boolean; codexExit?: number; answer?: string; label?: string
  env?: Record<string, string>; definition?: string; files?: Record<string, string>; fsThrows?: boolean; worktreeExit?: number; temporaryExit?: number
  repository?: unknown; properties?: unknown; githubPrivateAuth?: boolean; githubAuthDenied?: boolean; pr?: unknown; githubError?: boolean; githubInvalidJson?: boolean
  zcodeExit?: number; zcodeOutput?: string; zcodeAvailable?: boolean; zcodeThrows?: boolean; zcodeTruncated?: boolean
  sandboxRuns?: Record<string, { exit: number; output: string }>; jobStatus?: Record<string, unknown>; statusHangs?: boolean; statusExit?: number; logTail?: unknown[]; tailTruncated?: boolean
  gatewayTimeout?: boolean; gatewayStatus?: Record<string, number>; gatewayAnswer?: Record<string, string>; gatewayInvalidJson?: boolean
  quotaUrl?: string | null; quotaTimeout?: boolean; quotaText?: string; quotaSampleAge?: number
}

// Exercise the registered hooks with all IO captured; no subprocess or HTTP request escapes the fixture.
function world(w: World = {}) {
  const handlers = new Map<string, { run: Function; caught?: Function }>()
  const on = (event: string, ...args: unknown[]) => {
    const entry = { run: args[args.length - 1] as Function, caught: undefined as Function | undefined }
    handlers.set(event, entry)
    return { catch: (caught: Function) => { entry.caught = caught } }
  }
  register(on as never)
  const calls: Call[] = []
  const fetches: { url: string; body?: string }[] = []
  const quotaFetches: string[] = []
  const modelCalls: unknown[] = []
  const nextCalls: any[] = []
  const logs: string[] = []
  const env: Record<string, string> = { HOME: '/home/test', ...(w.quotaUrl === null ? {} : { AGENT_QUOTA_QUERY_URL: w.quotaUrl ?? QUOTA_BASE }), ...w.env }
  let output = ''
  let clockNow = w.now ?? 1_000_000
  const $ = {
    env: { get: async (key: string) => env[key] },
    session: { cwd: async () => '/workspace' },
    clock: { now: async () => clockNow, after: (delay: number, callback: () => void) => { if ((w.gatewayTimeout && delay >= 60_000) || (w.quotaTimeout && delay === 3_000) || (w.statusHangs && (delay === 3_000 || delay === 15_000))) queueMicrotask(callback); return { cancel() {} } } },
    ui: { log: (line: string) => logs.push(line) },
    fs: {
      exists: async (path: string) => {
        if (w.fsThrows) throw new Error('read failed')
        if (path.endsWith('/executors.json')) return w.files?.[path] !== undefined
        return path.endsWith('models_cache.json') ? w.cache !== false : w.files?.[path] !== undefined || Boolean(w.definition)
      },
      read: async (path: string) => path === '/token' ? 'test-token' : path.endsWith('models_cache.json') ? CACHE : path === '/tmp/final' ? output : w.files?.[path] ?? w.definition ?? '',
    },
    process: { run: async (argv: string[], init?: { stdin?: string }) => {
      calls.push({ argv, stdin: init?.stdin })
      if (argv[0] === 'mktemp') return { ...RAN, exitCode: w.temporaryExit ?? 0, stdout: argv[1] === '-d' ? '/tmp/worktree' : '/tmp/final' }
      if (argv[0] === 'git') return { ...RAN, exitCode: w.worktreeExit ?? 0 }
      if (argv[0] === 'codex') {
        output = init?.stdin?.startsWith('Classify the delegated task') ? w.label ?? 'standard' : w.answer ?? 'task result'
        return { ...RAN, exitCode: w.codexExit ?? 0 }
      }
      if (argv[0] === 'gh') {
        const value = argv[2].endsWith('/properties/values') ? w.properties : w.repository
        return { ...RAN, exitCode: w.githubAuthDenied ? 1 : 0, stdout: JSON.stringify(value) }
      }
      if (argv[0] === 'tail') return { ...RAN, isStdoutTruncated: w.tailTruncated ?? false, stdout: (w.logTail ?? []).map((l) => typeof l === 'string' ? l : JSON.stringify(l)).join('\n') }
      if (argv[0] === 'which') return { ...RAN, exitCode: w.zcodeAvailable === false ? 1 : 0 }
      if (argv[0] === 'zcode-job') {
        if (w.zcodeThrows) throw new Error('dispatch failed')
        if (argv[1] === 'status') { const s = w.jobStatus?.[argv[2]] ?? { state: 'running', end: '' }; return w.statusHangs ? new Promise<never>(() => {}) : { ...RAN, exitCode: w.statusExit ?? 0, stdout: typeof s === 'string' ? s : JSON.stringify(s) } }
        const run = w.sandboxRuns?.[argv[2] === '--tool' ? argv[3] : 'zcode']
        if (run) return { ...RAN, exitCode: run.exit, stdout: run.output }
        return { ...RAN, exitCode: w.zcodeExit ?? 0, stdout: w.zcodeOutput ?? `DONE|j-0123456789abcdef|${PR.html_url}\n`, isStdoutTruncated: w.zcodeTruncated ?? false }
      }
      return RAN
    } },
    http: { fetch: async (url: string, init: { body?: string }) => {
      if (url.includes('/api/v1/query?')) {
        quotaFetches.push(url)
        if (w.quotaThrows) throw new Error('quota read failed')
        if (w.quotaTimeout) return new Promise<never>(() => {})
        if (w.quotaText !== undefined) return { ok: true, text: w.quotaText }
        const quota = w.quota ?? 0
        if (quota !== 0 && quota !== 1) return { ok: false, text: '' }
        // Default: Codex available and exactly on pace (score 0); quota 1: exhausted. Cursor publishes nothing unless set.
        const at = clockNow / 1000 - (w.quotaSampleAge ?? 60)
        const codex = w.codexWindows ?? [{ kind: 'weekly', used_percent: quota === 1 ? 100 : 50, window_seconds: 2000, reset_at: 2000 }]
        return { ok: true, text: JSON.stringify(instantQuery([...series('codex', codex, at), ...(w.cursorWindows ? series('cursor', w.cursorWindows, at) : [])])) }
      }
      fetches.push({ url, body: init.body })
      if (url.startsWith('https://api.github.com/repos/')) {
        if (w.githubError) throw new Error('visibility unavailable')
        const value = url.includes('/properties/values') ? w.properties ?? [] : url.includes('/pulls/') ? w.pr ?? PR : w.repository ?? { visibility: 'public', private: false }
        return { ok: !(w.githubPrivateAuth && !url.includes('/pulls/')), text: w.githubInvalidJson ? '{' : JSON.stringify(value) }
      }
      if (url.endsWith('/model/info')) return { ok: true, text: JSON.stringify({ data: [
        { model_name: 'small', model_info: { max_input_tokens: 32768 } },
        { model_name: 'local-only', model_info: { max_input_tokens: 131072 } },
        { model_name: 'small-homelab', model_info: { max_input_tokens: 9_999_999 } },
      ] }) }
      const body = JSON.parse(init.body ?? '{}')
      if (url.endsWith('/systemone')) return { ok: true, text: JSON.stringify({ answers: { route: { choice: w.label ?? 'standard', answer_confidence: 1 } } }) }
      if (w.gatewayTimeout) return new Promise<never>(() => {})
      const status = w.gatewayStatus?.[body.model] ?? 200
      return { ok: status === 200, text: w.gatewayInvalidJson ? '{' : JSON.stringify({ choices: [{ finish_reason: w.gatewayFinish ?? 'stop', message: { content: w.gatewayAnswer?.[body.model] ?? 'gateway result' } }] }) }
    } },
    model: { complete: async (input: unknown) => { modelCalls.push(input); return { isAnswered: true, text: w.answer ?? '' } } },
  }
  async function invoke(event: string, e: unknown, core: unknown = { result: { content: [{ text: 'haiku result' }] } }) {
    const handler = handlers.get(event)!
    const next = async (value: unknown) => { nextCalls.push(value); return core }
    try { return await handler.run($, e, next) } catch (error) {
      if (!handler.caught) throw error
      return handler.caught($, e, next)
    }
  }
  return { calls, fetches, quotaFetches, modelCalls, nextCalls, logs, invoke, setNow: (ms: number) => { clockNow = ms },
    agent: (e: Record<string, unknown> = {}) => invoke('tool.call', { tool: 'Agent', description: '[class: standard]', prompt: 'Implement the change.', ...e }),
  }
}
const text = (r: any): string => r.result.content[0].text
const runs = (w: ReturnType<typeof world>) => w.calls.filter((c) => c.argv[0] === 'codex' && c.argv[1] === 'exec')
const gateways = { LITELLM_LOCAL_BASE_URL: 'http://localhost:8000', AGENT_ROUTE_GLM_MODEL: 'configured-glm', AGENT_ROUTE_OPENCODE_GO_MODEL: 'configured-go' }
const coding = { description: '[class: public] [repo: owner/project] [task: code]', prompt: 'Implement the change.' }
const textTask = { description: '[class: text]', prompt: 'Summarize this supplied text: A small change.' }
// A placeholder name for the metrics store's proxied route; no address.
const QUOTA_BASE = 'https://quota.example.test'
const QUERY_URL = `${QUOTA_BASE}/api/v1/query?query=${encodeURIComponent('{__name__=~"agent_quota_(used_percent|window_seconds|reset_timestamp_seconds)"}')}`
const instantQuery = (result: unknown[]) => ({ status: 'success', data: { resultType: 'vector', result } })
// The three gauges of each window, as one publisher sample at `at` seconds.
function series(executor: string, windows: any[], at: number, source = 'provider') {
  return windows.flatMap((w, i) => ([['used_percent', w.used_percent], ['window_seconds', w.window_seconds], ['reset_timestamp_seconds', w.reset_at]] as const)
    .filter(([, v]) => v !== undefined)
    .map(([name, v]) => ({ metric: { __name__: `agent_quota_${name}`, executor, window: w.kind ?? `w${i}`, source }, value: [at, String(v)] })))
}
const routeEvents = (w: ReturnType<typeof world>) => w.calls.filter((c) => c.argv[0] === 'tee' && c.stdin?.startsWith('{')).flatMap((c) => c.stdin!.trim().split('\n')).map((l) => JSON.parse(l))
const nonGithub = (w: ReturnType<typeof world>) => w.fetches.filter((f) => !f.url.startsWith('https://api.github.com/'))

describe('policy', () => {
  test('exact class routes and newest listed model per family', () => {
    expect(CODEX).toEqual({ bulk: { family: 'luna', effort: 'xhigh' }, 'bulk-complex': { family: 'luna', effort: 'max' }, standard: { family: 'luna', effort: 'xhigh' }, complex: { family: 'luna', effort: 'max' }, plan: { family: 'luna', effort: 'xhigh' }, deep: { family: 'luna', effort: 'xhigh' } })
    expect(newestModel(CACHE, 'luna')).toBe('gpt-newer-luna')
    expect(newestModel(CACHE, 'terra')).toBe('gpt-newer-terra')
    expect(newestModel(CACHE, 'missing')).toBeUndefined()
    expect(LAST_RESORT).toEqual({ model: 'haiku', effort: 'xhigh' })
  })
  for (const [label, route] of Object.entries(CODEX)) {
    test(`command builder accepts ${label} and binds family, effort and output`, () => {
      const argv = codexArgv('read-only', route, `gpt-newer-${route.family}`, '/tmp/out')
      expect(argv).toContain(`model_reasoning_effort="${route.effort}"`)
      expect(argv.slice(-3)).toEqual(['-o', '/tmp/out', '-'])
    })
  }
  test('command builder rejects any non-Luna family, unsupported efforts and missing output', () => {
    for (const effort of ['', 'ultra', 'high', 'medium']) expect(() => codexArgv('read-only', { family: 'luna', effort }, 'gpt-luna', '/tmp/out')).toThrow()
    for (const model of [undefined, '', 'gpt-sol', 'gpt-luna-mini']) expect(() => codexArgv('read-only', CODEX.bulk, model, '/tmp/out')).toThrow()
    expect(() => codexArgv('read-only', { family: 'terra', effort: 'high' } as never, 'gpt-terra', '/tmp/out')).toThrow()
    expect(() => codexArgv('read-only', CODEX.bulk, 'gpt-terra', '/tmp/out')).toThrow()
    expect(() => codexArgv('read-only', CODEX.bulk, 'gpt-luna', '')).toThrow()
  })
  test('labels, advisory classes and verdict parsing remain strict', () => {
    expect(explicitLabel('[class: bulk-complex]')).toBe('bulk-complex')
    expect(explicitLabel('[class: public]')).toBeUndefined()
    expect(isAdvisory('plan')).toBe(true)
    expect(isAdvisory('deep')).toBe(true)
    expect(isAdvisory('complex')).toBe(false)
    expect(parseVerdict('{"verdict":"safe","reason":"bounded"}')).toEqual({ verdict: 'safe', reason: 'bounded' })
    expect(parseVerdict('{"verdict":"maybe","reason":"x"}')).toBeUndefined()
  })
})

describe('custom agent tool authority', () => {
  for (const model of ['"ha\\x69ku"', '"ha\\u0069ku"', '"ha\\U00000069ku"']) {
    test(`YAML model escapes preserve inherited routing: ${model}`, async () => {
      for (const quota of [0, 1]) {
        const w = world({ quota, definition: `---\nmodel: ${model}\n---\nImplement the requested change.` })
        expect(text(await w.agent({ ...coding, subagent_type: 'worker' }))).toContain('routed: zcode-job sandbox')
        expect(w.calls.some((c) => c.argv[0] === 'zcode-job')).toBe(true)
      }
    })
  }
  test('YAML model escapes retain the forbidden-model guard', async () => {
    const w = world({ definition: '---\nmodel: "o\\x70us"\n---\nReview changes.' })
    expect(text(await w.agent({ subagent_type: 'reviewer' }))).toContain('subagents are forbidden')
    expect(w.calls).toEqual([])
    expect(w.nextCalls).toEqual([])
  })
  for (const fields of [
    '  tools: [Read]', '{"tools": [Read]}', "  'disallowedTools' : [Bash]", 'model: "ha\\qiku"', '  model: opus',
    ...['"tools"', "'tools' ", '"too\\u006cs" ', '"\\x74ools" '].map((key) => `${key}: [Read]`),
    ...['"disallowedTools" ', "'disallowedTools'\t"].map((key) => `tools: [Read, Bash]\n${key}: [Bash]`),
    ...['"model" ', "'model'\t", '"mo\\x64el"'].map((key) => `${key}: opus`),
    '? tools\n: [Read]', '? "to\\\n  ols"\n: [Read]', '? "mo\\\n  del"\n: opus',
    '"to\\x6fls": [Read]', '  name: reviewer\n  tools: [Read]', 'model: haiku\nmodel: opus',
    'defaults: &defaults {model: opus}\n<<: *defaults',
  ]) {
    test(`unreadable policy reports a closed route at every quota: ${fields}`, async () => {
      for (const quota of [0, 1]) {
        const w = world({ quota, env: gateways, definition: `---\n${fields}\n---\nPerform the task.` })
        expect(text(await w.agent({ ...coding, subagent_type: 'worker' }))).toContain('model or tool restrictions could not be read')
        expect(w.calls).toEqual([])
        expect(w.nextCalls).toEqual([])
        expect(w.fetches).toEqual([])
      }
    })
  }
  for (const key of ['tools ', 'tools\t']) {
    for (const tools of ['[Read, Grep, Glob]', '# file reads\n  - Read # supplied files\n  # search helpers\n  - Grep\n\n  - Glob']) {
      test(`spaced plain keys preserve the read-only allowlist: ${key}; ${tools}`, async () => {
        const definition = `---\nmodel: haiku\n${key}: ${tools}\n---\nRead the supplied files.`
        expect(parseAgentDefinition(definition).tools).toEqual(['Read', 'Grep', 'Glob'])
        for (const quota of [0, 1]) {
          const w = world({ quota, env: gateways, definition })
          await w.agent({ ...coding, description: `[class: standard] ${coding.description}`, subagent_type: 'reviewer' })
          if (quota === 0) {
            expect(runs(w)).toHaveLength(1)
            expect(runs(w)[0].argv).toContain('read-only')
            expect(runs(w)[0].argv).not.toContain('workspace-write')
            expect(w.nextCalls).toEqual([])
          } else {
            expect(runs(w)).toEqual([])
            expect(w.nextCalls[0]).toMatchObject({ subagent_type: 'reviewer', model: 'haiku', effort: 'xhigh' })
          }
          expect(w.calls.some((c) => c.argv[0] === 'zcode-job')).toBe(false)
          expect(w.fetches).toEqual([])
        }
      })
    }
  }
  for (const key of ['disallowedTools ', 'disallowedTools\t']) {
    for (const tools of ['[Bash]', '# no shell\n  - Bash # retain native enforcement']) {
      test(`spaced plain denials remove Bash from a write-capable agent: ${key}; ${tools}`, async () => {
        const definition = `---\nmodel: haiku\ntools: [Read, Bash]\n${key}: ${tools}\n---\nPerform the task.`
        expect(parseAgentDefinition(definition).disallowedTools).toEqual(['Bash'])
        for (const quota of [0, 1]) {
          const w = world({ quota, env: gateways, definition })
          const call = { ...coding, subagent_type: 'worker' }
          await w.agent(call)
          expect(runs(w)).toEqual([])
          expect(w.nextCalls).toEqual([{ tool: 'Agent', ...call }])
          expect(w.calls.some((c) => c.argv[0] === 'zcode-job')).toBe(false)
          expect(w.fetches).toEqual([])
        }
      })
    }
  }
  for (const key of ['model ', 'model\t']) {
    test(`spaced plain model keys retain the forbidden-model guard: ${key}`, async () => {
      const definition = `---\n${key}: opus\ntools: [Read]\n---\nRead the supplied files.`
      expect(parseAgentDefinition(definition).model).toBe('opus')
      const w = world({ definition })
      expect(text(await w.agent({ subagent_type: 'reviewer' }))).toContain('subagents are forbidden')
      expect(w.calls).toEqual([])
      expect(w.nextCalls).toEqual([])
    })
  }
  for (const tools of ['Read, Grep, Glob', '"Read, Grep, Glob"', '[Read, Grep, Glob]', '["Read", "Grep", "Glob"]', "['Read', 'Grep', 'Glob']", '\n  - Read\n  - Grep\n  - Glob', '# file reads\n  - Read\n  - Grep\n  - Glob']) {
    test(`read-only allowlist selects the Codex read-only sandbox: ${tools}`, async () => {
      const w = world({ definition: `---\nmodel: haiku\ntools: ${tools}\n---\nRead the supplied files.` })
      await w.agent({ subagent_type: 'reviewer' })
      expect(runs(w)).toHaveLength(1)
      expect(runs(w)[0].argv).toContain('read-only')
      expect(runs(w)[0].argv).not.toContain('workspace-write')
      expect(w.nextCalls).toEqual([])
    })
  }
  for (const tools of ['Bash', 'Edit, Bash', 'Write, Bash', 'NotebookEdit, Bash']) {
    test(`${tools} permits workspace-write while advisory work stays read-only`, async () => {
      for (const label of ['standard', 'plan']) {
        const w = world({ definition: `---\nmodel: haiku\ntools: [Read, ${tools}]\n---\nPerform the task.` })
        await w.agent({ subagent_type: 'worker', description: `[class: ${label}]` })
        expect(runs(w)[0].argv).toContain(label === 'plan' ? 'read-only' : 'workspace-write')
      }
    })
  }
  for (const tool of ['Edit', 'Write', 'NotebookEdit']) {
    test(`${tool} without Bash stays native because workspace-write carries a shell`, async () => {
      for (const quota of [0, 1]) {
        const w = world({ quota, definition: `---\nmodel: haiku\ntools: [Read, ${tool}]\n---\nPerform the task.` })
        await w.agent({ subagent_type: 'worker' })
        expect(runs(w)).toEqual([])
        expect(w.nextCalls[0]).toMatchObject({ subagent_type: 'worker', prompt: 'Implement the change.' })
      }
    })
  }
  for (const tools of ['mcp__tracker__*', '[mcp__tracker__get*]', '[Read, mcp__tracker__get]', '[WebFetch]', '[Agent]', '[Bash(git:*)]', '[Read, Bash(git:*)]', '[]']) {
    for (const quota of [0, 1]) {
      test(`native-only tools preserve the custom type and prompt at quota ${quota}: ${tools}`, async () => {
        const w = world({ quota, env: gateways, definition: `---\nmodel: haiku\ntools: ${tools}\n---\nFollow the native instructions.` })
        const call = { ...coding, subagent_type: 'tracker-specialist', model: 'haiku', isolation: 'worktree' }
        await w.agent(call)
        expect(w.nextCalls).toEqual([{ tool: 'Agent', ...call }])
        expect(w.calls.map((c) => c.argv)).toEqual([['tee', '-a', '/home/test/.claude/ai-delegation.log']])
        expect(w.fetches).toEqual([])
      })
    }
  }
  for (const tools of [
    'Bash(git:*), Read', '"Bash(git:*), Read"', '[Bash(git:*), Read]',
    '["Bash(echo a,b:*)", Read]', "['Read(src/[ab](copy)*.ts)', Bash]",
    '\n  - "Bash(echo # tag:*)"\n  - Read',
  ]) {
    test(`selectors parse without broadening their native authority: ${tools}`, async () => {
      const definition = `---\nmodel: haiku\ntools: ${tools}\n---\nPerform the task.`
      const parsed = parseAgentDefinition(definition)
      expect(parsed.tools).toHaveLength(2)
      expect(customAgentSandbox(parsed)).toBeUndefined()
      const w = world({ definition })
      await w.agent({ subagent_type: 'worker' })
      expect(w.nextCalls[0]).toMatchObject({ subagent_type: 'worker', prompt: 'Implement the change.' })
      expect(runs(w)).toEqual([])
    })
  }
  for (const fields of ['disallowedTools: Bash', 'disallowedTools: [Write, Edit]', 'disallowedTools: [Bash(git:*)]', 'disallowedTools: mcp__tracker__*', 'tools: [Read, Bash]\ndisallowedTools:\n  - Bash']) {
    test(`per-tool denials stay with the native custom agent: ${fields}`, async () => {
      const w = world({ definition: `---\nmodel: haiku\n${fields}\n---\nPerform the task.` })
      await w.agent({ subagent_type: 'reviewer' })
      expect(runs(w)).toEqual([])
      expect(w.nextCalls[0]).toMatchObject({ subagent_type: 'reviewer' })
    })
  }
  for (const fields of ['tools: [Read, Grep, Glob]', 'tools: [Read, Write, Bash]']) {
    test(`capped restricted agents retain their type and skip sandbox jobs: ${fields}`, async () => {
      const w = world({ quota: 1, env: gateways, definition: `---\nmodel: inherit\n${fields}\n---\nFollow the custom instructions.` })
      await w.agent({ ...coding, subagent_type: 'reviewer' })
      expect(w.nextCalls[0]).toMatchObject({ ...coding, subagent_type: 'reviewer', model: 'haiku', effort: 'xhigh' })
      expect(w.calls.some((c) => c.argv[0] === 'zcode-job')).toBe(false)
      expect(w.fetches).toEqual([])
    })
  }
  test('omitting tools keeps unrestricted sandbox eligibility at every quota', async () => {
    for (const quota of [0, 1]) {
      const w = world({ quota, definition: '---\nmodel: haiku\n---\nImplement the requested change.' })
      expect(text(await w.agent({ ...coding, subagent_type: 'worker' }))).toContain('routed: zcode-job sandbox')
      expect(w.calls.find((c) => c.argv[0] === 'zcode-job')?.argv.slice(0, 3)).toEqual(['zcode-job', 'start', 'owner/project'])
    }
  })
  for (const model of ['sonnet', 'opus', 'fable', 'inherit', undefined]) {
    test(`native-only tools fail closed for an unverifiable or forbidden model: ${model}`, async () => {
      const w = world({ definition: `---\n${model ? `model: ${model}\n` : ''}tools: mcp__tracker__*\n---\nPerform the task.` })
      expect(text(await w.agent({ subagent_type: 'tracker-specialist' }))).toStartWith('FAIL | router |')
      expect(w.nextCalls).toEqual([])
      expect(runs(w)).toEqual([])
    })
  }
  test('an explicit permitted override makes an inherited native model verifiable', async () => {
    const w = world({ definition: '---\nmodel: inherit\ntools: mcp__tracker__*\n---\nPerform the task.' })
    await w.agent({ subagent_type: 'tracker-specialist', model: 'haiku' })
    expect(w.nextCalls[0]).toMatchObject({ subagent_type: 'tracker-specialist', model: 'haiku' })
  })
  for (const fields of [
    'tools: [Read', 'tools: null', 'tools: true', 'tools:', 'tools: {allow: Read}',
    'tools: &allowed [Read]', 'tools: *allowed', 'tools: [Read]\ntools: [Write]',
    'tools: [Read]\n"tools": [Write]', 'tools: [Read]\ndisallowedTools: null',
    'tools: [Read]\n  disallowedTools: Bash',
    'tools: mcp__tracker__get*unexpected', 'tools: Read,', 'tools: Bash(git:*',
    'tools: ["Read", "Bash(git:*)]', 'tools: [Read,, Write]',
    'tools : [Read', '"tools" : null', "'tools : [Read]", '"tools : [Read]',
    'tools: [Read]\n"tools" : [Write]', 'disallowedTools : {deny: Bash}',
    '  tools: [Read]', '{tools: [Read]}', "  'tools' : [Read]",
    '{"disallowedTools" : [Bash]}', '  "too\\x6cs": [Read]',
    '  model: haiku', '{model: haiku}', 'model: "ha\\qiku"',
    'model: |\n  haiku',
  ]) {
    test(`ambiguous policy frontmatter never reaches an executor: ${fields}`, async () => {
      const w = world({ definition: `---\n${fields}\n---\nPerform the task.` })
      expect(text(await w.agent({ subagent_type: 'reviewer' }))).toStartWith('FAIL | router |')
      expect(w.calls).toEqual([])
      expect(w.nextCalls).toEqual([])
    })
  }
  test('an unterminated frontmatter block fails closed', async () => {
    const w = world({ definition: '---\nmodel: haiku\ntools: [Read]\nPerform the task.' })
    expect(text(await w.agent({ subagent_type: 'reviewer' }))).toStartWith('FAIL | router |')
    expect(w.calls).toEqual([])
    expect(w.nextCalls).toEqual([])
  })
  test('CRLF, comments and folded metadata preserve the allowlist', async () => {
    const w = world({ definition: '---\r\nmodel: "haiku" # permitted\r\ndescription: >\r\n  Inspect the repository.\r\ntools: [Read, Grep, Glob] # file reads\r\n---\r\nFollow the rubric.' })
    await w.agent({ subagent_type: 'reviewer' })
    expect(runs(w)[0].argv).toContain('read-only')
    expect(runs(w)[0].stdin).toContain('Follow the rubric.')
  })
  for (const metadata of [
    "description: Review the user's changes",
    'description: "Review: the supplied changes"',
    "description: 'Review the user''s changes'",
    'description: Review the supplied changes\n  and report the results.',
    'description: "Review the supplied changes\n  and report the results."',
    'description: |\n  Review the supplied changes.\n  Report the results.',
    'description: >-\n  Review the supplied changes\n  and report the results.',
    'metadata:\n  tags: [review, "code: changes"]',
    'metadata: {tags: [review, "code: changes"]}',
    'description: |\n  Review the supplied changes.\n  tools: Bash\n  model: opus',
    'metadata:\n  tools: [Bash]\n  model: opus\n  tags: [review, "code: changes"]',
    String.raw`description: 'Check "C:\path": text'`,
    'metadata: {tools: [Bash], model: opus}',
  ]) {
    for (const tools of ['', 'tools: [Read, Grep, Glob]\n', 'tools:\n  - Read\n  - Grep\n  - Glob\n']) {
      test(`unrelated metadata preserves inherited or restricted routing: ${metadata}; ${tools}`, async () => {
        const definition = `---\n${metadata}\nmodel: "haiku"\n${tools}---\nFollow the rubric.`
        const parsed = parseAgentDefinition(definition)
        expect(parsed.model).toBe('haiku')
        expect(parsed.tools).toEqual(tools ? ['Read', 'Grep', 'Glob'] : undefined)
        expect(parsed.disallowedTools).toBeUndefined()
        const w = world({ definition })
        await w.agent({ subagent_type: 'reviewer' })
        expect(runs(w)).toHaveLength(1)
        expect(runs(w)[0].argv).toContain(tools ? 'read-only' : 'workspace-write')
        expect(runs(w)[0].stdin).toContain('Follow the rubric.')
        expect(w.nextCalls).toEqual([])
      })
    }
  }
})

describe('Codex rung', () => {
  for (const [label, route] of Object.entries(CODEX)) {
    test(`${label} executes its assigned model and sandbox`, async () => {
      const w = world()
      expect(text(await w.agent({ description: `[class: ${label}]` }))).toContain(`codex ${route.family} ${route.effort}`)
      expect(runs(w)).toHaveLength(1)
      expect(runs(w)[0].argv).toContain(`gpt-newer-${route.family}`)
      expect(runs(w)[0].argv).toContain(isAdvisory(label as never) ? 'read-only' : 'workspace-write')
      expect(w.quotaFetches).toEqual([QUERY_URL])
      expect(w.nextCalls).toEqual([])
    })
  }
  for (const topic of ['auth', 'secrets', 'router', 'memory', 'cluster']) {
    test(`${topic} overrides an explicit standard class and names bulk-complex`, async () => {
      const w = world()
      const r = await w.agent({ prompt: `Implement ${topic} support using placeholders.` })
      expect(mandatoryLabel(`${topic} work`)).toBe('bulk-complex')
      expect(text(r)).toContain('codex luna max, class bulk-complex')
      expect(runs(w)).toHaveLength(1)
    })
  }
  for (const label of ['plan', 'deep']) {
    test(`mandatory auth classification preserves explicit ${label} sandbox`, async () => {
      const w = world()
      expect(text(await w.agent({ description: `[class: ${label}]`, prompt: 'Review authentication design using placeholders.' }))).toContain('codex luna max, class bulk-complex')
      expect(runs(w)).toHaveLength(1)
      expect(runs(w)[0].argv).toContain('read-only')
      expect(runs(w)[0].argv).not.toContain('workspace-write')
    })
  }
  test('tagged public coding takes the sandbox rung before Codex', async () => {
    const w = world()
    expect(text(await w.agent(coding))).toContain('routed: zcode-job sandbox')
    expect(runs(w)).toEqual([])
    expect(w.fetches.map((f) => f.url)).toEqual(['https://api.github.com/repos/owner/project', 'https://api.github.com/repos/owner/project/pulls/12'])
  })
  test('untagged public work still classifies onto Codex Luna', async () => {
    const w = world({ env: gateways })
    expect(text(await w.agent({ description: '[class: public] [repo: owner/project]' }))).toContain('codex luna xhigh')
    expect(w.calls.some((c) => c.argv[0] === 'zcode-job')).toBe(false)
    expect(w.fetches.filter((f) => !f.url.endsWith('/systemone'))).toEqual([])
  })
  test('untagged reads and triage use classifier bulk and Luna xhigh', async () => {
    const w = world({ label: 'bulk' })
    expect(text(await w.agent({ description: 'read and triage', prompt: 'Read the README.' }))).toContain('codex luna xhigh')
    expect(runs(w)).toHaveLength(2)
    expect(runs(w)[0].stdin).toContain('bulk: bulk work, reads and triage.')
  })
  test('classification itself stays on Codex while quota is available', async () => {
    const w = world({ env: gateways, label: 'complex' })
    expect(text(await w.agent({ description: 'coordinated change' }))).toContain('codex luna max')
    expect(runs(w)).toHaveLength(2)
    expect(runs(w)[0].argv).toContain('gpt-newer-luna')
    expect(runs(w)[1].argv).toContain('gpt-newer-luna')
    expect(w.fetches).toEqual([])
    expect(w.quotaFetches).toEqual([QUERY_URL])
  })
  for (const subagent_type of ['Explore', 'Plan']) {
    test(`${subagent_type} remains read-only on Luna xhigh`, async () => {
      const w = world()
      await w.agent({ description: 'advisory', subagent_type })
      expect(runs(w)[0].argv).toContain('read-only')
      expect(runs(w)[0].argv).toContain('gpt-newer-luna')
    })
  }
  test('worktree isolation creates an isolated checkout on Codex', async () => {
    const w = world()
    expect(text(await w.agent({ isolation: 'worktree' }))).toContain('worktree /tmp/worktree')
    expect(w.calls.find((c) => c.argv[0] === 'git')?.argv).toEqual(['git', '-C', '/workspace', 'worktree', 'add', '--detach', '/tmp/worktree', 'HEAD'])
    expect(runs(w)[0].argv.slice(0, 4)).toEqual(['codex', 'exec', '-C', '/tmp/worktree'])
    expect(w.nextCalls).toEqual([])
  })
  for (const options of [{ worktreeExit: 1 }, { temporaryExit: 1 }, { cache: false }, { answer: '' }, { codexExit: 7 }]) {
    test(`Codex failure continues to Haiku: ${JSON.stringify(options)}`, async () => {
      const w = world({ ...options, env: gateways })
      const isolation = options.worktreeExit ? 'worktree' : undefined
      expect(text(await w.agent({ isolation }))).toBe('haiku result')
      expect(w.nextCalls[0]).toMatchObject({ model: 'haiku', effort: 'xhigh', ...(isolation ? { isolation } : {}) })
      expect(w.fetches).toEqual([])
      expect(routeEvents(w).at(-1)).toMatchObject({ chosen: 'haiku', fell_through_from: ['codex'] })
    })
  }
  for (const options of [{ quota: 127 }, { quota: 2 }, { quotaThrows: true }]) {
    test(`unknown quota keeps the static order and still tries Codex: ${JSON.stringify(options)}`, async () => {
      const w = world(options)
      expect(text(await w.agent())).toContain('codex luna xhigh')
      expect(routeEvents(w).at(-1)).toMatchObject({ chosen: 'codex', scores: { codex: null } })
    })
  }
})

describe('model and payload guards', () => {
  for (const model of ['sonnet', 'opus', 'fable', 'claude-opus-4-6', 'anthropic/claude-sonnet-5']) {
    test(`explicit and custom ${model} are denied`, async () => {
      expect(forbiddenModel(model)).toBe(true)
      for (const custom of [false, true]) {
        const w = world({ definition: `---\nmodel: ${model}\n---\nReview the change.` })
        expect(text(await w.agent(custom ? { subagent_type: 'reviewer' } : { model }))).toContain('subagents are forbidden')
        expect(w.calls).toEqual([])
        expect(w.nextCalls).toEqual([])
      }
    })
  }
  test('explicit Haiku and named spawns still follow the class route', async () => {
    const w = world()
    expect(text(await w.agent({ model: 'haiku', name: 'worker', effort: 'max' }))).toContain('codex luna xhigh')
    expect(w.nextCalls).toEqual([])
  })
  test('custom Haiku instructions are preserved on Codex', async () => {
    const w = world({ definition: '---\nmodel: haiku\n---\nFollow the review rubric.' })
    expect(text(await w.agent({ subagent_type: 'reviewer' }))).toContain('codex luna xhigh')
    expect(runs(w)[0].stdin).toContain('Follow the review rubric.')
  })
  test('missing or unreadable custom definitions fail closed', async () => {
    for (const options of [{}, { fsThrows: true }]) {
      const w = world(options)
      expect(text(await w.agent({ subagent_type: 'reviewer' }))).toStartWith('FAIL | router |')
      expect(w.nextCalls).toEqual([])
    }
  })
  for (const payload of ['password: sensitive-value', '{"password":"actual-value"}', '{"passwd": "actual-value"}', '{"token":"actual-value"}', '{"api_key":"actual-value"}', '{"secret-key":"actual-value"}', "'password': 'actual-value'", 'Authorization: Bearer example-value', '-----BEGIN PRIVATE KEY-----', 'ansible_host: 192.0.2.1', '[content: incident] details', 'outage timeline: details', 'token=abc123', 'ghp_abcdefghijklmnop']) {
    test(`prohibited payload never reaches any executor: ${payload.split(':')[0]}`, async () => {
      expect(safePayload(payload)).toBe(false)
      for (const quota of [0, 1]) {
        const w = world({ quota, env: gateways })
        expect(text(await w.agent({ ...coding, prompt: payload }))).toContain('prohibited content')
        expect(w.calls).toEqual([])
        expect(w.fetches).toEqual([])
        expect(w.nextCalls).toEqual([])
      }
    })
  }
  for (const model of ['haiku', 'sonnet', undefined]) {
    test(`installed plugin agent ${model} definition is loaded and screened`, async () => {
      const w = world({ files: {
        '/home/test/.claude/plugins/installed_plugins.json': JSON.stringify({ version: 2, plugins: {
          'codeql-resolver@marketplace': [{ scope: 'user', installPath: '/plugins/codeql-resolver' }],
        } }),
        '/plugins/codeql-resolver/agents/codeql-permissions-auditor.md': `---\nname: CodeQL Permissions Auditor\n${model ? `model: ${model}\n` : ''}---\nFollow the plugin review rubric.`,
      } })
      const r = await w.agent({ subagent_type: 'codeql-resolver:codeql-permissions-auditor' })
      expect(text(r)).toContain(model !== 'sonnet' ? 'codex luna xhigh' : 'subagents are forbidden')
      if (model !== 'sonnet') expect(runs(w)[0].stdin).toContain('Follow the plugin review rubric.')
      else expect(w.calls).toEqual([])
      expect(w.nextCalls).toEqual([])
    })
  }
  for (const options of [
    { registry: '{', definition: true },
    { registry: JSON.stringify({ version: 2, plugins: {} }), definition: true },
    { registry: JSON.stringify({ version: 2, plugins: { 'codeql-resolver@marketplace': [{ scope: 'user', installPath: '/plugins/codeql-resolver' }] } }), definition: false },
    { registry: JSON.stringify({ version: 2, plugins: { 'codeql-resolver@marketplace': [{ scope: 'project', projectPath: '/other-project', installPath: '/plugins/codeql-resolver' }] } }), definition: true },
  ]) {
    test(`unverifiable plugin definitions fail closed: ${JSON.stringify(options)}`, async () => {
      const w = world({ env: gateways, files: {
        '/home/test/.claude/plugins/installed_plugins.json': options.registry,
        ...(options.definition ? { '/plugins/codeql-resolver/agents/codeql-permissions-auditor.md': '---\nmodel: haiku\n---\nFollow the plugin rubric.' } : {}),
      } })
      expect(text(await w.agent({ subagent_type: 'codeql-resolver:codeql-permissions-auditor' }))).toStartWith('FAIL | router |')
      expect(w.calls).toEqual([])
      expect(w.fetches).toEqual([])
      expect(w.nextCalls).toEqual([])
    })
  }
  test('project plugin installation precedes the user installation', async () => {
    const w = world({ env: { CLAUDE_CONFIG_DIR: '/config' }, files: {
      '/config/plugins/installed_plugins.json': JSON.stringify({ version: 2, plugins: { 'codeql-resolver@marketplace': [
        { scope: 'user', installPath: '/plugins/user' },
        { scope: 'project', projectPath: '/workspace', installPath: '/plugins/project' },
      ] } }),
      '/plugins/user/agents/codeql-permissions-auditor.md': '---\nmodel: sonnet\n---\nWrong installation.',
      '/plugins/project/agents/codeql-permissions-auditor.md': '---\nmodel: haiku\n---\nFollow the project plugin rubric.',
    } })
    expect(text(await w.agent({ subagent_type: 'codeql-resolver:codeql-permissions-auditor' }))).toContain('codex luna xhigh')
    expect(runs(w)[0].stdin).toContain('Follow the project plugin rubric.')
  })
  test('project custom definition still precedes plugin discovery', async () => {
    const w = world({ files: {
      '/workspace/.claude/agents/codeql-resolver:codeql-permissions-auditor.md': '---\nmodel: haiku\n---\nFollow the local rubric.',
      '/home/test/.claude/plugins/installed_plugins.json': '{',
    } })
    expect(text(await w.agent({ subagent_type: 'codeql-resolver:codeql-permissions-auditor' }))).toContain('codex luna xhigh')
    expect(runs(w)[0].stdin).toContain('Follow the local rubric.')
  })
})

describe('capped ladder', () => {
  test('custom tool-using agents cannot opt into a text gateway', async () => {
    const w = world({ quota: 1, env: gateways, definition: '---\nmodel: haiku\n---\nRead app.ts and run its tests.' })
    await w.agent({ ...textTask, subagent_type: 'reviewer' })
    expect(w.fetches).toEqual([])
    expect(w.nextCalls[0]).toMatchObject({ subagent_type: 'reviewer', model: 'haiku', effort: 'xhigh', prompt: textTask.prompt })
  })
  for (const task of [
    { description: '[class: standard]', prompt: 'Edit app.ts and run its tests.' },
    coding,
    { description: 'read and triage', subagent_type: 'Explore', prompt: 'Read app.ts and inspect the repository.' },
    { description: '[class: deep]', prompt: 'Review the repository architecture.' },
    { description: '[class: text] [task: code]', prompt: 'Edit app.ts and run its tests.' },
    { description: '[class: text]', subagent_type: 'Explore', prompt: 'Read app.ts and inspect the repository.' },
    { description: '[class: text]', subagent_type: 'Plan', prompt: 'Inspect the repository and plan changes.' },
  ]) {
    test(`tool-dependent tasks skip chat gateways: ${task.prompt}`, async () => {
      const w = world({ quota: 1, zcodeAvailable: false, env: gateways })
      await w.agent(task)
      expect(nonGithub(w)).toEqual([])
      expect(w.nextCalls[0]).toMatchObject({ model: 'haiku', effort: 'xhigh', prompt: task.prompt })
    })
  }
  test('public coding uses zcode and verifies a ready labelled PR', async () => {
    const w = world({ quota: 1, env: gateways })
    expect(text(await w.agent(coding))).toContain('[routed: zcode-job sandbox; leak-scan before merge; never auto-merge]')
    expect(w.calls.find((c) => c.argv[0] === 'zcode-job')?.argv).toEqual(['zcode-job', 'start', 'owner/project', `${coding.prompt}\n\nReturn a ready PR labelled human:review. Never auto-merge. The trusted lead must leak-scan the PR before merge.`])
    expect(w.fetches.map((f) => f.url)).toEqual(['https://api.github.com/repos/owner/project', 'https://api.github.com/repos/owner/project/pulls/12'])
    expect(w.nextCalls).toEqual([])
  })
  for (const options of [{ repository: { visibility: 'private', private: true } }, { repository: { visibility: 'private', private: true }, properties: [{ property_name: 'ai-untrusted-ok', value: 'true' }] }, { githubError: true }, { githubInvalidJson: true }]) {
    test(`private or unverifiable repositories never dispatch zcode: ${JSON.stringify(options)}`, async () => {
      const w = world({ quota: 1, env: gateways, ...options })
      const r = await w.agent({ ...coding, description: `${coding.description} [payload: classified-safe]` })
      expect(text(r)).toContain('haiku result')
      expect(w.calls.some((c) => c.argv[0] === 'zcode-job')).toBe(false)
      expect(w.fetches.some((f) => f.url.endsWith('/chat/completions'))).toBe(false)
      expect(w.nextCalls[0]).toMatchObject({ model: 'haiku', effort: 'xhigh' })
    })
  }
  for (const options of [{}, { githubError: true }, { githubInvalidJson: true }, { repository: { visibility: 'public', private: true } }, { zcodeAvailable: false }]) {
    test(`ineligible sandbox advances to a tool-capable executor: ${JSON.stringify(options)}`, async () => {
      const w = world({ quota: 1, env: gateways, ...options })
      expect(text(await w.agent(options && Object.keys(options).length ? coding : { ...coding, description: '[class: public] [repo: owner/project]' }))).toContain('haiku result')
      expect(w.calls.some((c) => c.argv[0] === 'zcode-job')).toBe(false)
      expect(w.fetches.some((f) => f.url.endsWith('/chat/completions'))).toBe(false)
    })
  }
  for (const options of [
    { zcodeOutput: 'DONE|j-0123456789abcdef|no-pr\n' },
    { zcodeOutput: 'DONE|j-0123456789abcdef|https://github.com/other/project/pull/12\n' },
    { zcodeOutput: 'FAIL|j-0123456789abcdef|failed\n', zcodeExit: 1 },
    { zcodeTruncated: true }, { zcodeThrows: true },
    { pr: { ...PR, draft: true } }, { pr: { ...PR, state: 'closed' } }, { pr: { ...PR, labels: [] } },
  ]) {
    test(`dispatched zcode must yield a verified ready PR: ${JSON.stringify(options)}`, async () => {
      const w = world({ quota: 1, env: gateways, ...options })
      expect(text(await w.agent(coding))).toStartWith('FAIL | router |')
      expect(routeEvents(w).at(-1)).toMatchObject({ chosen: 'zcode', reason: 'sandbox job without a verified PR' })
      expect(w.fetches.some((f) => f.url.endsWith('/chat/completions'))).toBe(false)
      expect(w.nextCalls).toEqual([])
    })
  }
  test('self-contained text runs on the on-host small alias, never a chat gateway', async () => {
    const w = world({ quota: 1, env: gateways })
    expect(text(await w.agent(textTask))).toContain('[routed: local small]')
    expect(w.fetches.map((f) => f.url)).toEqual(['http://localhost:8000/model/info', 'http://localhost:8000/v1/chat/completions'])
    expect(JSON.parse(w.fetches[1].body!).model).toBe('small')
    expect(w.nextCalls).toEqual([])
  })
  for (const options of [{ env: {} }, { env: gateways, gatewayStatus: { small: 503 } }, { env: gateways, gatewayAnswer: { small: '' } }, { env: gateways, gatewayInvalidJson: true }, { env: gateways, gatewayTimeout: true }, { env: gateways, gatewayFinish: 'length' }]) {
    test(`a failed local check falls through to Haiku xhigh: ${JSON.stringify(options)}`, async () => {
      const w = world({ quota: 1, ...options })
      await w.agent({ ...textTask, model: 'haiku', effort: 'low' })
      expect(w.nextCalls[0]).toMatchObject({ model: 'haiku', effort: 'xhigh' })
      expect(runs(w)).toEqual([])
      expect(w.fetches.every((f) => !f.body || JSON.parse(f.body).model === 'small')).toBe(true)
    })
  }
  test('capped isolation skips transports that cannot preserve worktrees', async () => {
    const w = world({ quota: 1, env: gateways })
    await w.agent({ ...textTask, isolation: 'worktree' })
    expect(w.fetches).toEqual([])
    expect(w.nextCalls[0]).toMatchObject({ isolation: 'worktree', model: 'haiku', effort: 'xhigh' })
  })
})

describe('judge and session policy', () => {
  test('Codex judge honors safe verdict and leaves malformed verdicts to the core', async () => {
    for (const answer of ['{"verdict":"safe","reason":"bounded"}', 'not a verdict']) {
      const w = world({ answer })
      const r = await w.invoke('tool.check', { input: { command: 'rm ./file' } }, CORE_ASK)
      expect(r.decision).toBe(answer.startsWith('{') ? 'allow' : 'ask')
      expect(w.modelCalls).toEqual([])
    }
  })
  test('mandatory judge topics also use Luna max and name the class', async () => {
    const w = world({ answer: '{"verdict":"safe","reason":"bounded"}' })
    await w.invoke('tool.check', { input: { command: 'rm ./auth-cache' } }, CORE_ASK)
    expect(runs(w)[0].argv).toContain('model_reasoning_effort="max"')
    expect(runs(w)[0].stdin).toStartWith('[class: bulk-complex]')
  })
  test('capped judge tries GLM and Go before Haiku', async () => {
    const w = world({ quota: 1, env: gateways, gatewayStatus: { 'configured-glm': 503, 'configured-go': 503 }, answer: '{"verdict":"unsafe","reason":"outside tree"}' })
    expect((await w.invoke('tool.check', { input: { command: 'rm /other' } }, CORE_ASK)).decision).toBe('deny')
    expect(w.fetches.map((f) => JSON.parse(f.body!).model)).toEqual(['configured-glm', 'configured-go'])
    expect(w.modelCalls[0]).toMatchObject({ model: 'haiku', effort: 'xhigh' })
  })
  test('unknown quota and sensitive shell input leave core ask without model calls', async () => {
    for (const options of [{ quota: 127 }, { quota: 1 }]) {
      const w = world(options)
      await w.invoke('tool.check', { input: { command: options.quota === 1 ? 'token=abc123' : 'rm ./file' } }, CORE_ASK)
      expect(w.modelCalls).toEqual([])
      expect(runs(w)).toEqual([])
    }
  })
  for (const [quota, status] of [[0, 'available'], [1, 'exhausted'], [2, 'unavailable']] as const) {
    test(`session injects ${status} quota and the complete routing policy`, async () => {
      const w = world({ quota })
      await w.invoke('session.start', { cwd: '/workspace' })
      const r = await w.invoke('prompt.compose', {}, { sections: [] })
      expect(r.sections).toHaveLength(1)
      const policy = r.sections[0].text
      expect(policy).not.toContain('Check codex-quota first')
      expect(policy).toStartWith(`codex-quota: ${status}\nThe jpe-ai-delegation hook places every Agent spawn.`)
      for (const fragment of ['Tag self-contained text work [class: text]', 'put all of its text in the prompt', 'on-host local model first', 'ranked by quota', 'non-sensitive coding tagged [task: code] [repo: owner/repository] in a public repository', 'ready PR labelled human:review', 'leak-scan it before merge', 'never auto-merge', 'Codex Luna takes any task', 'never Terra', 'Haiku xhigh is always last', 'Nothing stops because an executor is unavailable', 'Never Sonnet, Opus or Fable subagents', 'Never send secrets, credentials, inventory or incident content to any executor', 'Antigravity stays a second-opinion reviewer']) expect(policy).toContain(fragment)
    })
  }
})

describe('scoring and eligibility policy', () => {
  test('eligibility: sandbox tools see public code only; Codex sees everything', () => {
    expect(eligibleRows(EXECUTOR_TABLE, true, 0).rows.map((r) => r.id)).toEqual(['zcode', 'opencode-go', 'codex', 'cursor'])
    expect(eligibleRows(EXECUTOR_TABLE, false, 0).rows.map((r) => r.id)).toEqual(['codex'])
    expect(eligibleRows(EXECUTOR_TABLE, false, 0).skipped).toEqual({ zcode: 'ineligible', 'opencode-go': 'ineligible', cursor: 'ineligible' })
  })
  test('score is unused-at-pace per hour left, the binding window wins, 95% excludes', () => {
    const at = (used: number) => ({ used_percent: used, window_seconds: 2000, reset_at: 2000 })
    expect(scoreWindows([at(50)], 1000)).toEqual({ score: 0, exhausted: false })
    expect(Math.round(scoreWindows([at(10)], 1000).score)).toBe(80)
    expect(Math.round(scoreWindows([at(10), at(40)], 1000).score)).toBe(20)
    expect(scoreWindows([at(95)], 1000)).toEqual({ exhausted: true })
    expect(scoreWindows([{ ...at(99), reset_at: 900 }], 1000)).toEqual({ score: undefined, exhausted: false })
    expect(scoreWindows([{ used_percent: '10' }], 1000)).toEqual({ score: undefined, exhausted: false })
    expect(scoreWindows(undefined, 1000)).toEqual({ score: undefined, exhausted: false })
  })
  test('positive known scores lead; unknown and non-positive keep static order; exhausted drop', () => {
    const rows = EXECUTOR_TABLE.slice(0, 3)
    const offPeak = Date.parse('2026-11-14T12:00:00Z')
    expect(rankRows(rows, {}, offPeak).order).toEqual(['zcode', 'opencode-go', 'codex'])
    expect(rankRows(rows, { codex: { score: 3, exhausted: false } }, offPeak).order).toEqual(['codex', 'zcode', 'opencode-go'])
    expect(rankRows(rows, { codex: { score: 0, exhausted: false } }, offPeak).order).toEqual(['zcode', 'opencode-go', 'codex'])
    expect(rankRows(rows, { zcode: { exhausted: true } }, offPeak).order).toEqual(['opencode-go', 'codex'])
  })
  test('local fit: marked text only, smallest alias with 40% headroom', () => {
    expect(localTask('[class: text]')).toBe(true)
    expect(localTask('[class: bulk]')).toBe(false)
    expect(localTask('[class: standard]')).toBe(false)
    expect(localTask(undefined)).toBe(false)
    const windows = { small: 32768, 'local-only': 131072, 'small-homelab': 9_999_999 }
    expect(pickLocal(estimateTokens('a'.repeat(10_000)), windows)?.alias).toBe('small')
    expect(pickLocal(estimateTokens('a'.repeat(140_000)), windows)?.alias).toBe('local-only')
    expect(pickLocal(estimateTokens('a'.repeat(700_000)), windows)).toBeUndefined()
    expect(pickLocal(100, {})).toBeUndefined()
  })
})

// The labelled batch: Codex exhausted (quota 1) unless a row says otherwise.
describe('routing batch', () => {
  test('1: small pasted summary lands on local small', async () => {
    const w = world({ quota: 1, env: gateways })
    expect(text(await w.agent({ description: '[class: text]', prompt: `Summarize: ${'a'.repeat(10_000)}` }))).toContain('[routed: local small]')
    expect(routeEvents(w).at(-1)).toMatchObject({ chosen: 'local small', local: { alias: 'small' } })
  })
  test('2: a 40k-token extraction lands on local-only', async () => {
    const w = world({ quota: 1, env: gateways })
    expect(text(await w.agent({ description: '[class: text]', prompt: `Extract fields: ${'a'.repeat(140_000)}` }))).toContain('[routed: local local-only]')
    expect(JSON.parse(w.fetches[1].body!).model).toBe('local-only')
  })
  test('3: a 200k-token classification is too large for local and lands on Haiku', async () => {
    const w = world({ quota: 1, env: gateways })
    await w.agent({ description: '[class: text]', prompt: `Classify: ${'a'.repeat(700_000)}` })
    expect(w.fetches.map((f) => f.url)).toEqual(['http://localhost:8000/model/info'])
    expect(w.nextCalls[0]).toMatchObject({ model: 'haiku', effort: 'xhigh' })
    expect(routeEvents(w).at(-1)).toMatchObject({ chosen: 'haiku', local: { alias: null } })
  })
  for (const [name, options] of [['empty', { gatewayAnswer: { small: '' } }], ['times out', { gatewayTimeout: true }]] as const) {
    test(`4: local ${name} falls through to Haiku`, async () => {
      const w = world({ quota: 1, env: gateways, ...options })
      await w.agent(textTask)
      expect(w.nextCalls[0]).toMatchObject({ model: 'haiku', effort: 'xhigh' })
      expect(routeEvents(w).at(-1)).toMatchObject({ chosen: 'haiku', fell_through_from: ['local small'] })
    })
  }
  test('5: public-repo code with unknown sandbox quota takes ZCode by static order', async () => {
    const w = world({ quota: 1, env: gateways })
    expect(text(await w.agent(coding))).toContain('[routed: zcode-job sandbox;')
    expect(routeEvents(w).at(-1)).toMatchObject({ chosen: 'zcode', eligible: ['zcode', 'opencode-go', 'codex', 'cursor', 'haiku'] })
  })
  test('6: with ZCode disabled, public-repo code takes OpenCode Go', async () => {
    const w = world({ quota: 1, env: { ...gateways, AGENT_ROUTE_ZCODE_TOOLS: 'opencode' } })
    expect(text(await w.agent(coding))).toContain('[routed: OpenCode Go sandbox;')
    expect(w.calls.find((c) => c.argv[0] === 'zcode-job')?.argv.slice(0, 5)).toEqual(['zcode-job', 'start', '--tool', 'opencode', 'owner/project'])
    expect(routeEvents(w).at(-1)).toMatchObject({ chosen: 'opencode-go', fell_through_from: ['zcode'] })
  })
  test('7: private-repo code with Codex exhausted lands on Haiku, never a sandbox', async () => {
    const w = world({ quota: 1, env: gateways, repository: { visibility: 'private', private: true } })
    await w.agent(coding)
    expect(w.calls.some((c) => c.argv[0] === 'zcode-job')).toBe(false)
    expect(w.nextCalls[0]).toMatchObject({ model: 'haiku', effort: 'xhigh' })
    expect(routeEvents(w).at(-1)).toMatchObject({ eligible: ['codex', 'haiku'], scores: { codex: { exhausted: true } } })
  })
  test('8: private-repo code with Codex quota to spare lands on Codex', async () => {
    const w = world({ env: gateways, repository: { visibility: 'private', private: true }, codexWindows: [{ used_percent: 10, window_seconds: 2000, reset_at: 2000 }] })
    expect(text(await w.agent(coding))).toContain('codex luna xhigh')
    expect(Math.round(routeEvents(w).at(-1).scores.codex.score)).toBe(80)
  })
  test('8b: a positive Codex score also leads ZCode on public code', async () => {
    const w = world({ env: gateways, codexWindows: [{ used_percent: 10, window_seconds: 2000, reset_at: 2000 }] })
    expect(text(await w.agent(coding))).toContain('codex luna')
    expect(w.calls.some((c) => c.argv[0] === 'zcode-job')).toBe(false)
  })
  for (const quota of [0, 1]) {
    test(`9: sensitive public-repo code never reaches a sandbox (quota ${quota})`, async () => {
      const w = world({ quota, env: gateways })
      const r = await w.agent({ ...coding, prompt: 'Rotate the auth signing key using placeholders.' })
      expect(w.calls.some((c) => c.argv[0] === 'zcode-job')).toBe(false)
      expect(w.fetches).toEqual([])
      if (quota === 0) expect(text(r)).toContain('codex luna max, class bulk-complex')
      else expect(w.nextCalls[0]).toMatchObject({ model: 'haiku', effort: 'xhigh' })
    })
  }
  test('10: Explore needs tools and lands on Haiku when Codex is exhausted', async () => {
    const w = world({ quota: 1, env: gateways })
    await w.agent({ description: 'read', subagent_type: 'Explore', prompt: 'Summarize the repository layout.' })
    expect(w.fetches).toEqual([])
    expect(w.nextCalls[0]).toMatchObject({ subagent_type: 'Explore', model: 'haiku', effort: 'xhigh' })
  })
  test('11: a token-shaped payload fails before any executor', async () => {
    const w = world({ env: gateways })
    expect(text(await w.agent({ ...textTask, prompt: 'Summarize ghp_abcdefghijklmnopqrst' }))).toContain('prohibited content')
    expect(w.calls).toEqual([])
    expect(w.fetches).toEqual([])
  })
  test('12: Plan with a Sonnet model fails as forbidden', async () => {
    const w = world({ env: gateways })
    expect(text(await w.agent({ subagent_type: 'Plan', model: 'sonnet' }))).toContain('subagents are forbidden')
    expect(w.calls).toEqual([])
  })
  test('a quota read that throws leaves quota unknown and keeps the static order', async () => {
    const w = world({ quotaThrows: true, env: gateways })
    expect(text(await w.agent(coding))).toContain('[routed: zcode-job sandbox;')
    expect(routeEvents(w).at(-1)).toMatchObject({ scores: { zcode: null, 'opencode-go': null, codex: null } })
  })
  test('quota is read once per session and refreshed in the background after ten minutes', async () => {
    const w = world({ quota: 1, env: gateways })
    const reads = () => w.quotaFetches.length
    await w.agent()
    await w.agent()
    expect(reads()).toBe(1)
    w.setNow(1_000_000 + 600_000)
    await w.agent()
    expect(reads()).toBe(2)
    expect(w.nextCalls).toHaveLength(3)
  })
  test('a [class: bulk] summarize request needs tools and never goes local', async () => {
    const w = world({ quota: 1, env: gateways })
    await w.agent({ description: '[class: bulk]', prompt: 'Summarize the files under src/.' })
    expect(w.fetches).toEqual([])
    expect(w.nextCalls[0]).toMatchObject({ model: 'haiku', effort: 'xhigh' })
    expect(routeEvents(w).at(-1)).toMatchObject({ local: null, chosen: 'haiku' })
  })
})

describe('quota from the metrics store', () => {
  // The recorded sample is 120 s old at this clock.
  const RECORDED_NOW_MS = 1_762_826_400_000
  const recorded = (): any => JSON.parse(RECORDED_QUOTA)
  const ids = ['codex', 'cursor']
  const unknownCases: [string, Parameters<typeof world>[0]][] = [
    ['env unset', { quotaUrl: null }],
    ['HTTP 500', { quota: 500 }],
    ['timeout', { quotaTimeout: true }],
    ['malformed JSON', { quotaText: '{"status":"success","data":' }],
    ['error status', { quotaText: JSON.stringify({ status: 'error', errorType: 'bad_data', error: 'parse error' }) }],
    ['request throws', { quotaThrows: true }],
  ]

  test('adapter: all three series fresh group into rows by executor and window', () => {
    const read = quotaFromMetrics(recorded().data.result, ids, RECORDED_NOW_MS / 1000)
    expect(read.unknown).toEqual({})
    expect(read.sources).toEqual({ 'codex/five_hour': 'provider', 'codex/weekly': 'provider', 'cursor/monthly': 'estimate' })
    expect(read.rows).toEqual([
      { id: 'codex', status: 'ok', as_of: 1762826280.412, windows: [
        { used_percent: 42.5, window_seconds: 18000, reset_at: 1762833600 },
        { used_percent: 31, window_seconds: 604800, reset_at: 1763085600 },
      ] },
      { id: 'cursor', status: 'ok', as_of: 1762826310.007, windows: [{ used_percent: 12, window_seconds: 2592000, reset_at: 1764122400 }] },
    ])
  })
  test('adapter: a window sampled more than 15 minutes ago is unknown as quota_stale', () => {
    const body = recorded()
    for (const s of body.data.result) if (s.metric.window === 'weekly') s.value[0] = RECORDED_NOW_MS / 1000 - 901
    const read = quotaFromMetrics(body.data.result, ids, RECORDED_NOW_MS / 1000)
    expect(read.unknown).toEqual({ 'codex/weekly': 'quota_stale' })
    expect(read.rows[0].windows).toEqual([{ used_percent: 42.5, window_seconds: 18000, reset_at: 1762833600 }])
  })
  test('adapter: an executor with no series is quota_missing; an incomplete window is never filled in', () => {
    const body = recorded()
    body.data.result = body.data.result.filter((s: any) => s.metric.executor !== 'cursor' && !(s.metric.window === 'five_hour' && s.metric.__name__ === 'agent_quota_used_percent'))
    const read = quotaFromMetrics(body.data.result, ids, RECORDED_NOW_MS / 1000)
    expect(read.unknown).toEqual({ cursor: 'quota_missing', 'codex/five_hour': 'quota_missing' })
    expect(read.rows).toEqual([{ id: 'codex', status: 'ok', as_of: 1762826280.412, windows: [{ used_percent: 31, window_seconds: 604800, reset_at: 1763085600 }] }])
  })
  test('adapter: a response that is not a successful vector is no read at all', () => {
    for (const body of [null, {}, { status: 'error' }, { status: 'success', data: { resultType: 'matrix', result: [] } }, { status: 'success', data: {} }]) {
      expect(metricsResult(body)).toBeUndefined()
    }
  })
  test('adapter: 0 and 100 come only from a real sample; unparseable values are dropped, not defaulted', () => {
    const at = RECORDED_NOW_MS / 1000 - 60
    const windows = (used: unknown) => [{ kind: 'weekly', used_percent: used, window_seconds: 2000, reset_at: RECORDED_NOW_MS / 1000 + 1000 }]
    for (const used of [0, 100]) {
      const read = quotaFromMetrics(series('codex', windows(used), at), ['codex'], RECORDED_NOW_MS / 1000)
      expect(read.rows[0].windows[0].used_percent).toBe(used)
    }
    for (const used of ['NaN', '', '+Inf', 'n/a']) {
      const read = quotaFromMetrics(series('codex', windows(used), at), ['codex'], RECORDED_NOW_MS / 1000)
      expect(read.rows).toEqual([])
      expect(read.unknown).toEqual({ 'codex/weekly': 'quota_missing' })
    }
  })
  test('the hook makes one GET to the query API with the series selector and a trimmed base', async () => {
    const w = world({ quotaUrl: `${QUOTA_BASE}/`, now: RECORDED_NOW_MS, quotaText: JSON.stringify(recorded()) })
    expect(text(await w.agent())).toContain('codex luna xhigh')
    expect(w.quotaFetches).toEqual([QUERY_URL])
    const event = routeEvents(w).at(-1)
    expect(event.quota_unknown).toEqual({})
    expect(event.quota_source).toEqual({ 'codex/five_hour': 'provider', 'codex/weekly': 'provider', 'cursor/monthly': 'estimate' })
    expect(typeof event.scores.codex.score).toBe('number')
  })
  test('env unset: every quota is unknown and no request is made', async () => {
    const w = world({ quotaUrl: null })
    expect(text(await w.agent())).toContain('codex luna xhigh')
    expect(w.quotaFetches).toEqual([])
    expect(w.fetches).toEqual([])
    expect(routeEvents(w).at(-1)).toMatchObject({ scores: { codex: null }, quota_unknown: { codex: 'quota_unconfigured', cursor: 'quota_unconfigured' } })
  })
  for (const [name, options] of unknownCases.slice(1)) {
    test(`${name}: every quota is unknown as quota_unreachable and Codex is still tried`, async () => {
      const w = world({ ...options, env: gateways })
      expect(text(await w.agent())).toContain('codex luna xhigh')
      expect(w.quotaFetches).toEqual([QUERY_URL])
      expect(routeEvents(w).at(-1)).toMatchObject({ chosen: 'codex', scores: { codex: null }, quota_unknown: { codex: 'quota_unreachable', cursor: 'quota_unreachable' } })
    })
  }
  test('a stale sample in the store reads as quota_stale, never as a score', async () => {
    const w = world({ quotaSampleAge: 901, env: gateways })
    await w.agent()
    expect(routeEvents(w).at(-1)).toMatchObject({ scores: { codex: null }, quota_unknown: { 'codex/weekly': 'quota_stale', cursor: 'quota_missing' } })
  })
  test('staleness is judged on the clock at routing time, not when the sample was read', async () => {
    const w = world({ now: RECORDED_NOW_MS, quotaText: JSON.stringify(recorded()) })
    await w.agent()
    expect(routeEvents(w).at(-1).quota_unknown).toEqual({})
    // 800 s later the Codex sample is 920 s old and the Cursor sample 890 s; the refresh returns the same sample.
    w.setNow(RECORDED_NOW_MS + 800_000)
    await w.agent()
    const event = routeEvents(w).at(-1)
    expect(event.quota_unknown).toEqual({ 'codex/five_hour': 'quota_stale', 'codex/weekly': 'quota_stale' })
    expect(event.scores.codex).toBeNull()
    expect(w.quotaFetches).toHaveLength(2)
  })
  test('placeholder-free: no unknown quota is ever scored as empty or full', async () => {
    for (const [, options] of [...unknownCases, ['stale', { quotaSampleAge: 901 }] as const]) {
      const w = world({ ...options, env: gateways, cursorWindows: [{ used_percent: 10, window_seconds: 2000, reset_at: 2000 }] })
      await w.agent(coding)
      const { scores } = routeEvents(w).at(-1)
      for (const id of ids) expect(scores[id]).toBeNull()
    }
    const full = world({ quota: 1, env: gateways })
    await full.agent()
    expect(routeEvents(full).at(-1).scores.codex).toMatchObject({ exhausted: true })
    const empty = world({ codexWindows: [{ kind: 'weekly', used_percent: 0, window_seconds: 2000, reset_at: 2000 }], env: gateways })
    await empty.agent()
    expect(routeEvents(empty).at(-1).scores.codex).toMatchObject({ exhausted: false })
    expect(routeEvents(empty).at(-1).scores.codex.score).toBeGreaterThan(0)
  })
  test('quota never runs a local command, whatever the environment names', async () => {
    for (const env of [{}, { TOKEN_METER_BIN: '/opt/meter' }]) {
      const w = world({ quotaUrl: null, env })
      await w.agent({ description: '[class: standard]' })
      expect(w.calls.filter((c) => /quota|meter|^which /.test(c.argv.join(' ')))).toEqual([])
      expect(runs(w)).toHaveLength(1)
      expect(w.quotaFetches).toEqual([])
    }
  })
})

describe('cursor executor', () => {
  const at = (used: number) => [{ used_percent: used, window_seconds: 2000, reset_at: 2000 }]
  test('Codex exhausted and Cursor available: Cursor is chosen, not Haiku', async () => {
    const w = world({ quota: 1, env: { ...gateways, AGENT_ROUTE_ZCODE_TOOLS: 'cursor-agent' } })
    expect(text(await w.agent(coding))).toContain('[routed: Cursor sandbox;')
    expect(w.calls.find((c) => c.argv[0] === 'zcode-job')?.argv.slice(0, 5)).toEqual(['zcode-job', 'start', '--tool', 'cursor-agent', 'owner/project'])
    expect(w.nextCalls).toEqual([])
    expect(routeEvents(w).at(-1)).toMatchObject({ chosen: 'cursor', fell_through_from: ['zcode', 'opencode-go'] })
  })
  test('Codex and Cursor both fail: Haiku, with both in fell_through_from', async () => {
    const w = world({ codexExit: 7, zcodeAvailable: false, env: gateways })
    await w.agent(coding)
    expect(w.nextCalls[0]).toMatchObject({ model: 'haiku', effort: 'xhigh' })
    expect(routeEvents(w).at(-1)).toMatchObject({ chosen: 'haiku', fell_through_from: ['zcode', 'opencode-go', 'codex', 'cursor'] })
  })
  test('Cursor runs after Codex in the static order', async () => {
    const w = world({ env: { ...gateways, AGENT_ROUTE_ZCODE_TOOLS: 'cursor-agent' } })
    expect(text(await w.agent(coding))).toContain('codex luna')
    expect(w.calls.some((c) => c.argv[0] === 'zcode-job')).toBe(false)
  })
  test('a positive Cursor quota score moves it first; an exhausted one drops it', async () => {
    const lead = world({ env: gateways, cursorWindows: at(10) })
    expect(text(await lead.agent(coding))).toContain('[routed: Cursor sandbox;')
    expect(routeEvents(lead).at(-1).scores.cursor.exhausted).toBe(false)
    const out = world({ quota: 1, zcodeAvailable: false, env: gateways, cursorWindows: at(100) })
    await out.agent(coding)
    expect(routeEvents(out).at(-1)).toMatchObject({ chosen: 'haiku', scores: { cursor: { exhausted: true } }, fell_through_from: ['zcode', 'opencode-go'] })
  })
  test('a failed Cursor quota row leaves its score unknown', async () => {
    const w = world({ quota: 1, env: gateways })
    await w.agent(coding)
    expect(routeEvents(w).at(-1).scores.cursor).toBeNull()
  })
  test('private repositories never reach the Cursor sandbox', async () => {
    const w = world({ quota: 1, env: gateways, repository: { visibility: 'private', private: true }, cursorWindows: at(10) })
    await w.agent(coding)
    expect(w.calls.some((c) => c.argv[0] === 'zcode-job')).toBe(false)
    expect(routeEvents(w).at(-1)).toMatchObject({ eligible: ['codex', 'haiku'], chosen: 'haiku' })
  })
})

describe('executor table', () => {
  const OVERRIDE = '/home/test/.config/ai-delegation/executors.json'
  const promo = { id: 'promo-free', transport: 'sandbox', tool: 'opencode-free', trust: 'sandbox-public', private_ok: false, price: 0, kind: 'promotion' }
  test('the built-in table holds every row and validates', () => {
    expect(EXECUTOR_TABLE.map((r) => r.id)).toEqual(['zcode', 'opencode-go', 'codex', 'cursor'])
    expect(EXECUTOR_TABLE.every((r) => validRow(r))).toBe(true)
  })
  test('validation: only subscription-trusted rows may take private work; ids and promotions are strict', () => {
    expect(validRow({ ...EXECUTOR_TABLE[0], private_ok: true })).toBeUndefined()
    expect(validRow({ ...EXECUTOR_TABLE[0], trust: 'untrusted-api' })).toBeUndefined()
    expect(validRow({ ...EXECUTOR_TABLE[0], id: 'haiku' })).toBeUndefined()
    expect(validRow({ ...EXECUTOR_TABLE[0], id: 'Bad Id' })).toBeUndefined()
    expect(validRow({ ...EXECUTOR_TABLE[0], tool: undefined })).toBeUndefined()
    expect(validRow({ ...promo })).toBeUndefined()
    expect(validRow({ ...promo, expires: '2030-01-01T00:00:00Z' })).toBeTruthy()
  })
  test('a sandbox row can never be subscription-trusted or take private work', () => {
    const forged = { id: 'sandbox-private', transport: 'sandbox', tool: 'zcode', trust: 'subscription-trusted', private_ok: true, price: 1 }
    expect(validRow(forged)).toBeUndefined()
    expect(validRow({ ...forged, private_ok: false })).toBeUndefined()
    expect(validRow({ ...forged, trust: 'sandbox-public' })).toBeUndefined()
    const { rows, rejected } = mergeExecutorRows(EXECUTOR_TABLE, [forged, { id: 'zcode', trust: 'subscription-trusted', private_ok: true }])
    expect(rejected).toEqual(['sandbox-private', 'zcode'])
    expect(rows.map((r) => r.id)).toEqual(['zcode', 'opencode-go', 'codex', 'cursor'])
    expect(rows.find((r) => r.id === 'zcode')).toMatchObject({ trust: 'sandbox-public', private_ok: false })
  })
  test('merge: rows override by id, new ids append, invalid rows are rejected by name', () => {
    const { rows, rejected } = mergeExecutorRows(EXECUTOR_TABLE, [{ id: 'codex', price: 3 }, { ...promo, expires: '2030-01-01T00:00:00Z' }, { id: 'zcode', private_ok: true }, 'junk'])
    expect(rows.find((r) => r.id === 'codex')?.price).toBe(3)
    expect(rows.at(-1)?.id).toBe('promo-free')
    expect(rows.find((r) => r.id === 'zcode')?.private_ok).toBe(false)
    expect(rejected).toEqual(['zcode', '?'])
  })
  test('peak multiplier: ZCode doubles Mon-Fri 06:00-10:00 UTC only', () => {
    const zcode = EXECUTOR_TABLE[0]
    expect(peakMultiplier(zcode, Date.parse('2026-11-09T07:30:00Z'))).toBe(2)
    expect(peakMultiplier(zcode, Date.parse('2026-11-09T10:00:00Z'))).toBe(1)
    expect(peakMultiplier(zcode, Date.parse('2026-11-14T07:30:00Z'))).toBe(1)
    expect(peakMultiplier(EXECUTOR_TABLE[2], Date.parse('2026-11-09T07:30:00Z'))).toBe(1)
  })
  test('rank: promotions first, then headroom / (price x peak), exhausted rows skipped', () => {
    const rows = mergeExecutorRows(EXECUTOR_TABLE, [{ id: 'opencode-go', price: 2 }, { ...promo, expires: '2030-01-01T00:00:00Z' }]).rows
    const peakMonday = Date.parse('2026-11-09T07:30:00Z')
    const scores = { zcode: { score: 10, exhausted: false }, 'opencode-go': { score: 10, exhausted: false }, codex: { score: 8, exhausted: false }, cursor: { exhausted: true } }
    const r = rankRows(rows, scores, peakMonday)
    expect(r.order).toEqual(['promo-free', 'codex', 'zcode', 'opencode-go'])
    expect(r.effective).toMatchObject({ zcode: 5, 'opencode-go': 5, codex: 8 })
    expect(r.skipped).toEqual({ cursor: 'exhausted' })
    expect(rankRows(rows, scores, Date.parse('2026-11-14T07:30:00Z')).order).toEqual(['promo-free', 'zcode', 'codex', 'opencode-go'])
  })
  test('an override promotion sorts first for public code while it lasts', async () => {
    const w = world({ quota: 1, env: gateways, files: { [OVERRIDE]: JSON.stringify([{ ...promo, expires: '2030-01-01T00:00:00Z' }]) } })
    expect(text(await w.agent(coding))).toContain('[routed: opencode-free sandbox;')
    expect(w.calls.find((c) => c.argv[0] === 'zcode-job')?.argv.slice(0, 5)).toEqual(['zcode-job', 'start', '--tool', 'opencode-free', 'owner/project'])
    expect(routeEvents(w).at(-1)).toMatchObject({ chosen: 'promo-free', eligible: ['zcode', 'opencode-go', 'codex', 'cursor', 'promo-free', 'haiku'] })
  })
  test('an expired promotion is skipped with reason expired', async () => {
    const w = world({ quota: 1, env: gateways, files: { [OVERRIDE]: JSON.stringify([{ ...promo, expires: '1969-12-31T00:00:00Z' }]) } })
    expect(text(await w.agent(coding))).toContain('[routed: zcode-job sandbox;')
    expect(routeEvents(w).at(-1).skipped['promo-free']).toBe('expired')
  })
  test('an override cannot open a sandbox row to private work', async () => {
    const w = world({ quota: 1, env: gateways, repository: { visibility: 'private', private: true }, files: { [OVERRIDE]: JSON.stringify([{ id: 'zcode', private_ok: true }]) } })
    await w.agent(coding)
    expect(w.calls.some((c) => c.argv[0] === 'zcode-job')).toBe(false)
    expect(w.calls.some((c) => c.stdin === 'executor override rows rejected: zcode\n')).toBe(true)
    expect(routeEvents(w).at(-1)).toMatchObject({ eligible: ['codex', 'haiku'], chosen: 'haiku' })
  })
  test('an unreadable override falls back to the built-in table', async () => {
    const w = world({ quota: 1, env: gateways, files: { [OVERRIDE]: '{' } })
    expect(text(await w.agent(coding))).toContain('[routed: zcode-job sandbox;')
    expect(w.calls.some((c) => c.stdin === 'executor override unreadable; using the built-in table\n')).toBe(true)
  })
  test('private work with Codex failing: skip reasons name every row', async () => {
    const w = world({ codexExit: 7, env: gateways, repository: { visibility: 'private', private: true } })
    await w.agent(coding)
    expect(routeEvents(w).at(-1)).toMatchObject({ chosen: 'haiku', skipped: { zcode: 'ineligible', 'opencode-go': 'ineligible', codex: 'failed', cursor: 'ineligible' } })
  })
  // Haiku is chosen only when every other eligible row is exhausted, failed, expired or not installed.
  for (const [name, options, task] of [
    ['codex exhausted, sandboxes missing', { quota: 1, zcodeAvailable: false }, coding],
    ['codex failing, sandboxes disabled', { codexExit: 7, env: { AGENT_ROUTE_ZCODE_TOOLS: 'none' } }, coding],
    ['private, codex exhausted', { quota: 1, repository: { visibility: 'private', private: true } }, coding],
    ['non-code, codex failing', { answer: '' }, { description: '[class: standard]', prompt: 'Implement the change.' }],
  ] as const) {
    test(`Haiku only when every eligible row is unavailable: ${name}`, async () => {
      const w = world({ env: gateways, ...options } as never)
      await w.agent(task)
      const event = routeEvents(w).at(-1)
      expect(event.chosen).toBe('haiku')
      for (const id of event.eligible.filter((x: string) => x !== 'haiku')) expect(['exhausted', 'failed', 'expired', 'not_installed']).toContain(event.skipped[id])
    })
  }
  test('any available eligible row beats Haiku', async () => {
    const w = world({ quota: 1, env: gateways })
    await w.agent(coding)
    expect(routeEvents(w).at(-1).chosen).not.toBe('haiku')
    expect(w.nextCalls).toEqual([])
  })
})

describe('sandbox job outcomes', () => {
  const HOUR = 3_600_000
  const MIN = 60_000
  const NOW = 100 * HOUR + 10 * MIN
  const job = (n: number) => `j-${String(n).padStart(16, '0')}`
  const placed = (n: number, ts = NOW - MIN, repo = 'owner/project', executor = 'zcode', started?: number) => ({ ts_ms: ts, event: 'route', jobs: [{ job: job(n), repo, executor, ...(started === undefined ? {} : { started_ms: started }) }] })
  const ended = (n: number, end: string, ts = NOW - MIN, repo = 'owner/project', executor = 'zcode', endedMs?: number) => ({ ts_ms: ts, event: 'outcome', job: job(n), repo, executor, end, ...(endedMs === undefined ? {} : { ended_ms: endedMs }) })
  const lines = (entries: unknown[]) => entries.map((e) => typeof e === 'string' ? e : JSON.stringify(e))
  const outcomeLines = (w: ReturnType<typeof world>) => routeEvents(w).filter((l) => l.event === 'outcome')
  const starts = (w: ReturnType<typeof world>) => w.calls.filter((c) => c.argv[0] === 'zcode-job' && c.argv[1] === 'start')
  const statusReads = (w: ReturnType<typeof world>) => w.calls.filter((c) => c.argv[0] === 'zcode-job' && c.argv[1] === 'status')
  const failsOnce = { zcode: { exit: 1, output: `FAIL|${job(1)}|no commit\n` }, opencode: { exit: 0, output: `DONE|${job(2)}|${PR.html_url}\n` } }

  test('job state accepts only the contract ends and a non-negative duration', () => {
    expect(jobState({ end: 'no_commit', duration: 30 })).toEqual({ end: 'no_commit', duration_ms: 30_000 })
    expect(jobState({ end: 'timeout', duration: -1 })).toEqual({ end: 'timeout' })
    for (const status of [{ end: '' }, { end: 'succeeded' }, { state: 'failed' }, null, 'no_commit']) expect(jobState(status)).toBeUndefined()
  })
  test('the end anchor is start plus duration, never after the observation, else the observation', () => {
    const record = { job: job(1), repo: 'owner/project', executor: 'zcode', started_ms: NOW - 80 * MIN }
    expect(endAnchor(record, { end: 'no_commit', duration_ms: 10 * MIN }, NOW)).toBe(NOW - 70 * MIN)
    expect(endAnchor(record, { end: 'no_commit', duration_ms: 90 * MIN }, NOW)).toBe(NOW)
    expect(endAnchor(record, { end: 'no_commit' }, NOW)).toBe(NOW)
  })
  test('job history lists recent jobs without an outcome, newest first, at most five', () => {
    const history = jobHistory(lines(['not json', placed(1, NOW - 25 * HOUR), placed(2), placed(3), ended(3, 'pr_opened'), placed(4), placed(5), placed(6), placed(7), placed(8),
      { ts_ms: NOW, event: 'route', jobs: [{ job: 'j-bad', repo: 'owner/project', executor: 'zcode' }] }, ended(9, 'unknown_end')]), NOW)
    expect(history.pending.map((p) => p.job)).toEqual([job(8), job(7), job(6), job(5), job(4)])
    expect(history.pending[0].started_ms).toBe(NOW - MIN)
    expect(history.outcomes).toEqual([{ job: job(3), repo: 'owner/project', executor: 'zcode', end: 'pr_opened', ts_ms: NOW - MIN, ended_ms: NOW - MIN }])
  })
  test('job history ignores future stamps and invalid repositories or executors, and keeps one outcome per job', () => {
    const history = jobHistory(lines([placed(1, NOW + 10 * HOUR), placed(2, NOW, 'not a repo'), placed(3, NOW, 'owner/project', 'Bad Executor'),
      ended(4, 'no_commit', NOW + 2 * MIN), ended(5, 'no_commit'), ended(5, 'no_commit'), ended(6, 'refused', NOW, '../x')]), NOW)
    expect(history.pending).toEqual([])
    expect(history.outcomes.map((o) => o.job)).toEqual([job(5)])
  })
  test('one failed job logged twice does not trip recent failures', () => {
    expect(recentFailures(jobHistory(lines([ended(1, 'no_commit'), ended(1, 'no_commit'), ended(2, 'pr_opened')]), NOW).outcomes, 'zcode', 'owner/project', NOW)).toBe(false)
  })
  test('two failures among the last three jobs skip an executor for that repository for 60 minutes after the end anchor', () => {
    const outcomes = jobHistory(lines([ended(1, 'no_commit', NOW - 50 * MIN), ended(2, 'pr_opened', NOW - 40 * MIN), ended(3, 'timeout', NOW - 30 * MIN)]), NOW).outcomes
    expect(recentFailures(outcomes, 'zcode', 'Owner/Project', NOW)).toBe(true)
    expect(recentFailures(outcomes, 'zcode', 'owner/project', NOW - 30 * MIN + HOUR)).toBe(false)
    expect(recentFailures(outcomes, 'zcode', 'owner/other', NOW)).toBe(false)
    expect(recentFailures(outcomes, 'opencode-go', 'owner/project', NOW)).toBe(false)
  })
  test('failures observed late but ended long ago do not start a fresh skip', () => {
    const outcomes = jobHistory(lines([ended(1, 'no_commit', NOW - MIN, 'owner/project', 'zcode', NOW - 75 * MIN), ended(2, 'no_commit', NOW - MIN, 'owner/project', 'zcode', NOW - 70 * MIN)]), NOW).outcomes
    expect(recentFailures(outcomes, 'zcode', 'owner/project', NOW)).toBe(false)
    expect(recentFailures(outcomes, 'zcode', 'owner/project', NOW - 15 * MIN)).toBe(true)
  })
  test('only the last three ended jobs count, and branch_pushed, cancelled and failed are not failures', () => {
    const old = [ended(1, 'no_commit', NOW - 5 * MIN), ended(2, 'timeout', NOW - 4 * MIN)]
    expect(recentFailures(jobHistory(lines([...old, ended(3, 'pr_opened', NOW - 3 * MIN), ended(4, 'pr_opened', NOW - 2 * MIN), ended(5, 'refused')]), NOW).outcomes, 'zcode', 'owner/project', NOW)).toBe(false)
    expect(recentFailures(jobHistory(lines([ended(1, 'branch_pushed'), ended(2, 'cancelled'), ended(3, 'failed')]), NOW).outcomes, 'zcode', 'owner/project', NOW)).toBe(false)
  })
  test('a newest rate_limited failure skips until the end of its hour', () => {
    const outcomes = jobHistory(lines([ended(1, 'refused', NOW - 9 * MIN), ended(2, 'rate_limited', NOW - 5 * MIN)]), NOW).outcomes
    expect(recentFailures(outcomes, 'zcode', 'owner/project', 101 * HOUR - 1)).toBe(true)
    expect(recentFailures(outcomes, 'zcode', 'owner/project', 101 * HOUR)).toBe(false)
  })

  test('the route event names the job, repository, executor and start of a sandbox placement', async () => {
    const w = world({ quota: 1, now: NOW })
    await w.agent(coding)
    expect(routeEvents(w).at(-1)).toMatchObject({ chosen: 'zcode', jobs: [{ job: 'j-0123456789abcdef', repo: 'owner/project', executor: 'zcode', started_ms: NOW }] })
  })
  test('a job that ended without a PR moves the task to the next executor and logs its outcome', async () => {
    const w = world({ quota: 1, now: NOW, sandboxRuns: failsOnce, jobStatus: { [job(1)]: { state: 'failed', end: 'no_commit' } } })
    expect(text(await w.agent(coding))).toContain('[routed: OpenCode Go sandbox')
    expect(outcomeLines(w)).toEqual([{ ts_ms: NOW, event: 'outcome', job: job(1), repo: 'owner/project', executor: 'zcode', end: 'no_commit', ended_ms: NOW }])
    expect(routeEvents(w).at(-1)).toMatchObject({ chosen: 'opencode-go', fell_through_from: ['zcode'], skipped: { zcode: 'failed' },
      jobs: [{ job: job(1), repo: 'owner/project', executor: 'zcode' }, { job: job(2), repo: 'owner/project', executor: 'opencode-go' }] })
  })
  for (const [name, options] of [
    ['still running', { jobStatus: { [job(1)]: { state: 'running', end: '' } } }],
    ['opened a PR', { jobStatus: { [job(1)]: { state: 'succeeded', end: 'pr_opened' } } }],
    ['status exits non-zero', { jobStatus: { [job(1)]: { end: 'no_commit' } }, statusExit: 1 }],
    ['status is not JSON', { jobStatus: { [job(1)]: '{' } }],
    ['status hangs past 15 seconds', { statusHangs: true }],
  ] as const) {
    test(`a failed start whose job ${name} never starts a duplicate`, async () => {
      const w = world({ quota: 1, now: NOW, sandboxRuns: { zcode: { exit: 1, output: `FAIL|${job(1)}|timeout\n` } }, ...options })
      expect(text(await w.agent(coding))).toStartWith('FAIL | router |')
      expect(starts(w)).toHaveLength(1)
      expect(outcomeLines(w)).toEqual([])
      expect(routeEvents(w).at(-1)).toMatchObject({ chosen: 'zcode', jobs: [{ job: job(1), repo: 'owner/project', executor: 'zcode' }] })
    })
  }
  test('a cancelled job stops routing for the task, with its outcome and reason logged', async () => {
    const w = world({ quota: 1, now: NOW, sandboxRuns: failsOnce, jobStatus: { [job(1)]: { state: 'cancelled', end: 'cancelled' } } })
    expect(text(await w.agent(coding))).toContain(`job ${job(1)} was cancelled; routing stops for this task`)
    expect(starts(w)).toHaveLength(1)
    expect(outcomeLines(w)).toEqual([{ ts_ms: NOW, event: 'outcome', job: job(1), repo: 'owner/project', executor: 'zcode', end: 'cancelled', ended_ms: NOW }])
    expect(routeEvents(w).at(-1)).toMatchObject({ chosen: 'zcode', reason: 'sandbox job cancelled', fell_through_from: [] })
  })
  test('the next sandbox placement records each pending job that has ended, anchored to start plus duration', async () => {
    const w = world({ quota: 1, now: NOW, logTail: [placed(1, NOW - 70 * MIN, 'owner/project', 'zcode', NOW - 80 * MIN), placed(2), placed(3), ended(3, 'pr_opened')],
      jobStatus: { [job(1)]: { end: 'timeout', duration: 600 }, [job(2)]: { state: 'running', end: '' } } })
    await w.agent(coding)
    expect(statusReads(w).map((c) => c.argv[2]).sort()).toEqual([job(1), job(2)])
    expect(outcomeLines(w)).toEqual([{ ts_ms: NOW, event: 'outcome', job: job(1), repo: 'owner/project', executor: 'zcode', end: 'timeout', ended_ms: NOW - 70 * MIN }])
  })
  test('status reads stop at the three-second budget and routing continues', async () => {
    const w = world({ quota: 1, now: NOW, logTail: [placed(1)], statusHangs: true })
    expect(text(await w.agent(coding))).toContain('[routed: zcode-job sandbox')
    expect(outcomeLines(w)).toEqual([])
  })
  test('a placement with no sandbox candidate reads no job history and no status', async () => {
    const w = world({ now: NOW, logTail: [placed(1)] })
    await w.agent({ description: '[class: standard]', prompt: 'Implement the change.' })
    expect(w.calls.some((c) => c.argv[0] === 'tail')).toBe(false)
    expect(statusReads(w)).toEqual([])
  })
  test('a truncated log read counts as no history', async () => {
    const w = world({ quota: 1, now: NOW, logTail: [ended(1, 'no_commit'), ended(2, 'refused'), placed(3)], tailTruncated: true })
    expect(text(await w.agent(coding))).toContain('[routed: zcode-job sandbox')
    expect(statusReads(w)).toEqual([])
  })
  test('an executor with repeated recent failures on the repository is skipped for it', async () => {
    const w = world({ quota: 1, now: NOW, logTail: [placed(1), placed(2), placed(3)], jobStatus: { [job(1)]: { end: 'no_commit' }, [job(2)]: { end: 'refused' }, [job(3)]: { state: 'running', end: '' } },
      sandboxRuns: { opencode: { exit: 0, output: `DONE|${job(4)}|${PR.html_url}\n` } } })
    expect(text(await w.agent(coding))).toContain('[routed: OpenCode Go sandbox')
    expect(starts(w).map((c) => c.argv[3])).toEqual(['opencode'])
    expect(routeEvents(w).at(-1)).toMatchObject({ chosen: 'opencode-go', skipped: { zcode: 'recent_failures' } })
    const other = world({ quota: 1, now: NOW, logTail: [ended(1, 'no_commit', NOW - MIN, 'owner/other'), ended(2, 'refused', NOW - MIN, 'owner/other')] })
    expect(text(await other.agent(coding))).toContain('[routed: zcode-job sandbox')
  })
})
