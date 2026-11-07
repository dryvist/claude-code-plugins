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
    { name: 'denial inside metadata', fields: 'tools: [Read]\nmetadata: {disallowedTools: [Bash]}', outcome: 'parsed', tools: ['Read'] },
    { name: 'double-quoted key', fields: '"tools": [Read]', outcome: 'fail closed' },
    { name: 'single-quoted key', fields: "'tools': [Read]", outcome: 'fail closed' },
    { name: 'spaced key', fields: 'tools : [Read]', outcome: 'parsed', tools: ['Read'] },
    { name: 'escaped key', fields: '"too\\u006cs": [Read]', outcome: 'fail closed' },
    { name: 'escaped hex key', fields: '"to\\x6fls": [Read]', outcome: 'fail closed' },
    { name: 'explicit key', fields: '? tools\n: [Read]', outcome: 'fail closed' },
    { name: 'explicit multiline escaped key', fields: '? "to\\\n  ols"\n: [Read]', outcome: 'fail closed' },
    { name: 'indented whole mapping', fields: '  name: reviewer\n  tools: [Read]', outcome: 'fail closed' },
    { name: 'block list comments', fields: "tools: # reads\n  - Read # user's files\n  # search\n  - Grep", outcome: 'parsed', tools: ['Read', 'Grep'] },
    { name: 'flow list comments', fields: 'tools: [Read, Grep] # reads', outcome: 'parsed', tools: ['Read', 'Grep'] },
    { name: 'comma-separated scalar', fields: 'tools: Read, Grep', outcome: 'parsed', tools: ['Read', 'Grep'] },
    { name: 'empty allowlist', fields: 'tools: []', outcome: 'parsed', tools: [] },
    { name: 'escaped tool scalar', fields: 'tools: ["Re\\x61d"]', outcome: 'parsed', tools: ['Read'] },
    { name: 'denial removes shell', fields: 'tools: [Read, Bash]\ndisallowedTools: [Bash]', outcome: 'parsed', tools: ['Read', 'Bash'], disallowedTools: ['Bash'] },
    { name: 'block denial', fields: 'disallowedTools:\n  - Bash # native enforcement', outcome: 'parsed', disallowedTools: ['Bash'] },
    { name: 'quoted model', fields: 'model: "haiku"', outcome: 'parsed', model: 'haiku' },
    { name: 'single-quoted model', fields: "model: 'haiku'", outcome: 'parsed', model: 'haiku' },
    { name: 'hex model escape', fields: 'model: "ha\\x69ku"', outcome: 'parsed', model: 'haiku' },
    { name: 'unicode model escape', fields: 'model: "ha\\u0069ku"', outcome: 'parsed', model: 'haiku' },
    { name: 'long unicode model escape', fields: 'model: "ha\\U00000069ku"', outcome: 'parsed', model: 'haiku' },
    { name: 'escaped quoted model key', fields: '"mo\\x64el" : "ha\\x69ku"', outcome: 'fail closed' },
    { name: 'duplicate model keys', fields: 'model: haiku\nmodel: opus', outcome: 'fail closed' },
    { name: 'invalid model escape', fields: 'model: "ha\\qiku"', outcome: 'fail closed' },
    { name: 'unreadable model', fields: 'model: |\n  haiku', outcome: 'fail closed' },
    { name: 'indented model', fields: '  model: opus', outcome: 'fail closed' },
    { name: 'flow mapping model', fields: '{model: opus}', outcome: 'fail closed' },
    { name: 'multiline description', fields: 'description: >-\n  Review changes\n  and report results.', outcome: 'inherited' },
    { name: 'apostrophe in description', fields: "description: Review the user's changes", outcome: 'inherited' },
    { name: 'unrelated key suffix', fields: 'custom-tools: metadata', outcome: 'inherited' },
    { name: 'no tools key', fields: 'name: reviewer', outcome: 'inherited' },
    { name: 'nested metadata policy', fields: 'metadata:\n  tools: [Read]\n  model: opus', outcome: 'inherited' },
    { name: 'block scalar policy text', fields: 'description: |\n  tools: Bash', outcome: 'inherited' },
    { name: 'quoted policy text', fields: 'description: "tools: Bash"', outcome: 'inherited' },
    { name: 'quoted description colon', fields: String.raw`description: 'Check "C:\path": text'`, outcome: 'inherited' },
    { name: 'non-policy values unread', fields: 'metadata: &defaults {tools: [Read]}', outcome: 'inherited' },
    { name: 'merge key', fields: 'metadata: &defaults {}\n<<: *defaults', outcome: 'fail closed' },
    { name: 'tab before key', fields: '\ttools: [Read]', outcome: 'fail closed' },
    { name: 'tab after metadata', fields: 'metadata:\n\ttools: [Read]', outcome: 'fail closed' },
    { name: 'bare top-level word', fields: 'name: reviewer\ninvalid', outcome: 'fail closed' },
    { name: 'key without value separator', fields: 'tools:[Read]', outcome: 'fail closed' },
    { name: 'tool alias', fields: 'tools: *', outcome: 'fail closed' },
    { name: 'tool anchor', fields: 'tools: &reads [Read]', outcome: 'fail closed' },
    { name: 'tool tag', fields: 'tools: !!str Read', outcome: 'fail closed' },
    { name: 'tool flow map', fields: 'tools: {allow: Read}', outcome: 'fail closed' },
    { name: 'tool block scalar', fields: 'tools: |\n  Read', outcome: 'fail closed' },
    { name: 'multiline flow list', fields: 'tools: [Read,\n  Grep]', outcome: 'fail closed' },
    { name: 'nested list entry', fields: 'tools:\n  - Read\n    - Bash', outcome: 'fail closed' },
    { name: 'top-level list entry', fields: 'tools:\n- Read', outcome: 'fail closed' },
    { name: 'list entry alias', fields: 'tools:\n  - *reads', outcome: 'fail closed' },
    { name: 'model continuation', fields: 'model: haiku\n  opus', outcome: 'fail closed' },
    { name: 'model list', fields: 'model: [haiku]', outcome: 'fail closed' },
    { name: 'blank and comment lines', fields: '\n# header\nname: reviewer\n  # nested comment', outcome: 'inherited' },
  ]
  for (const row of cases) {
    let definition: AgentDefinition | undefined
    let outcome = 'fail closed'
    try {
      definition = parseAgentDefinition(`---\n${row.fields}\n---\nFollow the rubric.`)
      outcome = definition.model === undefined && definition.tools === undefined && definition.disallowedTools === undefined ? 'inherited' : 'parsed'
    } catch { /* Unsupported policy forms must fail closed. */ }
    expect({ name: row.name, outcome }).toEqual({ name: row.name, outcome: row.outcome })
    if (row.outcome !== 'fail closed') {
      expect(definition).toEqual({ prompt: 'Follow the rubric.', ...(row.model !== undefined ? { model: row.model } : {}), ...(row.tools !== undefined ? { tools: row.tools } : {}), ...(row.disallowedTools !== undefined ? { disallowedTools: row.disallowedTools } : {}) })
    }
  }
})
