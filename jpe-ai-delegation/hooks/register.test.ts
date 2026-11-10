import { describe, expect, test } from 'claude-code/testing'
import { register } from './register'
import { CODEX, LAST_RESORT, codexArgv, eligible, estimateTokens, explicitLabel, forbiddenModel, isAdvisory, localTask, mandatoryLabel, newestModel, parseVerdict, pickLocal, rankExecutors, safePayload, scoreWindows } from './lib/policy'
import { customAgentSandbox, parseAgentDefinition } from './lib/agent-definition'

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
  quota?: number; meterOnPath?: boolean; codexWindows?: unknown[]; now?: number; gatewayFinish?: string; quotaThrows?: boolean; cache?: boolean; codexExit?: number; answer?: string; label?: string
  env?: Record<string, string>; definition?: string; files?: Record<string, string>; fsThrows?: boolean; worktreeExit?: number; temporaryExit?: number
  repository?: unknown; properties?: unknown; githubPrivateAuth?: boolean; githubAuthDenied?: boolean; pr?: unknown; githubError?: boolean; githubInvalidJson?: boolean
  zcodeExit?: number; zcodeOutput?: string; zcodeAvailable?: boolean; zcodeThrows?: boolean; zcodeTruncated?: boolean
  gatewayTimeout?: boolean; gatewayStatus?: Record<string, number>; gatewayAnswer?: Record<string, string>; gatewayInvalidJson?: boolean
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
  const modelCalls: unknown[] = []
  const nextCalls: any[] = []
  const logs: string[] = []
  const env: Record<string, string> = { HOME: '/home/test', ...w.env }
  let output = ''
  let clockNow = w.now ?? 1_000_000
  const $ = {
    env: { get: async (key: string) => env[key] },
    session: { cwd: async () => '/workspace' },
    clock: { now: async () => clockNow, after: (delay: number, callback: () => void) => { if (w.gatewayTimeout && delay >= 60_000) queueMicrotask(callback); return { cancel() {} } } },
    ui: { log: (line: string) => logs.push(line) },
    fs: {
      exists: async (path: string) => {
        if (w.fsThrows) throw new Error('read failed')
        return path.endsWith('models_cache.json') ? w.cache !== false : w.files?.[path] !== undefined || Boolean(w.definition)
      },
      read: async (path: string) => path === '/token' ? 'test-token' : path.endsWith('models_cache.json') ? CACHE : path === '/tmp/final' ? output : w.files?.[path] ?? w.definition ?? '',
    },
    process: { run: async (argv: string[], init?: { stdin?: string }) => {
      calls.push({ argv, stdin: init?.stdin })
      if (argv.slice(-2).join(' ') === 'quota --json') {
        if (w.quotaThrows) throw new Error('quota command timed out')
        const quota = w.quota ?? 0
        if (quota !== 0 && quota !== 1) return { ...RAN, exitCode: quota }
        // Default: Codex available and exactly on pace (score 0); quota 1: exhausted.
        const windows = w.codexWindows ?? [{ kind: 'weekly', used_percent: quota === 1 ? 100 : 50, window_seconds: 2000, reset_at: 2000 }]
        return { ...RAN, stdout: JSON.stringify({ provider_quotas: [{ id: 'claude', status: 'ok', windows: [] }, { id: 'codex', status: 'ok', windows }] }) }
      }
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
      if (argv[0] === 'which' && argv[1] === 'token-meter-server') return w.meterOnPath === false ? { ...RAN, exitCode: 1 } : { ...RAN, stdout: '/run/bin/token-meter-server\n' }
      if (argv[0] === 'which') return { ...RAN, exitCode: w.zcodeAvailable === false ? 1 : 0 }
      if (argv[0] === 'zcode-job') {
        if (w.zcodeThrows) throw new Error('dispatch failed')
        return { ...RAN, exitCode: w.zcodeExit ?? 0, stdout: w.zcodeOutput ?? `DONE|j-0123456789abcdef|${PR.html_url}\n`, isStdoutTruncated: w.zcodeTruncated ?? false }
      }
      return RAN
    } },
    http: { fetch: async (url: string, init: { body?: string }) => {
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
  return { calls, fetches, modelCalls, nextCalls, logs, invoke, setNow: (ms: number) => { clockNow = ms },
    agent: (e: Record<string, unknown> = {}) => invoke('tool.call', { tool: 'Agent', description: '[class: standard]', prompt: 'Implement the change.', ...e }),
  }
}
const text = (r: any): string => r.result.content[0].text
const runs = (w: ReturnType<typeof world>) => w.calls.filter((c) => c.argv[0] === 'codex' && c.argv[1] === 'exec')
const gateways = { LITELLM_LOCAL_BASE_URL: 'http://localhost:8000', AGENT_ROUTE_GLM_MODEL: 'configured-glm', AGENT_ROUTE_OPENCODE_GO_MODEL: 'configured-go' }
const coding = { description: '[class: public] [repo: owner/project] [task: code]', prompt: 'Implement the change.' }
const textTask = { description: '[class: text]', prompt: 'Summarize this supplied text: A small change.' }
const QUOTA_ARGV = ['/run/bin/token-meter-server', 'quota', '--json']
const STAGED_METER = '/home/test/Library/Application Support/Token Meter/runtime/meter.py'
const quotaCall = (w: ReturnType<typeof world>) => w.calls.find((c) => c.argv.slice(-2).join(' ') === 'quota --json')
const routeEvents = (w: ReturnType<typeof world>) => w.calls.filter((c) => c.argv[0] === 'tee' && c.stdin?.startsWith('{')).map((c) => JSON.parse(c.stdin!))
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
      expect(w.calls[0].argv).toEqual(['which', 'token-meter-server'])
      expect(w.calls[1].argv).toEqual(QUOTA_ARGV)
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
    expect(w.calls[0].argv).toEqual(['which', 'token-meter-server'])
    expect(w.calls[1].argv).toEqual(QUOTA_ARGV)
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
    expect(eligible(true)).toEqual(['zcode', 'opencode-go', 'codex'])
    expect(eligible(false)).toEqual(['codex'])
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
    expect(rankExecutors(['zcode', 'opencode-go', 'codex'], {})).toEqual(['zcode', 'opencode-go', 'codex'])
    expect(rankExecutors(['zcode', 'opencode-go', 'codex'], { codex: { score: 3, exhausted: false } })).toEqual(['codex', 'zcode', 'opencode-go'])
    expect(rankExecutors(['zcode', 'opencode-go', 'codex'], { codex: { score: 0, exhausted: false } })).toEqual(['zcode', 'opencode-go', 'codex'])
    expect(rankExecutors(['zcode', 'opencode-go', 'codex'], { zcode: { exhausted: true } })).toEqual(['opencode-go', 'codex'])
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
    expect(routeEvents(w).at(-1)).toMatchObject({ chosen: 'zcode', eligible: ['zcode', 'opencode-go', 'codex', 'haiku'] })
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
  test('a hanging quota CLI leaves quota unknown and keeps the static order', async () => {
    const w = world({ quotaThrows: true, env: gateways })
    expect(text(await w.agent(coding))).toContain('[routed: zcode-job sandbox;')
    expect(routeEvents(w).at(-1)).toMatchObject({ scores: { zcode: null, 'opencode-go': null, codex: null } })
  })
  test('quota is read once per session and refreshed in the background after ten minutes', async () => {
    const w = world({ quota: 1, env: gateways })
    const reads = () => w.calls.filter((c) => c.argv.slice(-2).join(' ') === 'quota --json').length
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
  test('without token-meter-server on PATH the staged runtime is used when present', async () => {
    const w = world({ quota: 1, meterOnPath: false, files: { [STAGED_METER]: '' } })
    await w.agent()
    expect(quotaCall(w)?.argv).toEqual(['python3', STAGED_METER, 'quota', '--json'])
  })
  test('with no token-meter installed, quota is unknown and no quota command runs', async () => {
    const w = world({ meterOnPath: false })
    expect(text(await w.agent())).toContain('codex luna xhigh')
    expect(quotaCall(w)).toBeUndefined()
    expect(routeEvents(w).at(-1)).toMatchObject({ scores: { codex: null } })
  })
  test('TOKEN_METER_BIN replaces the default meter path', async () => {
    const w = world({ quota: 1, env: { TOKEN_METER_BIN: '/opt/token-meter' } })
    await w.agent()
    expect(w.calls[0].argv).toEqual(['/opt/token-meter', 'quota', '--json'])
  })
})
