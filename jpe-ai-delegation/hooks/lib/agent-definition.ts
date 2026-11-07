import type { Sandbox } from './policy'

export type AgentDefinition = { model?: string; prompt: string; tools?: string[]; disallowedTools?: string[] }
const WRITERS = ['Edit', 'Write', 'NotebookEdit', 'Bash']
const CODEX_TOOLS = ['Read', 'Grep', 'Glob', ...WRITERS]

// The hooks environment has no YAML library. Accept the policy's scalar/list syntax;
// ambiguous YAML stays closed rather than being interpreted as inherited authority.
function scalar(raw: string, tool = false): string {
  let value = raw.trim()
  const quoted = value.match(/^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*')(?:[ \t]+#.*)?$/)
  if (quoted) return quoted[1].startsWith('"') ? JSON.parse(quoted[1]) : quoted[1].slice(1, -1).replace(/''/g, "'")
  value = value.replace(/[ \t]+#.*$/, '').trim()
  if (!value || (!tool && (/[\[\]{}&*!|>'"`\n\r]/.test(value) || /:\s/.test(value)))) throw new Error('unsupported frontmatter scalar')
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
  if (tools.some((tool) => /^(?:null|true|false|yes|no|on|off)$/i.test(tool) || !/^(?:\*|mcp__[\w-]+__(?:[\w-]+\*?|\*)|[A-Za-z]\w*(?:\([^\r\n]*\))?)$/.test(tool))) throw new Error('invalid tool name')
  return tools
}

export function parseAgentDefinition(text: string): AgentDefinition {
  const frontmatter = text.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/)
  if (!frontmatter) {
    if (/^\s*---|\b(?:tools|disallowedTools|model)\s*:/.test(text)) throw new Error('invalid agent frontmatter')
    return { prompt: '' }
  }
  const definition: AgentDefinition = { prompt: text.slice(frontmatter[0].length).trim() }
  const lines = frontmatter[1].split(/\r?\n/)
  const seen = new Set<string>()
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim() || /^\s*#/.test(line)) continue
    const field = line.match(/^(?:([\w-]+)|"([\w-]+)"|'([\w-]+)'):[ \t]*(.*)$/)
    if (!field) throw new Error('unsupported agent frontmatter')
    const key = field[1] ?? field[2] ?? field[3]
    if (seen.has(key)) throw new Error('duplicate agent frontmatter key')
    seen.add(key)
    const value = field[4].trim().replace(/^#.*$/, '')
    const toolField = key === 'tools' || key === 'disallowedTools'
    if (toolField && !value) {
      const tools: string[] = []
      while (i + 1 < lines.length && (!lines[i + 1].trim() || /^\s*#/.test(lines[i + 1]) || /^\s*-\s/.test(lines[i + 1]))) {
        const item = lines[++i].match(/^\s*-\s+(.+)$/)
        if (item) tools.push(...toolList(`[${item[1]}]`))
      }
      if (!tools.length) throw new Error('empty agent tool field requires []')
      definition[key] = tools
    } else if (toolField) definition[key] = toolList(value)
    else if (key === 'model') definition.model = scalar(value)
    else {
      if (/^[|>][+-]?$/.test(value)) {
        while (i + 1 < lines.length && (!lines[i + 1].trim() || /^\s+\S/.test(lines[i + 1]))) i++
      } else {
        if (value.startsWith('[')) toolList(value)
        else scalar(value)
      }
    }
  }
  return definition
}

export function customAgentSandbox(definition: AgentDefinition): Sandbox | undefined {
  // Codex cannot enforce per-tool denials or selectors; core retains those policies.
  if (definition.disallowedTools?.length) return undefined
  if (definition.tools === undefined) return 'workspace-write'
  const sandbox = definition.tools.some((tool) => WRITERS.includes(tool.split('(')[0])) ? 'workspace-write' : 'read-only'
  if (!definition.tools.length || definition.tools.some((tool) => !CODEX_TOOLS.includes(tool))) return undefined
  return sandbox
}
