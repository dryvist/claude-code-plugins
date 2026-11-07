const { expect, test } = await import('claude-code/testing').catch(() => import('bun:test'))
import { parseAgentDefinition, type AgentDefinition } from './agent-definition'

test('frontmatter policy forms are parsed, inherited, or fail closed', () => {
  const cases: {
    name: string; fields: string; outcome: 'parsed' | 'inherited' | 'fail closed'
    tools?: string[]; disallowedTools?: string[]; model?: string
  }[] = [
    { name: 'top-level key', fields: 'tools: Read', outcome: 'parsed', tools: ['Read'] },
    { name: 'indented key', fields: '  tools: [Read]', outcome: 'fail closed' },
    { name: 'indented quoted key', fields: '  "tools": [Read]', outcome: 'fail closed' },
    { name: 'indented escaped key', fields: '  "too\\x6cs": [Read]', outcome: 'fail closed' },
    { name: 'flow mapping', fields: '{tools: [Read]}', outcome: 'fail closed' },
    { name: 'flow mapping quoted key', fields: '{"tools" : [Read]}', outcome: 'fail closed' },
    { name: 'flow mapping denial', fields: "{'disallowedTools' : [Bash]}", outcome: 'fail closed' },
    { name: 'indented denial', fields: '  disallowedTools: [Bash]', outcome: 'fail closed' },
    { name: 'denial beside parsed tools', fields: 'tools: [Read]\nmetadata: {disallowedTools: [Bash]}', outcome: 'fail closed' },
    { name: 'double-quoted key', fields: '"tools": [Read]', outcome: 'parsed', tools: ['Read'] },
    { name: 'single-quoted key', fields: "'tools': [Read]", outcome: 'parsed', tools: ['Read'] },
    { name: 'spaced key', fields: 'tools : [Read]', outcome: 'parsed', tools: ['Read'] },
    { name: 'escaped key', fields: '"too\\u006cs": [Read]', outcome: 'parsed', tools: ['Read'] },
    { name: 'block list comments', fields: 'tools: # reads\n  - Read # supplied files\n  # search\n  - Grep', outcome: 'parsed', tools: ['Read', 'Grep'] },
    { name: 'flow list comments', fields: 'tools: [Read, Grep] # reads', outcome: 'parsed', tools: ['Read', 'Grep'] },
    { name: 'comma-separated scalar', fields: 'tools: Read, Grep', outcome: 'parsed', tools: ['Read', 'Grep'] },
    { name: 'empty allowlist', fields: 'tools: []', outcome: 'parsed', tools: [] },
    { name: 'escaped tool scalar', fields: 'tools: ["Re\\x61d"]', outcome: 'parsed', tools: ['Read'] },
    { name: 'denial removes shell', fields: 'tools: [Read, Bash]\ndisallowedTools: [Bash]', outcome: 'parsed', tools: ['Read', 'Bash'], disallowedTools: ['Bash'] },
    { name: 'block denial', fields: 'disallowedTools:\n  - Bash # native enforcement', outcome: 'parsed', disallowedTools: ['Bash'] },
    { name: 'quoted model', fields: 'model: "haiku"', outcome: 'inherited', model: 'haiku' },
    { name: 'hex model escape', fields: 'model: "ha\\x69ku"', outcome: 'inherited', model: 'haiku' },
    { name: 'unicode model escape', fields: 'model: "ha\\u0069ku"', outcome: 'inherited', model: 'haiku' },
    { name: 'long unicode model escape', fields: 'model: "ha\\U00000069ku"', outcome: 'inherited', model: 'haiku' },
    { name: 'escaped quoted model key', fields: '"mo\\x64el" : "ha\\x69ku"', outcome: 'inherited', model: 'haiku' },
    { name: 'invalid model escape', fields: 'model: "ha\\qiku"', outcome: 'fail closed' },
    { name: 'unreadable model', fields: 'model: |\n  haiku', outcome: 'fail closed' },
    { name: 'indented model', fields: '  model: opus', outcome: 'fail closed' },
    { name: 'flow mapping model', fields: '{model: opus}', outcome: 'fail closed' },
    { name: 'multiline description', fields: 'description: >-\n  Review changes\n  and report results.', outcome: 'inherited' },
    { name: 'apostrophe in description', fields: "description: Review the user's changes", outcome: 'inherited' },
    { name: 'unrelated key suffix', fields: 'custom-tools: metadata', outcome: 'inherited' },
    { name: 'no tools key', fields: 'name: reviewer', outcome: 'inherited' },
    // Raw policy mentions require a top-level value, even inside metadata.
    { name: 'nested metadata policy', fields: 'metadata:\n  tools: [Read]', outcome: 'fail closed' },
    { name: 'block scalar policy text', fields: 'description: |\n  tools: Bash', outcome: 'fail closed' },
    { name: 'quoted policy text', fields: 'description: "tools: Bash"', outcome: 'fail closed' },
  ]
  for (const row of cases) {
    let definition: AgentDefinition | undefined
    let outcome = 'fail closed'
    try {
      definition = parseAgentDefinition(`---\n${row.fields}\n---\nFollow the rubric.`)
      outcome = definition.tools === undefined && definition.disallowedTools === undefined ? 'inherited' : 'parsed'
    } catch { /* Unsupported policy forms must fail closed. */ }
    expect({ name: row.name, outcome }).toEqual({ name: row.name, outcome: row.outcome })
    if (row.outcome !== 'fail closed') {
      expect(definition).toEqual({ prompt: 'Follow the rubric.', ...(row.model !== undefined ? { model: row.model } : {}), ...(row.tools !== undefined ? { tools: row.tools } : {}), ...(row.disallowedTools !== undefined ? { disallowedTools: row.disallowedTools } : {}) })
    }
  }
})
