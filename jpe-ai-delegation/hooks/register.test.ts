// Claude supplies its kit; standalone Bun runs the same IO fixture with its native kit.
const { describe, expect, test } = await import('claude-code/testing').catch(() => import('bun:test'))
import { register } from './register'
import { CODEX, LAST_RESORT, codexArgv, explicitLabel, forbiddenModel, isAdvisory, mandatoryLabel, newestModel, parseVerdict, safePayload } from './lib/policy'
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
  quota?: number; cli?: number; quotaThrows?: boolean; cache?: boolean; codexExit?: number; answer?: string; label?: string
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
  const $ = {
    env: { get: async (key: string) => env[key] },
    session: { cwd: async () => '/workspace' },
    clock: { now: async () => 1, after: (delay: number, callback: () => void) => { if (w.gatewayTimeout && delay === 120_000) queueMicrotask(callback); return { cancel() {} } } },
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
      if (argv[0] === 'codex-quota' || argv[0].endsWith('/bin/codex-quota')) {
        if (w.quotaThrows) throw new Error('missing quota command')
        return { ...RAN, exitCode: w.quota ?? 0 }
      }
      if (argv[0] === 'codex' && argv[1] === '--version') return { ...RAN, exitCode: w.cli ?? 0 }
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
      const body = JSON.parse(init.body ?? '{}')
      if (url.endsWith('/systemone')) return { ok: true, text: JSON.stringify({ answers: { route: { choice: w.label ?? 'standard', answer_confidence: 1 } } }) }
      if (w.gatewayTimeout) return new Promise<never>(() => {})
      const status = w.gatewayStatus?.[body.model] ?? 200
      return { ok: status === 200, text: w.gatewayInvalidJson ? '{' : JSON.stringify({ choices: [{ message: { content: w.gatewayAnswer?.[body.model] ?? 'gateway result' } }] }) }
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
  return { calls, fetches, modelCalls, nextCalls, logs, invoke,
    agent: (e: Record<string, unknown> = {}) => invoke('tool.call', { tool: 'Agent', description: '[class: standard]', prompt: 'Implement the change.', ...e }),
  }
}
const text = (r: any): string => r.result.content[0].text
const runs = (w: ReturnType<typeof world>) => w.calls.filter((c) => c.argv[0] === 'codex' && c.argv[1] === 'exec')
const gateways = { LITELLM_LOCAL_BASE_URL: 'http://localhost:8000', AGENT_ROUTE_GLM_MODEL: 'configured-glm', AGENT_ROUTE_OPENCODE_GO_MODEL: 'configured-go' }
const coding = { description: '[class: public] [repo: owner/project] [task: code]', prompt: 'Implement the change.' }
const textTask = { description: '[class: text]', prompt: 'Summarize this supplied text: A small change.' }

describe('policy', () => {
  test('exact class routes and newest listed model per family', () => {
    expect(CODEX).toEqual({ bulk: { family: 'luna', effort: 'xhigh' }, 'bulk-complex': { family: 'luna', effort: 'max' }, standard: { family: 'terra', effort: 'medium' }, complex: { family: 'terra', effort: 'high' }, plan: { family: 'terra', effort: 'high' }, deep: { family: 'terra', effort: 'high' } })
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
  test('command builder rejects family mismatch, unsupported efforts and missing output', () => {
    for (const family of ['luna', 'terra'] as const) {
      for (const effort of ['', 'ultra', ...(family === 'terra' ? ['xhigh', 'max'] : ['high', 'medium'])]) expect(() => codexArgv('read-only', { family, effort }, `gpt-${family}`, '/tmp/out')).toThrow()
      for (const model of [undefined, '', 'gpt-sol', `gpt-${family}-mini`]) expect(() => codexArgv('read-only', CODEX[family === 'terra' ? 'standard' : 'bulk'], model, '/tmp/out')).toThrow()
    }
    expect(() => codexArgv('read-only', { family: 'sol', effort: 'high' } as never, 'gpt-sol', '/tmp/out')).toThrow()
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
  for (const tool of ['Edit', 'Write', 'NotebookEdit', 'Bash']) {
    test(`${tool} permits workspace-write while advisory work stays read-only`, async () => {
      for (const label of ['standard', 'plan']) {
        const w = world({ definition: `---\nmodel: haiku\ntools: [Read, ${tool}]\n---\nPerform the task.` })
        await w.agent({ subagent_type: 'worker', description: `[class: ${label}]` })
        expect(runs(w)[0].argv).toContain(label === 'plan' ? 'read-only' : 'workspace-write')
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
        expect(w.calls.map((c) => c.argv)).toEqual([['codex-quota'], ['tee', '-a', '/home/test/.claude/ai-delegation.log']])
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
  for (const fields of ['tools: [Read, Grep, Glob]', 'tools: [Read, Write]']) {
    test(`capped restricted agents retain their type and skip sandbox jobs: ${fields}`, async () => {
      const w = world({ quota: 1, env: gateways, definition: `---\nmodel: inherit\n${fields}\n---\nFollow the custom instructions.` })
      await w.agent({ ...coding, subagent_type: 'reviewer' })
      expect(w.nextCalls[0]).toMatchObject({ ...coding, subagent_type: 'reviewer', model: 'haiku', effort: 'xhigh' })
      expect(w.calls.some((c) => c.argv[0] === 'zcode-job')).toBe(false)
      expect(w.fetches).toEqual([])
    })
  }
  test('omitting tools keeps inherited Codex write access and unrestricted sandbox eligibility', async () => {
    for (const quota of [0, 1]) {
      const w = world({ quota, definition: '---\nmodel: haiku\n---\nImplement the requested change.' })
      const result = text(await w.agent({ ...coding, subagent_type: 'worker' }))
      if (quota === 0) {
        expect(runs(w)).toHaveLength(2)
        expect(runs(w)[1].argv).toContain('workspace-write')
        expect(runs(w)[1].stdin).toContain('Implement the requested change.')
      } else expect(result).toContain('routed: zcode-job sandbox')
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
  ]) {
    test(`ambiguous policy frontmatter never reaches an executor: ${fields}`, async () => {
      const w = world({ definition: `---\nmodel: haiku\n${fields}\n---\nPerform the task.` })
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
  test('quoted policy keys, CRLF, comments and folded metadata preserve the allowlist', async () => {
    const w = world({ definition: '---\r\nmodel: "haiku" # permitted\r\ndescription: >\r\n  Inspect the repository.\r\n"tools": [Read, Grep, Glob] # file reads\r\n---\r\nFollow the rubric.' })
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
    'description: |\n  Review the supplied changes.\n  tools: Bash\n  model: opus',
    'description: >-\n  Review the supplied changes\n  and report the results.',
    'metadata:\n  tools: [Bash]\n  model: opus\n  tags: [review, "code: changes"]',
    'metadata: {tags: [review, "code: changes"]}',
    'defaults: &defaults {description: Review changes}\n<<: *defaults',
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

describe('Codex first', () => {
  for (const [label, route] of Object.entries(CODEX)) {
    test(`${label} executes its assigned model and sandbox`, async () => {
      const w = world()
      expect(text(await w.agent({ description: `[class: ${label}]` }))).toContain(`codex ${route.family} ${route.effort}`)
      expect(runs(w)).toHaveLength(1)
      expect(runs(w)[0].argv).toContain(`gpt-newer-${route.family}`)
      expect(runs(w)[0].argv).toContain(isAdvisory(label as never) ? 'read-only' : 'workspace-write')
      expect(w.calls[0].argv).toEqual(['codex-quota'])
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
  for (const description of ['[class: public] [repo: owner/project] [task: code]', '[class: text]']) {
    test(`${description} cannot bypass Codex`, async () => {
      const w = world({ env: gateways })
      expect(text(await w.agent({ description }))).toContain('codex terra medium')
      expect(w.calls.some((c) => c.argv[0] === 'zcode-job')).toBe(false)
      expect(w.fetches.filter((f) => !f.url.endsWith('/systemone'))).toEqual([])
    })
  }
  test('untagged reads and triage use classifier bulk and Luna xhigh', async () => {
    const w = world({ label: 'bulk' })
    expect(text(await w.agent({ description: 'read and triage', prompt: 'Read the README.' }))).toContain('codex luna xhigh')
    expect(runs(w)).toHaveLength(2)
    expect(runs(w)[0].stdin).toContain('bulk: bulk work, reads and triage.')
  })
  test('classification itself stays on Codex while quota is available', async () => {
    const w = world({ env: gateways, label: 'complex' })
    expect(text(await w.agent({ description: 'coordinated change' }))).toContain('codex terra high')
    expect(runs(w)).toHaveLength(2)
    expect(runs(w)[0].argv).toContain('gpt-newer-luna')
    expect(runs(w)[1].argv).toContain('gpt-newer-terra')
    expect(w.fetches).toEqual([])
    expect(w.calls[0].argv).toEqual(['codex-quota'])
  })
  for (const subagent_type of ['Explore', 'Plan']) {
    test(`${subagent_type} remains read-only`, async () => {
      const w = world()
      await w.agent({ description: 'advisory', subagent_type })
      expect(runs(w)[0].argv).toContain('read-only')
      expect(runs(w)[0].argv).toContain(subagent_type === 'Plan' ? 'gpt-newer-terra' : 'gpt-newer-luna')
    })
  }
  test('worktree isolation creates an isolated checkout and keeps Codex first', async () => {
    const w = world()
    expect(text(await w.agent({ isolation: 'worktree' }))).toContain('worktree /tmp/worktree')
    expect(w.calls.find((c) => c.argv[0] === 'git')?.argv).toEqual(['git', '-C', '/workspace', 'worktree', 'add', '--detach', '/tmp/worktree', 'HEAD'])
    expect(runs(w)[0].argv.slice(0, 4)).toEqual(['codex', 'exec', '-C', '/tmp/worktree'])
    expect(w.nextCalls).toEqual([])
  })
  for (const options of [{ worktreeExit: 1 }, { temporaryExit: 1 }, { cache: false }, { answer: '' }, { codexExit: 7 }, { cli: 1 }]) {
    test(`Codex failure stops without a lower rung: ${JSON.stringify(options)}`, async () => {
      const w = world({ ...options, env: gateways })
      expect(text(await w.agent({ isolation: options.worktreeExit ? 'worktree' : undefined }))).toStartWith('FAIL | router |')
      expect(w.nextCalls).toEqual([])
      expect(w.fetches).toEqual([])
    })
  }
  for (const options of [{ quota: 127 }, { quota: 2 }, { quotaThrows: true }]) {
    test(`unknown quota fails closed: ${JSON.stringify(options)}`, async () => {
      const w = world(options)
      expect(text(await w.agent())).toContain('quota status unavailable')
      expect(w.nextCalls).toEqual([])
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
    expect(text(await w.agent({ model: 'haiku', name: 'worker', effort: 'max' }))).toContain('codex terra medium')
    expect(w.nextCalls).toEqual([])
  })
  test('custom Haiku instructions are preserved on Codex', async () => {
    const w = world({ definition: '---\nmodel: haiku\n---\nFollow the review rubric.' })
    expect(text(await w.agent({ subagent_type: 'reviewer' }))).toContain('codex terra medium')
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
      expect(text(r)).toContain(model !== 'sonnet' ? 'codex terra medium' : 'subagents are forbidden')
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
    expect(text(await w.agent({ subagent_type: 'codeql-resolver:codeql-permissions-auditor' }))).toContain('codex terra medium')
    expect(runs(w)[0].stdin).toContain('Follow the project plugin rubric.')
  })
  test('project custom definition still precedes plugin discovery', async () => {
    const w = world({ files: {
      '/workspace/.claude/agents/codeql-resolver:codeql-permissions-auditor.md': '---\nmodel: haiku\n---\nFollow the local rubric.',
      '/home/test/.claude/plugins/installed_plugins.json': '{',
    } })
    expect(text(await w.agent({ subagent_type: 'codeql-resolver:codeql-permissions-auditor' }))).toContain('codex terra medium')
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
      expect(w.fetches).toEqual([])
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
  for (const properties of [[], [{ property_name: 'ai-untrusted-ok', value: 'false' }], [{ property_name: 'ai-untrusted-ok', value: 'true' }]]) {
    for (const classified of [false, true]) {
      test(`private coding requires property and payload classification: ${JSON.stringify(properties)}, ${classified}`, async () => {
        const w = world({ quota: 1, repository: { visibility: 'private', private: true }, properties, env: gateways })
        const r = await w.agent({ ...coding, description: `${coding.description}${classified ? ' [payload: classified-safe]' : ''}` })
        const eligible = classified && properties[0]?.value === 'true'
        expect(text(r)).toContain(eligible ? 'routed: zcode-job sandbox' : 'haiku result')
        expect(w.calls.some((c) => c.argv[0] === 'zcode-job')).toBe(eligible)
        if (!eligible) expect(w.fetches.some((f) => f.url.endsWith('/chat/completions'))).toBe(false)
      })
    }
  }
  test('private metadata uses the existing authenticated CLI after an unauthenticated miss', async () => {
    const w = world({ quota: 1, githubPrivateAuth: true, repository: { visibility: 'private', private: true }, properties: [{ property_name: 'ai-untrusted-ok', value: 'true' }] })
    expect(text(await w.agent({ ...coding, description: `${coding.description} [payload: classified-safe]` }))).toContain('routed: zcode-job sandbox')
    expect(w.calls.filter((c) => c.argv[0] === 'gh').map((c) => c.argv)).toEqual([
      ['gh', 'api', 'repos/owner/project'], ['gh', 'api', 'repos/owner/project/properties/values'],
    ])
  })
  test('unreadable private metadata never qualifies for zcode', async () => {
    const w = world({ quota: 1, githubPrivateAuth: true, githubAuthDenied: true, env: gateways })
    expect(text(await w.agent(coding))).toContain('haiku result')
    expect(w.calls.some((c) => c.argv[0] === 'zcode-job')).toBe(false)
  })
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
      expect(w.fetches.some((f) => f.url.endsWith('/chat/completions'))).toBe(false)
      expect(w.nextCalls).toEqual([])
    })
  }
  test('GLM precedes OpenCode Go; neither uses small', async () => {
    const w = world({ quota: 1, env: gateways })
    expect(text(await w.agent(textTask))).toContain('routed: Z.ai GLM')
    expect(w.fetches.map((f) => JSON.parse(f.body!).model)).toEqual(['configured-glm'])
  })
  test('GLM failure advances to OpenCode Go before Haiku', async () => {
    const w = world({ quota: 1, env: gateways, gatewayStatus: { 'configured-glm': 503 } })
    expect(text(await w.agent(textTask))).toContain('routed: OpenCode Go')
    expect(w.fetches.map((f) => JSON.parse(f.body!).model)).toEqual(['configured-glm', 'configured-go'])
    expect(w.nextCalls).toEqual([])
  })
  for (const options of [{ env: {} }, { env: gateways, gatewayStatus: { 'configured-glm': 503, 'configured-go': 503 } }, { env: gateways, gatewayAnswer: { 'configured-glm': '', 'configured-go': '' } }, { env: gateways, gatewayInvalidJson: true }, { env: gateways, gatewayTimeout: true }]) {
    test(`Haiku xhigh only after all earlier rungs fail to qualify: ${JSON.stringify(options)}`, async () => {
      const w = world({ quota: 1, ...options })
      await w.agent({ ...textTask, model: 'haiku', effort: 'low' })
      expect(w.nextCalls[0]).toMatchObject({ model: 'haiku', effort: 'xhigh' })
      expect(runs(w)).toEqual([])
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
      expect(policy).toStartWith(`codex-quota: ${status}\nCheck codex-quota first.`)
      for (const fragment of ['Luna xhigh', 'Luna max', '[class: bulk-complex]', 'Terra medium', 'Terra high', 'ai-untrusted-ok=true', 'payload classification', 'then Z.ai GLM, then OpenCode Go, then Haiku xhigh', 'human:review', 'leak-scan', 'never auto-merge', 'Sonnet, Opus or Fable', 'secrets, credentials, inventory or incident content']) expect(policy).toContain(fragment)
    })
  }
})
