import { describe, expect, test } from 'claude-code/testing'
import type { EngineInterface } from 'claude-code'
import { endAnchor, jobHistory, jobState, recentFailures } from './lib/policy'
import { register } from './register'
import { CODEX, EXECUTOR_TABLE, LAST_RESORT, codexArgv, eligibleRows, mergeExecutorRows, metricsResult, peakMultiplier, QUOTA_SELECTOR, quotaFromMetrics, rankRows, repositoryFromOrigin, validRow, estimateTokens, explicitLabel, forbiddenModel, isAdvisory, localTask, mandatoryLabel, newestModel, parseVerdict, pickLocal, safePayload, scoreWindows, budgetsFromMetrics, forbiddenRowModel } from './lib/policy'
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
  quota?: number; codexWindows?: unknown[]; cursorWindows?: unknown[]; now?: number; gatewayFinish?: string; quotaThrows?: boolean; cache?: boolean; codexExit?: number; codexStderr?: string; codexOutputMissing?: boolean; answer?: string; label?: string
  codexError?: string; env?: Record<string, string | undefined>; definition?: string; files?: Record<string, string>; fsThrows?: boolean; worktreeExit?: number; temporaryExit?: number
  repository?: unknown; properties?: unknown; githubPrivateAuth?: boolean; githubAuthDenied?: boolean; pr?: unknown; githubError?: boolean; githubInvalidJson?: boolean; gitRoot?: string; originUrl?: string; gitReadFail?: boolean
  sessionCwd?: string; pathRealpaths?: Record<string, string>; pathKinds?: Record<string, 'file' | 'directory'>; pathGitRoots?: Record<string, string>; unresolvedPaths?: string[]
  zcodeExit?: number; zcodeOutput?: string; zcodeAvailable?: boolean; zcodeThrows?: boolean; zcodeTruncated?: boolean
  sandboxRuns?: Record<string, { exit: number; output: string }>; jobStatus?: Record<string, unknown>; statusHangs?: boolean; statusExit?: number; logTail?: unknown[]; tailTruncated?: boolean
  gatewayTimeout?: boolean; gatewayStatus?: Record<string, number>; gatewayAnswer?: Record<string, string>; gatewayInvalidJson?: boolean
  quotaUrl?: string | null; quotaTimeout?: boolean; quotaText?: string; quotaSampleAge?: number; quotaStatus?: number
  quotaFileTypes?: Record<string, 'file' | 'directory' | 'symlink'>
  readThrows?: string; readHangs?: string
  envThrows?: string; clockThrows?: boolean; clockHangs?: boolean; teeThrows?: boolean; teeExit?: number; nextRejects?: boolean
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
  const writes: string[] = []
  const fetches: { url: string; body?: string }[] = []
  const quotaFetches: string[] = []
  const quotaHeaders: Record<string, string>[] = []
  // Every request with its full URL and headers, and every path touched through fs.
  const allFetches: { url: string; headers: Record<string, string>; body?: string }[] = []
  const fsTouches: string[] = []
  const fsReads: string[] = []
  const fsStats: { path: string; resolve?: boolean }[] = []
  const modelCalls: unknown[] = []
  const nextCalls: any[] = []
  const logs: string[] = []
  const tempPaths = new Set<string>()
  const tempInputs = new Map<string, string>()
  const tempOutputs = new Map<string, string>()
  const outputPaths = new Set<string>()
  let tempCounter = 0
  const env: Record<string, string | undefined> = { HOME: '/home/test', PATH: '/usr/bin:/bin', USER: 'tester', TERM: 'dumb', LANG: 'C.UTF-8', ...(w.quotaUrl === null ? {} : { AGENT_QUOTA_QUERY_URL: w.quotaUrl ?? QUOTA_BASE }), ...w.env }
  let output = ''
  let clockNow = w.now ?? 1_000_000
  const fs: Pick<EngineInterface['fs'], 'exists' | 'stat'> = {
    exists: async (path: string) => {
      fsTouches.push(path)
      if (w.fsThrows) throw new Error('read failed')
      if (path === w.readThrows || path === w.readHangs) return true
      if (outputPaths.has(path) && w.codexOutputMissing) return false
      if (tempPaths.has(path)) return true
      if (path.endsWith('/executors.json')) return w.files?.[path] !== undefined
      return path.endsWith('models_cache.json') ? w.cache !== false : w.files?.[path] !== undefined || Boolean(w.definition)
    },
    stat: async (path, options) => {
      fsTouches.push(path)
      fsStats.push({ path, resolve: options?.resolve })
      const cwd = w.sessionCwd ?? '/workspace'
      const mappedPath = Object.keys(w.pathGitRoots ?? {}).some((root) => path === root || path.startsWith(`${root.replace(/\/+$/g, '')}/`))
      const realPathTarget = Object.values(w.pathRealpaths ?? {}).some((target) => path === target || path.startsWith(`${target.replace(/\/+$/g, '')}/`))
      const repositoryPath = path === cwd || path.startsWith(`${cwd.replace(/\/+$/g, '')}/`) || mappedPath || realPathTarget || w.pathKinds?.[path] !== undefined
      if (w.fsThrows || (w.files?.[path] === undefined && !repositoryPath && path !== w.readThrows && path !== w.readHangs)) throw new Error('metadata read failed')
      const kind = w.quotaFileTypes?.[path] ?? (w.pathKinds?.[path] ?? (path === '/workspace' || path.endsWith('/') ? 'directory' : 'file'))
      return {
        kind: kind === 'directory' ? 'dir' : kind === 'symlink' && options?.resolve === false ? 'other' : 'file',
        size: new TextEncoder().encode(w.files?.[path] ?? '').byteLength,
        mtimeMs: 0,
        isLink: kind === 'symlink',
      }
    },
  }
  const $ = {
    env: { get: async (key: string) => { if (key === w.envThrows) throw new Error('environment read failed'); return env[key] } },
    session: { cwd: async () => w.sessionCwd ?? '/workspace' },
    clock: { now: async () => { if (w.clockThrows) throw new Error('clock failed'); if (w.clockHangs) return new Promise<number>(() => {}); return clockNow }, after: (delay: number, callback: () => void) => { if ((w.clockHangs && delay === 5_000) || (w.gatewayTimeout && delay >= 60_000) || (w.quotaTimeout && delay === 3_000) || (w.statusHangs && (delay === 3_000 || delay === 15_000))) queueMicrotask(callback); return { cancel() {} } } },
    ui: { log: (line: string) => logs.push(line) },
    fs: {
      ...fs,
      read: async (path: string) => {
        fsTouches.push(path)
        fsReads.push(path)
        if (path === w.readThrows) throw new Error('EISDIR: illegal operation on a directory')
        if (path === w.readHangs) return new Promise<never>(() => {})
        return path === '/token' ? 'test-token' : path.endsWith('models_cache.json') ? CACHE : tempOutputs.get(path) ?? tempInputs.get(path) ?? w.files?.[path] ?? w.definition ?? ''
      },
    },
    process: { run: async (argv: string[], init?: { stdin?: string }) => {
      calls.push({ argv, stdin: init?.stdin })
      if (argv[0] === 'tee' && w.teeThrows) throw new Error('log write failed')
      if (argv[0] === 'tee') {
        if (argv[1] === '-a') { if ((w.teeExit ?? 0) === 0) writes.push(init?.stdin ?? '') }
        else if ((w.teeExit ?? 0) === 0) tempInputs.set(argv[1], init?.stdin ?? '')
        return { ...RAN, exitCode: w.teeExit ?? 0 }
      }
      if (argv[0] === 'mktemp') {
        if (argv[1] === '-d') return { ...RAN, exitCode: w.temporaryExit ?? 0, stdout: '/tmp/worktree' }
        const index = Math.floor(tempCounter / 2)
        const name = tempCounter++ % 2 === 0 ? 'final' : 'prompt'
        const path = `/tmp/${name}-${index}`
        tempPaths.add(path)
        if (name === 'final') outputPaths.add(path)
        return { ...RAN, exitCode: w.temporaryExit ?? 0, stdout: path }
      }
      if (argv[0] === 'realpath') {
        const path = argv[1]
        if (w.unresolvedPaths?.includes(path)) return { ...RAN, exitCode: 1 }
        const resolved = w.pathRealpaths?.[path] ?? path.split('/').reduce<string[]>((parts, segment) => {
          if (!segment || segment === '.') return parts
          if (segment === '..') parts.pop()
          else parts.push(segment)
          return parts
        }, []).join('/')
        return { ...RAN, stdout: resolved.startsWith('/') ? resolved : `/${resolved}` }
      }
      if (argv[0] === 'git') {
        if (argv[3] === 'rev-parse' && argv[4] === '--show-toplevel') {
          const candidate = argv[2]
          const mapped = Object.entries(w.pathGitRoots ?? {}).filter(([path]) => candidate === path || candidate.startsWith(`${path.replace(/\/+$/g, '')}/`)).sort(([a], [b]) => b.length - a.length)[0]?.[1]
          return { ...RAN, exitCode: w.gitReadFail ? 1 : 0, stdout: mapped ?? w.gitRoot ?? '/workspace' }
        }
        if (argv[3] === 'remote' && argv[4] === 'get-url') return { ...RAN, exitCode: w.originUrl ? 0 : 2, stdout: w.originUrl ?? '' }
        return { ...RAN, exitCode: w.worktreeExit ?? 0 }
      }
      if (argv[0] === '/bin/sh' && argv[1] === '-c') {
        if (w.codexError) throw new Error(w.codexError)
        const codex = argv.slice(11)
        const input = tempInputs.get(argv[10]) ?? ''
        const outputFile = codex[codex.indexOf('-o') + 1]
        output = input.startsWith('Classify the delegated task') ? w.label ?? 'standard' : w.answer ?? 'task result'
        if (w.codexOutputMissing) tempPaths.delete(outputFile)
        else tempOutputs.set(outputFile, output)
        return { ...RAN, exitCode: w.codexExit ?? 0, stderr: w.codexStderr ?? '' }
      }
      if (argv[0] === 'rm') return RAN
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
    http: { fetch: async (url: string, init: { body?: string; headers?: Record<string, string> }) => {
      allFetches.push({ url, headers: { ...init.headers }, body: init.body })
      if (url.includes('/api/v1/query?')) {
        quotaFetches.push(url)
        quotaHeaders.push({ ...init.headers })
        if (w.quotaThrows) throw new Error('quota read failed')
        if (w.quotaStatus !== undefined) return { ok: false, status: w.quotaStatus, text: '{"status":"error","error":"unauthorized"}' }
        if (w.quotaTimeout) return new Promise<never>(() => {})
        if (w.quotaText !== undefined) return { ok: true, text: w.quotaText }
        const quota = w.quota ?? 0
        if (quota !== 0 && quota !== 1) return { ok: false, text: '' }
        // Default: Codex available and exactly on pace (score 0); quota 1: exhausted. The window resets 1000 s after the
        // clock, so "exhausted" holds at any world clock. Cursor publishes nothing unless set.
        const at = clockNow / 1000 - (w.quotaSampleAge ?? 60)
        const codex = w.codexWindows ?? [{ kind: 'weekly', used_percent: quota === 1 ? 100 : 50, window_seconds: 2000, reset_at: clockNow / 1000 + 1000 }]
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
    const next = async (value: unknown) => { nextCalls.push(value); if (w.nextRejects) throw new Error('core failed'); return core }
    try { return await handler.run($, e, next) } catch (error) {
      if (!handler.caught) throw error
      return handler.caught($, e, next)
    }
  }
  return { calls, writes, fetches, quotaFetches, quotaHeaders, allFetches, fsTouches, fsReads, fsStats, modelCalls, nextCalls, logs, invoke, setNow: (ms: number) => { clockNow = ms }, tempFile: (path: string) => tempInputs.get(path),
    agent: (e: Record<string, unknown> = {}) => invoke('tool.call', { tool: 'Agent', description: '[class: standard]', prompt: 'Implement the change.', ...e }),
  }
}
const text = (r: any): string => r.result.content[0].text
const runs = (w: ReturnType<typeof world>) => w.calls.filter((c) => c.argv[0] === '/bin/sh' && c.argv[1] === '-c' && c.argv[11] === 'codex')
const codexPrompt = (w: ReturnType<typeof world>, call = runs(w)[0]) => w.tempFile(call.argv[10])
const gateways = { LITELLM_LOCAL_BASE_URL: 'http://localhost:8000', AGENT_ROUTE_GLM_MODEL: 'configured-glm', AGENT_ROUTE_OPENCODE_GO_MODEL: 'configured-go' }
const coding = { description: '[class: public] [repo: owner/project] [task: code]', prompt: 'Implement the change.' }
const textTask = { description: '[class: text]', prompt: 'Summarize this supplied text: A small change.' }
// A placeholder name for the metrics store's proxied route; no address.
const QUOTA_BASE = 'https://quota.example.test'
const QUERY_URL = `${QUOTA_BASE}/api/v1/query?query=${encodeURIComponent('{__name__=~"agent_quota_(used_percent|window_seconds|reset_timestamp_seconds)|litellm_remaining_api_key_budget_metric"}')}`
const instantQuery = (result: unknown[]) => ({ status: 'success', data: { resultType: 'vector', result } })
// The three gauges of each window, as one publisher sample at `at` seconds.
function series(executor: string, windows: any[], at: number, source = 'provider') {
  return windows.flatMap((w, i) => ([['used_percent', w.used_percent], ['window_seconds', w.window_seconds], ['reset_timestamp_seconds', w.reset_at]] as const)
    .filter(([, v]) => v !== undefined)
    .map(([name, v]) => ({ metric: { __name__: `agent_quota_${name}`, executor, window: w.kind ?? `w${i}`, source }, value: [at, String(v)] })))
}
// Decision-log lines that were written (the writer exited 0), not attempts.
const routeEvents = (w: ReturnType<typeof world>) => w.writes.filter((s) => s.startsWith('{')).flatMap((s) => s.trim().split('\n')).map((line) => JSON.parse(line))
// Subprocess calls other than the decision-log append.
const work = (w: ReturnType<typeof world>) => w.calls.filter((c) => c.argv[0] !== 'tee')
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
      const argv = codexArgv('read-only', route, `gpt-newer-${route.family}`, '/tmp/out', '/workspace')
      expect(argv).toContain(`model_reasoning_effort=${route.effort}`)
      expect(argv.slice(-3)).toEqual(['-o', '/tmp/out', '-'])
      expect(argv).toEqual(['codex', 'exec', '--skip-git-repo-check', '-m', `gpt-newer-${route.family}`, '-c', `model_reasoning_effort=${route.effort}`, '-s', 'read-only', '-C', '/workspace', '-o', '/tmp/out', '-'])
    })
  }
  test('command builder rejects any non-Luna family, unsupported efforts and missing output', () => {
    for (const effort of ['', 'ultra', 'high', 'medium']) expect(() => codexArgv('read-only', { family: 'luna', effort }, 'gpt-luna', '/tmp/out', '/workspace')).toThrow()
    for (const model of [undefined, '', 'gpt-sol', 'gpt-luna-mini']) expect(() => codexArgv('read-only', CODEX.bulk, model, '/tmp/out', '/workspace')).toThrow()
    expect(() => codexArgv('read-only', { family: 'terra', effort: 'high' } as never, 'gpt-terra', '/tmp/out', '/workspace')).toThrow()
    expect(() => codexArgv('read-only', CODEX.bulk, 'gpt-terra', '/tmp/out', '/workspace')).toThrow()
    expect(() => codexArgv('read-only', CODEX.bulk, 'gpt-luna', '', '/workspace')).toThrow()
    expect(() => codexArgv('read-only', CODEX.bulk, 'gpt-luna', '/tmp/out', 'relative')).toThrow()
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
        const result = text(await w.agent({ ...coding, subagent_type: 'worker' }))
        const event = routeEvents(w).at(-1)
        expect(event.eligible).toContain('zcode')
        if (quota === 0) {
          expect(result).toContain('codex luna xhigh')
          expect(event.chosen).toBe('codex')
          expect(w.calls.some((c) => c.argv[0] === 'zcode-job')).toBe(false)
        } else {
          expect(result).toContain('routed: zcode-job sandbox')
          expect(event.chosen).toBe('zcode')
          expect(w.calls.some((c) => c.argv[0] === 'zcode-job')).toBe(true)
        }
      }
    })
  }
  test('YAML model escapes retain the forbidden-model guard', async () => {
    const w = world({ definition: '---\nmodel: "o\\x70us"\n---\nReview changes.' })
    expect(text(await w.agent({ subagent_type: 'reviewer' }))).toContain('subagents are forbidden')
    expect(work(w)).toEqual([])
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
        expect(work(w)).toEqual([])
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
      expect(work(w)).toEqual([])
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
      const result = text(await w.agent({ ...coding, subagent_type: 'worker' }))
      const event = routeEvents(w).at(-1)
      expect(event.eligible).toContain('zcode')
      if (quota === 0) {
        expect(result).toContain('codex luna xhigh')
        expect(event.chosen).toBe('codex')
        expect(w.calls.some((c) => c.argv[0] === 'zcode-job')).toBe(false)
      } else {
        expect(result).toContain('routed: zcode-job sandbox')
        expect(event.chosen).toBe('zcode')
        expect(w.calls.find((c) => c.argv[0] === 'zcode-job')?.argv.slice(0, 3)).toEqual(['zcode-job', 'start', 'owner/project'])
      }
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
      expect(work(w)).toEqual([])
      expect(w.nextCalls).toEqual([])
    })
  }
  test('an unterminated frontmatter block fails closed', async () => {
    const w = world({ definition: '---\nmodel: haiku\ntools: [Read]\nPerform the task.' })
    expect(text(await w.agent({ subagent_type: 'reviewer' }))).toStartWith('FAIL | router |')
    expect(work(w)).toEqual([])
    expect(w.nextCalls).toEqual([])
  })
  test('CRLF, comments and folded metadata preserve the allowlist', async () => {
    const w = world({ definition: '---\r\nmodel: "haiku" # permitted\r\ndescription: >\r\n  Inspect the repository.\r\ntools: [Read, Grep, Glob] # file reads\r\n---\r\nFollow the rubric.' })
    await w.agent({ subagent_type: 'reviewer' })
    expect(runs(w)[0].argv).toContain('read-only')
    expect(codexPrompt(w, runs(w)[0])).toContain('Follow the rubric.')
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
        expect(codexPrompt(w, runs(w)[0])).toContain('Follow the rubric.')
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
  test('Codex receives the prompt from a file on stdin and writes its final message with -o', async () => {
    const w = world()
    await w.agent({ description: '[class: standard]', prompt: 'Implement the change.' })
    const call = runs(w)[0]
    const args = call.argv.slice(11)
    expect(call.stdin).toBeUndefined()
    expect(call.argv[2]).toContain('"$@" < "$input_file"')
    expect(call.argv.slice(4, 9)).toEqual(['/home/test', '/usr/bin:/bin', 'tester', 'dumb', 'C.UTF-8'])
    expect(call.argv[9]).toBe('')
    expect(w.tempFile(call.argv[10])).toBe('Implement the change.')
    expect(args[0]).toBe('codex')
    const outputAt = args.indexOf('-o')
    expect(args[outputAt + 1]).toMatch(/^\/tmp\/final-\d+$/)
    expect(args.at(-1)).toBe('-')
    expect(args).toContain('--skip-git-repo-check')
    expect(args).toContain('-C')
    expect(args).toContain('/workspace')
  })
  test('Codex receives CODEX_HOME so its model cache and auth location match', async () => {
    const w = world({ env: { ...gateways, CODEX_HOME: '/custom/codex-home' } })
    await w.agent({ description: '[class: standard]' })
    const call = runs(w)[0]
    expect(w.fsTouches).toContain('/custom/codex-home/models_cache.json')
    expect(call.argv[9]).toBe('/custom/codex-home')
    expect(call.argv[2]).toContain('"CODEX_HOME=$codex_home"')
    expect(call.argv[2]).toContain('/usr/bin/env -i')
  })
  test('Codex uses safe defaults when USER, TERM and LANG are unset', async () => {
    const w = world({ env: { ...gateways, USER: undefined, TERM: undefined, LANG: undefined } })
    await w.agent({ description: '[class: standard]' })
    expect(runs(w)[0].argv.slice(6, 9)).toEqual(['codex', 'dumb', 'C.UTF-8'])
  })
  test('Codex failures log the exit code and stderr tail, or a missing final-message file', async () => {
    const failed = world({ codexExit: 7, codexStderr: 'temporary network failure' })
    await failed.agent({ description: '[class: standard]' })
    expect(failed.writes.some((line) => line.includes('codex failure: codex exec exited with code 7; stderr tail: temporary network failure'))).toBe(true)

    const missing = world({ codexOutputMissing: true })
    await missing.agent({ description: '[class: standard]' })
    expect(missing.writes.some((line) => line.includes('codex failure: codex exec final-message output file is missing'))).toBe(true)
  })
  test('credential screening happens before stderr and exception details are truncated', async () => {
    const secret = 'ghp_abcdefghijklmnopqrst'
    const tail = 'outside-the-window-probe '.repeat(40)
    const stderr = world({ codexExit: 7, codexStderr: `${secret}${tail}` })
    await stderr.agent({ description: '[class: standard]' })
    expect(stderr.writes.join('\n')).toContain('stderr tail: [detail redacted]')
    expect(stderr.writes.join('\n')).not.toContain(secret)
    expect(stderr.writes.join('\n')).not.toContain(tail)

    const thrown = world({ codexError: `${secret}${tail}` })
    await thrown.agent({ description: '[class: standard]' })
    expect(thrown.writes.join('\n')).toContain('codex exec invocation failed: [detail redacted]')
    expect(thrown.writes.join('\n')).not.toContain(secret)
    expect(thrown.writes.join('\n')).not.toContain(tail)
  })
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
  test('known at-pace Codex ranks ahead of unknown sandboxes for tagged public coding', async () => {
    const w = world()
    expect(text(await w.agent(coding))).toContain('codex luna xhigh')
    expect(routeEvents(w).at(-1)).toMatchObject({ chosen: 'codex', eligible: ['zcode', 'opencode-go', 'codex', 'cursor', 'haiku'], scores: { codex: { used: 50, line: 50 } } })
    expect(runs(w)).toHaveLength(2)
    expect(w.calls.some((c) => c.argv[0] === 'zcode-job')).toBe(false)
    expect(w.fetches.map((f) => f.url)).toEqual(['https://api.github.com/repos/owner/project'])
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
    expect(codexPrompt(w, runs(w)[0])).toContain('bulk: bulk work, reads and triage.')
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
    expect(runs(w)[0].argv.slice(11, 13)).toEqual(['codex', 'exec'])
    expect(runs(w)[0].argv.slice(20, 22)).toEqual(['-C', '/tmp/worktree'])
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
      expect(routeEvents(w).at(-1)).toMatchObject({ chosen: 'codex', scores: { codex: { used: null, line: null } } })
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
        expect(work(w)).toEqual([])
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
    expect(codexPrompt(w, runs(w)[0])).toContain('Follow the review rubric.')
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
        expect(work(w)).toEqual([])
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
      if (model !== 'sonnet') expect(codexPrompt(w, runs(w)[0])).toContain('Follow the plugin review rubric.')
      else expect(work(w)).toEqual([])
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
      expect(work(w)).toEqual([])
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
    expect(codexPrompt(w, runs(w)[0])).toContain('Follow the project plugin rubric.')
  })
  test('project custom definition still precedes plugin discovery', async () => {
    const w = world({ files: {
      '/workspace/.claude/agents/codeql-resolver:codeql-permissions-auditor.md': '---\nmodel: haiku\n---\nFollow the local rubric.',
      '/home/test/.claude/plugins/installed_plugins.json': '{',
    } })
    expect(text(await w.agent({ subagent_type: 'codeql-resolver:codeql-permissions-auditor' }))).toContain('codex luna xhigh')
    expect(codexPrompt(w, runs(w)[0])).toContain('Follow the local rubric.')
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
  test('untagged supplied-text requests use the local small alias; untagged coding requests stay tool-capable', async () => {
    const textWork = world({ quota: 1, env: gateways })
    expect(text(await textWork.agent({ description: undefined, prompt: 'Summarize this supplied text: A small change.' }))).toContain('[routed: local small]')

    const codeWork = world({ env: gateways, zcodeAvailable: false })
    await codeWork.agent({ description: '[task: code]', prompt: 'Implement the change.' })
    expect(codeWork.fetches.some((fetch) => fetch.url.endsWith('/model/info') || fetch.url.endsWith('/chat/completions'))).toBe(false)
    expect(runs(codeWork).length).toBeGreaterThan(0)
  })
  test('long supplied text included inline remains eligible for local chat when it fits', async () => {
    const prompt = `Summarize this supplied text: ${'word '.repeat(4_000)}`
    const w = world({ env: gateways })
    expect(text(await w.agent({ description: undefined, prompt }))).toContain('[routed: local small]')
    expect(JSON.parse(w.fetches.find((fetch) => fetch.url.endsWith('/chat/completions'))!.body!).messages[0].content).toBe(prompt)
  })
  for (const prompt of [
    'Summarize /workspace/project/notes.md',
    'Summarize this supplied text and run the tests.',
    'Edit the file using the supplied text.',
  ]) {
    test(`an untagged prompt with a path or tool instruction does not use local chat: ${prompt}`, async () => {
      const w = world({ env: gateways, zcodeAvailable: false })
      await w.agent({ description: undefined, prompt })
      expect(w.fetches.some((fetch) => fetch.url.endsWith('/model/info') || fetch.url.endsWith('/chat/completions'))).toBe(false)
      expect(runs(w).length).toBeGreaterThan(0)
    })
  }
  test('a [class: text] tag overrides prompt inference and still selects local chat', async () => {
    const w = world({ quota: 1, env: gateways })
    expect(text(await w.agent({ description: '[class: text]', prompt: 'A short supplied summary.' }))).toContain('[routed: local small]')
  })
  test('a local answer reporting missing access is logged and falls through', async () => {
    const w = world({ quota: 1, env: gateways, gatewayAnswer: { small: 'I cannot access the file you mentioned.' } })
    await w.agent({ description: '[class: text]', prompt: 'Summarize this supplied text: A small change.' })
    expect(w.writes.some((line) => line.includes('local small failed: answer reports unavailable access'))).toBe(true)
    expect(routeEvents(w).at(-1)).toMatchObject({ chosen: 'haiku', fell_through_from: ['local small'] })
  })
  test('an absolute prompt path infers a repository from its Git root origin', async () => {
    const w = world({ quota: 1, env: gateways, gitRoot: '/workspace/project', originUrl: 'https://github.com/owner/project.git' })
    await w.agent({ description: '[task: code]', prompt: 'Implement changes under /workspace/project/src/main.ts.' })
    expect(w.calls.find((call) => call.argv[0] === 'zcode-job')?.argv[2]).toBe('owner/project')
    expect(routeEvents(w).at(-1)).toMatchObject({ chosen: 'zcode', eligible: ['zcode', 'opencode-go', 'codex', 'cursor', 'haiku'] })
  })
  test('a relative prompt path resolves against the session directory before repository inference', async () => {
    const w = world({ quota: 1, env: gateways, originUrl: 'https://github.com/owner/project.git' })
    await w.agent({ description: '[task: code]', prompt: 'Update src/main.ts.' })
    expect(w.calls.some((call) => call.argv[0] === 'zcode-job')).toBe(true)
    expect(w.fetches).toContainEqual({ url: 'https://api.github.com/repos/owner/project', body: undefined })
  })
  test('a path resolving to another repository makes the candidate unknown, even with a repository tag', async () => {
    const w = world({ quota: 1, env: gateways, gitRoot: '/workspace', originUrl: 'https://github.com/owner/project.git',
      pathGitRoots: { '/private/notes': '/private' } })
    await w.agent({ description: '[task: code] [repo: owner/project]', prompt: 'Update ../private/notes/secret.md.' })
    expect(w.fetches.some((fetch) => fetch.url.startsWith('https://api.github.com/repos/'))).toBe(false)
    expect(w.calls.some((call) => call.argv[0] === 'zcode-job')).toBe(false)
    expect(routeEvents(w).at(-1).eligible).toEqual(['codex', 'haiku'])
  })
  test('a path that cannot be resolved leaves public-only executors ineligible', async () => {
    const w = world({ quota: 1, env: gateways, gitRoot: '/workspace', originUrl: 'https://github.com/owner/project.git',
      unresolvedPaths: ['/workspace/missing/main.ts'] })
    await w.agent({ description: '[task: code]', prompt: 'Update missing/main.ts.' })
    expect(w.fetches.some((fetch) => fetch.url.startsWith('https://api.github.com/repos/'))).toBe(false)
    expect(w.calls.some((call) => call.argv[0] === 'zcode-job')).toBe(false)
    expect(routeEvents(w).at(-1).eligible).toEqual(['codex', 'haiku'])
  })
  test('multiple paths in different repositories make the candidate unknown', async () => {
    const w = world({ quota: 1, env: gateways, gitRoot: '/workspace', originUrl: 'https://github.com/owner/project.git',
      pathGitRoots: { '/private': '/private' } })
    await w.agent({ description: '[task: code]', prompt: 'Update src/main.ts and ../private/notes.md.' })
    expect(w.fetches.some((fetch) => fetch.url.startsWith('https://api.github.com/repos/'))).toBe(false)
    expect(w.calls.some((call) => call.argv[0] === 'zcode-job')).toBe(false)
    expect(routeEvents(w).at(-1).eligible).toEqual(['codex', 'haiku'])
  })
  test('a symlinked prompt path is compared after realpath resolution', async () => {
    const w = world({ quota: 1, env: gateways, gitRoot: '/workspace/project', originUrl: 'https://github.com/owner/project.git',
      pathRealpaths: { '/workspace/link/src/main.ts': '/workspace/project/src/main.ts' } })
    await w.agent({ description: '[task: code]', prompt: 'Update /workspace/link/src/main.ts.' })
    expect(w.calls.some((call) => call.argv[0] === 'zcode-job')).toBe(true)
    expect(w.fetches).toContainEqual({ url: 'https://api.github.com/repos/owner/project', body: undefined })
  })
  test('an inferred repository with unknown visibility never admits public-only executors', async () => {
    const w = world({ quota: 1, env: gateways, gitRoot: '/workspace/project', originUrl: 'https://github.com/owner/project.git', repository: { visibility: 'unknown', private: false } })
    await w.agent({ description: '[task: code]', prompt: 'Update /workspace/project/src/main.ts.' })
    expect(w.fetches).toContainEqual({ url: 'https://api.github.com/repos/owner/project', body: undefined })
    expect(w.calls.some((call) => call.argv[0] === 'zcode-job')).toBe(false)
    expect(routeEvents(w).at(-1).eligible).toEqual(['codex', 'haiku'])
  })
  test('an explicit repository tag overrides the origin inferred from a prompt path', async () => {
    const w = world({ quota: 1, env: gateways, gitRoot: '/workspace/origin', originUrl: 'https://github.com/origin/repository.git' })
    await w.agent({ description: '[task: code] [repo: tagged/project]', prompt: 'Update /workspace/origin/src/main.ts.' })
    expect(w.fetches[0].url).toBe('https://api.github.com/repos/tagged/project')
    expect(routeEvents(w).at(-1).eligible).toContain('zcode')
  })
  test('private inferred repositories never list public-only executors as eligible', async () => {
    const w = world({ quota: 1, env: gateways, gitRoot: '/workspace/private', originUrl: 'git@github.com:owner/private.git', repository: { visibility: 'private', private: true } })
    await w.agent({ description: '[task: code]', prompt: 'Update /workspace/private/src/main.ts.' })
    expect(w.calls.some((call) => call.argv[0] === 'zcode-job')).toBe(false)
    expect(routeEvents(w).at(-1).eligible).toEqual(['codex', 'haiku'])
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
      // Output that names no job (truncated) means receipt is unverified: the line says stopped. A start call that threw
      // may have submitted the job, so its line names the executor with dispatch-unconfirmed, never stopped.
      const expected = 'zcodeThrows' in options ? { chosen: 'zcode', reason: 'dispatch-unconfirmed' }
        : 'zcodeTruncated' in options ? { chosen: 'stopped', reason: 'zcode dispatch failed before the job was accepted' }
          : { chosen: 'zcode', reason: 'sandbox job without a verified PR' }
      expect(routeEvents(w).at(-1)).toMatchObject(expected)
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
    expect(runs(w)[0].argv).toContain('model_reasoning_effort=max')
    expect(codexPrompt(w, runs(w)[0])).toStartWith('[class: bulk-complex]')
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
      for (const fragment of ['Tag self-contained text work [class: text]', 'put all of its text in the prompt', 'on-host local model first', 'ranked by usage pace', 'non-sensitive coding tagged [task: code] [repo: owner/repository] in a public repository', 'ready PR labelled human:review', 'leak-scan it before merge', 'never auto-merge', 'Codex Luna takes any task', 'never Terra', 'Haiku xhigh is always last', 'Nothing stops because an executor is unavailable', 'Never Sonnet, Opus or Fable subagents', 'Never send secrets, credentials, inventory or incident content to any executor', 'Antigravity stays a second-opinion reviewer']) expect(policy).toContain(fragment)
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
    expect(scoreWindows([at(50)], 1000)).toEqual({ score: 0, exhausted: false, used: 50, line: 50, distance: 0 })
    expect(Math.round(scoreWindows([at(10)], 1000).score!)).toBe(80)
    expect(Math.round(scoreWindows([at(10), at(40)], 1000).score!)).toBe(20)
    expect(scoreWindows([at(95)], 1000)).toEqual({ score: undefined, exhausted: true, used: 95, line: 50, distance: -45 })
    expect(scoreWindows([{ ...at(99), reset_at: 900 }], 1000)).toEqual({ score: undefined, exhausted: false, used: 99, line: 100, distance: 1 })
    expect(scoreWindows([{ used_percent: '10' }], 1000)).toEqual({ score: undefined, exhausted: false })
    expect(scoreWindows(undefined, 1000)).toEqual({ score: undefined, exhausted: false })
  })
  test('known under-line scores lead; unknown rows keep static order; exhausted drop', () => {
    const rows = EXECUTOR_TABLE.slice(0, 3)
    const offPeak = Date.parse('2026-11-14T12:00:00Z')
    expect(rankRows(rows, {}, offPeak).order).toEqual(['zcode', 'opencode-go', 'codex'])
    expect(rankRows(rows, { codex: { score: 3, exhausted: false, used: 10, line: 50, distance: 40 } }, offPeak).order).toEqual(['codex', 'zcode', 'opencode-go'])
    expect(rankRows(rows, { codex: { score: 0, exhausted: false, used: 50, line: 50, distance: 0 } }, offPeak).order).toEqual(['codex', 'zcode', 'opencode-go'])
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
  test('local inference accepts supplied-text requests without paths, external references or tool instructions', () => {
    expect(localTask(undefined, 'Summarize this supplied text: A small change.')).toBe(true)
    expect(localTask(undefined, 'Extract the fields from the text below.')).toBe(false)
    expect(localTask(undefined, 'Translate: bonjour, mon ami.')).toBe(true)
    expect(localTask(undefined, 'Summarize: hi')).toBe(false)
    expect(localTask(undefined, 'Summarize this supplied text: src/')).toBe(false)
    expect(localTask(undefined, 'Summarize this supplied text: src\\notes')).toBe(false)
    expect(localTask(undefined, 'Summarize `/workspace/notes.md`')).toBe(false)
    expect(localTask(undefined, 'Summarize: `/workspace/notes.md`')).toBe(false)
    expect(localTask(undefined, 'Summarize `a sufficiently long inline example` and consider $HOME/notes.md')).toBe(false)
    expect(localTask(undefined, 'Summarize the attachment using this supplied text: A small change.')).toBe(false)
    expect(localTask(undefined, 'Summarize the file: "the supplied inline content is long enough"')).toBe(false)
    for (const reference of ['the files', 'the directory', 'the folder', 'the repo', 'the codebase', 'the branch', 'the diff', 'the PR', 'the log', 'the attachment']) {
      expect(localTask(undefined, `Summarize ${reference}.`)).toBe(false)
    }
    expect(localTask('[class: bulk]', 'Summarize this supplied text: A small change.')).toBe(false)
    expect(localTask(undefined, 'Summarize this supplied text: "the phrase src/ is inline content"')).toBe(true)
    expect(localTask(undefined, `Summarize this supplied text: ${'long source text '.repeat(4)}`)).toBe(true)
    expect(localTask(undefined, 'Summarize /workspace/notes.txt')).toBe(false)
    expect(localTask(undefined, 'Summarize ~/notes')).toBe(false)
    expect(localTask(undefined, 'Summarize ./notes')).toBe(false)
    expect(localTask(undefined, 'Summarize src/notes.md')).toBe(false)
    expect(localTask(undefined, 'Summarize https://example.test/notes')).toBe(false)
    expect(localTask(undefined, 'Summarize the attached file.')).toBe(false)
    expect(localTask(undefined, 'Summarize the diff.')).toBe(false)
    expect(localTask(undefined, 'Run tests and summarize the result.')).toBe(false)
    expect(localTask(undefined, 'Rewrite the file.')).toBe(false)
    expect(localTask('[class: text]', 'Edit /workspace/notes.txt')).toBe(true)
  })
  test('repository candidates come only from GitHub origins', () => {
    expect(repositoryFromOrigin('https://github.com/owner/project.git')).toBe('owner/project')
    expect(repositoryFromOrigin('git@github.com:owner/project.git')).toBe('owner/project')
    expect(repositoryFromOrigin('ssh://git@github.com/owner/project')).toBe('owner/project')
    expect(repositoryFromOrigin('https://git.example.test/owner/project.git')).toBeUndefined()
    expect(repositoryFromOrigin('not a remote URL')).toBeUndefined()
  })
})

describe('usage pace ranking', () => {
  const now = Date.parse('2026-11-14T12:00:00Z')
  const atDistance = (distance: number) => ({ exhausted: false, used: 50 - distance, line: 50, distance })

  test('an under-line executor ranks ahead of an over-line executor', () => {
    const rows = [EXECUTOR_TABLE[0], EXECUTOR_TABLE[2]]
    const scores = { zcode: atDistance(-1), codex: atDistance(1) }
    expect(rankRows(rows, scores, now).order).toEqual(['codex', 'zcode'])
  })
  test('under-line executors rank by distance descending and ties keep table order', () => {
    const rows = [EXECUTOR_TABLE[0], EXECUTOR_TABLE[2], EXECUTOR_TABLE[3]]
    const scores = { zcode: atDistance(10), codex: atDistance(30), cursor: atDistance(30) }
    expect(rankRows(rows, scores, now).order).toEqual(['codex', 'cursor', 'zcode'])
  })
  test('all over-line executors rank with the least over first', () => {
    const rows = [EXECUTOR_TABLE[0], EXECUTOR_TABLE[2], EXECUTOR_TABLE[3]]
    const scores = { zcode: atDistance(-30), codex: atDistance(-5), cursor: atDistance(-10) }
    expect(rankRows(rows, scores, now).order).toEqual(['codex', 'cursor', 'zcode'])
  })
  test('unknown executors stay between known under-line and over-line executors', () => {
    const rows = [EXECUTOR_TABLE[0], EXECUTOR_TABLE[1], EXECUTOR_TABLE[2]]
    const scores = { zcode: atDistance(-1), codex: atDistance(1) }
    expect(rankRows(rows, scores, now).order).toEqual(['codex', 'opencode-go', 'zcode'])
  })
  test('the line reaches 100 at the one-day margin for a long window', () => {
    const day = 86_400
    const reset = 10 * day
    expect(scoreWindows([{ used_percent: 30, window_seconds: 3 * day, reset_at: reset }], reset - day)).toMatchObject({ used: 30, line: 100, distance: 70 })
  })
  test('a short window has no margin', () => {
    const day = 86_400
    const reset = 2 * day
    const window = { used_percent: 10, window_seconds: day, reset_at: reset }
    expect(scoreWindows([window], reset - day / 2)).toMatchObject({ used: 10, line: 50, distance: 40 })
    expect(scoreWindows([window], reset - day - 10).line).toBe(0)
    expect(scoreWindows([window], reset + 10).line).toBe(100)
  })
  test('multiple windows use the smallest distance', () => {
    const day = 86_400
    const nowSeconds = 10 * day
    const result = scoreWindows([
      { used_percent: 10, window_seconds: day, reset_at: nowSeconds + day / 2 },
      { used_percent: 70, window_seconds: 3 * day, reset_at: nowSeconds + 3 * day / 2 },
    ], nowSeconds)
    expect(result).toMatchObject({ used: 70, line: 75, distance: 5 })
  })
  test('the chosen executor route line records numeric used and one-decimal line', async () => {
    const w = world({ codexWindows: [{ kind: 'short', used_percent: 10, window_seconds: 3600, reset_at: 3600 }] })
    await w.agent({ description: '[class: standard]' })
    const event = routeEvents(w).at(-1)
    expect(event.chosen).toBe('codex')
    expect(event.scores.codex).toMatchObject({ used: 10, line: 27.8 })
    expect(typeof event.scores.codex.used).toBe('number')
    expect(typeof event.scores.codex.line).toBe('number')
  })
  test('no readings keep today’s table order and record unknown values', async () => {
    expect(rankRows(EXECUTOR_TABLE, {}, now).order).toEqual(EXECUTOR_TABLE.map((row) => row.id))
    const w = world({ quotaUrl: null })
    await w.agent(coding)
    const event = routeEvents(w).at(-1)
    expect(event.eligible).toEqual([...EXECUTOR_TABLE.map((row) => row.id), LAST_RESORT.model])
    expect(event.chosen).toBe(EXECUTOR_TABLE[0].id)
    for (const row of EXECUTOR_TABLE) expect(event.scores[row.id]).toMatchObject({ used: null, line: null })
  })
  test('no readings keep table order only without promotions: an appended promotion ranks first', () => {
    const promotion = { id: 'promo-free', transport: 'sandbox', tool: 'opencode-free', trust: 'sandbox-public', private_ok: false, price: 0, kind: 'promotion', expires: '2030-01-01T00:00:00Z' }
    const rows = mergeExecutorRows(EXECUTOR_TABLE, [promotion]).rows
    expect(rankRows(rows, {}, Date.parse('2026-11-14T12:00:00Z')).order).toEqual(['promo-free', ...EXECUTOR_TABLE.map((row) => row.id)])
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
    expect(work(w)).toEqual([])
    expect(w.fetches).toEqual([])
  })
  test('12: Plan with a Sonnet model fails as forbidden', async () => {
    const w = world({ env: gateways })
    expect(text(await w.agent({ subagent_type: 'Plan', model: 'sonnet' }))).toContain('subagents are forbidden')
    expect(work(w)).toEqual([])
  })
  test('a quota read that throws leaves quota unknown and keeps the static order', async () => {
    const w = world({ quotaThrows: true, env: gateways })
    expect(text(await w.agent(coding))).toContain('[routed: zcode-job sandbox;')
    expect(routeEvents(w).at(-1)).toMatchObject({ scores: { zcode: { used: null, line: null }, 'opencode-go': { used: null, line: null }, codex: { used: null, line: null } } })
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
    expect(event.quota_unknown).toEqual({ zcode: 'quota_unconfigured', 'opencode-go': 'quota_unconfigured' })
    expect(event.quota_source).toEqual({ 'codex/five_hour': 'provider', 'codex/weekly': 'provider', 'cursor/monthly': 'estimate' })
    expect(typeof event.scores.codex.score).toBe('number')
  })
  test('env unset: every quota is unknown and no request is made', async () => {
    const w = world({ quotaUrl: null })
    expect(text(await w.agent())).toContain('codex luna xhigh')
    expect(w.quotaFetches).toEqual([])
    expect(w.fetches).toEqual([])
    expect(routeEvents(w).at(-1)).toMatchObject({ scores: { codex: { used: null, line: null } }, quota_unknown: { codex: 'quota_unconfigured', cursor: 'quota_unconfigured' } })
  })
  for (const [name, options] of unknownCases.slice(1)) {
    test(`${name}: every quota is unknown as quota_unreachable and Codex is still tried`, async () => {
      const w = world({ ...options, env: gateways })
      expect(text(await w.agent())).toContain('codex luna xhigh')
      expect(w.quotaFetches).toEqual([QUERY_URL])
      expect(routeEvents(w).at(-1)).toMatchObject({ chosen: 'codex', scores: { codex: { used: null, line: null } }, quota_unknown: { codex: 'quota_unreachable', cursor: 'quota_unreachable' } })
    })
  }
  test('a stale sample in the store reads as quota_stale, never as a score', async () => {
    const w = world({ quotaSampleAge: 901, env: gateways })
    await w.agent()
    expect(routeEvents(w).at(-1)).toMatchObject({ scores: { codex: { used: null, line: null } }, quota_unknown: { 'codex/weekly': 'quota_stale', cursor: 'quota_missing' } })
  })
  test('staleness is judged on the clock at routing time, not when the sample was read', async () => {
    const w = world({ now: RECORDED_NOW_MS, quotaText: JSON.stringify(recorded()) })
    await w.agent()
    expect(routeEvents(w).at(-1).quota_unknown).toEqual({ zcode: 'quota_unconfigured', 'opencode-go': 'quota_unconfigured' })
    // 800 s later the Codex sample is 920 s old and the Cursor sample 890 s; the refresh returns the same sample.
    w.setNow(RECORDED_NOW_MS + 800_000)
    await w.agent()
    const event = routeEvents(w).at(-1)
    expect(event.quota_unknown).toEqual({ 'codex/five_hour': 'quota_stale', 'codex/weekly': 'quota_stale', zcode: 'quota_unconfigured', 'opencode-go': 'quota_unconfigured' })
    expect(event.scores.codex).toMatchObject({ used: null, line: null })
    expect(w.quotaFetches).toHaveLength(2)
  })
  test('placeholder-free: no unknown quota is ever scored as empty or full', async () => {
    for (const [, options] of [...unknownCases, ['stale', { quotaSampleAge: 901 }] as const]) {
      const w = world({ ...options, env: gateways, cursorWindows: [{ used_percent: 10, window_seconds: 2000, reset_at: 2000 }] })
      await w.agent(coding)
      const { scores } = routeEvents(w).at(-1)
      for (const id of ids) expect(scores[id]).toMatchObject({ used: null, line: null })
    }
    const full = world({ quota: 1, env: gateways })
    await full.agent()
    expect(routeEvents(full).at(-1).scores.codex).toMatchObject({ exhausted: true })
    const empty = world({ codexWindows: [{ kind: 'weekly', used_percent: 0, window_seconds: 2000, reset_at: 2000 }], env: gateways })
    await empty.agent()
    expect(routeEvents(empty).at(-1).scores.codex).toMatchObject({ exhausted: false })
    expect(routeEvents(empty).at(-1).scores.codex.score).toBeGreaterThan(0)
  })
  test('the route admits only this exact selector: the encoded query URL is pinned byte for byte', async () => {
    expect(QUOTA_SELECTOR).toBe('{__name__=~"agent_quota_(used_percent|window_seconds|reset_timestamp_seconds)|litellm_remaining_api_key_budget_metric"}')
    const w = world()
    await w.agent()
    expect(w.quotaFetches).toEqual(['https://quota.example.test/api/v1/query?query=%7B__name__%3D~%22agent_quota_(used_percent%7Cwindow_seconds%7Creset_timestamp_seconds)%7Clitellm_remaining_api_key_budget_metric%22%7D'])
  })
  const TOKEN_FILE = '/run/agent-quota/token'
  const SECRET = 'quota-secret-value'
  // How many times the token appears across every request's URL, headers and body.
  const tokenSightings = (w: ReturnType<typeof world>) => w.allFetches.reduce((n, f) => n + JSON.stringify(f).split(SECRET).length - 1, 0)
  test('a non-empty token file uses declared filesystem methods and sends a trimmed bearer header on the quota GET only', async () => {
    const w = world({ env: { ...gateways, AGENT_QUOTA_TOKEN_FILE: TOKEN_FILE }, files: { [TOKEN_FILE]: `  ${SECRET}\n` } })
    await w.agent(coding)
    expect(w.fsStats).toEqual([{ path: TOKEN_FILE, resolve: false }])
    expect(w.quotaHeaders).toEqual([{ accept: 'application/json', Authorization: `Bearer ${SECRET}` }])
    expect(w.allFetches.length).toBeGreaterThan(1)
    expect(tokenSightings(w)).toBe(1)
    expect(w.allFetches.find((f) => f.headers.Authorization)?.url).toBe(QUERY_URL)
  })
  test('a relative token file path leaves quota unknown without sending its contents', async () => {
    const w = world({ quotaStatus: 401, env: { ...gateways, AGENT_QUOTA_TOKEN_FILE: 'relative-token' }, files: { 'relative-token': SECRET } })
    await w.agent()
    expect(w.quotaHeaders).toEqual([{ accept: 'application/json' }])
    expect(routeEvents(w).at(-1)).toMatchObject({ quota_unknown: { codex: 'quota_unreachable', cursor: 'quota_unreachable' } })
    expect(w.fsReads).not.toContain('relative-token')
    expect(JSON.stringify(w.logs)).not.toContain('relative-token')
    expect(JSON.stringify(w.logs)).not.toContain(SECRET)
  })
  test('a symlink token file leaves quota unknown without reading its contents', async () => {
    const w = world({ quotaStatus: 401, env: { ...gateways, AGENT_QUOTA_TOKEN_FILE: TOKEN_FILE }, files: { [TOKEN_FILE]: SECRET }, quotaFileTypes: { [TOKEN_FILE]: 'symlink' } })
    await w.agent()
    expect(w.quotaHeaders).toEqual([{ accept: 'application/json' }])
    expect(routeEvents(w).at(-1)).toMatchObject({ quota_unknown: { codex: 'quota_unreachable', cursor: 'quota_unreachable' } })
    expect(w.fsReads).not.toContain(TOKEN_FILE)
    expect(JSON.stringify(w.logs)).not.toContain(TOKEN_FILE)
    expect(JSON.stringify(w.logs)).not.toContain(SECRET)
  })
  test('an oversized token file leaves quota unknown without reading its contents', async () => {
    const large = 'x'.repeat(4097)
    const w = world({ quotaStatus: 401, env: { ...gateways, AGENT_QUOTA_TOKEN_FILE: TOKEN_FILE }, files: { [TOKEN_FILE]: large } })
    await w.agent()
    expect(w.quotaHeaders).toEqual([{ accept: 'application/json' }])
    expect(routeEvents(w).at(-1)).toMatchObject({ quota_unknown: { codex: 'quota_unreachable', cursor: 'quota_unreachable' } })
    expect(w.fsReads).not.toContain(TOKEN_FILE)
    expect(JSON.stringify(w.logs)).not.toContain(TOKEN_FILE)
    expect(JSON.stringify(w.logs)).not.toContain(large)
  })
  test('a token with interior whitespace leaves quota unknown and sends no token', async () => {
    const w = world({ quotaStatus: 401, env: { ...gateways, AGENT_QUOTA_TOKEN_FILE: TOKEN_FILE }, files: { [TOKEN_FILE]: 'quota secret' } })
    await w.agent()
    expect(w.quotaHeaders).toEqual([{ accept: 'application/json' }])
    expect(routeEvents(w).at(-1)).toMatchObject({ quota_unknown: { codex: 'quota_unreachable', cursor: 'quota_unreachable' } })
    expect(JSON.stringify(w.logs)).not.toContain(TOKEN_FILE)
    expect(JSON.stringify(w.logs)).not.toContain('quota secret')
  })
  for (const [name, options] of [
    ['no token file named', { env: {} }],
    ['token file variable empty', { env: { AGENT_QUOTA_TOKEN_FILE: '' } }],
    ['token file missing', { env: { AGENT_QUOTA_TOKEN_FILE: TOKEN_FILE } }],
    ['token file empty', { env: { AGENT_QUOTA_TOKEN_FILE: TOKEN_FILE }, files: { [TOKEN_FILE]: '' } }],
    ['token file blank', { env: { AGENT_QUOTA_TOKEN_FILE: TOKEN_FILE }, files: { [TOKEN_FILE]: ' \n\t' } }],
    ['token file exists check throws', { env: { AGENT_QUOTA_TOKEN_FILE: TOKEN_FILE }, fsThrows: true }],
    ['token file read throws', { env: { AGENT_QUOTA_TOKEN_FILE: TOKEN_FILE }, readThrows: TOKEN_FILE }],
    ['token path is a directory', { env: { AGENT_QUOTA_TOKEN_FILE: '/run/agent-quota' }, readThrows: '/run/agent-quota', quotaFileTypes: { '/run/agent-quota': 'directory' } }],
    ['token spans two lines', { env: { AGENT_QUOTA_TOKEN_FILE: TOKEN_FILE }, files: { [TOKEN_FILE]: `${SECRET}\nsecond-line` } }],
    ['token holds an interior space', { env: { AGENT_QUOTA_TOKEN_FILE: TOKEN_FILE }, files: { [TOKEN_FILE]: 'quota secret' } }],
    ['token holds a control character', { env: { AGENT_QUOTA_TOKEN_FILE: TOKEN_FILE }, files: { [TOKEN_FILE]: `${SECRET}\u0007` } }],
  ] as const) {
    test(`${name}: the quota GET still goes, with no authorization header`, async () => {
      const w = world(options as Parameters<typeof world>[0])
      await w.agent()
      expect(w.quotaHeaders).toEqual([{ accept: 'application/json' }])
      expect(w.allFetches.some((f) => f.headers.Authorization !== undefined)).toBe(false)
    })
  }
  test('an http query URL never carries the bearer token; the request still goes', async () => {
    const plain = 'http://quota.example.test'
    const w = world({ quotaUrl: plain, env: { AGENT_QUOTA_TOKEN_FILE: TOKEN_FILE }, files: { [TOKEN_FILE]: SECRET } })
    await w.agent()
    expect(w.quotaFetches).toEqual([QUERY_URL.replace(QUOTA_BASE, plain)])
    expect(w.quotaHeaders).toEqual([{ accept: 'application/json' }])
    expect(tokenSightings(w)).toBe(0)
  })
  test('no query URL with a token file named: zero requests and zero file reads', async () => {
    const w = world({ quotaUrl: null, env: { AGENT_QUOTA_TOKEN_FILE: TOKEN_FILE }, files: { [TOKEN_FILE]: SECRET } })
    await w.agent()
    expect(w.quotaFetches).toEqual([])
    expect(w.fsTouches.filter((p) => p === TOKEN_FILE)).toEqual([])
  })
  test('a token read that never settles is cut by the 3 s budget and routing completes', async () => {
    const w = world({ quotaTimeout: true, readHangs: TOKEN_FILE, env: { ...gateways, AGENT_QUOTA_TOKEN_FILE: TOKEN_FILE } })
    expect(text(await w.agent())).toContain('codex luna xhigh')
    expect(w.quotaFetches).toEqual([])
    expect(routeEvents(w).at(-1)).toMatchObject({ quota_unknown: { codex: 'quota_unreachable', cursor: 'quota_unreachable' } })
  })
  for (const status of [401, 403]) {
    test(`HTTP ${status}: every quota is unknown as quota_unreachable`, async () => {
      const w = world({ quotaStatus: status, env: { ...gateways, AGENT_QUOTA_TOKEN_FILE: TOKEN_FILE }, files: { [TOKEN_FILE]: 'quota-secret-value' } })
      expect(text(await w.agent())).toContain('codex luna xhigh')
      expect(routeEvents(w).at(-1)).toMatchObject({ scores: { codex: { score: null, exhausted: false, effective: null, used: null, line: null } }, quota_unknown: { codex: 'quota_unreachable', cursor: 'quota_unreachable' } })
    })
  }
  test('the token appears only in the quota GET header: never in a URL, a body, the route event, a log or a command', async () => {
    for (const quotaStatus of [undefined, 401]) {
      const w = world({ quotaStatus, env: { ...gateways, AGENT_QUOTA_TOKEN_FILE: TOKEN_FILE }, files: { [TOKEN_FILE]: SECRET } })
      await w.agent(coding)
      expect(routeEvents(w).length).toBeGreaterThan(0)
      expect(tokenSightings(w)).toBe(1)
      expect(w.allFetches.some((f) => f.url.includes(SECRET) || (f.body ?? '').includes(SECRET))).toBe(false)
      expect(JSON.stringify(w.calls)).not.toContain(SECRET)
      expect(JSON.stringify(w.logs)).not.toContain(SECRET)
      expect(JSON.stringify(w.nextCalls)).not.toContain(SECRET)
    }
  })
  test('quota never runs a local command, whatever the environment names', async () => {
    const envs: Record<string, string>[] = [{}, { TOKEN_METER_BIN: '/opt/meter' }]
    for (const env of envs) {
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
  test('Codex fails before unknown executors and Haiku remains last', async () => {
    const w = world({ codexExit: 7, zcodeAvailable: false, env: gateways })
    await w.agent(coding)
    expect(w.nextCalls[0]).toMatchObject({ model: 'haiku', effort: 'xhigh' })
    expect(routeEvents(w).at(-1)).toMatchObject({ chosen: 'haiku', fell_through_from: ['codex', 'zcode', 'opencode-go', 'cursor'], scores: { codex: { used: 50, line: 50 } } })
  })
  test('at-pace Codex ranks before unknown Cursor', () => {
    const rows = [EXECUTOR_TABLE[3], EXECUTOR_TABLE[2]]
    const scores = { codex: { score: 0, exhausted: false, used: 50, line: 50, distance: 0 } }
    expect(rankRows(rows, scores, Date.parse('2026-11-14T12:00:00Z')).order).toEqual(['codex', 'cursor'])
  })
  test('an under-line Cursor ranks first; an exhausted one drops it', async () => {
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
    expect(routeEvents(w).at(-1).scores.cursor).toMatchObject({ used: null, line: null })
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
  test('rank: promotions first, then usage pace, exhausted rows skipped', () => {
    const rows = mergeExecutorRows(EXECUTOR_TABLE, [{ id: 'opencode-go', price: 2 }, { ...promo, expires: '2030-01-01T00:00:00Z' }]).rows
    const peakMonday = Date.parse('2026-11-09T07:30:00Z')
    const scores = {
      zcode: { score: 10, exhausted: false, used: 51, line: 50, distance: -1 },
      'opencode-go': { score: 10, exhausted: false, used: 50, line: 50, distance: 0 },
      codex: { score: 8, exhausted: false, used: 10, line: 50, distance: 40 },
      cursor: { exhausted: true },
    }
    const r = rankRows(rows, scores, peakMonday)
    expect(r.order).toEqual(['promo-free', 'codex', 'opencode-go', 'zcode'])
    expect(r.effective).toMatchObject({ zcode: 5, 'opencode-go': 5, codex: 8 })
    expect(r.skipped).toEqual({ cursor: 'exhausted' })
    expect(rankRows(rows, scores, Date.parse('2026-11-14T07:30:00Z')).order).toEqual(['promo-free', 'codex', 'opencode-go', 'zcode'])
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
describe('paid rows and router-chat', () => {
  const OVERRIDE = '/home/test/.config/ai-delegation/executors.json'
  const chat = { id: 'chat-paid', transport: 'router-chat', model: 'paid-chat', trust: 'sandbox-public', private_ok: false, price: 1, billing: 'paid', budget_daily_usd: 5, budget_key: 'agent-chat' }
  const flat = { id: 'chat-flat', transport: 'router-chat', model: 'local-only', trust: 'subscription-trusted', private_ok: true, price: 1 }
  const budget = (alias: string, remaining: string, age = 60) => ({ metric: { __name__: 'litellm_remaining_api_key_budget_metric', api_key_alias: alias, hashed_api_key: 'hashed' }, value: [1000 - age, remaining] })
  // The local rung fails its check, so text work reaches the subscription rungs.
  const localDown = { ...gateways, AGENT_ROUTE_ZCODE_TOOLS: '' }
  // The `small` alias fails its check, so text work falls through to the subscription rungs.
  const noLocal = { small: 500 }

  test('validation: a paid row needs a finite positive daily budget and a key alias, and is never private_ok', () => {
    expect(validRow(chat)).toBeTruthy()
    expect(validRow({ ...chat, budget_daily_usd: undefined })).toBeUndefined()
    expect(validRow({ ...chat, budget_daily_usd: 0 })).toBeUndefined()
    expect(validRow({ ...chat, budget_daily_usd: Infinity })).toBeUndefined()
    expect(validRow({ ...chat, budget_daily_usd: NaN })).toBeUndefined()
    expect(validRow({ ...chat, budget_key: undefined })).toBeUndefined()
    expect(validRow({ ...chat, budget_key: 'bad alias' })).toBeUndefined()
    expect(validRow({ ...chat, billing: 'metered' })).toBeUndefined()
    expect(validRow({ ...chat, model: undefined })).toBeUndefined()
    expect(validRow({ ...chat, private_ok: true })).toBeUndefined()
    expect(validRow({ ...EXECUTOR_TABLE[2], billing: 'paid' })).toBeUndefined()
  })
  test('validation: only a router-chat row may be paid, even with every paid field set', () => {
    const paid = { billing: 'paid', budget_daily_usd: 5, budget_key: 'agent-chat', private_ok: false }
    expect(validRow({ ...EXECUTOR_TABLE[2], ...paid })).toBeUndefined()
    expect(validRow({ ...EXECUTOR_TABLE[2], ...paid, trust: 'sandbox-public' })).toBeUndefined()
    expect(validRow({ ...EXECUTOR_TABLE[0], ...paid })).toBeUndefined()
    expect(validRow({ ...chat, ...paid })).toBeTruthy()
  })
  test('validation: a paid row is sandbox-public and never a promotion', () => {
    expect(validRow({ ...chat, trust: 'subscription-trusted' })).toBeUndefined()
    expect(validRow({ ...chat, kind: 'promotion', expires: '2099-01-01T00:00:00Z' })).toBeUndefined()
  })
  test('validation: no router-chat row may name a Sonnet, Opus or Fable model', () => {
    for (const model of ['anthropic/claude-opus-5', 'claude-sonnet-4-5', 'fable-1', 'claude_opus_4', 'claude.opus-4', 'claude:opus', 'claudeopus4', 'claude_sonnet', 'FABLE']) {
      expect(validRow({ ...chat, model })).toBeUndefined()
      expect(validRow({ ...flat, model })).toBeUndefined()
    }
  })
  test('validation: an unpaid router-chat row must use an on-host alias', () => {
    expect(validRow({ ...flat })).toBeTruthy()
    expect(validRow({ ...flat, model: 'small' })).toBeTruthy()
    for (const model of ['local-only-homelab', 'small-homelab', 'metered-model', 'paid-chat']) expect(validRow({ ...flat, model })).toBeUndefined()
    expect(validRow({ ...flat, trust: 'sandbox-public' })).toBeUndefined()
    // An override cannot retarget a built-in row to router-chat on a metered model.
    expect(mergeExecutorRows(EXECUTOR_TABLE, [{ id: 'codex', transport: 'router-chat', model: 'metered-model' }]).rejected).toEqual(['codex'])
  })
  test('budget adapter: remaining budget by key alias, only from a fresh finite sample', () => {
    const result = [budget('agent-chat', '3.25'), budget('spent-key', '0'), budget('stale-key', '9', 901), budget('odd-key', 'NaN')]
    expect([...budgetsFromMetrics(result, ['agent-chat', 'spent-key', 'stale-key', 'odd-key', 'absent-key'], 1000)]).toEqual([['agent-chat', 3.25], ['spent-key', 0]])
  })
  test('budget adapter: a timestamp that is not finite or lies in the future beyond the skew reads as unknown', () => {
    expect([...budgetsFromMetrics([budget('agent-chat', '5', -Infinity)], ['agent-chat'], 1000)]).toEqual([])
    expect([...budgetsFromMetrics([budget('agent-chat', '5', NaN)], ['agent-chat'], 1000)]).toEqual([])
    expect([...budgetsFromMetrics([budget('agent-chat', '7', -2_592_000)], ['agent-chat'], 1000)]).toEqual([])
    expect([...budgetsFromMetrics([budget('agent-chat', '7', -61)], ['agent-chat'], 1000)]).toEqual([])
    expect([...budgetsFromMetrics([budget('agent-chat', '7', -60)], ['agent-chat'], 1000)]).toEqual([['agent-chat', 7]])
  })
  test('agent type names keep the separator-based check; only row models use the substring check', async () => {
    expect(forbiddenRowModel('octopus')).toBe(true)
    expect(forbiddenModel('octopus-reviewer')).toBe(false)
    const w = world({ definition: '---\nmodel: haiku\n---\nReview the change.' })
    expect(text(await w.agent({ subagent_type: 'octopus-reviewer' }))).not.toContain('forbidden')
  })
  test('budget adapter: a stale, future-dated or invalid sample beside a fresh one makes the alias unknown', () => {
    for (const sibling of [budget('agent-chat', '0', 1000), budget('agent-chat', '0', -61), budget('agent-chat', 'oops')]) {
      expect([...budgetsFromMetrics([sibling, budget('agent-chat', '5')], ['agent-chat'], 1000)]).toEqual([])
    }
  })
  test('budget adapter: fresh samples for one alias that disagree read as unknown', () => {
    expect([...budgetsFromMetrics([budget('agent-chat', '0', 61), budget('agent-chat', '5', 60)], ['agent-chat'], 1000)]).toEqual([])
    expect([...budgetsFromMetrics([budget('agent-chat', '5', 61), budget('agent-chat', '5', 60)], ['agent-chat'], 1000)]).toEqual([['agent-chat', 5]])
  })
  test('eligibility on public work: a paid row with unknown or spent budget is skipped with its reason', () => {
    const rows = [EXECUTOR_TABLE[2], chat as never]
    expect(eligibleRows(rows, true, 0, new Map()).skipped).toEqual({ 'chat-paid': 'budget_unknown' })
    expect(eligibleRows(rows, true, 0, new Map([['agent-chat', 0]])).skipped).toEqual({ 'chat-paid': 'budget_spent' })
    expect(eligibleRows(rows, true, 0, new Map([['agent-chat', 0.5]])).rows.map((r) => r.id)).toEqual(['codex', 'chat-paid'])
  })
  for (const key of ['constructor', 'toString', 'hasOwnProperty', '__proto__']) {
    test(`a budget key named ${key} reads as unknown, never as an inherited value`, () => {
      const row = { ...chat, budget_key: key } as never
      expect(validRow(row)).toBeTruthy()
      expect(eligibleRows([row], true, 0, new Map()).skipped).toEqual({ 'chat-paid': 'budget_unknown' })
      expect(eligibleRows([row], true, 0, budgetsFromMetrics([], [key], 1000)).skipped).toEqual({ 'chat-paid': 'budget_unknown' })
    })
  }
  // Codex exhausted, plus one budget sample, in the single quota query result.
  const withBudget = (remaining: string) => JSON.stringify(instantQuery([...series('codex', [{ kind: 'weekly', used_percent: 100, window_seconds: 2000, reset_at: 2000 }], 940), budget('agent-chat', remaining)]))
  test('text work carries no public marker, so a paid row never receives it, funded or not; routing still completes', async () => {
    for (const quotaText of [undefined, withBudget('0'), withBudget('2')]) {
      const w = world({ quota: 1, quotaText, env: localDown, gatewayStatus: noLocal, files: { [OVERRIDE]: JSON.stringify([chat]) } })
      await w.agent(textTask)
      const event = routeEvents(w).at(-1)
      expect(event.skipped['chat-paid']).toBe('ineligible')
      expect(event.chosen).toBe('haiku')
      expect(w.fetches.some((f) => JSON.parse(f.body ?? '{}').model === 'paid-chat')).toBe(false)
    }
  })
  test('the override file adds an on-host router-chat row that answers [class: text] work over the local chat call', async () => {
    const w = world({ quota: 1, env: localDown, gatewayStatus: noLocal, gatewayAnswer: { 'local-only': 'router answer' }, files: { [OVERRIDE]: JSON.stringify([flat]) } })
    const r = await w.agent(textTask)
    expect(text(r)).toContain('router answer')
    expect(text(r)).toContain('[routed: router-chat local-only]')
    const sent = w.fetches.filter((f) => f.url === 'http://localhost:8000/v1/chat/completions').map((f) => JSON.parse(f.body!).model)
    expect(sent).toEqual(['small', 'local-only'])
    expect(routeEvents(w).at(-1)).toMatchObject({ chosen: 'chat-flat', fell_through_from: ['local small'] })
  })
  test('a router-chat row never re-sends the prompt to the alias the local rung just failed', async () => {
    const w = world({ quota: 1, env: localDown, gatewayStatus: noLocal, files: { [OVERRIDE]: JSON.stringify([{ ...flat, model: 'small' }]) } })
    await w.agent(textTask)
    const sent = w.fetches.filter((f) => f.url === 'http://localhost:8000/v1/chat/completions').map((f) => JSON.parse(f.body!).model)
    expect(sent).toEqual(['small'])
    expect(routeEvents(w).at(-1)).toMatchObject({ chosen: 'haiku', skipped: { 'chat-flat': 'failed' } })
  })
  test('router-chat applies the local size gate: a prompt over 60% of the window is skipped and falls through', async () => {
    const big = { description: '[class: text]', prompt: `Summarize this supplied text: ${'word '.repeat(60_000)}` }
    const w = world({ quota: 1, env: localDown, files: { [OVERRIDE]: JSON.stringify([flat]) } })
    await w.agent(big)
    expect(w.fetches.some((f) => f.url.endsWith('/chat/completions'))).toBe(false)
    expect(routeEvents(w).at(-1)).toMatchObject({ chosen: 'haiku', skipped: { 'chat-flat': 'ineligible' } })
  })
  for (const [name, task] of [
    ['[task: code]', { ...coding, description: `${coding.description} [class: text]` }],
    ['untagged work', { description: '[class: standard]', prompt: 'Implement the change.' }],
  ] as const) {
    test(`a router-chat row never receives ${name}`, async () => {
      const w = world({ quota: 1, zcodeAvailable: false, env: gateways, files: { [OVERRIDE]: JSON.stringify([flat]) } })
      await w.agent(task)
      expect(w.fetches.some((f) => f.body !== undefined && JSON.parse(f.body).model === 'local-only')).toBe(false)
      expect(routeEvents(w).at(-1).skipped['chat-flat']).toBe('ineligible')
    })
  }
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

describe('route telemetry', () => {
  const tracker = '---\nmodel: haiku\ntools: mcp__tracker__*\n---\nPerform the task.'
  const exits: [string, World, Record<string, unknown>, string, string][] = [
    ['forbidden explicit model', {}, { model: 'sonnet' }, 'stopped', 'Sonnet, Opus and Fable subagents are forbidden'],
    ['forbidden custom agent model', { definition: '---\nmodel: opus\n---\nReview.' }, { subagent_type: 'reviewer' }, 'stopped', 'Sonnet, Opus and Fable subagents are forbidden'],
    ['unreadable custom agent', { fsThrows: true }, { subagent_type: 'reviewer' }, 'stopped', 'custom agent model or tool restrictions could not be read'],
    ['unverified custom agent', {}, { subagent_type: 'reviewer' }, 'stopped', 'custom agent definition could not be verified'],
    ['prohibited payload', {}, { prompt: 'Use token=abc123 here.' }, 'stopped', 'payload contains prohibited content'],
    ['native custom agent without a model', { definition: tracker.replace('model: haiku', 'model: inherit') }, { subagent_type: 'reviewer' }, 'stopped', 'custom agent requires an explicit permitted model for native tools'],
    ['native custom agent', { definition: tracker }, { subagent_type: 'reviewer' }, 'native custom agent', 'custom tool policy'],
    ['checked local answer', { quota: 1, env: gateways }, textTask, 'local small', 'checked local answer'],
    ['sandbox executor', { quota: 1, env: gateways }, coding, 'zcode', 'highest-ranked eligible executor that answered'],
    ['sandbox job without a verified PR', { quota: 1, env: gateways, zcodeOutput: 'DONE|j-0123456789abcdef|no-pr\n' }, coding, 'zcode', 'sandbox job without a verified PR'],
    ['terminal rung', { quota: 1, zcodeAvailable: false }, {}, 'haiku', 'terminal rung'],
    ['routing failed closed', { env: gateways, envThrows: 'LITELLM_LOCAL_BASE_URL' }, textTask, 'stopped', 'routing failed closed'],
  ]
  for (const [name, options, call, chosen, reason] of exits) {
    test(`every route exit writes one JSON route line: ${name}`, async () => {
      const w = world(options)
      await w.agent(call)
      const lines = routeEvents(w).filter((l) => l.event === 'route')
      expect(lines).toHaveLength(1)
      expect(lines[0]).toMatchObject({ chosen, reason })
    })
  }
})

describe('route telemetry failures', () => {
  test('a rejected clock never turns a stop into a rejection, and the route line is still written', async () => {
    const w = world({ clockThrows: true })
    expect(text(await w.agent({ model: 'sonnet' }))).toContain('subagents are forbidden')
    expect(routeEvents(w).filter((l) => l.event === 'route')).toHaveLength(1)
    expect(routeEvents(w).at(-1)).toMatchObject({ ts_ms: null, chosen: 'stopped' })
  })
  test('a clock that never answers on the executor ladder still routes and writes the route line', async () => {
    // Without a clock reading quota staleness is unknown, and unknown never blocks a rung, so Codex takes the task.
    const w = world({ quota: 1, zcodeAvailable: false, clockHangs: true })
    expect(text(await w.agent())).toContain('[routed: codex')
    expect(routeEvents(w).at(-1)).toMatchObject({ ts_ms: null, chosen: EXECUTOR_TABLE.find((r) => r.transport === 'codex')!.id })
    expect(routeEvents(w).at(-1).quota_unknown).not.toEqual({})
  })
  test('a failed log write never changes the routing result', async () => {
    const w = world({ quota: 1, zcodeAvailable: false, teeThrows: true })
    expect(text(await w.agent())).toContain('haiku result')
    const stopped = world({ teeThrows: true })
    expect(text(await stopped.agent({ model: 'opus' }))).toContain('subagents are forbidden')
  })
  for (const [name, options, call, chosen, reason] of [
    ['terminal rung', { quota: 1, zcodeAvailable: false }, {}, LAST_RESORT.model, 'terminal rung'],
    ['native custom agent', { definition: '---\nmodel: haiku\ntools: mcp__tracker__*\n---\nPerform the task.' }, { subagent_type: 'reviewer' }, 'native custom agent', 'custom tool policy'],
  ] as const) {
    test(`a core rejection after the route line returns FAIL and writes no second line: ${name}`, async () => {
      const w = world({ ...options, nextRejects: true })
      expect(text(await w.agent(call))).toStartWith('FAIL | router | routing failed closed')
      expect(routeEvents(w).filter((l) => l.event === 'route')).toHaveLength(1)
      expect(routeEvents(w).at(-1)).toMatchObject({ chosen, reason })
    })
  }
  for (const type of ['\u001b[31mreviewer', 'a'.repeat(81), 'two words']) {
    test(`an unsafe agent type is logged as unrecognized: ${JSON.stringify(type).slice(0, 20)}`, async () => {
      const w = world()
      await w.agent({ subagent_type: type })
      expect(routeEvents(w).at(-1)).toMatchObject({ agent_type: 'unrecognized', chosen: 'stopped' })
    })
  }
})

describe('route telemetry content and bounds', () => {
  const TOKEN = 'ghp_abcdefghijklmnopqrst'
  test('route telemetry retains every field and gives every executor a score or an unknown reason', async () => {
    const w = world()
    await w.agent({ description: '[class: standard]' })
    const event = routeEvents(w).at(-1)
    expect(Object.keys(event).sort()).toEqual(['agent_type', 'chosen', 'eligible', 'event', 'fell_through_from', 'jobs', 'local', 'quota_source', 'quota_unknown', 'reason', 'scores', 'skipped', 'ts_ms'].sort())
    expect(Object.keys(event.scores).sort()).toEqual(EXECUTOR_TABLE.map((row) => row.id).sort())
    for (const row of EXECUTOR_TABLE) {
      const score = event.scores[row.id]
      const reason = event.quota_unknown[row.id] ?? (row.quota ? event.quota_unknown[row.quota] : undefined)
      expect(typeof score.score === 'number' || score.exhausted || reason !== undefined).toBe(true)
    }

    const stopped = world()
    await stopped.agent({ model: 'sonnet' })
    const stoppedEvent = routeEvents(stopped).at(-1)
    expect(Object.keys(stoppedEvent.scores).sort()).toEqual(EXECUTOR_TABLE.map((row) => row.id).sort())
    expect(Object.values(stoppedEvent.quota_unknown)).toEqual(EXECUTOR_TABLE.map(() => 'not_evaluated'))

    const customRow = { id: 'chat-flat', transport: 'router-chat', model: 'local-only', trust: 'subscription-trusted', private_ok: true, price: 1 }
    const configured = world({ quota: 1, env: gateways, files: { '/home/test/.config/ai-delegation/executors.json': JSON.stringify([customRow]) } })
    await configured.agent(textTask)
    const configuredEvent = routeEvents(configured).at(-1)
    expect(configuredEvent.scores['chat-flat']).toBeNull()
    expect(configuredEvent.quota_unknown['chat-flat']).toBe('not_evaluated')
  })
  test('a token-shaped agent type is logged as unrecognized, with or without a definition', async () => {
    for (const options of [{}, { definition: '---\nmodel: haiku\n---\nReview the change.' }]) {
      const w = world(options)
      await w.agent({ subagent_type: TOKEN })
      expect(routeEvents(w).at(-1).agent_type).toBe('unrecognized')
      expect(w.writes.some((s) => s.includes(TOKEN))).toBe(false)
    }
  })
  test('built-in types and verified custom agents are logged by name; an unverified name is not', async () => {
    const explore = world({ quota: 1, zcodeAvailable: false })
    await explore.agent({ subagent_type: 'Explore', description: 'read and triage', prompt: 'Read app.ts.' })
    expect(routeEvents(explore).at(-1).agent_type).toBe('Explore')
    const custom = world({ definition: '---\nmodel: haiku\ntools: mcp__tracker__*\n---\nPerform the task.' })
    await custom.agent({ subagent_type: 'reviewer' })
    expect(routeEvents(custom).at(-1).agent_type).toBe('reviewer')
    const missing = world()
    await missing.agent({ subagent_type: 'reviewer' })
    expect(routeEvents(missing).at(-1)).toMatchObject({ agent_type: 'unrecognized', chosen: 'stopped' })
  })
  test('quota labels reach telemetry only when short, plain and free of prohibited content', async () => {
    const at = 1000 - 60
    const windows = [{ kind: 'weekly', used_percent: 10, window_seconds: 2000, reset_at: 2000 }]
    for (const source of [TOKEN, 's'.repeat(41)]) {
      const w = world({ env: gateways, quotaText: JSON.stringify(instantQuery(series('codex', windows, at, source))) })
      await w.agent({ description: '[class: standard]', prompt: 'Implement the change.' })
      expect(routeEvents(w).at(-1).quota_source).toEqual({ 'codex/weekly': 'unrecognized' })
      expect(w.writes.some((s) => s.includes(source))).toBe(false)
    }
    const long = world({ env: gateways, quotaText: JSON.stringify(instantQuery(series('codex', [{ ...windows[0], kind: 'w'.repeat(41) }], at))) })
    await long.agent({ description: '[class: standard]', prompt: 'Implement the change.' })
    expect(routeEvents(long).at(-1).quota_unknown).toMatchObject({ codex: 'quota_missing' })
    expect(long.writes.some((s) => s.includes('w'.repeat(41)))).toBe(false)
  })
  test('a writer that exits non-zero is a failed write: no line counted, a UI notice, the same result', async () => {
    const w = world({ quota: 1, zcodeAvailable: false, teeExit: 1 })
    expect(text(await w.agent())).toContain('haiku result')
    expect(routeEvents(w)).toEqual([])
    expect(w.logs).toContain('ai-delegation: decision log write failed')
  })
  test('a clock that never answers bounds logging: the stop returns and the line carries a null timestamp', async () => {
    const w = world({ clockHangs: true })
    expect(text(await w.agent({ model: 'sonnet' }))).toContain('subagents are forbidden')
    expect(routeEvents(w).at(-1)).toMatchObject({ ts_ms: null, chosen: 'stopped' })
  })
  test('the terminal rung follows LAST_RESORT.model everywhere, so a literal model name fails this test', async () => {
    // Changing the value at run time catches a hard-coded name that would still equal the current one.
    const terminal = LAST_RESORT as { model: string }
    const saved = terminal.model
    terminal.model = 'terminal-probe'
    try {
      const w = world({ quota: 1, zcodeAvailable: false })
      await w.agent()
      const event = routeEvents(w).at(-1)
      expect(event.eligible.at(-1)).toBe('terminal-probe')
      expect(event.chosen).toBe('terminal-probe')
      const row = { ...EXECUTOR_TABLE.find((r) => r.transport === 'codex')!, id: 'terminal-probe' }
      expect(validRow(row)).toBeUndefined()
      expect(validRow({ ...row, id: saved })).toBeDefined()
    } finally {
      terminal.model = saved
    }
  })
  test('zcode-job start refusing before it accepts a job logs stopped, not the executor', async () => {
    const w = world({ quota: 1, env: gateways, zcodeExit: 64, zcodeOutput: '{"error":"Repository is not approved for ZCode"}\n' })
    expect(text(await w.agent(coding))).toStartWith('FAIL | router |')
    expect(routeEvents(w).at(-1)).toMatchObject({ chosen: 'stopped', reason: 'zcode dispatch failed before the job was accepted' })
  })
})
