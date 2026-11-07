import type { Sandbox } from './policy'

export type AgentDefinition = { model?: string; prompt: string; tools?: string[]; disallowedTools?: string[] }
const WRITERS = ['Edit', 'Write', 'NotebookEdit', 'Bash']
const CODEX_TOOLS = ['Read', 'Grep', 'Glob', ...WRITERS]

// Decode YAML scalar escapes without requiring a parser in the hook VM.
function quotedScalar(raw: string): string {
  if (!raw.startsWith('"')) return raw.startsWith("'") ? raw.slice(1, -1).replace(/''/g, "'") : raw
  const escapes: Record<string, string> = { '0': '\0', a: '\x07', b: '\b', t: '\t', n: '\n', v: '\v', f: '\f', r: '\r', e: '\x1b', ' ': ' ', '"': '"', '/': '/', '\\': '\\', N: '\x85', _: '\u00a0', L: '\u2028', P: '\u2029' }
  return raw.slice(1, -1).replace(/\\(x[\da-fA-F]{2}|u[\da-fA-F]{4}|U[\da-fA-F]{8}|.)/g, (_, escaped: string) => {
    if (/^[xuU]/.test(escaped)) return String.fromCodePoint(parseInt(escaped.slice(1), 16))
    if (!(escaped in escapes)) throw new Error('invalid quoted agent scalar')
    return escapes[escaped]
  })
}

function scalar(raw: string, tool = false): string {
  let value = raw.trim()
  const quoted = value.match(/^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*')(?:[ \t]+#.*)?$/)
  if (quoted) return quotedScalar(quoted[1])
  value = value.replace(/[ \t]+#.*$/, '').trim()
  if (!value || /^[\[\]{}&*!|>'"`]/.test(value) || (!tool && (/[\[\]{}&*!|>'"`\n\r]/.test(value) || /:\s/.test(value)))) throw new Error('unsupported frontmatter scalar')
  return value
}

// Commas inside a quoted entry or a tool selector belong to that entry.
function toolEntries(value: string): string[] {
  const entries: string[] = []
  let start = 0
  let depth = 0
  let quote = ''
  for (let i = 0; i < value.length; i++) {
    const char = value[i]
    if (quote) {
      if (char === '\\' && quote === '"') i++
      else if (char === quote) {
        if (quote === "'" && value[i + 1] === "'") i++
        else quote = ''
      }
    } else if (char === '"' || char === "'") quote = char
    else if (char === '(') depth++
    else if (char === ')') {
      if (--depth < 0) throw new Error('invalid tool selector')
    } else if (char === ',' && depth === 0) {
      entries.push(value.slice(start, i).trim())
      start = i + 1
    }
  }
  if (quote || depth) throw new Error('unterminated tool entry')
  entries.push(value.slice(start).trim())
  return entries
}

function validateTools(tools: string[]): string[] {
  if (tools.some((tool) => /^(?:null|true|false|yes|no|on|off)$/i.test(tool) || !/^(?:\*|mcp__[\w-]+__(?:[\w-]+\*?|\*)|[A-Za-z]\w*(?:\([^\r\n]*\))?)$/.test(tool))) throw new Error('invalid tool name')
  return tools
}

function toolList(raw: string): string[] {
  const value = raw.trim()
  let tools: string[]
  if (value.startsWith('[')) {
    const list = value.match(/^\[([\s\S]*)\](?:[ \t]+#.*)?$/)
    if (!list) throw new Error('invalid tool list')
    const body = list[1].trim().replace(/,\s*$/, '')
    tools = body ? toolEntries(body).map((entry) => scalar(entry, true)) : []
  } else {
    tools = toolEntries(scalar(value, true))
  }
  return validateTools(tools)
}

// The hook VM has no YAML parser: accept plain top-level keys and bounded policy values.
export function parseAgentDefinition(text: string): AgentDefinition {
  const frontmatter = text.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/)
  if (!frontmatter) {
    if (/^\s*---|\b(?:tools|disallowedTools|model)\s*:/.test(text)) throw new Error('invalid agent frontmatter')
    return { prompt: '' }
  }
  const definition: AgentDefinition = { prompt: text.slice(frontmatter[0].length).trim() }
  const lines = frontmatter[1].split(/\r?\n/)
  const seen = new Set<string>()
  let parent: string | undefined
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim() || /^\s*#/.test(line)) continue
    if (line.startsWith(' ') && parent) continue
    const field = line.match(/^([A-Za-z_][\w-]*)[ \t]*:([ \t]|$)/)
    if (!field) throw new Error('unsupported agent frontmatter key')
    const key = parent = field[1]
    if (key !== 'model' && key !== 'tools' && key !== 'disallowedTools') continue
    if (seen.has(key)) throw new Error('duplicate agent frontmatter key')
    seen.add(key)
    const value = line.slice(field[0].length).trim().replace(/^#.*$/, '')
    const continuation: string[] = []
    while (i + 1 < lines.length && (!lines[i + 1].trim() || /^\s*#/.test(lines[i + 1]) || lines[i + 1].startsWith(' '))) {
      const line = lines[++i]
      if (line.trim() && !/^\s*#/.test(line)) continuation.push(line)
    }
    const toolField = key === 'tools' || key === 'disallowedTools'
    if (toolField && !value) {
      if (!continuation.length) throw new Error('empty agent tool field requires []')
      let indent: number | undefined
      definition[key] = validateTools(continuation.map((line) => {
        const item = line.match(/^( +)-[ \t]+(.+)$/)
        if (!item || (indent !== undefined && item[1].length !== indent)) throw new Error('unsupported agent tool list entry')
        indent = item[1].length
        return scalar(item[2], true)
      }))
    } else {
      if (continuation.length) throw new Error('unsupported agent policy continuation')
      if (toolField) definition[key] = toolList(value)
      else definition.model = scalar(value)
    }
  }
  return definition
}

export function customAgentSandbox(definition: AgentDefinition): Sandbox | undefined {
  // Codex cannot enforce per-tool denials or selectors; core retains those policies.
  if (definition.disallowedTools?.length) return undefined
  if (definition.tools === undefined) return 'workspace-write'
  if (!definition.tools.length || definition.tools.some((tool) => !CODEX_TOOLS.includes(tool))) return undefined
  // Codex's workspace-write always carries a shell, so only a definition granting Bash may have it.
  if (definition.tools.includes('Bash')) return 'workspace-write'
  return definition.tools.some((tool) => WRITERS.includes(tool)) ? undefined : 'read-only'
}
